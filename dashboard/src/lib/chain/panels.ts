/**
 * The dashboard's panels, built on `@stellaragent/react`.
 *
 * ## How this is wired
 *
 * `<DashboardDataProvider>` owns one `StellarAgent` — a real one, or the mock
 * stand-in — and hands it to `<StellarAgentProvider>`. Every hook below then
 * goes through `useStellarAgent()` and `usePolling()` from that package, so a
 * page behaves identically whether the rows came off the chain or out of
 * `mockData.ts`. That symmetry is the point: it is why a green demo is no
 * longer mistaken for evidence that the live path works.
 *
 * ## Per-item isolation
 *
 * The contracts are keyed by ID, so a dashboard panel is a fan-out over a
 * configured roster, not a single call. One unreachable address must not blank
 * a table of fifty, so the fan-out settles per item and reports the losers in
 * `failures` alongside the rows that worked.
 */

import { useCallback, useMemo } from 'react';
import { usePolling, useRateLimitStatus, useStellarAgent } from '@stellaragent/react';
import type {
  ChannelInfo,
  JobInfo,
  LedgerCloseEstimate,
  RateLimitStatus,
} from '@stellaragent/core';
import { MOCK_AGENTS, MOCK_JOBS, MOCK_PAYMENTS, MOCK_SPEND_DATA } from '../mockData.js';
import { useDashboard } from './DashboardProvider.js';
import { fetchPaymentEvents } from './paymentFeed.js';
import {
  toAgentView,
  toJobView,
  toPaymentView,
  toSpendSeries,
  type AgentSnapshot,
  type PaymentEvent,
} from './views.js';
import type {
  Agent,
  Job,
  PanelFailure,
  PanelResult,
  Payment,
  SpendDataPoint,
} from './types.js';

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Settle per item: successes become values, rejects become failures that name
 * the id that produced them.
 *
 * `Promise.allSettled` keeps input order, so the id is carried inside the
 * fulfilled value and attached on the rejected side — a bare
 * `allSettled(ids.map(load))` cannot say *which* item failed, which is the
 * only thing the operator needs.
 */
async function fanOut<T>(
  ids: readonly string[],
  load: (id: string) => Promise<T>,
): Promise<{ values: T[]; failures: PanelFailure[] }> {
  const settled = await Promise.allSettled(
    ids.map(async (id) => ({ id, value: await load(id) })),
  );
  const values: T[] = [];
  const failures: PanelFailure[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') values.push(outcome.value.value);
    else {
      // The rejection carries no id, so it is recovered from the index the
      // results array preserved.
      const id = ids[failures.length + values.length] ?? 'unknown';
      failures.push({ id, error: toError(outcome.reason) });
    }
  }
  return { values, failures };
}

/** Attach an always-present `failures` array to a polling result. */
function withFailures<T>(
  poll: {
    data: T | null;
    status: 'idle' | 'loading' | 'ready' | 'error';
    error: Error | null;
    refetch: () => void;
  },
  failures: PanelFailure[] = [],
): PanelResult<T> {
  return { ...poll, failures };
}

/**
 * A panel whose payload is `{ rows, failures }`, split back apart for the
 * caller.
 *
 * Keeping `failures` out of `data` matters: a `Panel<T[]>` should not be
 * renderable into a table that silently mixes an error with a row, and this
 * is the one place that keeps the two from being confused.
 */
function useFanOutPanel<T>(
  fetcher: (() => Promise<{ rows: T[]; failures: PanelFailure[] }>) | null,
  intervalMs: number,
): PanelResult<T[]> {
  const poll = usePolling(fetcher, { intervalMs });
  const data = useMemo(() => (poll.data ? poll.data.rows : null), [poll.data]);
  const failures = useMemo(() => poll.data?.failures ?? [], [poll.data]);
  return { ...poll, data, failures };
}

// ─── Ledger clock ─────────────────────────────────────────────────────────────

/**
 * The current ledger and average close time, shared by every panel.
 *
 * Panels need it to turn ledger-count windows into wall-clock and to place
 * "last active"; polling it once here rather than per panel avoids one extra
 * Horizon round trip per panel per tick.
 */
