/**
 * Network client bootstrapping and other `StellarAgent`-wide configuration
 * that isn't specific to any one contract call.
 */
import { Horizon, SorobanRpc } from '@stellar/stellar-sdk';
import type { NetworkConfig, RateLimitStatus } from '../types/index.js';

/**
 * Whether a URL points at the local machine, and may therefore be spoken to
 * over plaintext HTTP. Anything else — including a LAN address — must use
 * TLS, so a misconfigured `horizonUrl` fails loudly instead of silently
 * transmitting signed transactions in the clear.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'https:') return false;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Builds the Horizon/RPC clients for a resolved network config.
 *
 * `Horizon.Server` refuses plain-HTTP endpoints unless `allowHttp` is set,
 * which made the `local` network config (http://localhost:8000) throw
 * "Cannot connect to insecure horizon server" from the constructor. Allow
 * HTTP for loopback only — a plaintext connection to a real network would
 * expose submitted transactions, so this must not be blanket-enabled.
 */
export function createNetworkClients(networkConfig: NetworkConfig): {
  horizon: Horizon.Server;
  rpc: SorobanRpc.Server;
} {
  return {
    horizon: new Horizon.Server(networkConfig.horizonUrl, {
      allowHttp: isLoopbackUrl(networkConfig.horizonUrl),
    }),
    rpc: new SorobanRpc.Server(networkConfig.rpcUrl, {
      allowHttp: isLoopbackUrl(networkConfig.rpcUrl),
    }),
  };
}

/**
 * What {@link StellarAgent.getRateLimitStatus} reports for an agent
 * `RateLimiter.set_limits` was never called for. `RateLimiter.check` returns
 * `true` unconditionally in that state, so the limits are not merely zero —
 * they do not apply at all, which `configured: false` is what signals. Every
 * other field is a placeholder and must not be read on its own.
 */
export const UNCONFIGURED_RATE_LIMIT: RateLimitStatus = {
  configured: false,
  active: true,
  maxPerTx: '0',
  maxPerHour: '0',
  maxPerDay: '0',
  maxTxsPerHour: 0,
  spentThisHour: '0',
  spentToday: '0',
  txsThisHour: 0,
  hourWindowStartLedger: 0,
  dayWindowStartLedger: 0,
};

/** Only a freshly generated testnet keypair gets funded this way — see `StellarAgent.create`. */
export async function fundFromFriendbot(address: string): Promise<void> {
  try {
    const response = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (!response.ok) {
      console.warn('Friendbot funding failed — account may already exist');
    }
  } catch {
    console.warn('Could not reach friendbot');
  }
}
