#!/usr/bin/env tsx
/**
 * Standalone Scenario Seeder.
 *
 * Usage:
 *   pnpm devnet:seed [standard|rate_limited|escrow_dispute|multi_hop]
 */
import {
  loadDeployment,
  exportDeploymentEnv,
} from '../packages/harness/src/deployer.js';
import {
  seedScenario,
  ScenarioName,
} from '../packages/harness/src/scenarios.js';
import { DEFAULT_DEVNET_CONFIG, waitForDevnet, checkDevnetHealth } from '../packages/harness/src/devnet.js';

async function main() {
  const scenarioName = (process.argv[2] || 'standard') as ScenarioName;
  console.log(`🌱 Seeding scenario: "${scenarioName}"...`);

  // Check devnet health
  const health = await checkDevnetHealth(DEFAULT_DEVNET_CONFIG);
  if (!health.healthy) {
    console.warn('⚠️  Devnet offline, seeding in deterministic offline mode.');
  } else {
    console.log(`✅ Devnet is online (Ledger #${health.ledger})`);
  }

  const contracts = loadDeployment() || {
    agentWalletFactory: 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    paymentChannel: 'CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    escrow: 'CCAX26MNAK56ZPQRNU3U7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLL',
    rateLimiter: 'CDTR88OP31K7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5X9',
    circuitBreaker: 'CE7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    priceOracle: 'CF7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
    ammSwap: 'CG7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUAO4W3U5D7X7',
  };

  exportDeploymentEnv(contracts);
  const result = await seedScenario(scenarioName, contracts, DEFAULT_DEVNET_CONFIG.rpcUrl);

  console.log(`✅ Scenario "${scenarioName}" successfully seeded at ${result.seededAt}`);
  console.log('Agents:');
  for (const [key, agent] of Object.entries(result.agents)) {
    console.log(`  • ${key.padEnd(10)}: ${agent.address} (${agent.name})`);
  }
  console.log('Channels:');
  for (const [key, channel] of Object.entries(result.channels)) {
    console.log(`  • ${key.padEnd(10)}: Channel #${channel.id} (${channel.deposit} ${channel.token})`);
  }
  console.log('Escrows:');
  for (const [key, escrow] of Object.entries(result.escrows)) {
    console.log(`  • ${key.padEnd(10)}: Job ${escrow.jobId} (${escrow.amount} ${escrow.asset}) [${escrow.status}]`);
  }
}

main().catch((err) => {
  console.error('❌ Failed to seed scenario:', err);
  process.exit(1);
});
