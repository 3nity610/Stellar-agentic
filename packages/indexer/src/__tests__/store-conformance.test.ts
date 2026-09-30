import { describe, expect, it } from "vitest";
import { EventStore, InMemoryEventStore, type IEventStore } from "../store.js";
import type { DecodedEvent } from "../types.js";

const base = {
  contractKind: "paymentChannel" as const,
  contractAddress: "CPAYMENT",
  ledgerClosedAt: "2026-01-01T00:00:00Z",
  txHash: "tx",
  rawTopicXdr: [],
  rawValueXdr: "",
};

function payment(
  eventId: string,
  ledger: number,
  amount: string,
): DecodedEvent {
  return {
    ...base,
    eventId,
    ledger,
    pagingToken: `${ledger}-1`,
    namespace: "channel",
    action: "paid",
    channelId: "9",
    agent: "GAGENT",
    recipient: "GRECIPIENT",
    amount,
    memo: "",
  };
}

describe.each([
  { name: "EventStore (SQLite in-memory)", factory: () => new EventStore(":memory:") },
  { name: "InMemoryEventStore (Pure in-memory)", factory: () => new InMemoryEventStore() },
])("Store Conformance: $name", ({ factory }) => {
  it("serves agent and spend audit queries", () => {
    const store: IEventStore = factory();
    store.replaceRange(10, 11, [
      payment("one", 10, "25"),
      payment("two", 11, "75"),
    ]);

    expect(store.checkpoint()).toBe(12);
    expect(store.eventsForAgent("GAGENT")).toHaveLength(2);
    expect(store.eventsForAgent("GRECIPIENT")).toHaveLength(2);
    expect(store.spendHistory("9")).toMatchObject({ totalSpent: "100" });
    expect(store.eventCount()).toBe(2);
    store.close();
  });

  it("atomically replaces a replayed ledger range after a reorg", () => {
    const store: IEventStore = factory();
    store.replaceRange(20, 20, [payment("orphaned", 20, "50")]);
    expect(store.eventCount()).toBe(1);

    store.replaceRange(20, 21, [payment("canonical", 20, "70")]);

    expect(store.allEvents().map((event) => event.eventId)).toEqual(["canonical"]);
    expect(store.spendHistory("9").totalSpent).toBe("70");
    expect(store.checkpoint()).toBe(22);
    expect(store.eventCount()).toBe(1);
    store.close();
  });

  it("derives a job lifecycle in ledger order", () => {
    const store: IEventStore = factory();
    const jobEvents: DecodedEvent[] = [
      {
        ...base,
        contractKind: "escrow",
        eventId: "created",
        ledger: 30,
        pagingToken: "30-1",
        namespace: "escrow",
        action: "created",
        jobId: "3",
        requester: "GREQUESTER",
        amount: "500",
      },
      {
        ...base,
        contractKind: "escrow",
        eventId: "accepted",
        ledger: 31,
        pagingToken: "31-1",
        namespace: "escrow",
        action: "accepted",
        jobId: "3",
        worker: "GWORKER",
      },
      {
        ...base,
        contractKind: "escrow",
        eventId: "result",
        ledger: 32,
        pagingToken: "32-1",
        namespace: "escrow",
        action: "result",
        jobId: "3",
        worker: "GWORKER",
      },
    ];
    store.replaceRange(30, 32, jobEvents);

    expect(store.jobLifecycle("3")).toMatchObject({
      status: "PendingRelease",
      events: [{ eventId: "created" }, { eventId: "accepted" }, { eventId: "result" }],
    });
    store.close();
  });

  it("returns exact latest state snapshots", () => {
    const store: IEventStore = factory();
    store.replaceRange(40, 41, [
      {
        ...base,
        eventId: "state-one",
        ledger: 40,
        pagingToken: "40-1",
        namespace: "state",
        action: "channel",
        channelId: "9",
        state: { active: true, total_spent: "10" },
      },
      {
        ...base,
        eventId: "state-two",
        ledger: 41,
        pagingToken: "41-1",
        namespace: "state",
        action: "channel",
        channelId: "9",
        state: { active: true, total_spent: "25" },
      },
    ]);

    expect(store.channelState("9")).toEqual({ active: true, total_spent: "25" });
    store.close();
  });

  it("records transaction fees and normalizes ledger entries", () => {
    const store: IEventStore = factory();
    store.replaceRange(50, 50, [payment("p-1", 50, "100")]);
    store.recordTransactionFees([
      {
        txHash: "tx",
        ledger: 50,
        ledgerClosedAt: "2026-01-01T00:00:00Z",
        payer: "GPAYER",
        charged: "1000",
        agent: "GAGENT",
      },
    ]);

    const entries = store.ledgerEntries({ fromLedger: 50, throughLedger: 50 });
    expect(entries.length).toBeGreaterThan(0);
    store.close();
  });
});
