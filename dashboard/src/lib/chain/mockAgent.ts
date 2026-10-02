/**
 * A `StellarAgent` stand-in backed by `lib/mockData.ts`.
 *
 * ## Why mock mode goes through the agent at all
 *
 * The obvious implementation is a second data source: pages branch on
 * `mode === 'mock'` and read the fixtures directly. That is exactly the shape
 * the dashboard had before — `import { MOCK_AGENTS }` in six pages — and it is
 * why a page that renders fixtures cannot be distinguished from a page that
 * renders chain state, and therefore never is.
 *
 * Instead, mock mode injects an agent that answers the same methods a real one
 * does. Every page runs the same `@stellaragent/react` hooks against the same
 * code path in both modes, so "it looks right in the demo" stops being
 * evidence about anything. The fixtures move one layer down, where they belong.
 *
 * `StellarAgent`'s constructor is private and its fields are private, so this
 * is a structural stand-in cast at the boundary — the same escape hatch
 * `packages/react/src/test/mockAgent.ts` uses, for the same reason.
 */

import { StellarAgent } from '@stellaragent/core';
import type {
  ChannelInfo,
  JobInfo,
  LedgerCloseEstimate,
  RateLimitStatus,
  SpendPeriod,
  SpendReport,
} from '@stellaragent/core';
import { MOCK_AGENTS, MOCK_JOBS } from '../mockData.js';
import type { Job } from './types.js';

export interface MockAgentOptions {
  /**
   * Artificial latency, in ms.
   *
   * Not decoration: without it, every panel resolves in the same tick and the
   * loading branch is never rendered — so it is never seen, and never tested.
   * Mock mode is the only place the dashboard can be exercised without a
   * network, which makes this the only place the loading state gets coverage.
   */
  latencyMs?: number;
  /** Throw from every chain read, to exercise the error state. */
  failWith?: Error;
}

const DEFAULT_LATENCY_MS = 250;

const MOCK_AGENT_ADDRESS =
  'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

const LEDGER_CLOSE: LedgerCloseEstimate = {
  currentLedger: 52_241_990,
  avgLedgerCloseSeconds: 5,
  // A fixed number, not a measured one — the same caveat
  // `FALLBACK_LEDGER_CLOSE_SECONDS` carries in the SDK.
  observed: false,
};

/** Decimal asset amount -> stroops, mirroring `@stellaragent/core`'s `toStroops`. */
function stroops(decimal: string): bigint {
  const [whole, fraction = ''] = decimal.split('.');
  const padded = `${fraction}0000000`.slice(0, 7);
  return BigInt(whole || '0') * 10_000_000n + BigInt(padded || '0');
}

function toChannelInfo(
  agent: (typeof MOCK_AGENTS)[number],
  channelId: bigint,
): ChannelInfo {
  const period: SpendPeriod = 'hourly';
  return {
    id: channelId,
    owner: agent.address,
    agent: agent.address,
    token: 'CUSDC',
    active: agent.status !== 'inactive',
    limitPerPeriod: stroops(agent.limitPerHour),
    spentThisPeriod: stroops(agent.spentThisHour),
    totalSpent: stroops(agent.spentToday),
    period,
    periodStartLedger: LEDGER_CLOSE.currentLedger - 120,
  };
}

function toRateLimitStatus(agent: (typeof MOCK_AGENTS)[number]): RateLimitStatus {
  return {
    configured: true,
    active: agent.status !== 'inactive',
    maxPerTx: '1.0000000',
    maxPerHour: agent.limitPerHour,
    maxPerDay: agent.limitPerDay,
    maxTxsPerHour: 40,
    spentThisHour: agent.spentThisHour,
    spentToday: agent.spentToday,
    txsThisHour: agent.totalOps,
    hourWindowStartLedger: LEDGER_CLOSE.currentLedger - 120,
    dayWindowStartLedger: LEDGER_CLOSE.currentLedger - 1_200,
  };
}

function toJobInfo(job: Job): JobInfo {
  return {
    id: BigInt(job.id.replace(/\D/g, '') || '1'),
    requester: job.requester,
    worker: job.worker,
    arbiter: null,
    token: 'CUSDC',
    amount: stroops(job.amount),
    taskDescription: job.task,
    result: job.status === 'pending_release' || job.status === 'completed' ? 'ipfs://result' : null,
    status: job.status,
    deadlineLedger: LEDGER_CLOSE.currentLedger + 720,
    createdAt: LEDGER_CLOSE.currentLedger - 60,
  };
}

/** Map a dashboard `channelId` string ("ch_001") onto the bigint the SDK wants. */
function channelIdOf(agent: (typeof MOCK_AGENTS)[number]): bigint {
  const digits = agent.channelId.replace(/\D/g, '');
  return BigInt(digits || '1');
}

export function createMockAgent(options: MockAgentOptions = {}): StellarAgent {
  const { latencyMs = DEFAULT_LATENCY_MS, failWith } = options;

  const settle = <T>(value: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (failWith) reject(failWith);
        else resolve(value());
      }, latencyMs);
    });

  const agentFor = (address: string) =>
    MOCK_AGENTS.find((candidate) => candidate.address === address) ?? MOCK_AGENTS[0];

  const mock = {
    address: MOCK_AGENT_ADDRESS,

    async getChannel(channelId: bigint): Promise<ChannelInfo> {
      return settle(() => {
        // Channel 1 is the first fixture agent, 2 the second, and so on —
        // matching how `open_channel` hands out IDs, so a page that opens a
        // channel in one mode sees the same row in the other.
        const index = channelId > 0n ? Number((channelId - 1n) % BigInt(MOCK_AGENTS.length)) : 0;
        return toChannelInfo(MOCK_AGENTS[index] ?? MOCK_AGENTS[0], channelId);
      });
    },

    async getRateLimitStatus(agentAddress?: string): Promise<RateLimitStatus> {
      return settle(() => toRateLimitStatus(agentFor(agentAddress ?? MOCK_AGENT_ADDRESS)));
    },

    async getSpendReport(): Promise<SpendReport> {
      return settle(() => {
        const total = MOCK_AGENTS.reduce((sum, agent) => sum + Number(agent.spentThisHour), 0);
        const daily = MOCK_AGENTS.reduce((sum, agent) => sum + Number(agent.spentToday), 0);
        return {
          spentThisPeriod: total.toFixed(7),
          remainingThisPeriod: '4.0000000',
          totalLifetime: daily.toFixed(7),
        };
      });
    },

    async getBalance(): Promise<string> {
      return settle(() => MOCK_AGENTS[0].balance);
    },

    async getLedgerCloseEstimate(): Promise<LedgerCloseEstimate> {
      return settle(() => LEDGER_CLOSE);
    },

    async getJob(jobId: bigint): Promise<JobInfo> {
      return settle(() => {
        const job = MOCK_JOBS.find((candidate) => BigInt(candidate.id.replace(/\D/g, '')) === jobId)
          ?? MOCK_JOBS[0];
        return toJobInfo(job);
      });
    },

    /** Channel ids the mock roster answers to, for the page-level fan-out. */
    async listChannelIds(): Promise<bigint[]> {
      return settle(() => MOCK_AGENTS.map((agent) => channelIdOf(agent)));
    },

    /** Mock mode has no mutations; failing beats pretending. */
    async payForAPI(): Promise<never> {
      throw new Error('MockAgent: payments are disabled in mock mode — switch the dashboard to live.');
    },
  };

  return mock as unknown as StellarAgent;
}
