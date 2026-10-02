import { nativeToScVal, xdr, type SorobanRpc } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { SorobanEventIndexer } from "../indexer.js";
import { EventStore } from "../store.js";
import type { EventSource } from "../types.js";

const contracts = {
  paymentChannel: "CPAYMENT",
  escrow: "CESCROW",
  rateLimiter: "CRATE",
  agentWalletFactory: "CFACTORY",
};

function rpcEvent(id: string, ledger: number, amount: bigint) {
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
    value: xdr.ScVal.scvVec([
      nativeToScVal("GAGENT"),
      nativeToScVal(amount),
    ]),
  } as SorobanRpc.Api.EventResponse;
}

const CHANNEL_ID = "7";
const AGENT = "GAGENT";
const OWNER = "GOWNER";

/** A payment-channel event with an explicit transaction hash and paging token. */
function channelEvent(
  id: string,
  ledger: number,
  txHash: string,
  action: "opened" | "paid",
  value: unknown[],
  pagingToken = `${ledger}-0`,
): SorobanRpc.Api.EventResponse {
  return {
    id,
    type: "contract",
    ledger,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    pagingToken,
    inSuccessfulContractCall: true,
    txHash,
    contractId: { toString: () => contracts.paymentChannel },
    topic: [xdr.ScVal.scvSymbol("channel"), xdr.ScVal.scvSymbol(action)],
    value: xdr.ScVal.scvVec(value.map((item) => nativeToScVal(item))),
  } as SorobanRpc.Api.EventResponse;
}

/** The `state/channel` snapshot a payment needs to normalize without an issue. */
function channelStateEvent(ledger: number, txHash: string): SorobanRpc.Api.EventResponse {
  return {
    id: `state-${ledger}`,
    type: "contract",
    ledger,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    pagingToken: `${ledger}-state`,
    inSuccessfulContractCall: true,
    txHash,
    contractId: { toString: () => contracts.paymentChannel },
    topic: [xdr.ScVal.scvSymbol("state"), xdr.ScVal.scvSymbol("channel")],
    value: xdr.ScVal.scvVec([
      nativeToScVal(CHANNEL_ID),
      nativeToScVal({ token: "USDC", owner: OWNER, agent: AGENT, active: true }),
    ]),
  } as SorobanRpc.Api.EventResponse;
}

interface ForkedChain {
  /** The canonical events the RPC will return; mutate this to fork the chain. */
  events: SorobanRpc.Api.EventResponse[];
  latestLedger: number;
  /** `startLedger` of every fetch, so tests can assert how far it rewound. */
  starts: number[];
  source: EventSource;
}

/**
 * A chain double that answers with a fixed canonical event list and a movable
 * head. Mutating `events` to a different list at the same heights is exactly
 * what a fork looks like to the indexer: same ledger, different hashes.
 */
function forkedChain(
  initial: SorobanRpc.Api.EventResponse[],
  latestLedger: number,
): ForkedChain {
  const chain: ForkedChain = {
    events: initial,
    latestLedger,
    starts: [],
    source: {
      async getEvents(request: SorobanRpc.Server.GetEventsRequest) {
        chain.starts.push(request.startLedger!);
        return { latestLedger: chain.latestLedger, events: chain.events };
      },
    },
  };
  return chain;
}

/** A channel payment plus the state snapshot its ledger needs to normalize. */
function paymentAt(ledger: number, id: string, amount: bigint): SorobanRpc.Api.EventResponse[] {
  return [
    channelStateEvent(ledger, `tx-${id}`),
    channelEvent(id, ledger, `tx-${id}`, "paid", [CHANNEL_ID, AGENT, "GRECIPIENT", amount, id], `${ledger}-1`),
  ];
}

