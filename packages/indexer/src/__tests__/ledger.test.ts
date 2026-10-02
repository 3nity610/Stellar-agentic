import { describe, expect, it } from "vitest";
import {
  NATIVE_ASSET,
  normalizeLedger,
  reconcileLedger,
  type BalancePosition,
  type LedgerEntry,
} from "../ledger.js";
import { EventStore } from "../store.js";
import type { DecodedEvent, StoredEvent } from "../types.js";

const CHANNEL = "CCHANNEL";
const ESCROW = "CESCROW";
const OWNER = "GOWNER";
const AGENT = "GAGENT";
const RECIPIENT = "GRECIPIENT";
const REQUESTER = "GREQUESTER";
const WORKER = "GWORKER";
const ARBITER = "GARBITER";
const USDC = "CUSDC";
const EURC = "CEURC";

let sequence = 0;

function metadata(
  contractKind: DecodedEvent["contractKind"],
  ledger: number,
  txHash: string,
) {
  sequence += 1;
  return {
    eventId: `${ledger}-${sequence}`,
    contractKind,
    contractAddress: contractKind === "paymentChannel" ? CHANNEL : ESCROW,
    ledger,
    ledgerClosedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ledger)).toISOString(),
    txHash,
    pagingToken: `${ledger}-${String(sequence).padStart(4, "0")}`,
    rawTopicXdr: [],
    rawValueXdr: "AAAA",
  };
}

function stored(payload: DecodedEvent): StoredEvent {
  const entityType = "channelId" in payload
    ? "channel"
    : "jobId" in payload
      ? "job"
      : "agent" in payload || "agentId" in payload
        ? "agent"
        : null;
  const entityId = "channelId" in payload
    ? payload.channelId
    : "jobId" in payload
      ? payload.jobId
      : "agentId" in payload
        ? payload.agentId
        : "agent" in payload
          ? payload.agent
          : null;
  return {
    eventId: payload.eventId,
    contractKind: payload.contractKind,
    contractAddress: payload.contractAddress,
    ledger: payload.ledger,
    ledgerClosedAt: payload.ledgerClosedAt,
    txHash: payload.txHash,
    pagingToken: payload.pagingToken,
    namespace: payload.namespace,
    action: payload.action,
    entityType,
    entityId,
    payload,
  };
}

function channelState(
  ledger: number,
  txHash: string,
  overrides: Record<string, string | number | boolean> = {},
): DecodedEvent {
  return {
    ...metadata("paymentChannel", ledger, txHash),
    namespace: "state",
    action: "channel",
    channelId: "1",
    state: {
      agent: AGENT,
      owner: OWNER,
      token: USDC,
      collateral: "1000",
      total_spent: "0",
      active: true,
      ...overrides,
    },
  };
}

function jobState(
  jobId: string,
  ledger: number,
  txHash: string,
  overrides: Record<string, string | number | boolean | null> = {},
): DecodedEvent {
  return {
    ...metadata("escrow", ledger, txHash),
    namespace: "state",
    action: "job",
    jobId,
    state: {
      requester: REQUESTER,
      worker: WORKER,
      arbiter: ARBITER,
      token: EURC,
      amount: "300",
      status: "Open",
      ...overrides,
    },
  };
}

function channelHistory(): DecodedEvent[] {
  return [
    {
      ...metadata("paymentChannel", 10, "tx-open"),
      namespace: "channel",
      action: "opened",
      channelId: "1",
      agent: AGENT,
      owner: OWNER,
      deposit: "1000",
    },
    channelState(10, "tx-open"),
    {
      ...metadata("paymentChannel", 11, "tx-pay"),
      namespace: "channel",
      action: "paid",
      channelId: "1",
      agent: AGENT,
      recipient: RECIPIENT,
      amount: "100",
      memo: "aW52b2ljZS0x",
    },
    channelState(11, "tx-pay", { collateral: "900", total_spent: "100" }),
    {
      ...metadata("paymentChannel", 12, "tx-convert"),
      namespace: "channel",
      action: "convpaid",
      channelId: "1",
      agent: AGENT,
      recipient: RECIPIENT,
      amount: "200",
      destinationToken: EURC,
      received: "1000",
      memo: "Y29udmVydGVk",
    },
    channelState(12, "tx-convert", { collateral: "700", total_spent: "300" }),
    {
      ...metadata("paymentChannel", 13, "tx-topup"),
      namespace: "channel",
      action: "topup",
      channelId: "1",
      owner: OWNER,
      amount: "200",
    },
    channelState(13, "tx-topup", { collateral: "900", total_spent: "300" }),
    {
      ...metadata("paymentChannel", 14, "tx-close"),
      namespace: "channel",
      action: "closed",
      channelId: "1",
      owner: OWNER,
      refund: "400",
    },
    channelState(14, "tx-close", { collateral: "500", total_spent: "300", active: false }),
  ];
}

