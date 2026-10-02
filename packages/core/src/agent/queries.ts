/** Read-only `StellarAgent` operations: contract reads and Horizon lookups. */
import type { Horizon } from '@stellar/stellar-sdk';
import { StellarAgentError } from '../errors.js';
import { expectBigInt } from '../decode.js';
import { fromStroops } from '../math/index.js';
import { fetchLedgerCloseEstimate } from '../ledgerTime.js';
import type { LedgerCloseEstimate } from '../ledgerTime.js';
import {
  decodeAgentInfo,
  decodeChannel,
  decodeJob,
  decodeRateLimit,
} from '../generated/contract-types.js';
import type {
  AgentInfo,
  ChannelInfo,
  JobInfo,
  RateLimitStatus,
  SpendReport,
} from '../types/index.js';
import { addressVal, i128Val, u64Val } from './encoding.js';
import { toAgentInfo, toChannelInfo, toJobInfo, toRateLimitStatus } from './decoding.js';
import { UNCONFIGURED_RATE_LIMIT } from './config.js';
import type { InvokeFn } from './invocation.js';

/** Read and decode an agent registered in AgentWalletFactory. */
export async function getAgent(
  invoke: InvokeFn,
  agentWalletFactory: string,
  agentId: bigint,
): Promise<AgentInfo> {
  const raw = decodeAgentInfo((await invoke(agentWalletFactory, 'get_agent', [u64Val(agentId)], true)).value);
  return toAgentInfo(agentId, raw);
}

/** Current XLM balance, or `'0'` if the account doesn't exist yet. */
export async function getBalance(horizon: Horizon.Server, address: string): Promise<string> {
  try {
    const account = await horizon.loadAccount(address);
    const xlmBalance = account.balances.find(
      (b) => b.asset_type === 'native',
    );
    return xlmBalance?.balance ?? '0';
  } catch {
    return '0';
  }
}

/** Spend report for the current period on `activeChannelId`. */
export async function getSpendReport(
  invoke: InvokeFn,
  paymentChannel: string,
  activeChannelId: bigint | undefined,
): Promise<SpendReport> {
  if (activeChannelId === undefined) {
    throw new StellarAgentError(
      'NO_ACTIVE_CHANNEL',
      'No active payment channel. Call openChannel() first.',
    );
  }
  const channel = await getChannel(invoke, paymentChannel, activeChannelId);
  const remaining = await invoke(
    paymentChannel,
    'remaining_this_period',
    [u64Val(activeChannelId)],
    true,
  );
  return {
    spentThisPeriod: fromStroops(channel.spentThisPeriod),
    remainingThisPeriod: fromStroops(expectBigInt(remaining.value, 'remaining_this_period result')),
    totalLifetime: fromStroops(channel.totalSpent),
  };
}

/** Info about a payment channel. */
export async function getChannel(
  invoke: InvokeFn,
  paymentChannel: string,
  channelId: bigint,
): Promise<ChannelInfo> {
  const raw = decodeChannel((await invoke(paymentChannel, 'get_channel', [u64Val(channelId)], true)).value);
  return toChannelInfo(channelId, raw);
}

/** Info about an escrow job. */
export async function getJob(
  invoke: InvokeFn,
  escrow: string,
  jobId: bigint,
): Promise<JobInfo> {
  const raw = decodeJob((await invoke(escrow, 'get_job', [u64Val(jobId)], true)).value);
  return toJobInfo(jobId, raw);
}

/**
 * Current rate-limit usage alongside the configured limits.
 *
 * `RateLimiter.get_limits` panics on-chain ("no rate limit for agent") when
 * nothing has been configured — that failure is the only way to derive
 * `configured: false`, since `is_active` returns `true` both for an
 * unconfigured agent and for a configured, live one.
 */
export async function getRateLimitStatus(
  invoke: InvokeFn,
  rateLimiter: string,
  agentAddress: string,
): Promise<RateLimitStatus> {
  let raw: { value: unknown };
  try {
    raw = await invoke(rateLimiter, 'get_limits', [addressVal(agentAddress)], true);
  } catch (error) {
    if (error instanceof StellarAgentError && error.code === 'RATE_LIMIT_NOT_FOUND') {
      return { ...UNCONFIGURED_RATE_LIMIT };
    }
    throw error;
  }
  return toRateLimitStatus(decodeRateLimit(raw.value));
}

/** See `StellarAgent.getLedgerCloseEstimate` for the derivation and its caveats. */
export async function getLedgerCloseEstimate(horizonUrl: string): Promise<LedgerCloseEstimate> {
  return fetchLedgerCloseEstimate(horizonUrl);
}

/** Whether a payment would be blocked by rate limits (read-only). */
export async function checkRateLimit(
  invoke: InvokeFn,
  rateLimiter: string,
  address: string,
  amount: string,
): Promise<boolean> {
  const result = await invoke(rateLimiter, 'check', [
    addressVal(address),
    i128Val(amount),
  ], true);
  return result.value === true;
}
