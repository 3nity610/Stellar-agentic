/**
 * Dashboard configuration and the explicit mock-mode toggle.
 *
 * ## Why the dashboard needs configuration at all
 *
 * `PaymentChannel` has no "list every channel" query, and the Soroban contracts
 * are keyed by ID, not by owner. A dashboard that shows "your agents" is
 * therefore showing a *roster* someone told it about, and that roster has to
 * come from somewhere explicit. Pretending otherwise is what produced
 * `mockData.ts` in the first place: fixtures that looked exactly like chain
 * state, in pages that could not tell the difference.
 *
 * So the roster, the contract addresses, the network, and the signing story
 * are all environment variables, and a dashboard without them says so in the
 * UI rather than rendering rows that are not real.
 *
 * ## The mock toggle is explicit, always
 *
 * Mock mode is never inferred. It is one of:
 *
 *   1. `?mode=mock` in the URL — shareable demo links, and what the Playwright
 *      suite uses so it never depends on a dev server's env.
 *   2. `localStorage['sa.dashboard.mode']` — the switch in the sidebar.
 *   3. `VITE_STELLARAGENT_MODE=mock` at build time — a demo deployment.
 *   4. Otherwise: **live**.
 *
 * The default is live, and there is no code path that reaches the fixtures
 * without passing through one of the three above. A dashboard that quietly
 * serves fixture data while claiming to be connected to mainnet is worse than
 * one that shows nothing.
 */

import type { ContractAddresses, Network } from '@stellaragent/core';

export type DashboardMode = 'chain' | 'mock';

export const MOCK_MODE_STORAGE_KEY = 'sa.dashboard.mode';

/** One agent the dashboard watches, and the channel it spends through. */
export interface WatchedAgent {
  id: string;
  name: string;
  /** The agent's `G...` address. */
  address: string;
  /** The payment channel to read spend state from, as a decimal string. */
  channelId?: string;
  /** Display code for the settlement asset, e.g. `USDC`. */
  asset: string;
}

/** One escrow job the dashboard watches. */
export interface WatchedJob {
  id: string;
  /** Optional display name for the worker, when the roster knows it. */
  workerName?: string;
}

export interface DashboardConfig {
  mode: DashboardMode;
  network: Network;
  contracts: Partial<ContractAddresses>;
  assetContracts: Record<string, string>;
  agents: WatchedAgent[];
  jobs: WatchedJob[];
  /** Query API of `@stellaragent/indexer`; the payment feed's only source. */
  indexerUrl: string | null;
  /** How often panels re-read the chain. */
  pollIntervalMs: number;
  /**
   * A `G...` account the read-only agent simulates against.
   *
   * The dashboard is a reader: it never signs, and must never be handed a
   * secret. But Soroban simulation still builds a transaction *from* some
   * account, so the account has to exist on-chain. This is it.
   */
  viewerKey: string | null;
  /**
   * Why the dashboard cannot show real chain state, in the order they should
   * be fixed. Empty means live mode is fully configured.
   */
  problems: string[];
}

const NETWORKS: readonly Network[] = ['mainnet', 'testnet', 'local'];

/**
 * The contracts the dashboard's panels actually call.
 *
 * `circuitBreaker` and `agentWalletFactory` are resolvable but not required:
 * nothing in the built pages calls them, and a setup checklist that lists
 * addresses nobody asked for is a checklist people stop reading.
 */
const REQUIRED_CONTRACTS: ReadonlyArray<keyof ContractAddresses> = ['paymentChannel', 'escrow'];

/** Minimal view of `import.meta.env`, so this module is testable in Node. */
export interface RawEnv {
  VITE_STELLARAGENT_MODE?: string;
  VITE_STELLARAGENT_NETWORK?: string;
  VITE_STELLARAGENT_VIEWER_KEY?: string;
  VITE_STELLARAGENT_INDEXER_URL?: string;
  VITE_STELLARAGENT_AGENTS?: string;
  VITE_STELLARAGENT_JOBS?: string;
  VITE_STELLARAGENT_POLL_MS?: string;
  VITE_STELLARAGENT_ASSET_CONTRACTS?: string;
  [contractKey: string]: string | undefined;
}

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim();
  return out ? out : undefined;
}

