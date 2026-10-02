import { describe, expect, it } from "vitest";
import {
  ReportDeliveryStore,
  ScheduledReportService,
  eventStoreArtifactBuilder,
  type ClaimedDelivery,
  type DeliveryTransport,
} from "../delivery.js";
import { collectStatementExport } from "../export.js";
import type { BalancePosition, LedgerEntry } from "../ledger.js";
import { EventStore } from "../store.js";
import type { DecodedEvent } from "../types.js";

const OWNER = "GOWNER";
const AGENT = "GAGENT";
const RECIPIENT = "GRECIPIENT";
const CHANNEL = "CCHANNEL";
const USDC = "CUSDC";
const EURC = "CEURC";

let order = 0;

function metadata(ledger: number, txHash: string) {
  order += 1;
  return {
    eventId: `audit-${ledger}-${order}`,
    contractKind: "paymentChannel" as const,
    contractAddress: CHANNEL,
    ledger,
    ledgerClosedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ledger - 100)).toISOString(),
    txHash,
    pagingToken: `${ledger}-${String(order).padStart(4, "0")}`,
    rawTopicXdr: [],
    rawValueXdr: "AAAA",
  };
}

function state(
  ledger: number,
  txHash: string,
  collateral: string,
  totalSpent: string,
  active = true,
): DecodedEvent {
  return {
    ...metadata(ledger, txHash),
    namespace: "state",
    action: "channel",
    channelId: "audit-channel",
    state: {
      owner: OWNER,
      agent: AGENT,
      token: USDC,
      collateral,
      total_spent: totalSpent,
      active,
    },
  };
}

function seededHistory(): DecodedEvent[] {
  order = 0;
  return [
    {
      ...metadata(100, "tx-open"),
      namespace: "channel",
      action: "opened",
      channelId: "audit-channel",
      owner: OWNER,
      agent: AGENT,
      deposit: "1000",
    },
    state(100, "tx-open", "1000", "0"),
    {
      ...metadata(101, "tx-payment"),
      namespace: "channel",
      action: "paid",
      channelId: "audit-channel",
      agent: AGENT,
      recipient: RECIPIENT,
      amount: "100",
      memo: "aW52b2ljZS0xMDE=",
    },
    state(101, "tx-payment", "900", "100"),
    {
      ...metadata(102, "tx-conversion"),
      namespace: "channel",
      action: "convpaid",
      channelId: "audit-channel",
      agent: AGENT,
      recipient: RECIPIENT,
      amount: "200",
      destinationToken: EURC,
      received: "950",
      memo: "aW52b2ljZS0xMDI=",
    },
    state(102, "tx-conversion", "700", "300"),
    {
      ...metadata(103, "tx-top-up"),
      namespace: "channel",
      action: "topup",
      channelId: "audit-channel",
      owner: OWNER,
      amount: "300",
    },
    state(103, "tx-top-up", "1000", "300"),
    {
      ...metadata(104, "tx-close"),
      namespace: "channel",
      action: "closed",
      channelId: "audit-channel",
      owner: OWNER,
      refund: "1000",
    },
    state(104, "tx-close", "0", "300", false),
  ];
}

function closePositions(
  opening: BalancePosition[],
  entries: LedgerEntry[],
): BalancePosition[] {
  const values = new Map(
    opening.map((position) => [
      `${position.account}\0${position.asset}`,
      BigInt(position.amount),
    ]),
  );
  for (const entry of entries) {
    for (const posting of entry.postings) {
      const key = `${posting.account}\0${posting.asset}`;
      values.set(key, (values.get(key) ?? 0n) + BigInt(posting.amount));
    }
  }
  return [...values].map(([key, amount]) => {
    const [account, asset] = key.split("\0");
    return { account, asset, amount: amount.toString() };
  });
}

class RecordingTransport implements DeliveryTransport {
  readonly claims: ClaimedDelivery[] = [];

  async deliver(claim: ClaimedDelivery): Promise<void> {
    this.claims.push(claim);
    await Promise.resolve();
  }
}

function seedStore(): EventStore {
  const store = new EventStore(":memory:");
  store.replaceRange(100, 104, seededHistory());
  store.recordTransactionFees([{
    txHash: "tx-conversion",
    ledger: 102,
    ledgerClosedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 2)).toISOString(),
    payer: OWNER,
    charged: "10",
    agent: AGENT,
    owner: OWNER,
  }]);
  return store;
}

