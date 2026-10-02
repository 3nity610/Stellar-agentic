import { describe, expect, it } from 'vitest';
import {
  deterministicKeypair,
  DEVNET_KEYPAIRS,
  DEVNET_ADDRESSES,
  DEVNET_IDENTITIES,
} from '../keys.js';
import {
  checkDevnetHealth,
  DEFAULT_DEVNET_CONFIG,
} from '../devnet.js';
import {
  loadDeployment,
  exportDeploymentEnv,
  verifyDeployment,
  type DeployedContracts,
} from '../deployer.js';
import {
  seedScenario,
  restoreSnapshot,
} from '../scenarios.js';
import {
  formatFailureDiagnostic,
} from '../diagnostics.js';
import { TestHarness } from '../runner.js';

describe('Deterministic Key Derivation', () => {
  it('generates consistent and reproducible keys for standard identities', () => {
    const key1 = deterministicKeypair('alice');
    const key2 = deterministicKeypair('alice');

    expect(key1.publicKey()).toBe(key2.publicKey());
    expect(key1.secret()).toBe(key2.secret());
    expect(key1.publicKey()).toBe(DEVNET_ADDRESSES.alice);
  });

  it('generates distinct keys for different identities', () => {
    const alice = deterministicKeypair('alice');
    const bob = deterministicKeypair('bob');

    expect(alice.publicKey()).not.toBe(bob.publicKey());
  });

  it('contains all expected test identities', () => {
    for (const name of DEVNET_IDENTITIES) {
      expect(DEVNET_KEYPAIRS[name]).toBeDefined();
      expect(DEVNET_ADDRESSES[name]).toBeDefined();
      expect(DEVNET_ADDRESSES[name].startsWith('G')).toBe(true);
    }
  });
});

describe('Devnet Configuration & Health Checking', () => {
  it('has default devnet config with expected ports and endpoints', () => {
    expect(DEFAULT_DEVNET_CONFIG.rpcUrl).toContain('8000');
    expect(DEFAULT_DEVNET_CONFIG.friendbotUrl).toContain('friendbot');
    expect(DEFAULT_DEVNET_CONFIG.networkPassphrase).toContain('Standalone Network');
  });

  it('safely handles offline health check without throwing', async () => {
    const health = await checkDevnetHealth({
      ...DEFAULT_DEVNET_CONFIG,
      rpcUrl: 'http://localhost:59999/soroban/rpc', // invalid port
    });

    expect(health.healthy).toBe(false);
    expect(health.error).toBeDefined();
  });
});

describe('Deployer & Environment Exporter', () => {
  const sampleContracts: DeployedContracts = {
    agentWalletFactory: 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    paymentChannel: 'CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    escrow: 'CCAX26MNAK56ZPQRNU3U7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLL',
    rateLimiter: 'CDTR88OP31K7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5X9',
    circuitBreaker: 'CE7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    priceOracle: 'CF7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    ammSwap: 'CG7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
  };

  it('exports STELLARAGENT_LOCAL_* environment variables correctly', () => {
    const envs = exportDeploymentEnv(sampleContracts);

    expect(envs.STELLARAGENT_LOCAL_AGENT_WALLET_FACTORY).toBe(sampleContracts.agentWalletFactory);
    expect(envs.STELLARAGENT_LOCAL_PAYMENT_CHANNEL).toBe(sampleContracts.paymentChannel);
    expect(envs.STELLAR_LOCAL_INTEGRATION).toBe('1');
    expect(process.env.STELLAR_LOCAL_INTEGRATION).toBe('1');
  });

  it('validates contract address format during verification', async () => {
    const invalidContracts: DeployedContracts = {
      ...sampleContracts,
      paymentChannel: 'INVALID_ADDRESS',
    };

    const res = await verifyDeployment(invalidContracts);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

describe('Scenario Seeder & Snapshot Engine', () => {
  const sampleContracts: DeployedContracts = {
    agentWalletFactory: 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    paymentChannel: 'CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    escrow: 'CCAX26MNAK56ZPQRNU3U7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLL',
    rateLimiter: 'CDTR88OP31K7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5X9',
    circuitBreaker: 'CE7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    priceOracle: 'CF7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    ammSwap: 'CG7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
  };

  it('seeds standard scenario with agents, channels, and escrows', async () => {
    const scenario = await seedScenario('standard', sampleContracts);

    expect(scenario.name).toBe('standard');
    expect(scenario.agents.alice).toBeDefined();
    expect(scenario.agents.bob).toBeDefined();
    expect(scenario.channels.aliceMain).toBeDefined();
    expect(scenario.escrows.jobA).toBeDefined();
    expect(scenario.escrows.jobA.status).toBe('funded');
  });

  it('seeds rate_limited scenario with reduced quota', async () => {
    const scenario = await seedScenario('rate_limited', sampleContracts);

    expect(scenario.name).toBe('rate_limited');
    expect(scenario.channels.aliceMain.limitPerPeriod).toBe('5');
  });

  it('seeds escrow_dispute scenario with disputed job status', async () => {
    const scenario = await seedScenario('escrow_dispute', sampleContracts);

    expect(scenario.name).toBe('escrow_dispute');
    expect(scenario.escrows.disputedJob.status).toBe('disputed');
  });

  it('restores cached snapshot from memory', async () => {
    await seedScenario('standard', sampleContracts);
    const restored = restoreSnapshot('standard');

    expect(restored).not.toBeNull();
    expect(restored?.name).toBe('standard');
  });
});

describe('Diagnostic Reporter', () => {
  it('formats readable failure diagnostic report', () => {
    const formatted = formatFailureDiagnostic({
      suiteName: 'Core Payment Test',
      testName: 'should reject overspend',
      currentLedger: 1048576,
      error: new Error('Spend limit exceeded (5.0 > 4.0)'),
      additionalInfo: {
        channelId: '1',
        attemptedAmount: '5.0',
      },
    });

    expect(formatted).toContain('E2E DEVNET TEST FAILURE REPORT');
    expect(formatted).toContain('Core Payment Test');
    expect(formatted).toContain('Ledger Seq:  #1048576');
    expect(formatted).toContain('Spend limit exceeded');
  });
});

describe('TestHarness Class', () => {
  it('instantiates and provides deterministic keypairs and helpers', () => {
    const harness = new TestHarness();

    expect(harness.getKeypair('alice').publicKey()).toBe(DEVNET_ADDRESSES.alice);
    expect(harness.getAddress('bob')).toBe(DEVNET_ADDRESSES.bob);
  });
});
