import type { DecodedEvent, JsonValue, StoredEvent } from "./types.js";

/** Asset used for Stellar network fees when no SAC address is required. */
export const NATIVE_ASSET = "native:XLM";

/** A normalized economic action derived from one canonical contract event. */
export type LedgerEntryKind =
  | "channel_funding"
  | "channel_top_up"
  | "channel_payment"
  | "channel_conversion"
  | "channel_refund"
  | "escrow_lock"
  | "escrow_release"
  | "escrow_refund"
  | "network_fee";

/** The role an account plays in one balanced ledger posting. */
export type LedgerAccountRole =
  | "owner"
  | "agent"
  | "recipient"
  | "requester"
  | "worker"
  | "contract"
  | "conversion"
  | "fee_payer"
  | "network";

/**
 * One signed balance delta. Negative amounts leave an account and positive
 * amounts enter it. Postings in an entry always sum to zero independently for
 * every asset.
 */
export interface LedgerPosting {
  postingId: string;
  account: string;
  role: LedgerAccountRole;
  asset: string;
  amount: string;
}

/** A verifiable, balanced transaction in the normalized reporting ledger. */
export interface LedgerEntry {
  entryId: string;
  eventId: string | null;
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  kind: LedgerEntryKind;
  referenceType: "channel" | "job" | "transaction";
  referenceId: string;
  agent: string | null;
  owner: string | null;
  counterparty: string | null;
  memo: string | null;
  sourceAsset: string;
  sourceAmount: string;
  destinationAsset: string | null;
  destinationAmount: string | null;
  postings: LedgerPosting[];
  metadata: JsonValue;
}

/** Confirmed fee metadata obtained from the transaction result/envelope. */
export interface TransactionFee {
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  payer: string;
  charged: string;
  asset?: string;
  agent?: string | null;
  owner?: string | null;
}

/** A normalization problem retained for operators rather than silently lost. */
export interface LedgerIssue {
  issueId: string;
  eventId: string;
  txHash: string;
  ledger: number;
  code: "MISSING_CHANNEL_STATE" | "MISSING_JOB_STATE" | "INVALID_AMOUNT" | "UNBALANCED_ENTRY";
  message: string;
}

export interface NormalizedLedger {
  entries: LedgerEntry[];
  issues: LedgerIssue[];
}

/** An absolute balance observed at a ledger boundary. */
export interface BalancePosition {
  account: string;
  asset: string;
  amount: string;
}

export interface ReconciliationRequest {
  /** Inclusive opening ledger. Opening positions are immediately before it. */
  fromLedger?: number;
  /** Inclusive ledger boundary. */
  asOfLedger: number;
  /** Absolute balances immediately before this ledger range. */
  openingPositions?: BalancePosition[];
  /** Absolute balances read from chain at `asOfLedger`. */
  onChainPositions: BalancePosition[];
  /** Restrict reconciliation to these accounts. */
  accounts?: string[];
}

export type ReconciliationStatus = "matched" | "discrepancy" | "missing_on_chain";

export interface ReconciliationLine {
  account: string;
  asset: string;
  openingAmount: string;
  activityAmount: string;
  expectedAmount: string;
  onChainAmount: string | null;
  difference: string | null;
  status: ReconciliationStatus;
}

export interface ReconciliationResult {
  /** Inclusive opening ledger used for activity, or zero for all indexed history. */
  fromLedger: number;
  asOfLedger: number;
  reconciled: boolean;
  checkedEntries: number;
  lines: ReconciliationLine[];
}

interface Snapshot {
  ledger: number;
  pagingToken: string;
  txHash: string;
  state: Record<string, JsonValue>;
}

interface EconomicContext {
  agent: string | null;
  owner: string | null;
  counterparty: string | null;
  sourceAsset: string;
  sourceAmount: string;
  destinationAsset?: string;
  destinationAmount?: string;
  memo?: string;
  postings: Array<Omit<LedgerPosting, "postingId">>;
  metadata?: JsonValue;
}