function escrowHistory(): DecodedEvent[] {
  return [
    {
      ...metadata("escrow", 20, "tx-job-1"),
      namespace: "escrow",
      action: "created",
      jobId: "8",
      requester: REQUESTER,
      amount: "300",
    },
    jobState("8", 20, "tx-job-1"),
    {
      ...metadata("escrow", 21, "tx-release"),
      namespace: "escrow",
      action: "released",
      jobId: "8",
      worker: WORKER,
      amount: "300",
    },
    jobState("8", 21, "tx-release", { status: "Completed" }),
    {
      ...metadata("escrow", 22, "tx-job-2"),
      namespace: "escrow",
      action: "created",
      jobId: "9",
      requester: REQUESTER,
      amount: "300",
    },
    jobState("9", 22, "tx-job-2"),
    {
      ...metadata("escrow", 23, "tx-resolve"),
      namespace: "escrow",
      action: "resolved",
      jobId: "9",
      arbiter: ARBITER,
      favorWorker: false,
    },
    jobState("9", 23, "tx-resolve", { status: "Refunded" }),
  ];
}

function balances(entries: LedgerEntry[], opening: BalancePosition[]): BalancePosition[] {
  const values = new Map(opening.map((item) => [`${item.account}\0${item.asset}`, BigInt(item.amount)]));
  for (const item of entries) {
    for (const posting of item.postings) {
      const key = `${posting.account}\0${posting.asset}`;
      values.set(key, (values.get(key) ?? 0n) + BigInt(posting.amount));
    }
  }
  return [...values].map(([key, value]) => {
    const [account, asset] = key.split("\0");
    return { account, asset, amount: value.toString() };
  });
}

function expectBalanced(entries: LedgerEntry[]): void {
  for (const ledgerEntry of entries) {
    const totals = new Map<string, bigint>();
    for (const posting of ledgerEntry.postings) {
      totals.set(posting.asset, (totals.get(posting.asset) ?? 0n) + BigInt(posting.amount));
    }
    expect([...totals.values()], ledgerEntry.entryId).toEqual(
      [...totals.values()].map(() => 0n),
    );
  }
}