function parseJson<T>(value: string | undefined, what: string, problems: string[]): T | null {
  const raw = trimmed(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    problems.push(
      `${what} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/** A `G...` address, or `null` — checked here so a typo is a message, not an RPC error. */
function isPublicKey(value: string | undefined): value is string {
  return typeof value === 'string' && /^G[A-Z2-7]{55}$/.test(value.trim());
}

function isContractId(value: string | undefined): value is string {
  return typeof value === 'string' && /^C[A-Z2-7]{55}$/.test(value.trim());
}

function parseAgents(raw: string | undefined, problems: string[]): WatchedAgent[] {
  const parsed = parseJson<unknown[]>(raw, 'VITE_STELLARAGENT_AGENTS', problems);
  if (!parsed) return [];
  const agents: WatchedAgent[] = [];
  for (const [index, entry] of parsed.entries()) {
    if (!entry || typeof entry !== 'object') {
      problems.push(`VITE_STELLARAGENT_AGENTS[${index}] is not an object`);
      continue;
    }
    const record = entry as Record<string, unknown>;
    const address = trimmed(record.address as string);
    if (!isPublicKey(address)) {
      problems.push(
        `VITE_STELLARAGENT_AGENTS[${index}].address is not a Stellar G... address: ${String(record.address)}`,
      );
      continue;
    }
    if (record.channelId !== undefined && !/^(0|[1-9][0-9]*)$/.test(String(record.channelId))) {
      problems.push(
        `VITE_STELLARAGENT_AGENTS[${index}].channelId must be a u64 as a decimal string`,
      );
      continue;
    }
    agents.push({
      id: trimmed(record.id as string) ?? address,
      name: trimmed(record.name as string) ?? `${address.slice(0, 6)}…${address.slice(-4)}`,
      address,
      channelId: record.channelId === undefined ? undefined : String(record.channelId),
      asset: trimmed(record.asset as string) ?? 'XLM',
    });
  }
  return agents;
}

function parseJobs(raw: string | undefined, problems: string[]): WatchedJob[] {
  const parsed = parseJson<unknown[]>(raw, 'VITE_STELLARAGENT_JOBS', problems);
  if (!parsed) return [];
  const jobs: WatchedJob[] = [];
  for (const [index, entry] of parsed.entries()) {
    // Accept both `"7"` and `{ "id": "7", "workerName": "…" }`.
    const record = typeof entry === 'object' && entry !== null
      ? (entry as Record<string, unknown>)
      : { id: entry };
    const id = trimmed(record.id as string);
    if (!id || !/^(0|[1-9][0-9]*)$/.test(id)) {
      problems.push(`VITE_STELLARAGENT_JOBS[${index}].id must be a u64 as a decimal string`);
      continue;
    }
    jobs.push({ id, workerName: trimmed(record.workerName as string) });
  }
  return jobs;
}

/**
 * Resolve the mode from the three explicit switches, in precedence order.
 *
 * Exported separately from {@link readDashboardConfig} because the toggle in
 * the sidebar and the Playwright `?mode=` query parameter both need it, and
 * because the precedence order is the thing worth asserting in a test.
 */
export function resolveMode(
  env: RawEnv,
  search = typeof window === 'undefined' ? '' : window.location.search,
  storage: Pick<Storage, 'getItem'> | null =
    typeof window === 'undefined' ? null : window.localStorage,
): DashboardMode {
  const fromQuery = new URLSearchParams(search).get('mode');
  if (fromQuery === 'mock' || fromQuery === 'chain') return fromQuery;

  let fromStorage: string | null = null;
  try {
    fromStorage = storage?.getItem(MOCK_MODE_STORAGE_KEY) ?? null;
  } catch {
    // Safari in private mode, and any storage-disabled embedding. The toggle
    // is a convenience, not a requirement.
    fromStorage = null;
  }
  if (fromStorage === 'mock' || fromStorage === 'chain') return fromStorage;

  const fromEnv = trimmed(env.VITE_STELLARAGENT_MODE)?.toLowerCase();
  if (fromEnv === 'mock') return 'mock';
  if (fromEnv === 'chain' || fromEnv === 'live') return 'chain';

  return 'chain';
}

/** Persist a mode chosen in the UI, so it survives a reload. */
export function persistMode(mode: DashboardMode): void {
  try {
    window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, mode);
  } catch {
    /* see resolveMode */
  }
}

/**
 * Read the whole dashboard configuration out of Vite's `import.meta.env`.
 *
 * Never throws. Anything missing or malformed becomes an entry in `problems`,
 * which the shell renders as a setup checklist — a misconfigured dashboard
 * should tell you what to fix, not show an empty table.
 */
export function readDashboardConfig(
  env: RawEnv,
  search?: string,
  storage?: Pick<Storage, 'getItem'> | null,
): DashboardConfig {
  const problems: string[] = [];
  const mode = resolveMode(env, search, storage);

  const networkEnv = trimmed(env.VITE_STELLARAGENT_NETWORK)?.toLowerCase() ?? 'testnet';
  const network = (NETWORKS as readonly string[]).includes(networkEnv)
    ? (networkEnv as Network)
    : 'testnet';
  if (!(NETWORKS as readonly string[]).includes(networkEnv)) {
    problems.push(
      `VITE_STELLARAGENT_NETWORK is "${networkEnv}", which is not one of ${NETWORKS.join(', ')}. Falling back to testnet.`,
    );
  }

  // Network-scoped first (STELLARAGENT_TESTNET_PAYMENT_CHANNEL), matching
  // `resolveContracts` in @stellaragent/core, so the dashboard reads the same
  // variables `pnpm deploy:contracts` prints.
  const contractKeys: Array<keyof ContractAddresses> = [
    'agentWalletFactory',
    'paymentChannel',
    'escrow',
    'rateLimiter',
    'circuitBreaker',
  ];
  const contracts: Partial<ContractAddresses> = {};
  for (const key of contractKeys) {
    const suffix = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
    const value = trimmed(env[`VITE_STELLARAGENT_${network.toUpperCase()}_${suffix}`])
      ?? trimmed(env[`VITE_STELLARAGENT_${suffix}`]);
    if (isContractId(value)) contracts[key] = value.trim();
  }

  const agents = parseAgents(env.VITE_STELLARAGENT_AGENTS, problems);
  const jobs = parseJobs(env.VITE_STELLARAGENT_JOBS, problems);

  const assetContracts = parseJson<Record<string, string>>(
    env.VITE_STELLARAGENT_ASSET_CONTRACTS,
    'VITE_STELLARAGENT_ASSET_CONTRACTS',
    problems,
  ) ?? {};

  const viewerKey = isPublicKey(trimmed(env.VITE_STELLARAGENT_VIEWER_KEY))
    ? trimmed(env.VITE_STELLARAGENT_VIEWER_KEY)!
    : null;

  const pollRaw = Number(trimmed(env.VITE_STELLARAGENT_POLL_MS));
  const pollIntervalMs = Number.isFinite(pollRaw) && pollRaw >= 1_000 ? pollRaw : 15_000;

  if (mode === 'chain') {
    // Only the contracts a panel actually calls are required. Demanding the
    // circuit breaker's address from a dashboard that never touches it is
    // noise, and noise is what makes a setup checklist get ignored.
    const missingContracts = REQUIRED_CONTRACTS.filter((key) => !contracts[key]);
    if (missingContracts.length > 0) {
      problems.push(
        `No contract address for ${missingContracts.join(', ')}. ` +
          `Set VITE_STELLARAGENT_${network.toUpperCase()}_<CONTRACT> (the deploy script prints a .env block), ` +
          'or switch the dashboard to mock mode.',
      );
    }
    if (!viewerKey) {
      problems.push(
        'VITE_STELLARAGENT_VIEWER_KEY is not set. The dashboard reads the chain without ever holding a ' +
          'secret, but Soroban still needs an account to simulate against — point this at any funded ' +
          'G... address you do not mind transactions being built from.',
      );
    }
    if (agents.length === 0) {
      problems.push(
        'VITE_STELLARAGENT_AGENTS is empty. The contracts are keyed by ID and have no "list every ' +
          'channel" query, so the dashboard needs a roster: ' +
          'VITE_STELLARAGENT_AGENTS=[{"name":"Inference","address":"G…","channelId":"1","asset":"USDC"}]',
      );
    }
  }

  return {
    mode,
    network,
    contracts,
    assetContracts,
    agents,
    jobs,
    indexerUrl: trimmed(env.VITE_STELLARAGENT_INDEXER_URL)?.replace(/\/+$/, '') ?? null,
    pollIntervalMs,
    viewerKey,
    problems,
  };
}
