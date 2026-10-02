import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { nativeToScVal, xdr, type SorobanRpc } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createQueryServer } from "../api.js";
import { ReportDeliveryStore } from "../delivery.js";
import { SorobanEventIndexer } from "../indexer.js";
import {
  IndexerProgressReporter,
  renderPrometheusMetrics,
} from "../progress.js";
import { EventStore } from "../store.js";
import type { EventSource } from "../types.js";

const contracts = {
  paymentChannel: "CPAYMENT",
  escrow: "CESCROW",
  rateLimiter: "CRATE",
  agentWalletFactory: "CFACTORY",
};

const servers: Server[] = [];
const eventStores: EventStore[] = [];
const deliveryStores: ReportDeliveryStore[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  eventStores.splice(0).forEach((store) => store.close());
  deliveryStores.splice(0).forEach((store) => store.close());
});

/** A decodable `rl/recorded` event at `ledger`, as the RPC would return it. */
function rlEvent(id: string, ledger: number) {
  return {
    id,
    type: "contract" as const,
    ledger,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    pagingToken: `${ledger}-${id}`,
    inSuccessfulContractCall: true,
    txHash: `tx-${id}`,
    contractId: { toString: () => contracts.rateLimiter },
    topic: [xdr.ScVal.scvSymbol("rl"), xdr.ScVal.scvSymbol("recorded")],
    value: xdr.ScVal.scvVec([nativeToScVal("GAGENT"), nativeToScVal(1n)]),
  } as SorobanRpc.Api.EventResponse;
}

/** An event from a contract the indexer was not configured with — a decode failure. */
function unconfiguredEvent(id: string, ledger: number) {
  return {
    ...rlEvent(id, ledger),
    contractId: { toString: () => "CUNCONFIGURED" },
  } as SorobanRpc.Api.EventResponse;
}

async function listen(store: EventStore, options: Parameters<typeof createQueryServer>[1]) {
  const server = createQueryServer(store, options);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Every non-comment, non-blank line of a valid Prometheus sample. */
const SAMPLE_LINE = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? -?(\d|\.|\+|-|e|E|Inf|NaN)[^\s]*$/;

/** Parse `name{labels} value` samples into a map, for readable assertions. */
function parseSamples(text: string): Map<string, number> {
  const samples = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.lastIndexOf(" ");
    samples.set(line.slice(0, separator), Number(line.slice(separator + 1)));
  }
  return samples;
}

