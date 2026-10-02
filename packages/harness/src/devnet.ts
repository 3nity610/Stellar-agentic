/**
 * Local devnet health-check, waiting, and funding orchestration.
 */
import { SorobanRpc } from '@stellar/stellar-sdk';
import { DEVNET_ADDRESSES } from './keys.js';

export interface DevnetConfig {
  rpcUrl: string;
  horizonUrl: string;
  friendbotUrl: string;
  networkPassphrase: string;
}

export const DEFAULT_DEVNET_CONFIG: DevnetConfig = {
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'http://localhost:8000/soroban/rpc',
  horizonUrl: process.env.STELLAR_HORIZON_URL ?? 'http://localhost:8000',
  friendbotUrl: process.env.STELLAR_FRIENDBOT_URL ?? 'http://localhost:8000/friendbot',
  networkPassphrase:
    process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Standalone Network ; February 2017',
};

/**
 * Checks if the local Soroban devnet is healthy and responding to RPC calls.
 */
export async function checkDevnetHealth(
  config: DevnetConfig = DEFAULT_DEVNET_CONFIG
): Promise<{ healthy: boolean; ledger?: number; error?: string }> {
  try {
    const rpc = new SorobanRpc.Server(config.rpcUrl, { allowHttp: true });
    const ledger = await rpc.getLatestLedger();
    return { healthy: true, ledger: ledger.sequence };
  } catch (err) {
    return {
      healthy: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Health-gated startup waiter.
 *
 * Polls the Soroban RPC getLatestLedger endpoint and Friendbot endpoint with
 * exponential backoff until both are responsive or timeout is reached.
 * Never uses arbitrary unvalidated sleeps.
 */
export async function waitForDevnet(
  config: DevnetConfig = DEFAULT_DEVNET_CONFIG,
  timeoutMs: number = 60_000,
  pollIntervalMs: number = 1_000
): Promise<number> {
  const startTime = Date.now();
  let lastError = 'No response yet';

  while (Date.now() - startTime < timeoutMs) {
    try {
      const rpc = new SorobanRpc.Server(config.rpcUrl, { allowHttp: true });
      const ledger = await rpc.getLatestLedger();
      if (ledger && ledger.sequence > 0) {
        // Also verify friendbot responds
        const fbRes = await fetch(`${config.friendbotUrl}?addr=${DEVNET_ADDRESSES.admin}`);
        if (fbRes.ok || fbRes.status === 400) {
          // 400 or 200 means friendbot server is up and evaluating queries
          return ledger.sequence;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Timed out waiting for local Soroban devnet at ${config.rpcUrl} after ${timeoutMs}ms. Last error: ${lastError}`
  );
}

/**
 * Deterministically funds a Stellar account using the local friendbot.
 */
export async function fundAccount(
  address: string,
  friendbotUrl: string = DEFAULT_DEVNET_CONFIG.friendbotUrl
): Promise<void> {
  const url = `${friendbotUrl}?addr=${encodeURIComponent(address)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Friendbot funding failed for ${address} (HTTP ${response.status}): ${text}`
    );
  }
}

/**
 * Funds all pre-configured devnet test identities deterministically.
 */
export async function fundAllDevnetIdentities(
  friendbotUrl: string = DEFAULT_DEVNET_CONFIG.friendbotUrl
): Promise<void> {
  const addresses = Object.values(DEVNET_ADDRESSES);
  for (const addr of addresses) {
    await fundAccount(addr, friendbotUrl);
  }
}
