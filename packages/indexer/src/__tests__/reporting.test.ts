import { describe, expect, it } from "vitest";
import type { LedgerEntry, LedgerEntryKind } from "../ledger.js";
import { buildStatement } from "../reporting.js";

const AGENT = "GAGENT";
const OWNER = "GOWNER";
const RECIPIENT = "GRECIPIENT";
const OTHER_AGENT = "GOTHER";
const USDC = "CUSDC";
const EURC = "CEURC";

interface EntryOptions {
  agent?: string | null;
  owner?: string | null;
  counterparty?: string | null;
  asset?: string;
  destinationAsset?: string | null;
  destinationAmount?: string | null;
}

function ledgerEntry(
  kind: LedgerEntryKind,
  ledger: number,
  amount: string,
  options: EntryOptions = {},
): LedgerEntry {
  const entryId = `${ledger}:${kind}`;
  return {
    entryId,
    eventId: `event:${entryId}`,
    txHash: `tx:${entryId}`,
    ledger,
    ledgerClosedAt: new Date(Date.UTC(2026, 0, ledger)).toISOString(),
    kind,
    referenceType: kind.startsWith("escrow") ? "job" : kind === "network_fee" ? "transaction" : "channel",
    referenceId: kind.startsWith("escrow") ? "job-1" : kind === "network_fee" ? `tx:${entryId}` : "channel-1",
    agent: options.agent === undefined ? AGENT : options.agent,
    owner: options.owner === undefined ? OWNER : options.owner,
    counterparty: options.counterparty === undefined ? RECIPIENT : options.counterparty,
    memo: "invoice",
    sourceAsset: options.asset ?? USDC,
    sourceAmount: amount,
    destinationAsset: options.destinationAsset ?? null,
    destinationAmount: options.destinationAmount ?? null,
    postings: [],
    metadata: {},
  };
}

function history(): LedgerEntry[] {
  return [
    ledgerEntry("channel_funding", 10, "1000", { counterparty: "CCHANNEL" }),
    ledgerEntry("channel_payment", 11, "100"),
    ledgerEntry("channel_conversion", 12, "200", {
      destinationAsset: EURC,
      destinationAmount: "1000",
    }),
    ledgerEntry("channel_top_up", 13, "200", { counterparty: "CCHANNEL" }),
    ledgerEntry("channel_refund", 14, "400", { counterparty: OWNER }),
    ledgerEntry("network_fee", 15, "10", { counterparty: "stellar:network-fees" }),
    ledgerEntry("channel_payment", 16, "999", {
      agent: OTHER_AGENT,
      owner: "GOTHEROWNER",
    }),
  ];
}