describe("SorobanEventIndexer", () => {
  it("replays its rollback window and removes orphaned RPC events", async () => {
    let canonical = [rpcEvent("old", 99, 10n)];
    const starts: number[] = [];
    const source: EventSource = {
      async getEvents(request) {
        starts.push(request.startLedger!);
        return { latestLedger: 100, events: canonical };
      },
    };
    const store = new EventStore(":memory:");
    const indexer = new SorobanEventIndexer({
      source,
      store,
      contracts,
      startLedger: 90,
      rollbackWindow: 5,
      finalityLag: 0,
    });

    await indexer.runOnce();
    canonical = [rpcEvent("replacement", 99, 20n)];
    await indexer.runOnce();

    expect(starts).toEqual([90, 96]);
    expect(store.allEvents().map((event) => event.eventId)).toEqual(["replacement"]);
    expect(store.checkpoint()).toBe(101);
    store.close();
  });

  it("follows paging tokens and honors the finality lag", async () => {
    const requests: SorobanRpc.Server.GetEventsRequest[] = [];
    const source: EventSource = {
      async getEvents(request) {
        requests.push(request);
        if (!request.cursor) {
          return { latestLedger: 50, events: [rpcEvent("a", 48, 1n)] };
        }
        if (request.cursor === "48-a") {
          return { latestLedger: 51, events: [rpcEvent("b", 50, 2n)] };
        }
        return { latestLedger: 51, events: [] };
      },
    };
    const store = new EventStore(":memory:");
    const indexer = new SorobanEventIndexer({
      source,
      store,
      contracts,
      startLedger: 40,
      finalityLag: 1,
      pageSize: 1,
    });

    const result = await indexer.runOnce();
    expect(requests[1]).toMatchObject({ cursor: "48-a" });
    expect(requests[1].startLedger).toBeUndefined();
    expect(result).toEqual({ fromLedger: 40, throughLedger: 49, eventCount: 1 });
    expect(store.allEvents().map((event) => event.eventId)).toEqual(["a"]);
    store.close();
  });
});

