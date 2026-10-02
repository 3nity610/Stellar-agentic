import type { LedgerEntry, LedgerEntryKind, ReconciliationResult } from "./ledger.js";

/** The entity whose attributable economic activity appears on a statement. */
export interface StatementSubject {
  kind: "agent" | "owner";
  id: string;
}

/** Inclusive period boundaries; omitted boundaries are open-ended. */
export interface StatementPeriod {
  fromLedger?: number;
  throughLedger?: number;
  fromTimestamp?: string;
  throughTimestamp?: string;
}

/** An absolute reporting position at the beginning of the requested period. */
export interface StatementOpeningPosition {
  asset: string;
  amount: string;
}

export interface StatementRequest {
  subject: StatementSubject;
  period: StatementPeriod;
  /**
   * When supplied, these are authoritative positions at the period opening.
   * Otherwise the engine derives opening positions from earlier indexed rows.
   */
  openingPositions?: StatementOpeningPosition[];
  /** Attach a reconciliation performed at the statement closing boundary. */
  reconciliation?: ReconciliationResult;
}

export type StatementCategory =
  | "funding"
  | "payment"
  | "conversion"
  | "refund"
  | "escrow"
  | "fee";

export type StatementDirection = "credit" | "debit" | "neutral";

export interface StatementLine {
  lineId: string;
  entryId: string;
  eventId: string | null;
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  kind: LedgerEntryKind;
  category: StatementCategory;
  direction: StatementDirection;
  counterparty: string | null;
  memo: string | null;
  referenceType: LedgerEntry["referenceType"];
  referenceId: string;
  asset: string;
  amount: string;
  signedAmount: string;
  destinationAsset: string | null;
  destinationAmount: string | null;
  runningBalance: string;
}

export interface StatementPosition {
  asset: string;
  openingAmount: string;
  credits: string;
  debits: string;
  closingAmount: string;
}

export type StatementCategoryDimension = "counterparty" | "asset" | "payment_type";

export interface StatementCategoryTotal {
  dimension: StatementCategoryDimension;
  key: string;
  asset: string;
  count: number;
  credits: string;
  debits: string;
  net: string;
}

export interface StatementEvidence {
  entryCount: number;
  transactionCount: number;
  transactionHashes: string[];
  firstLedger: number | null;
  lastLedger: number | null;
}

export interface Statement {
  statementId: string;
  subject: StatementSubject;
  period: StatementPeriod;
  lines: StatementLine[];
  positions: StatementPosition[];
  categories: StatementCategoryTotal[];
  evidence: StatementEvidence;
  reconciliation: ReconciliationResult | null;
}

interface Totals {
  credits: bigint;
  debits: bigint;
}

function integer(value: string, label: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be an integer string`);
  }
}

function timestamp(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO-8601 timestamp`);
  return parsed;
}