describe("buildStatement", () => {
  it("builds an agent period with derived opening and running closing positions", () => {
    const statement = buildStatement(history(), {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 11, throughLedger: 15 },
    });

    expect(statement.statementId).toBe(
      `statement:agent:${AGENT}:11:15:start-time:end-time`,
    );
    expect(statement.lines.map((line) => [line.kind, line.signedAmount, line.runningBalance]))
      .toEqual([
        ["channel_payment", "-100", "900"],
        ["channel_conversion", "-200", "700"],
        ["channel_top_up", "200", "900"],
        ["channel_refund", "-400", "500"],
        ["network_fee", "-10", "490"],
      ]);
    expect(statement.positions).toEqual([{
      asset: USDC,
      openingAmount: "1000",
      credits: "200",
      debits: "710",
      closingAmount: "490",
    }]);
    expect(statement.evidence).toMatchObject({
      entryCount: 5,
      transactionCount: 5,
      firstLedger: 11,
      lastLedger: 15,
    });
  });

  it("builds the equivalent owner statement without another projection model", () => {
    const statement = buildStatement(history(), {
      subject: { kind: "owner", id: OWNER },
      period: { fromLedger: 10, throughLedger: 15 },
    });

    expect(statement.lines).toHaveLength(6);
    expect(statement.positions[0]).toMatchObject({
      openingAmount: "0",
      credits: "1200",
      debits: "710",
      closingAmount: "490",
    });
    expect(statement.lines.every((line) => line.txHash.startsWith("tx:"))).toBe(true);
  });

  it("categorizes by counterparty, asset, and payment type", () => {
    const statement = buildStatement(history(), {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 11, throughLedger: 15 },
    });

    expect(statement.categories).toContainEqual({
      dimension: "counterparty",
      key: RECIPIENT,
      asset: USDC,
      count: 2,
      credits: "0",
      debits: "300",
      net: "-300",
    });
    expect(statement.categories).toContainEqual({
      dimension: "payment_type",
      key: "channel_conversion",
      asset: USDC,
      count: 1,
      credits: "0",
      debits: "200",
      net: "-200",
    });
    expect(statement.categories).toContainEqual({
      dimension: "asset",
      key: USDC,
      asset: USDC,
      count: 5,
      credits: "200",
      debits: "710",
      net: "-510",
    });
  });

  it("retains both legs of converted payments on the statement line", () => {
    const statement = buildStatement(history(), {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 12, throughLedger: 12 },
    });

    expect(statement.lines).toEqual([
      expect.objectContaining({
        category: "conversion",
        direction: "debit",
        asset: USDC,
        amount: "200",
        signedAmount: "-200",
        destinationAsset: EURC,
        destinationAmount: "1000",
        runningBalance: "700",
      }),
    ]);
  });

  it("uses explicit opening positions instead of replaying earlier history", () => {
    const statement = buildStatement(history(), {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 11, throughLedger: 12 },
      openingPositions: [{ asset: USDC, amount: "5000" }],
    });

    expect(statement.positions).toEqual([{
      asset: USDC,
      openingAmount: "5000",
      credits: "0",
      debits: "300",
      closingAmount: "4700",
    }]);
  });

  it("supports inclusive ISO timestamp periods", () => {
    const statement = buildStatement(history(), {
      subject: { kind: "agent", id: AGENT },
      period: {
        fromTimestamp: new Date(Date.UTC(2026, 0, 12)).toISOString(),
        throughTimestamp: new Date(Date.UTC(2026, 0, 13)).toISOString(),
      },
    });

    expect(statement.lines.map((line) => line.ledger)).toEqual([12, 13]);
    expect(statement.positions[0]).toMatchObject({
      openingAmount: "900",
      closingAmount: "900",
    });
  });

  it("recognizes escrow cash at lock and does not charge release twice", () => {
    const escrow = [
      ledgerEntry("escrow_lock", 20, "300", { asset: EURC, counterparty: "CESCROW" }),
      ledgerEntry("escrow_release", 21, "300", { asset: EURC, counterparty: "GWORKER" }),
      ledgerEntry("escrow_lock", 22, "200", { asset: EURC, counterparty: "CESCROW" }),
      ledgerEntry("escrow_refund", 23, "200", { asset: EURC, counterparty: AGENT }),
    ];
    const statement = buildStatement(escrow, {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 20, throughLedger: 23 },
      openingPositions: [{ asset: EURC, amount: "1000" }],
    });

    expect(statement.lines.map((line) => [line.kind, line.signedAmount, line.direction]))
      .toEqual([
        ["escrow_lock", "-300", "debit"],
        ["escrow_release", "0", "neutral"],
        ["escrow_lock", "-200", "debit"],
        ["escrow_refund", "200", "credit"],
      ]);
    expect(statement.positions[0]).toMatchObject({
      openingAmount: "1000",
      credits: "200",
      debits: "500",
      closingAmount: "700",
    });
  });

  it("validates subjects, periods, timestamps and duplicate openings", () => {
    expect(() => buildStatement([], {
      subject: { kind: "agent", id: "" },
      period: {},
    })).toThrow("subject id");
    expect(() => buildStatement([], {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 2, throughLedger: 1 },
    })).toThrow("fromLedger");
    expect(() => buildStatement([], {
      subject: { kind: "agent", id: AGENT },
      period: { fromTimestamp: "yesterday" },
    })).toThrow("ISO-8601");
    expect(() => buildStatement(history(), {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 11 },
      openingPositions: [
        { asset: USDC, amount: "1" },
        { asset: USDC, amount: "2" },
      ],
    })).toThrow("duplicate opening position");
  });
});