describe("normalized ledger", () => {
  it("creates balanced channel, payment, conversion, top-up and refund entries", () => {
    const result = normalizeLedger(channelHistory().map(stored));

    expect(result.issues).toEqual([]);
    expect(result.entries.map((item) => item.kind)).toEqual([
      "channel_funding",
      "channel_payment",
      "channel_conversion",
      "channel_top_up",
      "channel_refund",
    ]);
    expectBalanced(result.entries);

    const conversion = result.entries[2];
    expect(conversion).toMatchObject({
      txHash: "tx-convert",
      ledger: 12,
      agent: AGENT,
      owner: OWNER,
      counterparty: RECIPIENT,
      sourceAsset: USDC,
      sourceAmount: "200",
      destinationAsset: EURC,
      destinationAmount: "1000",
    });
    expect(conversion.postings).toEqual([
      expect.objectContaining({ account: CHANNEL, asset: USDC, amount: "-200" }),
      expect.objectContaining({ account: expect.stringMatching(/^conversion:/), asset: USDC, amount: "200" }),
      expect.objectContaining({ account: expect.stringMatching(/^conversion:/), asset: EURC, amount: "-1000" }),
      expect.objectContaining({ account: RECIPIENT, asset: EURC, amount: "1000" }),
    ]);
  });

  it("normalizes escrow lock, release and dispute refund without double counting state events", () => {
    const result = normalizeLedger(escrowHistory().map(stored));

    expect(result.issues).toEqual([]);
    expect(result.entries.map((item) => item.kind)).toEqual([
      "escrow_lock",
      "escrow_release",
      "escrow_lock",
      "escrow_refund",
    ]);
    expectBalanced(result.entries);
    expect(result.entries[3]).toMatchObject({
      txHash: "tx-resolve",
      counterparty: REQUESTER,
      metadata: { arbiter: ARBITER, resolvedDispute: true },
    });
  });

  it("adds confirmed fees as independently balanced native-asset entries", () => {
    const result = normalizeLedger([], [{
      txHash: "tx-fee",
      ledger: 30,
      ledgerClosedAt: "2026-01-01T00:00:30Z",
      payer: OWNER,
      charged: "427",
      agent: AGENT,
    }]);

    expect(result.entries).toEqual([
      expect.objectContaining({
        entryId: "fee:tx-fee",
        kind: "network_fee",
        sourceAsset: NATIVE_ASSET,
        sourceAmount: "427",
        txHash: "tx-fee",
        ledger: 30,
        agent: AGENT,
      }),
    ]);
    expect(result.entries[0].postings).toEqual([
      expect.objectContaining({ account: OWNER, amount: "-427" }),
      expect.objectContaining({ account: "stellar:network-fees", amount: "427" }),
    ]);
    expectBalanced(result.entries);
  });

  it("retains missing asset context as a visible issue", () => {
    const orphan: DecodedEvent = {
      ...metadata("paymentChannel", 40, "tx-orphan"),
      namespace: "channel",
      action: "paid",
      channelId: "404",
      agent: AGENT,
      recipient: RECIPIENT,
      amount: "5",
      memo: "",
    };
    const result = normalizeLedger([stored(orphan)]);

    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        eventId: orphan.eventId,
        txHash: "tx-orphan",
        code: "MISSING_CHANNEL_STATE",
      }),
    ]);
  });
});

describe("reconciliation", () => {
  it("reconciles each account/asset exactly from opening through closing", () => {
    const entries = normalizeLedger([
      ...channelHistory().map(stored),
      ...escrowHistory().map(stored),
    ]).entries;
    const opening: BalancePosition[] = [
      { account: OWNER, asset: USDC, amount: "10000" },
      { account: CHANNEL, asset: USDC, amount: "0" },
      { account: RECIPIENT, asset: USDC, amount: "0" },
      { account: RECIPIENT, asset: EURC, amount: "0" },
      { account: REQUESTER, asset: EURC, amount: "1000" },
      { account: ESCROW, asset: EURC, amount: "0" },
      { account: WORKER, asset: EURC, amount: "0" },
    ];

    const result = reconcileLedger(entries, {
      asOfLedger: 23,
      openingPositions: opening,
      onChainPositions: balances(entries, opening),
    });

    expect(result.reconciled).toBe(true);
    expect(result.checkedEntries).toBe(9);
    expect(result.lines.every((line) => line.status === "matched")).toBe(true);
    expect(result.lines.find((line) => line.account === CHANNEL && line.asset === USDC))
      .toMatchObject({ openingAmount: "0", activityAmount: "500", expectedAmount: "500" });
  });

  it("flags an on-chain discrepancy and a missing observation", () => {
    const entries = normalizeLedger(channelHistory().map(stored)).entries;
    const result = reconcileLedger(entries, {
      asOfLedger: 14,
      accounts: [CHANNEL, RECIPIENT],
      onChainPositions: [
        { account: CHANNEL, asset: USDC, amount: "499" },
        { account: RECIPIENT, asset: USDC, amount: "100" },
      ],
    });

    expect(result.reconciled).toBe(false);
    expect(result.lines.find((line) => line.account === CHANNEL)).toMatchObject({
      expectedAmount: "500",
      onChainAmount: "499",
      difference: "-1",
      status: "discrepancy",
    });
    expect(result.lines.find((line) => line.account === RECIPIENT && line.asset === EURC))
      .toMatchObject({ onChainAmount: null, status: "missing_on_chain" });
  });

  it("reconciles an arbitrary inclusive period from its opening checkpoint", () => {
    const entries = normalizeLedger(channelHistory().map(stored)).entries;
    const result = reconcileLedger(entries, {
      fromLedger: 12,
      asOfLedger: 14,
      accounts: [CHANNEL],
      openingPositions: [{ account: CHANNEL, asset: USDC, amount: "900" }],
      onChainPositions: [{ account: CHANNEL, asset: USDC, amount: "500" }],
    });

    expect(result).toMatchObject({
      fromLedger: 12,
      asOfLedger: 14,
      reconciled: true,
      checkedEntries: 3,
      lines: [{
        account: CHANNEL,
        asset: USDC,
        openingAmount: "900",
        activityAmount: "-400",
        expectedAmount: "500",
        onChainAmount: "500",
        difference: "0",
        status: "matched",
      }],
    });
  });

  it("rejects duplicate balance observations", () => {
    expect(() => reconcileLedger([], {
      asOfLedger: 1,
      onChainPositions: [
        { account: OWNER, asset: USDC, amount: "1" },
        { account: OWNER, asset: USDC, amount: "1" },
      ],
    })).toThrow("duplicate on-chain position");
    expect(() => reconcileLedger([], {
      fromLedger: 2,
      asOfLedger: 1,
      onChainPositions: [{ account: OWNER, asset: USDC, amount: "1" }],
    })).toThrow("fromLedger");
    expect(() => reconcileLedger([], {
      asOfLedger: 1,
      onChainPositions: [],
    })).toThrow("at least one observed balance");
  });
});

