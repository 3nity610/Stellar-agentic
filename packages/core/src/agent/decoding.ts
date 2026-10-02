/**
 * Contract result -> SDK public type mapping. The generated `decode*`
 * functions in `../generated/contract-types.ts` do the actual field-by-field
 * validation (a `scValToNative` shape mismatch becomes a
 * {@link StellarAgentError} there, with the on-chain field name in the
 * message); the functions here just map that already-validated `Raw*` shape
 * onto the SDK's public `*Info` types.
 *
 * The inverse direction (TypeScript values -> `xdr.ScVal` arguments) lives in
 * `./encoding.ts`.
 */
import { decodeUtf8 } from '../decode.js';
import { fromStroops } from '../math/index.js';
import type {
  RawAgentInfo,
  RawChannel,
  RawJob,
  RawRateLimit,
} from '../generated/contract-types.js';
import type {
  AgentInfo,
  ChannelInfo,
  JobInfo,
  RateLimitStatus,
} from '../types/index.js';
import type { ChannelSpendState, RateLimitSpendState } from '../math/predict.js';

export function toAgentInfo(agentId: bigint, raw: RawAgentInfo): AgentInfo {
  return {
    id: agentId,
    address: raw.address,
    name: raw.name,
    owner: raw.owner,
    active: raw.active,
    createdAt: raw.created_at,
    totalOps: raw.total_ops,
  };
}

export function toChannelInfo(channelId: bigint, raw: RawChannel): ChannelInfo {
  return {
    id: channelId,
    agent: raw.agent,
    owner: raw.owner,
    token: raw.token,
    limitPerPeriod: raw.limit_per_period,
    period: raw.period,
    spentThisPeriod: raw.spent_this_period,
    periodStartLedger: raw.period_start_ledger,
    totalSpent: raw.total_spent,
    active: raw.active,
  };
}

export function toJobInfo(jobId: bigint, raw: RawJob): JobInfo {
  return {
    id: jobId,
    requester: raw.requester,
    worker: raw.worker,
    arbiter: raw.arbiter,
    token: raw.token,
    amount: raw.amount,
    taskDescription: decodeUtf8(raw.task_description),
    result: raw.result == null ? null : decodeUtf8(raw.result),
    deadlineLedger: raw.deadline_ledger,
    status: raw.status,
    createdAt: raw.created_at,
  };
}

export function toRateLimitStatus(raw: RawRateLimit): RateLimitStatus {
  return {
    configured: true,
    active: raw.active,
    maxPerTx: fromStroops(raw.max_per_tx),
    maxPerHour: fromStroops(raw.max_per_hour),
    maxPerDay: fromStroops(raw.max_per_day),
    maxTxsPerHour: raw.max_txs_per_hour,
    spentThisHour: fromStroops(raw.hourly_spend),
    spentToday: fromStroops(raw.daily_spend),
    txsThisHour: raw.hourly_tx_count,
    hourWindowStartLedger: raw.hour_window_start,
    dayWindowStartLedger: raw.day_window_start,
  };
}

export function toChannelSpendState(channel: ChannelInfo): ChannelSpendState {
  return {
    active: channel.active,
    limitPerPeriod: channel.limitPerPeriod.toString(),
    spentThisPeriod: channel.spentThisPeriod.toString(),
    periodStartLedger: channel.periodStartLedger,
    period: channel.period,
  };
}

export function toRateLimitSpendState(status: RateLimitStatus): RateLimitSpendState {
  return {
    configured: status.configured,
    active: status.active,
    maxPerTx: status.maxPerTx,
    maxPerHour: status.maxPerHour,
    maxPerDay: status.maxPerDay,
    maxTxsPerHour: status.maxTxsPerHour,
    hourlySpend: status.spentThisHour,
    dailySpend: status.spentToday,
    hourlyTxCount: status.txsThisHour,
    hourWindowStartLedger: status.hourWindowStartLedger,
    dayWindowStartLedger: status.dayWindowStartLedger,
  };
}
