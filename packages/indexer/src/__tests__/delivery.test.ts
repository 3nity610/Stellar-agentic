import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EmailReportTransport,
  HttpEmailSender,
  ReportDeliveryStore,
  ScheduledReportService,
  WebhookReportTransport,
  periodForRun,
  type ClaimedDelivery,
  type DeliveryTransport,
  type EmailMessage,
  type GeneratedReportArtifact,
  type ReportArtifactBuilder,
  type ReportSchedule,
  type ReportScheduleInput,
} from "../delivery.js";

const DUE = "2026-04-01T00:00:00.000Z";

function input(destinations: ReportScheduleInput["destinations"] = [{
  id: "webhook-primary",
  kind: "webhook",
  url: "https://finance.example.test/statements",
}]): ReportScheduleInput {
  return {
    scheduleId: "quarterly-agent-report",
    subject: { kind: "agent", id: "GAGENT" },
    cadence: "quarterly",
    format: "csv",
    destinations,
    nextRunAt: DUE,
  };
}

function generated(content = "statement content"): GeneratedReportArtifact {
  return {
    statementId: "statement:agent:GAGENT",
    format: "csv",
    contentType: "text/csv; charset=utf-8",
    filename: "statement.csv",
    content: Buffer.from(content),
  };
}

class RecordingBuilder implements ReportArtifactBuilder {
  readonly calls: Array<{ schedule: ReportSchedule; period: unknown }> = [];

  async build(schedule: ReportSchedule, period: unknown): Promise<GeneratedReportArtifact> {
    this.calls.push({ schedule, period });
    return generated(JSON.stringify(period));
  }
}

class RecordingTransport implements DeliveryTransport {
  readonly claims: ClaimedDelivery[] = [];
  failures = 0;
  delayMs = 0;

  async deliver(claim: ClaimedDelivery): Promise<void> {
    this.claims.push(claim);
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("temporary provider outage");
    }
  }
}

function service(
  store: ReportDeliveryStore,
  builder: ReportArtifactBuilder,
  webhook: DeliveryTransport,
  email: DeliveryTransport = webhook,
  options: { maxAttempts?: number; baseRetryMs?: number; leaseMs?: number } = {},
): ScheduledReportService {
  return new ScheduledReportService({
    store,
    artifactBuilder: builder,
    transports: { webhook, email },
    ...options,
  });
}

