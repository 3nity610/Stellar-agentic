#!/usr/bin/env tsx
/**
 * One-command Local Devnet Orchestrator.
 *
 * Usage:
 *   pnpm devnet:up      # Spins up devnet container & waits for healthcheck
 *   pnpm devnet:down    # Shuts down devnet container
 *   pnpm devnet:wait    # Health-gated wait loop for ready state
 *   pnpm devnet:fund    # Funds deterministic test accounts
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  DEFAULT_DEVNET_CONFIG,
  waitForDevnet,
  fundAllDevnetIdentities,
  checkDevnetHealth,
} from '../packages/harness/src/devnet.js';
import { DEVNET_ADDRESSES } from '../packages/harness/src/keys.js';

const command = process.argv[2] || 'status';

async function main() {
  switch (command) {
    case 'up': {
      console.log('🚀 Starting Stellar Local Devnet via Docker Compose...');
      try {
        execFileSync('docker', ['compose', '-f', 'docker-compose.devnet.yml', 'up', '-d'], {
          stdio: 'inherit',
        });
      } catch {
        console.warn('⚠️  Docker Compose command failed or Docker not running in this environment.');
      }

      console.log('⏳ Waiting for Soroban RPC & Friendbot to be healthy...');
      const ledger = await waitForDevnet(DEFAULT_DEVNET_CONFIG, 45_000);
      console.log(`✅ Devnet is healthy! Current ledger sequence: #${ledger}`);

      console.log('💰 Funding deterministic test identities...');
      await fundAllDevnetIdentities();
      console.log('✅ Deterministic test identities funded.');
      break;
    }

    case 'down': {
      console.log('🛑 Stopping Stellar Local Devnet...');
      try {
        execFileSync('docker', ['compose', '-f', 'docker-compose.devnet.yml', 'down'], {
          stdio: 'inherit',
        });
        console.log('✅ Devnet stopped.');
      } catch (err) {
        console.error('Failed to stop devnet container:', err);
      }
      break;
    }

    case 'wait': {
      console.log(`⏳ Waiting for local devnet at ${DEFAULT_DEVNET_CONFIG.rpcUrl}...`);
      const ledger = await waitForDevnet(DEFAULT_DEVNET_CONFIG);
      console.log(`✅ Devnet is ready! Ledger sequence: #${ledger}`);
      break;
    }

    case 'fund': {
      console.log('💰 Funding deterministic test identities...');
      await fundAllDevnetIdentities();
      console.log('✅ Funded identities:');
      for (const [name, addr] of Object.entries(DEVNET_ADDRESSES)) {
        console.log(`  • ${name.padEnd(10)}: ${addr}`);
      }
      break;
    }

    case 'status':
    default: {
      console.log(`🔍 Checking Devnet health at ${DEFAULT_DEVNET_CONFIG.rpcUrl}...`);
      const status = await checkDevnetHealth(DEFAULT_DEVNET_CONFIG);
      if (status.healthy) {
        console.log(`✅ Devnet is ONLINE (Ledger #${status.ledger})`);
      } else {
        console.log(`❌ Devnet is OFFLINE: ${status.error}`);
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error('❌ Error executing devnet command:', err);
  process.exit(1);
});