export function useLedgerClock(): LedgerCloseEstimate | null {
  const { agent, status } = useStellarAgent();
  const fetcher = useCallback(async () => {
    if (!agent) throw new Error('useLedgerClock: agent not ready');
    return agent.getLedgerCloseEstimate();
  }, [agent]);
  return usePolling(status === 'ready' ? fetcher : null, { intervalMs: 30_000 }).data;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

/**
 * One agent's live spend and limits.
 *
 * A thin wrapper over `useRateLimitStatus` — the real hook, not a
 * reimplementation — so the pre-flight prediction and the ledger-window
 * estimates come from the same code the SDK ships, including the measured
 * ledger-close time behind "~2h". The channel read is separate because
 * `useChannel` needs a channel id and most roster entries are rate-limit-only.
 */
export function useAgentDetail(address: string, channelId?: bigint): {
  channel: ChannelInfo | null;
  rateLimit: RateLimitStatus | null;
  /** Estimated seconds until the rate limiter's rolling hourly window resets. */
  hourWindowSeconds: number | null;
  balance: string | null;
  loading: boolean;
  error: Error | null;
} {
  const { config, agentReady } = useDashboard();
  const { agent } = useStellarAgent();
  const limits = useRateLimitStatus(address, {
    channelId,
    intervalMs: config.pollIntervalMs,
  });

  const channelFetcher = useCallback(async (): Promise<ChannelInfo | null> => {
    if (!agent || channelId === undefined) return null;
    return agent.getChannel(channelId);
  }, [agent, channelId]);
  const channel = usePolling(
    agentReady && channelId !== undefined ? channelFetcher : null,
    { intervalMs: config.pollIntervalMs },
  ).data;

  const balanceFetcher = useCallback(async () => (agent ? agent.getBalance() : '0'), [agent]);
  const balance = usePolling(agentReady ? balanceFetcher : null, {
    intervalMs: config.pollIntervalMs,
  }).data;

  return {
    channel,
    rateLimit: limits.data?.rateLimit ?? null,
    hourWindowSeconds: limits.data?.hourWindow.estimatedSecondsRemaining ?? null,
    balance,
    loading: !agentReady || limits.status === 'loading' || limits.status === 'idle',
    error: limits.error,
  };
}

/** The agents table: one row per watched agent. */
export function useAgentsPanel(): PanelResult<Agent[]> {
  const { config, mode, agentReady, lastPayments } = useDashboard();
  const { agent } = useStellarAgent();
  const now = useMemo(() => Date.now(), []);

  const fetcher = useCallback(async (): Promise<{ rows: Agent[]; failures: PanelFailure[] }> => {
    if (mode === 'mock') {
      // The mock agent answers the same methods; only the roster differs.
      return { rows: MOCK_AGENTS.map((row) => ({ ...row })), failures: [] };
    }
    if (!agent) throw new Error('useAgentsPanel: agent not ready');

    const { values, failures } = await fanOut(
      config.agents.map((watched) => watched.id),
      async (id) => {
        const watched = config.agents.find((candidate) => candidate.id === id);
        if (!watched) throw new Error(`Unknown watched agent ${id}`);
        const [balance, rateLimit, channel, close] = await Promise.all([
          // A missing account is a real state (an agent that has never been
          // funded), not a failure — it must not blank the row.
          agent.getBalance().catch(() => '0'),
          agent.getRateLimitStatus(watched.address),
          watched.channelId === undefined
            ? Promise.resolve(null)
            : agent.getChannel(BigInt(watched.channelId)),
          agent.getLedgerCloseEstimate(),
        ]);
        const snapshot: AgentSnapshot = {
          address: watched.address,
          name: watched.name,
          channelId: watched.channelId === undefined ? 0n : BigInt(watched.channelId),
          channel,
          rateLimit,
          balance,
          currentLedger: close.currentLedger,
          lastPaymentAtMs: lastPayments[watched.address],
        };
        return { ...toAgentView(snapshot, now), asset: watched.asset };
      },
    );

    return { rows: values, failures };
  }, [agent, config.agents, lastPayments, mode, now]);

  return useFanOutPanel(
    mode === 'mock' || agentReady ? fetcher : null,
    config.pollIntervalMs,
  );
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export function useJobsPanel(): PanelResult<Job[]> {
  const { config, mode, agentReady } = useDashboard();
  const { agent } = useStellarAgent();
  const ledger = useLedgerClock();

  const fetcher = useCallback(async (): Promise<{ rows: Job[]; failures: PanelFailure[] }> => {
    if (mode === 'mock') {
      return { rows: MOCK_JOBS.map((job) => ({ ...job })), failures: [] };
    }
    if (!agent) throw new Error('useJobsPanel: agent not ready');
    const close = ledger ?? (await agent.getLedgerCloseEstimate());

    const { values, failures } = await fanOut(
      config.jobs.map((job) => job.id),
      async (id) => {
        const info: JobInfo = await agent.getJob(BigInt(id));
        const watched = config.jobs.find((job) => job.id === id);
        return toJobView(info, close.currentLedger, {
          requester: config.agents.find((agent) => agent.address === info.requester)?.name,
          worker: watched?.workerName,
        });
      },
    );
    return { rows: values, failures };
  }, [agent, config.agents, config.jobs, ledger, mode]);

  return useFanOutPanel(
    mode === 'mock' || agentReady ? fetcher : null,
    config.pollIntervalMs,
  );
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface PaymentsPanel extends PanelResult<Payment[]> {
  /** Raw events, kept so the spend chart can bucket by absolute time. */
  events: PaymentEvent[];
  series: SpendDataPoint[];
}

export function usePaymentsPanel(): PaymentsPanel {
  const { config, mode, agentReady } = useDashboard();
  const now = useMemo(() => Date.now(), []);

  const fetcher = useCallback(async (): Promise<PaymentEvent[]> => {
    if (mode === 'mock') {
      // Fixtures carry relative timestamps ("5s ago"), which cannot be
      // bucketed, so the mock feed is given absolute ones spaced evenly
      // behind `now` — a demo chart whose bars line up, rather than one that
      // drifts on every render.
      const base = now - MOCK_PAYMENTS.length * 2 * 60_000;
      return MOCK_PAYMENTS.map((payment, index) => ({
        eventId: payment.id,
        txHash: '',
        ledger: payment.ledger,
        ledgerClosedAt: new Date(base + index * 2 * 60_000).toISOString(),
        channelId: payment.agentId,
        agent:
          MOCK_AGENTS.find((agent) => agent.id === payment.agentId)?.address
          ?? MOCK_AGENTS[0].address,
        recipient: payment.recipient,
        amount: payment.amount,
        memo: payment.endpoint,
      }));
    }
    if (!agentReady) throw new Error('usePaymentsPanel: agent not ready');
    return fetchPaymentEvents(config.indexerUrl);
  }, [agentReady, config.indexerUrl, mode, now]);

  const poll = usePolling(fetcher, { intervalMs: config.pollIntervalMs });
  // A stable empty array rather than `poll.data ?? []`, which allocates a new
  // reference on every render and invalidates every memo that depends on it.
  const events = useMemo(() => poll.data ?? [], [poll.data]);

  const names = useMemo(() => {
    const roster: Record<string, string> = {};
    if (mode === 'mock') {
      for (const agent of MOCK_AGENTS) roster[agent.address] = agent.name;
    } else {
      for (const watched of config.agents) roster[watched.address] = watched.name;
    }
    return roster;
  }, [config.agents, mode]);

  const data = useMemo<Payment[] | null>(
    () => (poll.status === 'ready' ? events.map((event) => toPaymentView(event, names, now)) : null),
    [events, names, now, poll.status],
  );

  const series = useMemo<SpendDataPoint[]>(
    () => (mode === 'mock' ? MOCK_SPEND_DATA : toSpendSeries(events, now)),
    [events, mode, now],
  );

  return { ...withFailures(poll), data, events, series };
}
