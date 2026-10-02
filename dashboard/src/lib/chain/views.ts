/**
 * Chain state -> the view models the pages render.
 *
 * Every function here is pure and takes plain values, so the mapping is unit
 * tested without a network, a React tree, or a `StellarAgent`. That matters
 * more than it looks: this is where "the dashboard shows real chain state"
 * actually happens, and it is exactly the layer the fixture-import version of
 * the dashboard had no equivalent of.
 *
 * Two rules hold throughout:
 *
 *   - **Monetary values stay decimal strings.** They come off the contract as
 *     stroops and go onto the screen as asset units, and that conversion goes
 *     through `lib/deterministic-math.ts` rather than `/ 1e7`.
 *   - **Nothing is invented.** A field the chain does not report stays
 *     `'0'` or `'—'`; it is never back-filled from a fixture, because a
 *     plausible-looking number that did not come from the chain is the exact
 *     failure this layer exists to prevent.
 */

import {
  FALLBACK_LEDGER_CLOSE_SECONDS,
  fromStroops,
  LEDGERS_PER_CHANNEL_PERIOD,
} from '@stellaragent/core';
import type { ChannelInfo, JobInfo, RateLimitStatus } from '@stellaragent/core';
import { fmt, pctNumber } from '../deterministic-math.js';
import type { Agent, AgentStatus, Job, Payment, SpendDataPoint } from './types.js';

/** Chain state for one watched agent, before it becomes an `Agent` row. */
export interface AgentSnapshot {
  address: string;
  name: string;
  channelId: bigint;
  channel: ChannelInfo | null;
  rateLimit: RateLimitStatus | null;
  balance: string;
  /** Ledger-close estimate, used to place "last active" on the ledger clock. */
  currentLedger: number;
  /** Most recent payment timestamp in ms, when the payment feed knows one. */
  lastPaymentAtMs?: number;
}

/** Show as `warning` at or above this fraction of a spend limit. */
export const WARNING_THRESHOLD_PERCENT = 80;

/**
 * `'warning'` when either window is at or past 80% of its limit.
 *
 * A `warning` here is a *dashboard* threshold, not a contract one: the
 * on-chain limiter's own boundary is 100% of `max_per_tx`/`max_per_hour`/
 * `max_per_day`, and a payment that trips it has already failed. This is the
 * earlier signal a human wants.
 */
export function agentStatus(
  spentThisHour: string,
  limitPerHour: string,
  spentToday: string,
  limitPerDay: string,
  active: boolean,
): AgentStatus {
  if (!active) return 'inactive';
  const hourPct = pctNumber(spentThisHour, limitPerHour);
  const dayPct = pctNumber(spentToday, limitPerDay);
  return hourPct >= WARNING_THRESHOLD_PERCENT || dayPct >= WARNING_THRESHOLD_PERCENT
    ? 'warning'
    : 'active';
}

/** `'2 seconds ago'` — the only relative-time format the pages already use. */
export function relativeTime(timestampMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - timestampMs) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** `~2.1h` / `~45m` / `~30s`, for a ledger-count window. */
export function estimatedDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'now';
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}

/**
 * The spend-limit utilization a row should show, as a 0–100 number.
 *
 * Prefers the channel's own period (the limit a payment actually trips), and
 * falls back to the rate limiter's hourly window when the agent has no
 * channel.
 */
export function spendPercent(channel: ChannelInfo | null, rateLimit: RateLimitStatus | null): number {
  if (channel) {
    return pctNumber(
      fromStroops(channel.spentThisPeriod),
      fromStroops(channel.limitPerPeriod),
    );
  }
  if (rateLimit?.configured) {
    return pctNumber(rateLimit.spentThisHour, rateLimit.maxPerHour);
  }
  return 0;
}

/** Build one `Agent` row from its chain state. */
export function toAgentView(snapshot: AgentSnapshot, nowMs: number): Agent {
  const rateLimit = snapshot.rateLimit;
  const channel = snapshot.channel;

  const limitPerHour = rateLimit?.configured
    ? fmt(rateLimit.maxPerHour, 2)
    : channel
      ? fmt(fromStroops(channel.limitPerPeriod), 2)
      : '0';
  const limitPerDay = rateLimit?.configured ? fmt(rateLimit.maxPerDay, 2) : limitPerHour;
  const spentThisHour = rateLimit?.configured
    ? fmt(rateLimit.spentThisHour, 2)
    : channel
      ? fmt(fromStroops(channel.spentThisPeriod), 2)
      : '0';
  const spentToday = rateLimit?.configured ? fmt(rateLimit.spentToday, 2) : spentThisHour;

  const active = channel ? channel.active : (rateLimit?.active ?? true);

  return {
    id: snapshot.address,
    name: snapshot.name,
    address: snapshot.address,
    status: agentStatus(spentThisHour, limitPerHour, spentToday, limitPerDay, active),
    balance: fmt(snapshot.balance, 2),
    // The token contract is a `C...` ID, which is not an asset code. The
    // roster supplies the code; the chain supplies the amount.
    asset: '',
    spentToday,
    spentThisHour,
    limitPerHour,
    limitPerDay,
    totalOps: rateLimit?.txsThisHour ?? 0,
    lastActive:
      snapshot.lastPaymentAtMs === undefined
        ? 'no payments yet'
        : relativeTime(snapshot.lastPaymentAtMs, nowMs),
    channelId: String(snapshot.channelId),
  };
}

