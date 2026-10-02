/**
 * View model for the Rate Limits page.
 *
 * `useRateLimitStatus` returns raw contract state; this turns it into the rows
 * the page renders, so the arithmetic (headroom, percentages, reset estimates)
 * is testable without a browser and without an agent. All money math goes
 * through `deterministic-math` — the same BigNumber path the rest of the
 * dashboard uses — so a displayed headroom can never disagree with an
 * on-chain check by a rounding step.
 */

import type { RateLimitStatus } from '@stellaragent/core';
import type BigNumber from 'bignumber.js';
import { bn, pctNumber, sub } from './deterministic-math.js';

export interface RateLimitRow {
  key: string;
  label: string;
  /** Human description of what the limit covers. */
  detail: string;
  /** Amount consumed in the window, as a display string. */
  spent: string;
  /** The configured ceiling, or `—` when the ceiling is unset. */
  limit: string;
  /** `limit - spent`, floored at zero, or `—` when the ceiling is unset. */
  headroom: string;
  /** 0–100, rounded down. Always 0 for an unset ceiling. */
  usedPercent: number;
  /** `true` when the ceiling is set and there is nothing left of it. */
  exhausted: boolean;
  /**
   * `true` when the ceiling is zero, which the contract reads as "no cap"
   * rather than "no allowance". A `0 / 0` bar would say the opposite.
   */
  unset: boolean;
}

export interface WindowRow {
  key: 'hour' | 'day';
  label: string;
  ledgersRemaining: number;
  estimatedSecondsRemaining: number;
  /** "~42 min" — always approximate, never a countdown. */
  resetsIn: string;
}

const BLOCK_REASON_LABELS: Record<string, string> = {
  invalid_amount: 'amount is not a positive value',
  channel_inactive: 'the payment channel is closed',
  channel_spend_limit: 'the channel has no spend headroom left this period',
  rate_limit_per_tx: 'exceeds the per-transaction cap',
  rate_limit_hourly: 'exceeds the hourly spend cap',
  rate_limit_daily: 'exceeds the daily spend cap',
  rate_limit_tx_count: 'exceeds the hourly transaction count',
};

function headroom(limit: string, spent: string): ReturnType<typeof bn> {
  const remaining = sub(limit, spent);
  return remaining.isNegative() ? bn(0) : remaining;
}

/**
 * Exact decimal rendering with trailing zeros trimmed: `12.5` stays `12.5`,
 * `50` stays `50`, and `0.0000001` keeps all seven places. No rounding, so a
 * headroom shown here is the headroom the contract would compute.
 */
function display(value: string | number | BigNumber): string {
  const fixed = bn(value).toFixed();
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

function amountRow(
  key: string,
  label: string,
  detail: string,
  limit: string,
  spent: string,
): RateLimitRow {
  const unset = bn(limit).isZero();
  const remaining = headroom(limit, spent);
  return {
    key,
    label,
    detail,
    spent: display(spent),
    limit: unset ? '—' : display(limit),
    headroom: unset ? '—' : display(remaining),
    usedPercent: unset ? 0 : pctNumber(spent, limit),
    exhausted: !unset && remaining.isZero(),
    unset,
  };
}

/**
 * One row per configured rate limit.
 *
 * A zero ceiling is treated as "no ceiling" rather than "already exhausted":
 * the contract treats `maxPerHour = 0` as an unset cap, and rendering it as a
 * 100%-used bar would tell the operator the opposite of the truth.
 */
export function buildRateLimitRows(rateLimit: RateLimitStatus): RateLimitRow[] {
  const rows = [
    amountRow('per_tx', 'Per transaction', 'Largest single payment accepted', rateLimit.maxPerTx, '0'),
    amountRow('hourly', 'Hourly spend', 'Rolling 720-ledger window', rateLimit.maxPerHour, rateLimit.spentThisHour),
    amountRow('daily', 'Daily spend', 'Rolling 17280-ledger window', rateLimit.maxPerDay, rateLimit.spentToday),
  ];

  const txLimit = rateLimit.maxTxsPerHour;
  const txUnset = txLimit <= 0;
  const txRemaining = Math.max(0, txLimit - rateLimit.txsThisHour);
  rows.push({
    key: 'tx_count',
    label: 'Hourly transactions',
    detail: 'Rolling 720-ledger window',
    spent: String(rateLimit.txsThisHour),
    limit: txUnset ? '—' : String(txLimit),
    headroom: txUnset ? '—' : String(txRemaining),
    usedPercent: txUnset ? 0 : Math.floor((rateLimit.txsThisHour / txLimit) * 100),
    exhausted: !txUnset && txRemaining === 0,
    unset: txUnset,
  });

  return rows;
}

/**
 * Human duration for an estimated seconds-remaining value.
 *
 * Deliberately coarse and always prefixed by the caller with `~`: the input is
 * `ledgersRemaining * average observed close time`, so second-level precision
 * would be invented precision.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'now';
  const total = Math.round(seconds);
  if (total < 60) return `${total} sec`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes > 0 ? `${hours} h ${restMinutes} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
}

export function buildWindowRows(windows: {
  hour: { ledgersRemaining: number; estimatedSecondsRemaining: number };
  day: { ledgersRemaining: number; estimatedSecondsRemaining: number };
}): WindowRow[] {
  return [
    {
      key: 'hour',
      label: 'Hourly window',
      ledgersRemaining: windows.hour.ledgersRemaining,
      estimatedSecondsRemaining: windows.hour.estimatedSecondsRemaining,
      resetsIn: formatDuration(windows.hour.estimatedSecondsRemaining),
    },
    {
      key: 'day',
      label: 'Daily window',
      ledgersRemaining: windows.day.ledgersRemaining,
      estimatedSecondsRemaining: windows.day.estimatedSecondsRemaining,
      resetsIn: formatDuration(windows.day.estimatedSecondsRemaining),
    },
  ];
}

/** Turn `predict().reasons` into sentences for the "would this payment go through" probe. */
export function describeBlockReasons(reasons: readonly string[]): string[] {
  return reasons.map((reason) => BLOCK_REASON_LABELS[reason] ?? reason);
}
