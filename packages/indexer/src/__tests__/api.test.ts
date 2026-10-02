import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createQueryServer } from "../api.js";
import { ReportDeliveryStore } from "../delivery.js";
import { EventStore } from "../store.js";

const servers: Server[] = [];
const eventStores: EventStore[] = [];
const deliveryStores: ReportDeliveryStore[] = [];

async function start(
  scheduling = true,
  options: { corsOrigin?: string; maxRequestBytes?: number } = {},
): Promise<{
  baseUrl: string;
  eventStore: EventStore;
  deliveryStore?: ReportDeliveryStore;
}> {
  const eventStore = new EventStore(":memory:");
  const deliveryStore = scheduling ? new ReportDeliveryStore(":memory:") : undefined;
  const server = createQueryServer(eventStore, { deliveryStore, ...options });
  servers.push(server);
  eventStores.push(eventStore);
  if (deliveryStore) deliveryStores.push(deliveryStore);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    eventStore,
    ...(deliveryStore ? { deliveryStore } : {}),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  eventStores.splice(0).forEach((store) => store.close());
  deliveryStores.splice(0).forEach((store) => store.close());
});

describe("audit query API", () => {
  it("serves statement previews, downloads, health, and CORS preflight", async () => {
    const { baseUrl } = await start(true, { corsOrigin: "https://dashboard.example.test" });
    const preview = await fetch(`${baseUrl}/reports/statements/agent/GAGENT?fromLedger=10`);
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({
      subject: { kind: "agent", id: "GAGENT" },
      period: { fromLedger: 10 },
      lines: [],
    });

    const download = await fetch(
      `${baseUrl}/reports/statements/agent/GAGENT/export?format=csv&fromLedger=10`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain("text/csv");
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(await download.text()).toContain("transactionHash");

    const health = await fetch(`${baseUrl}/health`);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      reportSchedules: 0,
      deadLetterDeliveries: 0,
    });

    const preflight = await fetch(`${baseUrl}/reports/schedules`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin"))
      .toBe("https://dashboard.example.test");
  });

  it("creates and lists schedules without returning secret webhook headers", async () => {
    const { baseUrl } = await start();
    const input = {
      scheduleId: "finance-monthly",
      subject: { kind: "owner", id: "GOWNER" },
      cadence: "monthly",
      format: "csv",
      destinations: [{
        id: "finance-hook",
        kind: "webhook",
        url: "https://finance.example.test/reports",
        headers: { authorization: "Bearer TOP_SECRET" },
      }],
      nextRunAt: "2026-09-01T00:00:00.000Z",
    };
    const created = await fetch(`${baseUrl}/reports/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { destinations: unknown[] };
    expect(createdBody.destinations).toEqual([{
      id: "finance-hook",
      kind: "webhook",
      url: "https://finance.example.test/reports",
    }]);

    const list = await fetch(`${baseUrl}/reports/schedules`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(await list.json())).not.toContain("TOP_SECRET");
  });

  it("attaches a period-aligned on-chain reconciliation to a statement", async () => {
    const { baseUrl } = await start();
    const checkpoint = {
      fromLedger: 10,
      asOfLedger: 20,
      openingPositions: [{ account: "CCHANNEL", asset: "CUSDC", amount: "42" }],
      onChainPositions: [{ account: "CCHANNEL", asset: "CUSDC", amount: "42" }],
    };
    const response = await fetch(
      `${baseUrl}/reports/statements/agent/GAGENT?fromLedger=10&throughLedger=20`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checkpoint),
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      period: { fromLedger: 10, throughLedger: 20 },
      reconciliation: {
        fromLedger: 10,
        asOfLedger: 20,
        reconciled: true,
        lines: [{ expectedAmount: "42", onChainAmount: "42", status: "matched" }],
      },
    });

    const mismatch = await fetch(
      `${baseUrl}/reports/statements/agent/GAGENT?throughLedger=21`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checkpoint),
      },
    );
    expect(mismatch.status).toBe(400);
  });

  it("filters dead letters and replays them through the administration route", async () => {
    const { baseUrl, deliveryStore } = await start();
    const now = "2026-08-28T10:00:00.000Z";
    const schedule = deliveryStore!.saveSchedule({
      scheduleId: "dead-letter-test",
      subject: { kind: "agent", id: "GAGENT" },
      cadence: "daily",
      format: "json",
      destinations: [{
        id: "hook",
        kind: "webhook",
        url: "https://example.test/hook",
        headers: { "x-secret": "HIDDEN" },
      }],
      nextRunAt: "2026-08-29T10:00:00.000Z",
    }, now);
    deliveryStore!.enqueueArtifact(schedule, "dead-letter-test:run", {}, {
      statementId: "statement-1",
      format: "json",
      contentType: "application/x-ndjson",
      filename: "statement.ndjson",
      content: Buffer.from("{}\n"),
    }, now);
    const claim = deliveryStore!.claimDue(now, 10_000)!;
    deliveryStore!.markFailed(claim.delivery.deliveryId, "provider error", now, 1, now);

    const deadLetters = await fetch(`${baseUrl}/reports/deliveries?status=dead_letter`);
    expect(deadLetters.status).toBe(200);
    const deadBody = await deadLetters.json() as Array<{ deliveryId: string; status: string }>;
    expect(deadBody).toMatchObject([{ deliveryId: claim.delivery.deliveryId, status: "dead_letter" }]);
    expect(JSON.stringify(deadBody)).not.toContain("HIDDEN");

    const replayed = await fetch(
      `${baseUrl}/reports/deliveries/${encodeURIComponent(claim.delivery.deliveryId)}/replay`,
      { method: "POST" },
    );
    expect(replayed.status).toBe(202);
    await expect(replayed.json()).resolves.toMatchObject({
      deliveryId: claim.delivery.deliveryId,
      status: "retry",
      attemptCount: 0,
    });
  });

  it("classifies malformed requests and disabled scheduling", async () => {
    const withoutScheduling = await start(false);
    const unavailable = await fetch(`${withoutScheduling.baseUrl}/reports/schedules`);
    expect(unavailable.status).toBe(503);

    const configured = await start(true, { maxRequestBytes: 10 });
    const oversized = await fetch(`${configured.baseUrl}/reports/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ larger: "than ten bytes" }),
    });
    expect(oversized.status).toBe(413);

    const invalidStatus = await fetch(`${configured.baseUrl}/reports/deliveries?status=lost`);
    expect(invalidStatus.status).toBe(400);
  });
});