function amount(value: string, event: StoredEvent | DecodedEvent): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`event ${event.eventId} has invalid integer amount ${value}`);
  }
}

function object(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function text(state: Record<string, JsonValue> | undefined, key: string): string | undefined {
  const value = state?.[key];
  return typeof value === "string" ? value : undefined;
}

function optionalText(
  state: Record<string, JsonValue> | undefined,
  key: string,
): string | undefined {
  const value = state?.[key];
  if (typeof value === "string") return value;
  const some = object(value)?.Some;
  if (typeof some === "string") return some;
  if (Array.isArray(some) && typeof some[0] === "string") return some[0];
  return undefined;
}

function comparePosition(a: Pick<StoredEvent, "ledger" | "pagingToken">, b: Snapshot): number {
  return a.ledger - b.ledger || a.pagingToken.localeCompare(b.pagingToken);
}

function snapshots(events: StoredEvent[], action: "channel" | "job"): Map<string, Snapshot[]> {
  const result = new Map<string, Snapshot[]>();
  for (const event of events) {
    if (event.namespace !== "state" || event.action !== action || !("state" in event.payload)) {
      continue;
    }
    const id = action === "channel"
      ? (event.payload as { channelId?: string }).channelId
      : (event.payload as { jobId?: string }).jobId;
    const state = object(event.payload.state);
    if (!id || !state) continue;
    const values = result.get(id) ?? [];
    values.push({
      ledger: event.ledger,
      pagingToken: event.pagingToken,
      txHash: event.txHash,
      state,
    });
    result.set(id, values);
  }
  for (const values of result.values()) {
    values.sort((a, b) => a.ledger - b.ledger || a.pagingToken.localeCompare(b.pagingToken));
  }
  return result;
}

function stateFor(event: StoredEvent, values: Snapshot[] | undefined): Record<string, JsonValue> | undefined {
  if (!values) return undefined;
  const sameTransaction = values.find((snapshot) => snapshot.txHash === event.txHash);
  if (sameTransaction) return sameTransaction.state;
  let latest: Snapshot | undefined;
  for (const snapshot of values) {
    if (comparePosition(event, snapshot) < 0) break;
    latest = snapshot;
  }
  return latest?.state;
}

function posting(
  account: string,
  role: LedgerAccountRole,
  asset: string,
  value: bigint,
): Omit<LedgerPosting, "postingId"> {
  return { account, role, asset, amount: value.toString() };
}

function validateEntry(entry: LedgerEntry): void {
  const totals = new Map<string, bigint>();
  for (const item of entry.postings) {
    totals.set(item.asset, (totals.get(item.asset) ?? 0n) + BigInt(item.amount));
  }
  for (const [asset, total] of totals) {
    if (total !== 0n) {
      throw new Error(`entry ${entry.entryId} is unbalanced for ${asset}: ${total}`);
    }
  }
}

function entry(
  event: StoredEvent,
  kind: LedgerEntryKind,
  referenceType: LedgerEntry["referenceType"],
  referenceId: string,
  context: EconomicContext,
): LedgerEntry {
  const result: LedgerEntry = {
    entryId: `event:${event.eventId}`,
    eventId: event.eventId,
    txHash: event.txHash,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    kind,
    referenceType,
    referenceId,
    agent: context.agent,
    owner: context.owner,
    counterparty: context.counterparty,
    memo: context.memo ?? null,
    sourceAsset: context.sourceAsset,
    sourceAmount: context.sourceAmount,
    destinationAsset: context.destinationAsset ?? null,
    destinationAmount: context.destinationAmount ?? null,
    postings: context.postings.map((item, index) => ({
      postingId: `event:${event.eventId}:${index}`,
      ...item,
    })),
    metadata: context.metadata ?? {},
  };
  validateEntry(result);
  return result;
}

function issue(
  event: StoredEvent,
  code: LedgerIssue["code"],
  message: string,
): LedgerIssue {
  return {
    issueId: `${event.eventId}:${code}`,
    eventId: event.eventId,
    txHash: event.txHash,
    ledger: event.ledger,
    code,
    message,
  };
}

/**
 * Convert canonical indexed events into balanced, multi-asset ledger entries.
 * State snapshots supply the asset and ownership fields intentionally omitted
 * from compact business events. Missing context becomes a retained issue.
 */
export function normalizeLedger(
  events: StoredEvent[],
  fees: TransactionFee[] = [],
): NormalizedLedger {
  const channelSnapshots = snapshots(events, "channel");
  const jobSnapshots = snapshots(events, "job");
  const entries: LedgerEntry[] = [];
  const issues: LedgerIssue[] = [];

  const ordered = [...events].sort(
    (a, b) => a.ledger - b.ledger || a.pagingToken.localeCompare(b.pagingToken),
  );
  for (const event of ordered) {
    try {
      const payload = event.payload;
      if (payload.namespace === "channel" && "channelId" in payload) {
        const state = stateFor(event, channelSnapshots.get(payload.channelId));
        const asset = text(state, "token");
        const owner = "owner" in payload ? payload.owner : text(state, "owner");
        const agent = "agent" in payload ? payload.agent : text(state, "agent");
        if (!asset || !owner || !agent) {
          if (["opened", "paid", "convpaid", "topup", "closed"].includes(payload.action)) {
            issues.push(issue(event, "MISSING_CHANNEL_STATE", `channel ${payload.channelId} has no asset/owner/agent snapshot`));
          }
          continue;
        }
        const contract = event.contractAddress;

        if (payload.action === "opened") {
          const value = amount(payload.deposit, event);
          entries.push(entry(event, "channel_funding", "channel", payload.channelId, {
            agent,
            owner,
            counterparty: contract,
            sourceAsset: asset,
            sourceAmount: value.toString(),
            postings: [posting(owner, "owner", asset, -value), posting(contract, "contract", asset, value)],
          }));
        } else if (payload.action === "topup") {
          const value = amount(payload.amount, event);
          entries.push(entry(event, "channel_top_up", "channel", payload.channelId, {
            agent,
            owner,
            counterparty: contract,
            sourceAsset: asset,
            sourceAmount: value.toString(),
            postings: [posting(owner, "owner", asset, -value), posting(contract, "contract", asset, value)],
          }));
        } else if (payload.action === "paid") {
          const value = amount(payload.amount, event);
          entries.push(entry(event, "channel_payment", "channel", payload.channelId, {
            agent,
            owner,
            counterparty: payload.recipient,
            memo: payload.memo,
            sourceAsset: asset,
            sourceAmount: value.toString(),
            postings: [posting(contract, "contract", asset, -value), posting(payload.recipient, "recipient", asset, value)],
          }));
        } else if (payload.action === "convpaid") {
          const source = amount(payload.amount, event);
          const destination = amount(payload.received, event);
          const clearing = `conversion:${event.eventId}`;
          entries.push(entry(event, "channel_conversion", "channel", payload.channelId, {
            agent,
            owner,
            counterparty: payload.recipient,
            memo: payload.memo,
            sourceAsset: asset,
            sourceAmount: source.toString(),
            destinationAsset: payload.destinationToken,
            destinationAmount: destination.toString(),
            postings: [
              posting(contract, "contract", asset, -source),
              posting(clearing, "conversion", asset, source),
              posting(clearing, "conversion", payload.destinationToken, -destination),
              posting(payload.recipient, "recipient", payload.destinationToken, destination),
            ],
          }));
        } else if (payload.action === "closed") {
          const value = amount(payload.refund, event);
          entries.push(entry(event, "channel_refund", "channel", payload.channelId, {
            agent,
            owner,
            counterparty: owner,
            sourceAsset: asset,
            sourceAmount: value.toString(),
            postings: [posting(contract, "contract", asset, -value), posting(owner, "owner", asset, value)],
          }));
        }
        continue;
      }

      if (payload.namespace === "escrow" && "jobId" in payload) {
        const state = stateFor(event, jobSnapshots.get(payload.jobId));
        const asset = text(state, "token");
        const requester = "requester" in payload
          ? payload.requester
          : text(state, "requester");
        const worker = "worker" in payload
          ? payload.worker
          : optionalText(state, "worker");
        const stateAmount = text(state, "amount");
        if (!asset || !requester || !stateAmount) {
          if (["created", "released", "refunded", "resolved"].includes(payload.action)) {
            issues.push(issue(event, "MISSING_JOB_STATE", `job ${payload.jobId} has no asset/requester/amount snapshot`));
          }
          continue;
        }
        const contract = event.contractAddress;
        const value = amount(
          "amount" in payload ? payload.amount : stateAmount,
          event,
        );
        if (payload.action === "created") {
          entries.push(entry(event, "escrow_lock", "job", payload.jobId, {
            agent: requester,
            owner: requester,
            counterparty: contract,
            sourceAsset: asset,
            sourceAmount: value.toString(),
            postings: [posting(requester, "requester", asset, -value), posting(contract, "contract", asset, value)],
          }));
        } else if (payload.action === "released" && worker) {
          entries.push(entry(event, "escrow_release", "job", payload.jobId, {
            agent: requester,
            owner: requester,
            counterparty: worker,
            sourceAsset: asset,
            sourceAmount: value.toString(),
            postings: [posting(contract, "contract", asset, -value), posting(worker, "worker", asset, value)],
          }));
        } else if (payload.action === "refunded") {
          entries.push(entry(event, "escrow_refund", "job", payload.jobId, {
            agent: requester,
            owner: requester,
            counterparty: requester,
            sourceAsset: asset,
            sourceAmount: value.toString(),
            postings: [posting(contract, "contract", asset, -value), posting(requester, "requester", asset, value)],
          }));
        } else if (payload.action === "resolved") {
          const recipient = payload.favorWorker ? worker : requester;
          if (!recipient) {
            issues.push(issue(event, "MISSING_JOB_STATE", `job ${payload.jobId} resolution has no worker`));
            continue;
          }
          entries.push(entry(
            event,
            payload.favorWorker ? "escrow_release" : "escrow_refund",
            "job",
            payload.jobId,
            {
              agent: requester,
              owner: requester,
              counterparty: recipient,
              sourceAsset: asset,
              sourceAmount: value.toString(),
              postings: [
                posting(contract, "contract", asset, -value),
                posting(recipient, payload.favorWorker ? "worker" : "requester", asset, value),
              ],
              metadata: { arbiter: payload.arbiter, resolvedDispute: true },
            },
          ));
        }
      }
    } catch (error) {
      issues.push(issue(
        event,
        error instanceof Error && error.message.includes("unbalanced")
          ? "UNBALANCED_ENTRY"
          : "INVALID_AMOUNT",
        error instanceof Error ? error.message : String(error),
      ));
    }
  }

  for (const fee of fees) {
    try {
      const value = amount(fee.charged, {
        eventId: `fee:${fee.txHash}`,
      } as DecodedEvent);
      const asset = fee.asset ?? NATIVE_ASSET;
      const feeEntry: LedgerEntry = {
        entryId: `fee:${fee.txHash}`,
        eventId: null,
        txHash: fee.txHash,
        ledger: fee.ledger,
        ledgerClosedAt: fee.ledgerClosedAt,
        kind: "network_fee",
        referenceType: "transaction",
        referenceId: fee.txHash,
        agent: fee.agent ?? null,
        owner: fee.owner ?? null,
        counterparty: "stellar:network-fees",
        memo: null,
        sourceAsset: asset,
        sourceAmount: value.toString(),
        destinationAsset: null,
        destinationAmount: null,
        postings: [
          { postingId: `fee:${fee.txHash}:0`, ...posting(fee.payer, "fee_payer", asset, -value) },
          { postingId: `fee:${fee.txHash}:1`, ...posting("stellar:network-fees", "network", asset, value) },
        ],
        metadata: {},
      };
      validateEntry(feeEntry);
      entries.push(feeEntry);
    } catch {
      // Fee records are caller-supplied and have no contract event to attach an
      // issue to. Invalid values are rejected at the EventStore boundary.
    }
  }

  entries.sort((a, b) => a.ledger - b.ledger || a.entryId.localeCompare(b.entryId));
  issues.sort((a, b) => a.ledger - b.ledger || a.issueId.localeCompare(b.issueId));
  return { entries, issues };
}

function positions(values: BalancePosition[], label: string): Map<string, bigint> {
  const result = new Map<string, bigint>();
  for (const value of values) {
    const key = `${value.account}\0${value.asset}`;
    if (result.has(key)) throw new Error(`duplicate ${label} position for ${value.account}/${value.asset}`);
    result.set(key, BigInt(value.amount));
  }
  return result;
}

/** Reconcile normalized posting activity to absolute on-chain positions. */
export function reconcileLedger(
  entries: LedgerEntry[],
  request: ReconciliationRequest,
): ReconciliationResult {
  if (!Number.isSafeInteger(request.asOfLedger) || request.asOfLedger < 0) {
    throw new Error("asOfLedger must be a non-negative safe integer");
  }
  const fromLedger = request.fromLedger ?? 0;
  if (!Number.isSafeInteger(fromLedger) || fromLedger < 0) {
    throw new Error("fromLedger must be a non-negative safe integer");
  }
  if (fromLedger > request.asOfLedger) {
    throw new Error("fromLedger must not exceed asOfLedger");
  }
  if (!Array.isArray(request.onChainPositions) || request.onChainPositions.length === 0) {
    throw new Error("onChainPositions must contain at least one observed balance");
  }
  if (request.accounts !== undefined && request.accounts.length === 0) {
    throw new Error("accounts must contain at least one account when supplied");
  }
  const accountFilter = request.accounts ? new Set(request.accounts) : undefined;
  const opening = positions(request.openingPositions ?? [], "opening");
  const observed = positions(request.onChainPositions, "on-chain");
  const activity = new Map<string, bigint>();
  const relevant = entries.filter(
    (item) => item.ledger >= fromLedger && item.ledger <= request.asOfLedger,
  );
  for (const item of relevant) {
    for (const itemPosting of item.postings) {
      if (accountFilter && !accountFilter.has(itemPosting.account)) continue;
      const key = `${itemPosting.account}\0${itemPosting.asset}`;
      activity.set(key, (activity.get(key) ?? 0n) + BigInt(itemPosting.amount));
    }
  }

  const keys = new Set([...opening.keys(), ...observed.keys(), ...activity.keys()]);
  const lines: ReconciliationLine[] = [];
  for (const key of keys) {
    const separator = key.indexOf("\0");
    const account = key.slice(0, separator);
    const asset = key.slice(separator + 1);
    if (accountFilter && !accountFilter.has(account)) continue;
    const openingAmount = opening.get(key) ?? 0n;
    const activityAmount = activity.get(key) ?? 0n;
    const expectedAmount = openingAmount + activityAmount;
    const onChainAmount = observed.get(key);
    const difference = onChainAmount === undefined ? null : onChainAmount - expectedAmount;
    lines.push({
      account,
      asset,
      openingAmount: openingAmount.toString(),
      activityAmount: activityAmount.toString(),
      expectedAmount: expectedAmount.toString(),
      onChainAmount: onChainAmount?.toString() ?? null,
      difference: difference?.toString() ?? null,
      status: onChainAmount === undefined
        ? "missing_on_chain"
        : difference === 0n
          ? "matched"
          : "discrepancy",
    });
  }
  lines.sort((a, b) => a.account.localeCompare(b.account) || a.asset.localeCompare(b.asset));
  return {
    fromLedger,
    asOfLedger: request.asOfLedger,
    reconciled: lines.every((line) => line.status === "matched"),
    checkedEntries: relevant.length,
    lines,
  };
}