/**
 * A `Job` from an on-chain `JobInfo`, with the roster's display names folded in.
 *
 * `avgLedgerCloseSeconds` is the SDK's *estimated* close time, not a
 * contractual constant — see `FALLBACK_LEDGER_CLOSE_SECONDS` in
 * `@stellaragent/core`. The default is that fallback, so a caller with no
 * ledger measurement still gets a plausible number rather than a divide by
 * zero.
 */
export function toJobView(
  info: JobInfo,
  currentLedger: number,
  names: { requester?: string; worker?: string } = {},
  avgLedgerCloseSeconds = FALLBACK_LEDGER_CLOSE_SECONDS,
): Job {
  const ledgersLeft = info.deadlineLedger - currentLedger;
  // `avgLedgerCloseSeconds` is seconds, so the ledger distance has to be
  // divided by 60 before it is a minute count.
  const minutesLeft = (ledgersLeft * avgLedgerCloseSeconds) / 60;
  return {
    id: String(info.id),
    requester: info.requester,
    requesterName: names.requester ?? shorten(info.requester),
    worker: info.worker,
    workerName: info.worker ? (names.worker ?? shorten(info.worker)) : null,
    task: info.taskDescription,
    amount: fmt(fromStroops(info.amount), 2),
    asset: '',
    status: info.status,
    deadline: minutesLeft > 0 ? `in ~${formatMinutes(minutesLeft)}` : 'expired',
    createdAt: `${formatMinutes(((currentLedger - info.createdAt) * avgLedgerCloseSeconds) / 60)} ago`,
  };
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
}

/** `GDQ…H4W37` — the same shape `AddressChip` renders, for names we do not have. */
export function shorten(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** A decoded `channel.paid` / `channel.convpaid` indexer event. */
export interface PaymentEvent {
  eventId: string;
  txHash: string;
  ledger: number;
  ledgerClosedAt: string;
  channelId: string;
  agent: string;
  recipient: string;
  amount: string;
  memo: string;
  destinationToken?: string;
  received?: string;
}

/** One indexer payment event as a `Payment` row. */
export function toPaymentView(
  event: PaymentEvent,
  names: Record<string, string>,
  nowMs: number,
): Payment {
  return {
    id: event.eventId,
    agentId: event.agent,
    agentName: names[event.agent] ?? shorten(event.agent),
    recipient: event.recipient,
    amount: fmt(event.amount, 2),
    asset: '',
    endpoint: event.memo || '—',
    ledger: event.ledger,
    timestamp: relativeTime(Date.parse(event.ledgerClosedAt) || nowMs, nowMs),
    // An indexed contract event is, by construction, the record of a
    // transaction that succeeded — the contract reverted otherwise. There is
    // no "failed" row to render from this source; failures show up as an
    // absence, which the empty state covers.
    status: 'success',
    txHash: event.txHash,
  };
}

/** Number of hourly buckets in the spend chart. */
export const SPEND_SERIES_BUCKETS = 12;

/**
 * Bucket payments into the last {@link SPEND_SERIES_BUCKETS} hours.
 *
 * Derived from the payment feed rather than sampled from a running total: a
 * running total only moves when the page is open, so a chart built from it is
 * a chart of when *you* were looking, not of what the agents did.
 *
 * Takes the raw events rather than the `Payment` rows, because a `Payment`
 * carries a *relative* timestamp ("5s ago") and bucketing needs an absolute
 * one.
 */
export function toSpendSeries(
  events: readonly PaymentEvent[],
  nowMs: number,
  buckets = SPEND_SERIES_BUCKETS,
): SpendDataPoint[] {
  const nowHour = Math.floor(nowMs / 3_600_000);
  const points: SpendDataPoint[] = Array.from({ length: buckets }, (_unused, index) => {
    const hour = nowHour - (buckets - 1 - index);
    return {
      time: `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`,
      spend: 0,
      ops: 0,
    };
  });

  for (const event of events) {
    const paidAt = Date.parse(event.ledgerClosedAt);
    if (!Number.isFinite(paidAt)) continue;
    const offset = nowHour - Math.floor(paidAt / 3_600_000);
    if (offset < 0 || offset >= buckets) continue;
    const point = points[buckets - 1 - offset];
    if (!point) continue;
    // Chart values are Recharts props that only accept `number`. The
    // deterministic part — the amount itself — is a decimal string all the
    // way to here; this is the single narrowing point, and the only place a
    // float enters the pipeline.
    const amount = Number(event.amount);
    if (!Number.isFinite(amount)) continue;
    point.spend += amount;
    point.ops += 1;
  }

  return points;
}

/**
 * Seconds until a channel's spend-limit period rolls over, from ledger counts.
 *
 * Mirrors `PaymentChannel.pay`'s own reset rule — the window resets once
 * `currentLedger >= periodStartLedger + ledgersForPeriod` — so the number on
 * screen is the number a payment will be judged against.
 */
export function secondsUntilPeriodReset(
  channel: ChannelInfo,
  currentLedger: number,
  avgLedgerCloseSeconds: number,
): number {
  const period = LEDGERS_PER_CHANNEL_PERIOD[channel.period] ?? 1;
  const remaining = channel.periodStartLedger + period - currentLedger;
  return remaining > 0 ? remaining * avgLedgerCloseSeconds : 0;
}
