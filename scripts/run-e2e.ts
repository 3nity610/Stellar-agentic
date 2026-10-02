#!/usr/bin/env tsx
/**
 * Master End-to-End Test Suite Runner.
 *
 * Usage:
 *   pnpm test:e2e
 *   pnpm devnet:harness --all
 */
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_DEVNET_CONFIG,
  checkDevnetHealth,
  waitForDevnet,
} from '../packages/harness/src/devnet.js';
import {
  loadDeployment,
  exportDeploymentEnv,
} from '../packages/harness/src/deployer.js';
import { seedScenario } from '../packages/harness/src/scenarios.js';

async function main() {
  console.log('🧪 Starting StellarAgent End-to-End Test Harness...');

  // 1. Check Devnet health
  const health = await checkDevnetHealth(DEFAULT_DEVNET_CONFIG);
  if (!health.healthy) {
    console.warn(`⚠️  Local Devnet is not reachable (${health.error}).`);
    console.log('   Running in local mock integration test mode...');
  } else {
    console.log(`✅ Connected to local Devnet at ${DEFAULT_DEVNET_CONFIG.rpcUrl} (Ledger #${health.ledger})`);
  }

  // 2. Load and verify deployment
  const contracts = loadDeployment() || {
    agentWalletFactory: 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    paymentChannel: 'CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    escrow: 'CCAX26MNAK56ZPQRNU3U7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLL',
    rateLimiter: 'CDTR88OP31K7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5X9',
    circuitBreaker: 'CE7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    priceOracle: 'CF7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    ammSwap: 'CG7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
  };

  const envs = exportDeploymentEnv(contracts);

  // 3. Seed scenario
  await seedScenario('standard', contracts, DEFAULT_DEVNET_CONFIG.rpcUrl);
  console.log('✅ Baseline scenarios seeded.');

  // 4. Run Core Integration Suite
  console.log('\n📦 Running @stellaragent/core integration test suite...');
  const coreResult = spawnSync(
    'npx',
    ['vitest', 'run', 'packages/core/src/__tests__/integration.local.test.ts'],
    {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        ...envs,
        STELLAR_LOCAL_INTEGRATION: '1',
      },
    }
  );

  if (coreResult.status !== 0) {
    console.error('❌ @stellaragent/core integration suite failed.');
    process.exit(coreResult.status || 1);
  }

  console.log('\n🎉 All local end-to-end integration test suites passed successfully!');
}

main().catch((err) => {
  console.error('❌ Error in E2E test runner:', err);
  process.exit(1);
});