describe("reorg safety", () => {
  const OPENING = channelEvent(
    "open",
    90,
    "tx-open",
    "opened",
    [CHANNEL_ID, AGENT, OWNER, 1_000n],
  );
  const OPENING_STATE = channelStateEvent(90, "tx-open");

  it("removes the orphaned branch instead of superseding it", async () => {
    // Both branches occupy ledger 95 and reuse the same paging token — the
    // event id and transaction hash are all that differ, which is what a fork
    // at a given height actually looks like over RPC.
    const orphan = channelEvent("pay-orphan", 95, "tx-orphan", "paid", [
      CHANNEL_ID, AGENT, "G_ORPHAN_RECIPIENT", 10n, "orphan",
    ]);
    const winner = channelEvent("pay-winner", 95, "tx-winner", "paid", [
      CHANNEL_ID, AGENT, "G_WINNER_RECIPIENT", 77n, "winner",
    ]);
    const chain = forkedChain([OPENING, OPENING_STATE, orphan], 100);
    const store = new EventStore(":memory:");
    const indexer = new SorobanEventIndexer({
      source: chain.source,
      store,
      contracts,
      startLedger: 90,
      rollbackWindow: 12,
      finalityLag: 0,
    });

    await indexer.runOnce();
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("10");
    expect(store.eventsForAgent("G_ORPHAN_RECIPIENT").map((e) => e.eventId))
      .toEqual(["pay-orphan"]);

    // The chain forks: same height, new hashes, and the old payment is gone
    // from the network entirely.
    chain.events = [OPENING, OPENING_STATE, winner];
    await indexer.runOnce();

    const stored = store.allEvents();
    expect(stored.map((event) => event.eventId)).not.toContain("pay-orphan");
    expect(stored.map((event) => event.eventId)).toEqual(["open", "state-90", "pay-winner"]);

    // Removed, not merely superseded: no participant index row survives for
    // the orphan either, so the address no longer appears in agent queries.
    expect(store.eventsForAgent("G_ORPHAN_RECIPIENT")).toEqual([]);
    expect(store.eventsForAgent("G_WINNER_RECIPIENT").map((e) => e.eventId))
      .toEqual(["pay-winner"]);

    // Every derived view is rebuilt from the winning branch only.
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("77");
    expect(store.spendHistory(CHANNEL_ID).payments.map((e) => e.txHash))
      .toEqual(["tx-winner"]);
    const entries = store.ledgerEntries({ kinds: ["channel_payment"] });
    expect(entries.map((entry) => entry.txHash)).toEqual(["tx-winner"]);
    expect(entries[0].sourceAmount).toBe("77");
    expect(store.ledgerIssues()).toEqual([]);

    // The checkpoint tracks the winning chain, not the abandoned one.
    expect(store.checkpoint()).toBe(101);
    store.close();
  });

  it("erases a branch whose replacement ledger has no events at all", async () => {
    const orphan = channelEvent("pay-orphan", 95, "tx-orphan", "paid", [
      CHANNEL_ID, AGENT, "G_ORPHAN_RECIPIENT", 10n, "orphan",
    ]);
    const chain = forkedChain([OPENING, OPENING_STATE, orphan], 100);
    const store = new EventStore(":memory:");
    const indexer = new SorobanEventIndexer({
      source: chain.source,
      store,
      contracts,
      startLedger: 90,
      rollbackWindow: 12,
      finalityLag: 0,
    });

    await indexer.runOnce();
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("10");

    // Ledger 95 closes empty on the winning branch: the whole payment vanished.
    chain.events = [OPENING, OPENING_STATE];
    await indexer.runOnce();

    expect(store.allEvents().map((event) => event.eventId)).toEqual(["open", "state-90"]);
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("0");
    expect(store.ledgerEntries({ kinds: ["channel_payment"] })).toEqual([]);
    expect(store.checkpoint()).toBe(101);
    store.close();
  });

  it("converges on a reorg inside the rollback window and rewinds only that far", async () => {
    const chain = forkedChain(
      [rpcEvent("a", 16, 1n), rpcEvent("b", 19, 2n)],
      20,
    );
    const store = new EventStore(":memory:");
    const indexer = new SorobanEventIndexer({
      source: chain.source,
      store,
      contracts,
      startLedger: 1,
      rollbackWindow: 4,
      finalityLag: 1,
    });

    await indexer.runOnce();
    // head 20, finalityLag 1, rollbackWindow 4 → the next poll re-reads 16..19.
    expect(chain.starts).toEqual([1]);

    chain.events = [rpcEvent("a2", 16, 5n), rpcEvent("b2", 19, 6n)];
    await indexer.runOnce();
    expect(chain.starts).toEqual([1, 16]);
    expect(store.allEvents().map((event) => event.eventId)).toEqual(["a2", "b2"]);
    expect(store.checkpoint()).toBe(20);
    store.close();
  });

  it("does not silently repair a reorg deeper than the rollback window", async () => {
    // A full history: one payment per ledger 1..20, then the chain forks at 3.
    const history = Array.from({ length: 20 }, (_, index) =>
      paymentAt(index + 1, `e${index + 1}`, BigInt(index + 1))).flat();
    const chain = forkedChain(history, 21);
    const store = new EventStore(":memory:");
    const indexer = new SorobanEventIndexer({
      source: chain.source,
      store,
      contracts,
      startLedger: 1,
      rollbackWindow: 4,
      finalityLag: 1,
    });

    await indexer.runOnce();
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("210");
    expect(store.ledgerEntries({ kinds: ["channel_payment"] })).toHaveLength(20);
    expect(store.checkpoint()).toBe(21);

    // Fork at ledger 3, 18 ledgers behind the head — far outside the window.
    const forked = [
      ...paymentAt(1, "e1", 1n),
      ...paymentAt(2, "e2", 2n),
      ...paymentAt(3, "e3-forked", 999n),
      ...Array.from({ length: 17 }, (_, index) =>
        paymentAt(index + 4, `e${index + 4}`, BigInt(index + 4))).flat(),
    ];
    chain.events = forked;
    await indexer.runOnce();

    // The next poll only re-reads 17..20, so the orphaned payment survives.
    // This is the documented depth limit, not something the store can paper
    // over: it deletes exactly the range it re-read, and nothing outside it.
    expect(chain.starts).toEqual([1, 17]);
    const orphaned = store.allEvents().find((event) => event.eventId === "e3");
    expect(orphaned).toBeDefined();
    expect(orphaned!.txHash).toBe("tx-e3");
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("210");

    // Recovery is an explicit replay from the fork point, which is exactly what
    // `--from-ledger` does. The store then matches the winning chain, events
    // and normalized ledger alike.
    await indexer.runOnce(3);
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("1206");
    // Sorted because the store orders by (ledger, paging token) and the
    // snapshot sorts ahead of the payment it accompanies.
    expect(store.allEvents().map((event) => event.eventId).sort())
      .toEqual(forked.map((event) => event.id).sort());
    expect(store.allEvents().some((event) => event.eventId === "e3")).toBe(false);
    expect(store.ledgerEntries({ kinds: ["channel_payment"] }).map((entry) => entry.txHash))
      .toEqual(forked.filter((event) => event.id.startsWith("e")).map((event) => event.txHash));
    expect(store.ledgerEntries({ kinds: ["channel_payment"] })).not.toContainEqual(
      expect.objectContaining({ txHash: "tx-e3" }),
    );
    store.close();
  });

  it("repairs the oldest ledger inside the window and nothing below it", async () => {
    // head 21 with finalityLag 1 commits through ledger 20, and rollbackWindow
    // 4 makes the next poll re-read 17..20. So ledger 17 is the oldest fork
    // the indexer can repair and ledger 16 is the first it cannot. This is
    // the exact boundary documented in the README.
    const base = Array.from({ length: 20 }, (_, index) =>
      paymentAt(index + 1, `e${index + 1}`, BigInt(index + 1))).flat();

    for (const [forkLedger, repaired] of [[17, true], [16, false]] as const) {
      const chain = forkedChain(base, 21);
      const store = new EventStore(":memory:");
      const indexer = new SorobanEventIndexer({
        source: chain.source,
        store,
        contracts,
        startLedger: 1,
        rollbackWindow: 4,
        finalityLag: 1,
      });

      await indexer.runOnce();
      const original = base.filter((event) => event.ledger === forkLedger);
      chain.events = base.flatMap((event) =>
        event.ledger === forkLedger
          ? paymentAt(forkLedger, `e${forkLedger}-forked`, 999n)
          : [event]);
      await indexer.runOnce();

      const survived = store.allEvents()
        .filter((event) => event.ledger === forkLedger)
        .map((event) => event.eventId)
        .sort();
      expect(survived, `fork at ledger ${forkLedger}`).toEqual(
        repaired
          ? [`e${forkLedger}-forked`, `state-${forkLedger}`].sort()
          : original.map((event) => event.id).sort(),
      );
      expect(chain.starts, `fork at ledger ${forkLedger}`).toEqual([1, 17]);
      store.close();
    }
  });

  it("keeps a repeated poll idempotent, so a rewind never double-counts", async () => {
    const chain = forkedChain([OPENING, OPENING_STATE], 100);
    const store = new EventStore(":memory:");
    const indexer = new SorobanEventIndexer({
      source: chain.source,
      store,
      contracts,
      startLedger: 90,
      rollbackWindow: 12,
      finalityLag: 0,
    });

    await indexer.runOnce();
    const afterFirst = store.ledgerEntries();
    await indexer.runOnce();
    await indexer.runOnce();

    expect(store.allEvents()).toHaveLength(2);
    expect(store.ledgerEntries()).toEqual(afterFirst);
    expect(store.spendHistory(CHANNEL_ID).totalSpent).toBe("0");
    expect(store.checkpoint()).toBe(101);
    store.close();
  });
});