describe("ReportDeliveryStore and ScheduledReportService", () => {
  it("generates once and delivers once to each destination", async () => {
    const store = new ReportDeliveryStore(":memory:");
    store.saveSchedule(input([
      { id: "hook", kind: "webhook", url: "https://finance.example.test/hook" },
      { id: "mail", kind: "email", to: ["audit@example.test"] },
    ]), "2026-01-01T00:00:00Z");
    const builder = new RecordingBuilder();
    const webhook = new RecordingTransport();
    const email = new RecordingTransport();
    const worker = service(store, builder, webhook, email);

    await expect(worker.tick(new Date(DUE))).resolves.toEqual({
      generated: 1,
      delivered: 2,
      retried: 0,
      deadLettered: 0,
    });
    await expect(worker.tick(new Date(DUE))).resolves.toEqual({
      generated: 0,
      delivered: 0,
      retried: 0,
      deadLettered: 0,
    });

    expect(builder.calls).toHaveLength(1);
    expect(webhook.claims).toHaveLength(1);
    expect(email.claims).toHaveLength(1);
    expect(store.deliveries().map((delivery) => delivery.status)).toEqual([
      "delivered",
      "delivered",
    ]);
    expect(new Set(store.deliveries().map((delivery) => delivery.idempotencyKey)).size).toBe(2);
    expect(store.schedule(input().scheduleId)?.nextRunAt).toBe("2026-07-01T00:00:00.000Z");
    store.close();
  });

  it("retries with the same artifact and idempotency key", async () => {
    const store = new ReportDeliveryStore(":memory:");
    store.saveSchedule(input());
    const transport = new RecordingTransport();
    transport.failures = 1;
    const worker = service(store, new RecordingBuilder(), transport, transport, {
      baseRetryMs: 1_000,
    });

    expect(await worker.tick(new Date(DUE))).toMatchObject({ generated: 1, retried: 1 });
    expect(store.deliveries()[0]).toMatchObject({
      status: "retry",
      attemptCount: 1,
      nextAttemptAt: "2026-04-01T00:00:01.000Z",
    });
    expect(await worker.deliverDue(new Date("2026-04-01T00:00:00.999Z"))).toMatchObject({ delivered: 0 });
    expect(await worker.deliverDue(new Date("2026-04-01T00:00:01.000Z"))).toMatchObject({ delivered: 1 });

    expect(transport.claims).toHaveLength(2);
    expect(transport.claims[0].artifact.sha256).toBe(transport.claims[1].artifact.sha256);
    expect(transport.claims[0].delivery.idempotencyKey)
      .toBe(transport.claims[1].delivery.idempotencyKey);
    expect(store.deliveries()[0]).toMatchObject({ status: "delivered", attemptCount: 2 });
    store.close();
  });

  it("dead-letters terminal failures and supports explicit replay", async () => {
    const store = new ReportDeliveryStore(":memory:");
    store.saveSchedule(input());
    const transport = new RecordingTransport();
    transport.failures = 2;
    const worker = service(store, new RecordingBuilder(), transport, transport, {
      maxAttempts: 2,
      baseRetryMs: 100,
    });

    expect(await worker.tick(new Date(DUE))).toMatchObject({ retried: 1 });
    expect(await worker.deliverDue(new Date("2026-04-01T00:00:00.100Z")))
      .toMatchObject({ deadLettered: 1 });
    const dead = store.deliveries("dead_letter")[0];
    expect(dead).toMatchObject({ attemptCount: 2, lastError: "temporary provider outage" });

    store.replayDeadLetter(dead.deliveryId, "2026-04-01T00:00:01Z");
    expect(await worker.deliverDue(new Date("2026-04-01T00:00:01Z")))
      .toMatchObject({ delivered: 1 });
    expect(store.deliveries()[0]).toMatchObject({ status: "delivered", attemptCount: 1 });
    store.close();
  });

  it("uses leases to prevent duplicate concurrent delivery and reclaim abandoned work", async () => {
    const store = new ReportDeliveryStore(":memory:");
    store.saveSchedule(input());
    const transport = new RecordingTransport();
    transport.delayMs = 20;
    const worker = service(store, new RecordingBuilder(), transport, transport, { leaseMs: 100 });
    await worker.generateDue(new Date(DUE));

    await Promise.all([
      worker.deliverDue(new Date(DUE)),
      worker.deliverDue(new Date(DUE)),
    ]);
    expect(transport.claims).toHaveLength(1);
    expect(store.deliveries()[0].status).toBe("delivered");
    store.close();

    const reclaimStore = new ReportDeliveryStore(":memory:");
    reclaimStore.saveSchedule({ ...input(), scheduleId: "abandoned", nextRunAt: "2026-07-01T00:00:00Z" });
    const reclaimWorker = service(reclaimStore, new RecordingBuilder(), transport, transport, { leaseMs: 100 });
    await reclaimWorker.generateDue(new Date("2026-07-01T00:00:00Z"));
    const first = reclaimStore.claimDue("2026-07-01T00:00:00Z", 100)!;
    expect(reclaimStore.claimDue("2026-07-01T00:00:00.099Z", 100)).toBeUndefined();
    const reclaimed = reclaimStore.claimDue("2026-07-01T00:00:00.100Z", 100)!;
    expect(reclaimed.delivery.deliveryId).toBe(first.delivery.deliveryId);
    expect(reclaimed.delivery.attemptCount).toBe(2);
    reclaimStore.close();
  });

  it("keeps artifacts immutable for an existing run key", () => {
    const store = new ReportDeliveryStore(":memory:");
    const schedule = store.saveSchedule(input());
    const period = periodForRun(DUE, "quarterly");
    const runKey = `${schedule.scheduleId}:${DUE}`;
    const first = store.enqueueArtifact(schedule, runKey, period, generated("first"), DUE);
    const replay = store.enqueueArtifact(schedule, runKey, period, generated("first"), DUE);

    expect(replay.artifactId).toBe(first.artifactId);
    expect(store.deliveries()).toHaveLength(1);
    expect(() => store.enqueueArtifact(schedule, runKey, period, generated("different"), DUE))
      .toThrow("different immutable artifact");
    store.close();
  });

  it("persists schedules, artifacts and deliveries across process restarts", () => {
    const directory = mkdtempSync(join(tmpdir(), "stellaragent-delivery-"));
    const filename = join(directory, "reports.sqlite");
    try {
      const first = new ReportDeliveryStore(filename);
      const schedule = first.saveSchedule(input());
      first.enqueueArtifact(
        schedule,
        `${schedule.scheduleId}:${DUE}`,
        periodForRun(DUE, schedule.cadence),
        generated(),
        DUE,
      );
      first.close();

      const reopened = new ReportDeliveryStore(filename);
      expect(reopened.schedules()).toHaveLength(1);
      expect(reopened.deliveries()).toEqual([
        expect.objectContaining({ status: "pending", attemptCount: 0 }),
      ]);
      expect(Buffer.from(reopened.artifactForRun(`${schedule.scheduleId}:${DUE}`)!.content))
        .toEqual(Buffer.from("statement content"));
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("delivery formats and transports", () => {
  it.each([
    ["daily", "2026-03-31T00:00:00.000Z"],
    ["weekly", "2026-03-25T00:00:00.000Z"],
    ["monthly", "2026-03-01T00:00:00.000Z"],
    ["quarterly", "2026-01-01T00:00:00.000Z"],
  ] as const)("calculates the closed %s period", (cadence, expectedStart) => {
    expect(periodForRun(DUE, cadence)).toEqual({
      fromTimestamp: expectedStart,
      throughTimestamp: "2026-03-31T23:59:59.999Z",
    });
  });

  it("clamps month-end cadence without rolling into the wrong month", () => {
    expect(periodForRun("2026-03-31T00:00:00Z", "monthly")).toEqual({
      fromTimestamp: "2026-02-28T00:00:00.000Z",
      throughTimestamp: "2026-03-30T23:59:59.999Z",
    });
  });

  it("sends webhook evidence and idempotency headers", async () => {
    let request: { url: string; headers: Record<string, string>; body: Uint8Array } | undefined;
    const transport = new WebhookReportTransport(async (url, init) => {
      request = { url, headers: init.headers, body: init.body };
      return { ok: true, status: 204, async text() { return ""; } };
    });
    const store = new ReportDeliveryStore(":memory:");
    const schedule = store.saveSchedule(input());
    store.enqueueArtifact(schedule, `${schedule.scheduleId}:${DUE}`, periodForRun(DUE, "quarterly"), generated(), DUE);
    const claim = store.claimDue(DUE, 1_000)!;

    await transport.deliver(claim);

    expect(request).toMatchObject({
      url: "https://finance.example.test/statements",
      headers: {
        "idempotency-key": claim.delivery.idempotencyKey,
        "x-stellaragent-artifact-sha256": claim.artifact.sha256,
        "x-stellaragent-statement-id": claim.artifact.statementId,
      },
    });
    expect(Buffer.from(request!.body)).toEqual(Buffer.from("statement content"));
    store.close();
  });

  it("sends email with stable message identity, hash, and attachment", async () => {
    let message: EmailMessage | undefined;
    const transport = new EmailReportTransport({
      async send(value) { message = value; },
    });
    const store = new ReportDeliveryStore(":memory:");
    const schedule = store.saveSchedule(input([{
      id: "mail",
      kind: "email",
      to: ["compliance@example.test"],
      from: "reports@example.test",
    }]));
    store.enqueueArtifact(schedule, `${schedule.scheduleId}:${DUE}`, periodForRun(DUE, "quarterly"), generated(), DUE);
    const claim = store.claimDue(DUE, 1_000)!;

    await transport.deliver(claim);

    expect(message).toMatchObject({
      to: ["compliance@example.test"],
      from: "reports@example.test",
      messageId: claim.delivery.idempotencyKey,
      attachment: {
        filename: "statement.csv",
        contentType: "text/csv; charset=utf-8",
      },
    });
    expect(message!.text).toContain(claim.artifact.sha256);
    expect(Buffer.from(message!.attachment.content)).toEqual(Buffer.from("statement content"));
    store.close();
  });

  it("bridges email to a JSON provider with idempotency and base64 content", async () => {
    let request: {
      url: string;
      headers: Record<string, string>;
      body: string;
    } | undefined;
    const sender = new HttpEmailSender(
      "https://mail.example.test/v1/send",
      "gateway-token",
      async (url, init) => {
        request = { url, ...init };
        return { ok: true, status: 202, async text() { return ""; } };
      },
    );
    await sender.send({
      to: ["finance@example.test"],
      from: "reports@example.test",
      subject: "Monthly statement",
      text: "Attached",
      messageId: "stable-message-id",
      attachment: {
        filename: "statement.csv",
        contentType: "text/csv",
        content: Buffer.from("transactionHash,ledger\ntx-1,100\n"),
      },
    });

    expect(request).toMatchObject({
      url: "https://mail.example.test/v1/send",
      headers: {
        authorization: "Bearer gateway-token",
        "idempotency-key": "stable-message-id",
      },
    });
    expect(JSON.parse(request!.body)).toMatchObject({
      messageId: "stable-message-id",
      attachment: {
        filename: "statement.csv",
        contentType: "text/csv",
        contentBase64: Buffer.from("transactionHash,ledger\ntx-1,100\n")
          .toString("base64"),
      },
    });
    expect(request!.body).not.toContain('"content"');
  });

  it("reports email gateway failures for durable retry classification", async () => {
    const sender = new HttpEmailSender(
      "https://mail.example.test/v1/send",
      undefined,
      async () => ({
        ok: false,
        status: 503,
        async text() { return "provider unavailable"; },
      }),
    );
    await expect(sender.send({
      to: ["finance@example.test"],
      subject: "Statement",
      text: "Attached",
      messageId: "message-id",
      attachment: {
        filename: "statement.csv",
        contentType: "text/csv",
        content: Buffer.from("content"),
      },
    })).rejects.toThrow("email gateway returned 503: provider unavailable");
  });
});