function validatePeriod(period: StatementPeriod): {
  fromTime?: number;
  throughTime?: number;
} {
  for (const [label, value] of [
    ["fromLedger", period.fromLedger],
    ["throughLedger", period.throughLedger],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
  }
  if (
    period.fromLedger !== undefined &&
    period.throughLedger !== undefined &&
    period.fromLedger > period.throughLedger
  ) {
    throw new Error("fromLedger must not exceed throughLedger");
  }
  const fromTime = timestamp(period.fromTimestamp, "fromTimestamp");
  const throughTime = timestamp(period.throughTimestamp, "throughTimestamp");
  if (fromTime !== undefined && throughTime !== undefined && fromTime > throughTime) {
    throw new Error("fromTimestamp must not exceed throughTimestamp");
  }
  return {
    ...(fromTime === undefined ? {} : { fromTime }),
    ...(throughTime === undefined ? {} : { throughTime }),
  };
}

function attributed(entry: LedgerEntry, subject: StatementSubject): boolean {
  return subject.kind === "agent" ? entry.agent === subject.id : entry.owner === subject.id;
}

function inPeriod(
  entry: LedgerEntry,
  period: StatementPeriod,
  times: { fromTime?: number; throughTime?: number },
): boolean {
  const closedAt = Date.parse(entry.ledgerClosedAt);
  return !(
    (period.fromLedger !== undefined && entry.ledger < period.fromLedger) ||
    (period.throughLedger !== undefined && entry.ledger > period.throughLedger) ||
    (times.fromTime !== undefined && closedAt < times.fromTime) ||
    (times.throughTime !== undefined && closedAt > times.throughTime)
  );
}

function beforePeriod(
  entry: LedgerEntry,
  period: StatementPeriod,
  times: { fromTime?: number },
): boolean {
  const closedAt = Date.parse(entry.ledgerClosedAt);
  if (period.fromLedger !== undefined && entry.ledger < period.fromLedger) return true;
  return times.fromTime !== undefined && closedAt < times.fromTime;
}

function impact(entry: LedgerEntry): bigint {
  const value = integer(entry.sourceAmount, `entry ${entry.entryId} sourceAmount`);
  switch (entry.kind) {
    case "channel_funding":
    case "channel_top_up":
    case "escrow_refund":
      return value;
    case "channel_payment":
    case "channel_conversion":
    case "channel_refund":
    case "escrow_lock":
    case "network_fee":
      return -value;
    case "escrow_release":
      // Cash left the requester's available position when the escrow locked.
      // Release settles that restricted position without charging it twice.
      return 0n;
  }
}

function category(kind: LedgerEntryKind): StatementCategory {
  switch (kind) {
    case "channel_funding":
    case "channel_top_up":
      return "funding";
    case "channel_payment":
      return "payment";
    case "channel_conversion":
      return "conversion";
    case "channel_refund":
    case "escrow_refund":
      return "refund";
    case "escrow_lock":
    case "escrow_release":
      return "escrow";
    case "network_fee":
      return "fee";
  }
}

function direction(value: bigint): StatementDirection {
  return value > 0n ? "credit" : value < 0n ? "debit" : "neutral";
}

function addPosition(map: Map<string, bigint>, asset: string, delta: bigint): void {
  map.set(asset, (map.get(asset) ?? 0n) + delta);
}

function openingPositions(
  entries: LedgerEntry[],
  request: StatementRequest,
  times: { fromTime?: number },
): Map<string, bigint> {
  const result = new Map<string, bigint>();
  if (request.openingPositions) {
    for (const position of request.openingPositions) {
      if (result.has(position.asset)) {
        throw new Error(`duplicate opening position for ${position.asset}`);
      }
      result.set(position.asset, integer(position.amount, `opening ${position.asset}`));
    }
    return result;
  }
  for (const entry of entries) {
    if (attributed(entry, request.subject) && beforePeriod(entry, request.period, times)) {
      addPosition(result, entry.sourceAsset, impact(entry));
    }
  }
  return result;
}

function addCategory(
  groups: Map<string, StatementCategoryTotal>,
  dimension: StatementCategoryDimension,
  key: string,
  asset: string,
  value: bigint,
): void {
  const id = `${dimension}\0${key}\0${asset}`;
  const current = groups.get(id) ?? {
    dimension,
    key,
    asset,
    count: 0,
    credits: "0",
    debits: "0",
    net: "0",
  };
  const credits = BigInt(current.credits) + (value > 0n ? value : 0n);
  const debits = BigInt(current.debits) + (value < 0n ? -value : 0n);
  groups.set(id, {
    ...current,
    count: current.count + 1,
    credits: credits.toString(),
    debits: debits.toString(),
    net: (credits - debits).toString(),
  });
}

function statementId(request: StatementRequest): string {
  const period = request.period;
  return [
    "statement",
    request.subject.kind,
    request.subject.id,
    period.fromLedger ?? "start",
    period.throughLedger ?? "end",
    period.fromTimestamp ?? "start-time",
    period.throughTimestamp ?? "end-time",
  ].join(":");
}

/**
 * Build a deterministic statement from normalized ledger entries. The same
 * inputs produce byte-for-byte equivalent statement data.
 */
export function buildStatement(entries: LedgerEntry[], request: StatementRequest): Statement {
  if (!request.subject.id) throw new Error("statement subject id is required");
  const times = validatePeriod(request.period);
  const ordered = [...entries].sort(
    (a, b) => a.ledger - b.ledger || a.entryId.localeCompare(b.entryId),
  );
  const selected = ordered.filter(
    (entry) => attributed(entry, request.subject) && inPeriod(entry, request.period, times),
  );
  const opening = openingPositions(ordered, request, times);
  const running = new Map(opening);
  const totals = new Map<string, Totals>();
  const categoryGroups = new Map<string, StatementCategoryTotal>();
  const lines: StatementLine[] = [];

  selected.forEach((entry, index) => {
    const delta = impact(entry);
    addPosition(running, entry.sourceAsset, delta);
    const assetTotals = totals.get(entry.sourceAsset) ?? { credits: 0n, debits: 0n };
    if (delta > 0n) assetTotals.credits += delta;
    if (delta < 0n) assetTotals.debits += -delta;
    totals.set(entry.sourceAsset, assetTotals);

    const counterparty = entry.counterparty ?? "uncategorized";
    addCategory(categoryGroups, "counterparty", counterparty, entry.sourceAsset, delta);
    addCategory(categoryGroups, "asset", entry.sourceAsset, entry.sourceAsset, delta);
    addCategory(categoryGroups, "payment_type", entry.kind, entry.sourceAsset, delta);
    lines.push({
      lineId: `${statementId(request)}:${String(index + 1).padStart(8, "0")}`,
      entryId: entry.entryId,
      eventId: entry.eventId,
      txHash: entry.txHash,
      ledger: entry.ledger,
      ledgerClosedAt: entry.ledgerClosedAt,
      kind: entry.kind,
      category: category(entry.kind),
      direction: direction(delta),
      counterparty: entry.counterparty,
      memo: entry.memo,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      asset: entry.sourceAsset,
      amount: entry.sourceAmount,
      signedAmount: delta.toString(),
      destinationAsset: entry.destinationAsset,
      destinationAmount: entry.destinationAmount,
      runningBalance: running.get(entry.sourceAsset)!.toString(),
    });
  });

  const assets = new Set([...opening.keys(), ...running.keys(), ...totals.keys()]);
  const positions = [...assets].sort().map((asset) => ({
    asset,
    openingAmount: (opening.get(asset) ?? 0n).toString(),
    credits: (totals.get(asset)?.credits ?? 0n).toString(),
    debits: (totals.get(asset)?.debits ?? 0n).toString(),
    closingAmount: (running.get(asset) ?? opening.get(asset) ?? 0n).toString(),
  }));
  const hashes = [...new Set(selected.map((entry) => entry.txHash))];
  return {
    statementId: statementId(request),
    subject: { ...request.subject },
    period: { ...request.period },
    lines,
    positions,
    categories: [...categoryGroups.values()].sort(
      (a, b) =>
        a.dimension.localeCompare(b.dimension) ||
        a.key.localeCompare(b.key) ||
        a.asset.localeCompare(b.asset),
    ),
    evidence: {
      entryCount: selected.length,
      transactionCount: hashes.length,
      transactionHashes: hashes,
      firstLedger: selected[0]?.ledger ?? null,
      lastLedger: selected.at(-1)?.ledger ?? null,
    },
    reconciliation: request.reconciliation ?? null,
  };
}
