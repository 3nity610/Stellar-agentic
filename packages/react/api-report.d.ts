// GENERATED FILE — do not edit by hand.
// Public API surface of @stellaragent/react, derived from its built .d.ts with
// `private` members stripped. Regenerate with `pnpm docs:api`.
// A diff here in review is a public-surface change — call it out.

import * as react from 'react';
import { ReactNode } from 'react';
import { StellarAgent, StellarAgentConfig, AgentInfo, ChannelInfo, JobInfo, RateLimitStatus, PaymentPrediction, SpendReport, PayForAPIParams, TxResult } from '@stellaragent/core';

type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';
interface AsyncState<T> {
    data: T | null;
    status: AsyncStatus;
    error: Error | null;
}
interface UsePollingOptions {
    /** Poll interval in ms. Default 5000. */
    intervalMs?: number;
    /** Skip fetching entirely (e.g. a dependency isn't ready yet). Default true. */
    enabled?: boolean;
}
interface UsePollingResult<T> extends AsyncState<T> {
    /** Fetch immediately, outside the regular interval. */
    refetch: () => void;
}
/**
 * Polls `fetcher` on an interval, exposing `idle` -> `loading` -> `ready` |
 * `error` state and a manual `refetch`.
 *
 * `fetcher`'s identity is the effect's dependency key: hooks built on top
 * of this should build it with `useCallback` over their real dependencies
 * (e.g. `agent`, `channelId`) so a poll cycle only restarts when those
 * actually change, not on every render. Passing `null` disables polling
 * (e.g. while the agent isn't ready yet) without unmounting the caller.
 *
 * Guards against the two classic polling bugs: no `setState` after
 * unmount (the interval's `cancelled` flag), and no stale-response races
 * when `fetcher` changes mid-flight (the monotonic `requestId` ref —
 * only the most recently issued request's result is ever applied).
 */
declare function usePolling<T>(fetcher: (() => Promise<T>) | null, { intervalMs, enabled }?: UsePollingOptions): UsePollingResult<T>;

interface StellarAgentContextValue {
    agent: StellarAgent | null;
    /** `idle` before the provider has started constructing the agent. */
    status: AsyncStatus;
    error: Error | null;
}
/** The live agent + its async init status. Must be used within a `<StellarAgentProvider>`. */
declare function useStellarAgent(): StellarAgentContextValue;
interface PendingPayment {
    id: string;
    amountStroops: bigint;
}
interface StellarAgentProviderProps {
    /** Same config shape accepted by `StellarAgent.create`. */
    config: StellarAgentConfig;
    children: ReactNode;
    /**
     * Provide an already-constructed agent (real or mocked) instead of
     * having the provider call `StellarAgent.create(config)` itself. When
     * set, `config` is ignored for construction and the agent is considered
     * `ready` immediately. Intended for tests and for demos that don't want
     * to hit a real network — see `packages/react/example`.
     */
    agent?: StellarAgent;
}
/**
 * Owns a `StellarAgent` instance (built from `config` via
 * `StellarAgent.create`, unless `agent` is supplied directly) and exposes
 * it — plus its async init status — to `useStellarAgent()` and every hook
 * in this package. Also owns the optimistic-payment overlay shared
 * between `usePayForAPI` and `useSpendReport`.
 */
declare function StellarAgentProvider({ config, children, agent: injectedAgent, }: StellarAgentProviderProps): react.JSX.Element;

/**
 * Polls `AgentWalletFactory.get_agent` for `agentId` via the current
 * `StellarAgent`, exposing the agent's identity (name, address, owner) and
 * its `active` status. Disabled (stays `idle`) until both the agent is
 * `ready` and `agentId` is defined, so it's safe to call before an agent
 * has been registered yet — e.g. `useAgent(agentId)` where `agentId` starts
 * `undefined`.
 */
declare function useAgent(agentId: bigint | undefined, options?: UsePollingOptions): UsePollingResult<AgentInfo>;

/**
 * Polls `PaymentChannel.get_channel` for `channelId` via the current
 * `StellarAgent`. Disabled (stays `idle`) until both the agent is `ready`
 * and `channelId` is defined, so it's safe to call before a channel has
 * been opened yet — e.g. `useChannel(channelId)` where `channelId` starts
 * `undefined`.
 */
declare function useChannel(channelId: bigint | undefined, options?: UsePollingOptions): UsePollingResult<ChannelInfo>;

/**
 * Polls `Escrow.get_job` for `jobId` via the current `StellarAgent`.
 * Disabled until both the agent is `ready` and `jobId` is defined.
 */
declare function useJob(jobId: bigint | undefined, options?: UsePollingOptions): UsePollingResult<JobInfo>;

