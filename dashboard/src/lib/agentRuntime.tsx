/**
 * Where the dashboard's `@stellaragent/react` hooks get their agent.
 *
 * The dashboard is read-only, so it needs a `StellarAgent` instance but never a
 * signer. `StellarAgentProvider` accepts either a `config` (which it turns into
 * a real agent itself) or an already-constructed `agent`; this module picks
 * between them.
 *
 * `window.__STELLARAGENT_AGENT__` is the injection point. It exists because
 * `StellarAgentProvider`'s `agent` prop is a first-class API of the package
 * (documented for tests and demos) but the dashboard's entry point renders
 * `<App />` with no props, so something has to read it. The e2e specs install a
 * stub there via `page.addInitScript`, which is the only way to exercise
 * `/limits` against deterministic on-chain state in CI. In a normal build the
 * global is never set and the provider builds a real agent from `VITE_*`
 * configuration.
 */

import type { ReactNode } from 'react';
import { StellarAgent, type ContractAddresses, type Network } from '@stellaragent/core';
import { StellarAgentProvider } from '@stellaragent/react';

declare global {
  interface Window {
    /** Test-only agent override. See the module comment. */
    __STELLARAGENT_AGENT__?: StellarAgent;
  }
}

const env = import.meta.env;

export const AGENT_NETWORK = (env.VITE_STELLAR_NETWORK ?? 'testnet') as Network;

/** Every contract `StellarAgentConfig.contracts` can carry, and the env var that sets it. */
const CONTRACT_ENV: Record<keyof ContractAddresses, keyof ImportMetaEnv> = {
  paymentChannel: 'VITE_CONTRACT_PAYMENT_CHANNEL',
  escrow: 'VITE_CONTRACT_ESCROW',
  rateLimiter: 'VITE_CONTRACT_RATE_LIMITER',
  agentWalletFactory: 'VITE_CONTRACT_AGENT_WALLET_FACTORY',
  circuitBreaker: 'VITE_CONTRACT_CIRCUIT_BREAKER',
};

function configuredContracts(): Partial<ContractAddresses> {
  const result: Partial<ContractAddresses> = {};
  for (const [key, variable] of Object.entries(CONTRACT_ENV) as Array<
    [keyof ContractAddresses, keyof ImportMetaEnv]
  >) {
    const address = env[variable];
    if (address) result[key] = address;
  }
  return result;
}

/** `true` when every contract address the read-only pages need is present. */
export function hasContractConfiguration(): boolean {
  const contracts = configuredContracts();
  return Boolean(contracts.rateLimiter && contracts.paymentChannel);
}

export const AGENT_CONFIG = {
  network: AGENT_NETWORK,
  contracts: configuredContracts(),
  // Read-only dashboard: no secret key, so there is nothing to leak or to
  // accidentally spend. `allowUnconfiguredContracts` keeps `create()` from
  // throwing before the page can render its own "not configured" guidance.
  allowUnconfiguredContracts: true,
} as const;

function injectedAgent(): StellarAgent | undefined {
  return typeof window === 'undefined' ? undefined : window.__STELLARAGENT_AGENT__;
}

export function DashboardAgentProvider({ children }: { children: ReactNode }) {
  const agent = injectedAgent();
  return (
    <StellarAgentProvider config={AGENT_CONFIG} {...(agent ? { agent } : {})}>
      {children}
    </StellarAgentProvider>
  );
}