describe("indexer observability endpoints", () => {
  it("reports lag, throughput, and decode failures on /health and /metrics", async () => {
    // Two decodable events and one from an unconfigured contract, so the run
    // both commits and counts a decode failure.
    let head = 100;
    const source: EventSource = {
      async getEvents() {
        return {
          latestLedger: head,
          events: [rlEvent("a", 98), rlEvent("b", 99), unconfiguredEvent("bad", 99)],
        };
      },
    };
    const store = new EventStore(":memory:");
    eventStores.push(store);
    const indexer = new SorobanEventIndexer({
      source,
      store,
      contracts,
      startLedger: 90,
      rollbackWindow: 5,
      finalityLag: 1,
    });

    await indexer.runOnce();
    head = 140;
    await indexer.runOnce();

    const baseUrl = await listen(store, {
      progress: () => indexer.progressReporter.snapshot(),
    });

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("content-type")).toContain("application/json");
    await expect(health.json()).resolves.toMatchObject({
      // Liveness stays true; the degraded verdict is a separate field.
      ok: true,
      status: "ok",
      lagLedgers: 1,
      latestLedger: 140,
      indexedThroughLedger: 139,
      // Two runs, two events each, minus nothing: the malformed event is
      // re-attempted on the second run's rollback replay, so it counts twice.
      eventsProcessed: 4,
      eventsStored: 2,
      decodeFailures: 2,
      lastError: null,
      lastErrorAt: null,
      consecutiveFailures: 0,
      runs: 2,
      successfulRuns: 2,
      rollbackWindowLedgers: 5,
      finalityLagLedgers: 1,
      ledgerIssues: 0,
    });

    const metrics = await fetch(`${baseUrl}/metrics`);
    expect(metrics.status).toBe(200);
    expect(metrics.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    const text = await metrics.text();
    expect(text).toMatch(/^# HELP stellaragent_indexer_lag_ledgers /m);
    expect(text).toMatch(/^# TYPE stellaragent_indexer_lag_ledgers gauge$/m);
    expect(text).toMatch(/^# TYPE stellaragent_indexer_events_processed_total counter$/m);

    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      expect(line, `not a valid Prometheus sample: ${line}`).toMatch(SAMPLE_LINE);
    }

    const samples = parseSamples(text);
    expect(samples.get("stellaragent_indexer_lag_ledgers")).toBe(1);
    expect(samples.get("stellaragent_indexer_latest_ledger")).toBe(140);
    expect(samples.get("stellaragent_indexer_indexed_through_ledger")).toBe(139);
    expect(samples.get("stellaragent_indexer_events_processed_total")).toBe(4);
    expect(samples.get("stellaragent_indexer_decode_failures_total")).toBe(2);
    expect(samples.get("stellaragent_indexer_events_stored")).toBe(2);
    expect(samples.get("stellaragent_indexer_up")).toBe(1);
    expect(samples.get("stellaragent_indexer_last_error")).toBe(0);
    expect(samples.get("stellaragent_indexer_rollback_window_ledgers")).toBe(5);
    // A healthy run leaves the error gauge at zero and no error-info series.
    expect(text).not.toContain("stellaragent_indexer_last_error_info{");
  });

  it("surfaces a failed run's error and clears it on the next success", async () => {
    let failing = true;
    const source: EventSource = {
      async getEvents() {
        if (failing) throw new Error("rpc connection reset by peer");
        return { latestLedger: 60, events: [rlEvent("a", 59)] };
      },
    };
    const store = new EventStore(":memory:");
    eventStores.push(store);
    const indexer = new SorobanEventIndexer({
      source,
      store,
      contracts,
      startLedger: 50,
      finalityLag: 1,
    });

    await expect(indexer.runOnce()).rejects.toThrow("rpc connection reset by peer");

    const baseUrl = await listen(store, {
      progress: () => indexer.progressReporter.snapshot(),
    });

    const degraded = await (await fetch(`${baseUrl}/health`)).json() as Record<string, unknown>;
    expect(degraded).toMatchObject({
      ok: true,
      status: "degraded",
      lastError: "rpc connection reset by peer",
      consecutiveFailures: 1,
      runs: 1,
      successfulRuns: 0,
      // Nothing committed, so lag is unknown rather than a misleading zero.
      lagLedgers: null,
      nextLedger: null,
    });
    expect(degraded.lastErrorAt).toEqual(expect.any(String));

    const degradedText = await (await fetch(`${baseUrl}/metrics`)).text();
    const degradedSamples = parseSamples(degradedText);
    expect(degradedSamples.get("stellaragent_indexer_up")).toBe(0);
    expect(degradedSamples.get("stellaragent_indexer_last_error")).toBe(1);
    expect(degradedSamples.get("stellaragent_indexer_consecutive_failures")).toBe(1);
    expect(degradedSamples.get("stellaragent_indexer_successful_runs_total")).toBe(0);
    expect(degradedText).toContain(
      'stellaragent_indexer_last_error_info{message="rpc connection reset by peer"} 1',
    );
    // No committed run means no head to compare against, so no lag series at all.
    expect(degradedText).not.toContain("stellaragent_indexer_lag_ledgers 0");

    failing = false;
    await indexer.runOnce();

    const recoveredText = await (await fetch(`${baseUrl}/metrics`)).text();
    const recoveredSamples = parseSamples(recoveredText);
    expect(recoveredSamples.get("stellaragent_indexer_up")).toBe(1);
    expect(recoveredSamples.get("stellaragent_indexer_last_error")).toBe(0);
    expect(recoveredSamples.get("stellaragent_indexer_consecutive_failures")).toBe(0);
    expect(recoveredSamples.get("stellaragent_indexer_lag_ledgers")).toBe(1);
    // The message is dropped, but its timestamp survives for post-mortems.
    expect(recoveredText).not.toContain("stellaragent_indexer_last_error_info{");
    expect(recoveredSamples.get("stellaragent_indexer_last_error_timestamp_seconds")).toBeGreaterThan(0);
  });

  it("adds delivery gauges only when scheduling is configured", async () => {
    const store = new EventStore(":memory:");
    eventStores.push(store);
    const reporter = new IndexerProgressReporter({ rollbackWindow: 12, finalityLag: 1 });
    reporter.recordRun({
      fromLedger: 10,
      throughLedger: 20,
      eventCount: 3,
      decodeFailures: 0,
      latestLedger: 21,
    });

    const withoutScheduling = await listen(store, { progress: () => reporter.snapshot() });
    const plain = await (await fetch(`${withoutScheduling}/metrics`)).text();
    expect(plain).toContain("stellaragent_indexer_lag_ledgers 1");
    expect(plain).not.toContain("stellaragent_indexer_report_schedules");

    const deliveryStore = new ReportDeliveryStore(":memory:");
    deliveryStores.push(deliveryStore);
    const withScheduling = await listen(store, {
      progress: () => reporter.snapshot(),
      deliveryStore,
    });
    const scheduled = await (await fetch(`${withScheduling}/metrics`)).text();
    expect(parseSamples(scheduled).get("stellaragent_indexer_report_schedules")).toBe(0);
    expect(parseSamples(scheduled).get("stellaragent_indexer_report_dead_letters")).toBe(0);
  });

  it("omits lag rather than claiming zero when no reporter is attached", async () => {
    const store = new EventStore(":memory:");
    eventStores.push(store);
    const baseUrl = await listen(store, {});

    await expect((await fetch(`${baseUrl}/health`)).json()).resolves.toMatchObject({
      status: "ok",
      lagLedgers: null,
      latestLedger: null,
      eventsProcessed: 0,
    });
    const text = await (await fetch(`${baseUrl}/metrics`)).text();
    // Store-derived gauges are still real.
    expect(parseSamples(text).get("stellaragent_indexer_events_stored")).toBe(0);
    expect(text).not.toContain("stellaragent_indexer_lag_ledgers ");
  });
});

describe("lag arithmetic", () => {
  it("is the distance between the RPC head and the last committed ledger", () => {
    const reporter = new IndexerProgressReporter();
    // A head that ran away while the indexer was down.
    reporter.recordRun({
      fromLedger: 1,
      throughLedger: 99,
      eventCount: 0,
      decodeFailures: 0,
      latestLedger: 140,
    });
    expect(reporter.snapshot().lagLedgers).toBe(41);
  });

  it("clamps at zero when the head is behind the checkpoint", () => {
    const reporter = new IndexerProgressReporter();
    reporter.recordRun({
      fromLedger: 1,
      throughLedger: 99,
      eventCount: 0,
      decodeFailures: 0,
      latestLedger: 98,
    });
    expect(reporter.snapshot().lagLedgers).toBe(0);
  });

  it("is null before anything has been committed", () => {
    const reporter = new IndexerProgressReporter();
    expect(reporter.snapshot().lagLedgers).toBeNull();
    expect(reporter.snapshot().started).toBe(false);
    reporter.recordLatestLedger(500);
    // A known head with nothing committed is still not a measurable distance.
    expect(reporter.snapshot().lagLedgers).toBeNull();
  });

  it("escapes label values so a hostile error message cannot break the format", () => {
    const reporter = new IndexerProgressReporter();
    reporter.recordFailure(new Error('bad "quote" and \\backslash\nand newline'));
    const text = renderPrometheusMetrics({ progress: reporter.snapshot() });
    expect(text).toContain(
      'stellaragent_indexer_last_error_info{message="bad \\"quote\\" and \\\\backslash\\nand newline"} 1',
    );
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      expect(line).toMatch(SAMPLE_LINE);
    }
  });
});