interface UseRateLimitStatusOptions extends UsePollingOptions {
    /**
     * Channel to fold into `wouldBlock`/`predict` alongside the rate limiter,
     * via `PaymentChannel.get_channel`/`remaining_this_period`. Omit if the
     * proposed payment doesn't go through a channel at all — `wouldBlock`
     * then reflects the rate limiter only.
     */
    channelId?: bigint;
}
/** A ledger-count window, plus a wall-clock estimate derived from recently observed ledger close times. */
interface RateLimitWindowEstimate {
    /** Ledgers remaining until this window resets (0 once it has). */
    ledgersRemaining: number;
    /**
     * **Estimated** wall-clock seconds remaining — `ledgersRemaining *`
     * an average ledger close time measured from recent Horizon ledgers, not
     * a hard-coded "5 seconds". Ledger close times drift with network
     * conditions, so treat this as an approximation, not a countdown timer.
     */
    estimatedSecondsRemaining: number;
}
interface UseRateLimitStatusData {
    /** Raw `RateLimiter.get_limits` result for the queried agent. */
    rateLimit: RateLimitStatus;
    /** Raw `PaymentChannel.get_channel` result, or `null` if no `channelId` was given. */
    channel: ChannelInfo | null;
    /**
     * `false` only when `RateLimiter.set_limits` has never been called for
     * this agent — payments are then unrestricted by the rate limiter
     * (`RateLimiter.check` always returns `true`), though a configured
     * channel's own spend limit can still apply. Distinct from
     * `rateLimitKilled`.
     */
    rateLimitConfigured: boolean;
    /**
     * `true` when a rate limit *is* configured but has been disabled via
     * `RateLimiter.kill_agent`. Informational only: today's on-chain
     * `RateLimiter.check` does not itself gate on this flag (only
     * `is_active()`, a separate query, does) — see `predictPaymentOutcome`'s
     * doc comment in `@stellaragent/core` for the full explanation. Surface
     * this as a "killed" badge, not as something that changes `wouldBlock`.
     */
    rateLimitKilled: boolean;
    /** Time until the rate limiter's rolling hourly window resets. */
    hourWindow: RateLimitWindowEstimate;
    /** Time until the rate limiter's rolling daily window resets. */
    dayWindow: RateLimitWindowEstimate;
    /** Time until the channel's own spend-limit period resets, or `null` when no `channelId` was given. */
    channelPeriodWindow: RateLimitWindowEstimate | null;
    /** Whether `amount` would be blocked by the channel's spend limit and/or the configured rate limiter. */
    wouldBlock: (amount: string) => boolean;
    /** Same check as `wouldBlock`, with the specific reasons attached. */
    predict: (amount: string) => PaymentPrediction;
}
type UseRateLimitStatusResult = UsePollingResult<UseRateLimitStatusData>;
/**
 * Pre-flight rate-limit + spend-limit status for `agentAddress`, polling
 * `RateLimiter.get_limits` and (when `channelId` is given)
 * `PaymentChannel.get_channel`/`remaining_this_period`, plus a Horizon-derived
 * ledger-close estimate to translate ledger-count windows into wall-clock
 * time. Exposes `wouldBlock(amount)` / `predict(amount)`, built on
 * `@stellaragent/core`'s `predictPaymentOutcome`, so a caller can check
 * "would my next payment be blocked?" without a network round trip or a
 * transaction fee.
 *
 * Disabled (stays `idle`) until the agent is `ready`.
 */
declare function useRateLimitStatus(agentAddress: string, options?: UseRateLimitStatusOptions): UseRateLimitStatusResult;

interface UseSpendReportResult extends UsePollingResult<SpendReport> {
    /** Whether `data` currently includes unconfirmed optimistic payments. */
    hasPendingPayments: boolean;
}
/**
 * Polls `PaymentChannel.remaining_this_period` (and friends) for the
 * agent's active channel, with any in-flight `usePayForAPI()` payments
 * from anywhere else in the tree overlaid optimistically — see
 * `applyPending`. Reconciles automatically: `usePayForAPI` bumps a shared
 * version counter on settle, which forces every mounted `useSpendReport`
 * to refetch immediately rather than waiting out the poll interval.
 */
declare function useSpendReport(options?: UsePollingOptions): UseSpendReportResult;

type PayForAPIStatus = 'idle' | 'pending' | 'success' | 'error';
interface UsePayForAPIResult {
    /** Invoke a payment. Resolves/rejects the same as `StellarAgent.payForAPI`. */
    payForAPI: (params: PayForAPIParams) => Promise<TxResult>;
    status: PayForAPIStatus;
    error: Error | null;
    /** Back to `idle` — does not affect any in-flight call. */
    reset: () => void;
}
/**
 * Mutation hook for `StellarAgent.payForAPI`, with optimistic-update
 * support: as soon as `payForAPI(params)` is called, `params.amount` is
 * recorded in the provider's shared pending-payments state, so any
 * `useSpendReport()` mounted under the same `<StellarAgentProvider>`
 * immediately reflects the pending spend — before the transaction has
 * even been submitted, let alone confirmed.
 *
 * On settle (success *or* failure) the pending entry is removed and the
 * provider's spend-report version counter is bumped to force an
 * immediate refetch:
 * - On success, the next `getSpendReport()` call already reflects the
 *   confirmed payment server-side, so removing the optimistic entry and
 *   refetching hands off from "optimistic" to "confirmed" with no gap.
 * - On failure, nothing was ever applied server-side, so removing the
 *   optimistic entry *is* the rollback — the spend report reverts to
 *   whatever the last real poll said.
 */
declare function usePayForAPI(): UsePayForAPIResult;

export { type AsyncState, type AsyncStatus, type PayForAPIStatus, type PendingPayment, type RateLimitWindowEstimate, type StellarAgentContextValue, StellarAgentProvider, type StellarAgentProviderProps, type UsePayForAPIResult, type UsePollingOptions, type UsePollingResult, type UseRateLimitStatusData, type UseRateLimitStatusOptions, type UseRateLimitStatusResult, type UseSpendReportResult, useAgent, useChannel, useJob, usePayForAPI, usePolling, useRateLimitStatus, useSpendReport, useStellarAgent };
