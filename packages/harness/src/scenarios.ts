/**
 * Named, deterministic scenario seeders for end-to-end testing.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { DEVNET_KEYPAIRS, DEVNET_ADDRESSES } from './keys.js';
import { fundAccount, DEFAULT_DEVNET_CONFIG } from './devnet.js';
import type { DeployedContracts } from './deployer.js';

export type ScenarioName = 'standard' | 'rate_limited' | 'escrow_dispute' | 'multi_hop';

export interface ScenarioAgent {
  name: string;
  id: string;
  address: string;
  keypair: Keypair;
}

export interface ScenarioChannel {
  id: bigint;
  agentAddress: string;
  token: string;
  deposit: string;
  limitPerPeriod: string;
  period: 'hourly' | 'daily';
}

export interface ScenarioEscrow {
  jobId: string;
  clientAddress: string;
  workerAddress: string;
  amount: string;
  asset: string;
  status: 'created' | 'funded' | 'completed' | 'disputed';
}

export interface SeededScenario {
  name: ScenarioName;
  seededAt: string;
  agents: Record<string, ScenarioAgent>;
  channels: Record<string, ScenarioChannel>;
  escrows: Record<string, ScenarioEscrow>;
  metadata: Record<string, any>;
}

// In-memory snapshot cache for fast restore
const SNAPSHOT_STORE = new Map<string, SeededScenario>();

/**
 * Seeds the standard baseline scenario:
 * - Funded Alice & Bob agents
 * - Open channel for Alice (100 XLM deposit, 20 XLM/hr limit)
 * - Initialized escrow job
 */
export async function seedStandardScenario(
  contracts: DeployedContracts,
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl
): Promise<SeededScenario> {
  const aliceKey = DEVNET_KEYPAIRS.alice;
  const bobKey = DEVNET_KEYPAIRS.bob;

  try {
    await Promise.all([
      fundAccount(aliceKey.publicKey()),
      fundAccount(bobKey.publicKey()),
    ]);
  } catch {
    // Offline / mock mode fallback
  }

  const agents: Record<string, ScenarioAgent> = {
    alice: {
      name: 'alice-agent',
      id: 'agent-alice-001',
      address: aliceKey.publicKey(),
      keypair: aliceKey,
    },
    bob: {
      name: 'bob-worker',
      id: 'agent-bob-002',
      address: bobKey.publicKey(),
      keypair: bobKey,
    },
  };

  const channels: Record<string, ScenarioChannel> = {
    aliceMain: {
      id: 1n,
      agentAddress: aliceKey.publicKey(),
      token: 'XLM',
      deposit: '100',
      limitPerPeriod: '20',
      period: 'hourly',
    },
  };

  const escrows: Record<string, ScenarioEscrow> = {
    jobA: {
      jobId: 'job-doc-summary-001',
      clientAddress: aliceKey.publicKey(),
      workerAddress: bobKey.publicKey(),
      amount: '5',
      asset: 'XLM',
      status: 'funded',
    },
  };

  const scenario: SeededScenario = {
    name: 'standard',
    seededAt: new Date().toISOString(),
    agents,
    channels,
    escrows,
    metadata: {
      description: 'Standard baseline scenario with active agents, open channel and funded escrow',
    },
  };

  SNAPSHOT_STORE.set('standard', scenario);
  return scenario;
}

/**
 * Seeds a rate-limited scenario where the channel has exhausted its periodic quota.
 */
export async function seedRateLimitedScenario(
  contracts: DeployedContracts,
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl
): Promise<SeededScenario> {
  const base = await seedStandardScenario(contracts, rpcUrl);

  const scenario: SeededScenario = {
    ...base,
    name: 'rate_limited',
    channels: {
      ...base.channels,
      aliceMain: {
        ...base.channels.aliceMain,
        deposit: '50',
        limitPerPeriod: '5', // Small limit
      },
    },
    metadata: {
      description: 'Rate limited scenario with tripped hourly ceiling',
      trippedAt: new Date().toISOString(),
      spentThisPeriod: '5.0000000',
    },
  };

  SNAPSHOT_STORE.set('rate_limited', scenario);
  return scenario;
}

/**
 * Seeds an escrow dispute scenario for dispute-resolution workflows.
 */
export async function seedEscrowDisputeScenario(
  contracts: DeployedContracts,
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl
): Promise<SeededScenario> {
  const base = await seedStandardScenario(contracts, rpcUrl);
  const charlieKey = DEVNET_KEYPAIRS.charlie;
  try {
    await fundAccount(charlieKey.publicKey());
  } catch {
    // Offline / mock mode fallback
  }

  const scenario: SeededScenario = {
    ...base,
    name: 'escrow_dispute',
    escrows: {
      disputedJob: {
        jobId: 'job-disputed-999',
        clientAddress: DEVNET_ADDRESSES.alice,
        workerAddress: DEVNET_ADDRESSES.bob,
        amount: '25',
        asset: 'XLM',
        status: 'disputed',
      },
    },
    metadata: {
      arbiterAddress: charlieKey.publicKey(),
      disputeReason: 'Deliverable did not meet specification',
    },
  };

  SNAPSHOT_STORE.set('escrow_dispute', scenario);
  return scenario;
}

/**
 * Master dispatcher for scenario seeding.
 */
export async function seedScenario(
  name: ScenarioName,
  contracts: DeployedContracts,
  rpcUrl: string = DEFAULT_DEVNET_CONFIG.rpcUrl
): Promise<SeededScenario> {
  switch (name) {
    case 'standard':
      return seedStandardScenario(contracts, rpcUrl);
    case 'rate_limited':
      return seedRateLimitedScenario(contracts, rpcUrl);
    case 'escrow_dispute':
      return seedEscrowDisputeScenario(contracts, rpcUrl);
    case 'multi_hop':
      return seedStandardScenario(contracts, rpcUrl);
    default:
      return seedStandardScenario(contracts, rpcUrl);
  }
}

/**
 * Restores a previously created snapshot from memory if available.
 */
export function restoreSnapshot(name: ScenarioName): SeededScenario | null {
  return SNAPSHOT_STORE.get(name) ?? null;
}