describe("EventStore ledger persistence", () => {
  it("persists queryable entries, fees, issues and reconciliation", () => {
    const store = new EventStore(":memory:");
    const history = channelHistory();
    store.replaceRange(10, 14, history);
    store.recordTransactionFees([{
      txHash: "tx-pay",
      ledger: 11,
      ledgerClosedAt: "2026-01-01T00:00:11Z",
      payer: OWNER,
      charged: "100",
      agent: AGENT,
      owner: OWNER,
    }]);

    expect(store.ledgerEntries()).toHaveLength(6);
    expect(store.ledgerEntries({ agent: AGENT })).toHaveLength(6);
    expect(store.ledgerEntries({ account: RECIPIENT })).toHaveLength(2);
    expect(store.ledgerEntries({ asset: EURC })).toHaveLength(1);
    expect(store.ledgerEntries({ kinds: ["network_fee"] })).toEqual([
      expect.objectContaining({ txHash: "tx-pay", sourceAmount: "100" }),
    ]);
    expect(store.ledgerIssues()).toEqual([]);

    const opening = [{ account: CHANNEL, asset: USDC, amount: "0" }];
    const channelEntries = store.ledgerEntries({ account: CHANNEL });
    expect(store.reconcile({
      asOfLedger: 14,
      accounts: [CHANNEL],
      openingPositions: opening,
      onChainPositions: balances(channelEntries, opening),
    }).reconciled).toBe(true);
    store.close();
  });

  it("atomically removes orphaned normalized rows and fees during replay", () => {
    const store = new EventStore(":memory:");
    const original = channelHistory();
    store.replaceRange(10, 14, original);
    store.recordTransactionFees([{
      txHash: "tx-close",
      ledger: 14,
      ledgerClosedAt: "2026-01-01T00:00:14Z",
      payer: OWNER,
      charged: "99",
    }]);
    expect(store.ledgerEntries()).toHaveLength(6);

    const canonical = original.filter((event) => event.ledger < 14);
    store.replaceRange(14, 14, []);

    expect(store.allEvents().map((event) => event.eventId)).toEqual(
      canonical.map((event) => event.eventId),
    );
    expect(store.ledgerEntries().map((item) => item.txHash)).not.toContain("tx-close");
    expect(store.ledgerEntries({ kinds: ["network_fee"] })).toEqual([]);
    store.close();
  });

  it("iterates stable pages without imposing a total reporting ceiling", () => {
    const store = new EventStore(":memory:");
    store.recordTransactionFees(Array.from({ length: 13 }, (_, index) => ({
      txHash: `tx-page-${String(index).padStart(2, "0")}`,
      ledger: 100 + index,
      ledgerClosedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      payer: OWNER,
      charged: "1",
      agent: AGENT,
    })));

    const iterated = [...store.iterateLedgerEntries({}, 5)];
    expect(iterated).toHaveLength(13);
    expect(iterated.map((entry) => entry.ledger)).toEqual(
      Array.from({ length: 13 }, (_, index) => 100 + index),
    );
    expect(store.statement({ subject: { kind: "agent", id: AGENT }, period: {} })
      .lines).toHaveLength(13);
    store.close();
  });
});