describe("seeded audit workflow", () => {
  it("reconciles an exact period and flags a one-unit on-chain discrepancy", () => {
    const store = seedStore();
    const periodEntries = [...store.iterateLedgerEntries({
      fromLedger: 101,
      throughLedger: 104,
    })];
    const opening: BalancePosition[] = [
      { account: OWNER, asset: USDC, amount: "9000" },
      { account: CHANNEL, asset: USDC, amount: "1000" },
      { account: RECIPIENT, asset: USDC, amount: "0" },
      { account: RECIPIENT, asset: EURC, amount: "0" },
    ];
    const observed = closePositions(opening, periodEntries);
    const reconciliation = store.reconcile({
      fromLedger: 101,
      asOfLedger: 104,
      openingPositions: opening,
      onChainPositions: observed,
    });
    const statement = store.statement({
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 101, throughLedger: 104 },
      reconciliation,
    });

    expect(statement.reconciliation).toMatchObject({
      fromLedger: 101,
      asOfLedger: 104,
      reconciled: true,
      checkedEntries: 5,
    });
    expect(statement.reconciliation!.lines.every((line) => line.status === "matched"))
      .toBe(true);
    expect(statement.lines.map((line) => line.kind).sort()).toEqual([
      "channel_conversion",
      "channel_payment",
      "channel_refund",
      "channel_top_up",
      "network_fee",
    ]);
    expect(statement.positions).toEqual([
      {
        asset: USDC,
        openingAmount: "1000",
        credits: "300",
        debits: "1300",
        closingAmount: "0",
      },
      {
        asset: "native:XLM",
        openingAmount: "0",
        credits: "0",
        debits: "10",
        closingAmount: "-10",
      },
    ]);

    const corrupted = observed.map((position, index) => index === 0
      ? { ...position, amount: (BigInt(position.amount) + 1n).toString() }
      : position);
    const mismatch = store.reconcile({
      fromLedger: 101,
      asOfLedger: 104,
      openingPositions: opening,
      onChainPositions: corrupted,
    });
    expect(mismatch.reconciled).toBe(false);
    expect(mismatch.lines).toContainEqual(expect.objectContaining({
      difference: "1",
      status: "discrepancy",
    }));
    store.close();
  });

  it("exports every statement row with independently resolvable transaction evidence", async () => {
    const store = seedStore();
    const statement = store.statement({
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 101, throughLedger: 104 },
    });
    const knownTransactions = new Map(
      store.allEvents(1_000).map((event) => [event.txHash, event.ledger]),
    );

    const ndjson = await collectStatementExport(statement, { format: "json" });
    const rows = ndjson.trim().split("\n").map((line) => JSON.parse(line) as {
      transactionHash: string;
      ledger: number;
      lineId: string;
      entryId: string;
    });
    expect(rows).toHaveLength(statement.lines.length);
    for (const row of rows) {
      expect(row.transactionHash).not.toBe("");
      expect(row.lineId).not.toBe("");
      expect(row.entryId).not.toBe("");
      expect(knownTransactions.get(row.transactionHash)).toBe(row.ledger);
    }

    const csv = await collectStatementExport(statement, { format: "csv" });
    expect(csv.trim().split("\n")).toHaveLength(statement.lines.length + 1);
    for (const line of statement.lines) {
      expect(csv).toContain(`"${line.txHash}"`);
      expect(csv).toContain(`"${line.ledger}"`);
    }

    const iif = await collectStatementExport(statement, { format: "iif" });
    const iifRows = iif.trim().split("\n").slice(1);
    expect(iifRows).toHaveLength(statement.lines.length * 3);
    expect(iifRows.every((line) => line.split("\t")[7]?.startsWith("tx-")))
      .toBe(true);
    store.close();
  });

  it("generates and delivers one immutable artifact under concurrent scheduler ticks", async () => {
    const eventStore = seedStore();
    const deliveryStore = new ReportDeliveryStore(":memory:");
    deliveryStore.saveSchedule({
      scheduleId: "monthly-compliance",
      subject: { kind: "agent", id: AGENT },
      cadence: "monthly",
      format: "json",
      destinations: [{
        id: "finance-webhook",
        kind: "webhook",
        url: "https://finance.example.test/reports",
      }],
      nextRunAt: "2026-02-01T00:00:00.000Z",
    });
    const transport = new RecordingTransport();
    const service = new ScheduledReportService({
      store: deliveryStore,
      artifactBuilder: eventStoreArtifactBuilder(eventStore),
      transports: { webhook: transport, email: transport },
    });
    const now = new Date("2026-02-01T00:00:00.000Z");

    const concurrent = await Promise.all([service.tick(now), service.tick(now)]);
    expect(concurrent.reduce((sum, result) => sum + result.generated, 0)).toBe(1);
    expect(concurrent.reduce((sum, result) => sum + result.delivered, 0)).toBe(1);
    expect(deliveryStore.deliveries()).toHaveLength(1);
    expect(deliveryStore.deliveries()[0]).toMatchObject({
      status: "delivered",
      attemptCount: 1,
    });
    expect(transport.claims).toHaveLength(1);
    expect(transport.claims[0].artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(service.tick(now)).resolves.toEqual({
      generated: 0,
      delivered: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(transport.claims).toHaveLength(1);

    deliveryStore.close();
    eventStore.close();
  });
});
