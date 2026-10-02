/**
 * The one place the dashboard decides where its data comes from.
 *
 * It reads the configuration, constructs exactly one `StellarAgent`, and puts
 * it inside a `<StellarAgentProvider>` from `@stellaragent/react`. Everything
 * downstream — every hook in `panels.ts`, every page — sits below that one
 * decision and cannot make it again.
 *
 * Live mode builds a real agent against `VITE_STELLARAGENT_VIEWER_KEY` with
 * {@link createReadOnlySigner}, so the browser bundle never contains a secret.
 * Mock mode builds a stand-in that answers the same methods. Either way the
 * tree below is identical, which is what makes mock mode a usable test of the
 * live path rather than a parallel implementation of it.
 *
 * The three pre-panel states — unconfigured, connecting, ready — are rendered
 * by {@link DashboardAgentBoundary} rather than by the panels, because they are
 * properties of the *agent*, not of any one panel, and duplicating them into
 * six pages is how they end up disagreeing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StellarAgent } from '@stellaragent/core';
import { StellarAgentProvider } from '@stellaragent/react';
import {
  MOCK_MODE_STORAGE_KEY,
  readDashboardConfig,
  type DashboardConfig,
  type DashboardMode,
  type RawEnv,
} from './config.js';
import { createMockAgent } from './mockAgent.js';
import { createReadOnlySigner } from './readOnlySigner.js';
import { fetchPaymentEvents } from './paymentFeed.js';

export interface DashboardContextValue {
  config: DashboardConfig;
  /** Shorthand for `config.mode`; read it directly in panels. */
  mode: DashboardMode;
  /** The resolved agent, or `null` while it is still being built. */
  agent: StellarAgent | null;
  /** `false` until the agent exists and the provider reports itself ready. */
  agentReady: boolean;
  /** Why `StellarAgent.create` failed, when it did. */
  agentError: Error | null;
  /** Switch between live and mock at runtime. Persisted to `localStorage`. */
  setMode: (mode: DashboardMode) => void;
  /** agent address -> epoch ms of its most recent indexed payment. */
  lastPayments: Record<string, number>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within a <DashboardDataProvider>');
  }
  return ctx;
}

/** Vite's `import.meta.env`, narrowed to what {@link readDashboardConfig} reads. */
function viteEnv(): RawEnv {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env as RawEnv;
}

export interface DashboardDataProviderProps {
  /** Test seam — a full config instead of reading `import.meta.env`. */
  config?: DashboardConfig;
  children: ReactNode;
}

export function DashboardDataProvider({ config: injected, children }: DashboardDataProviderProps) {
  const [config, setConfig] = useState<DashboardConfig>(
    () => injected ?? readDashboardConfig(viteEnv()),
  );
  const [agent, setAgent] = useState<StellarAgent | null>(null);
  const [agentError, setAgentError] = useState<Error | null>(null);
  const [lastPayments, setLastPayments] = useState<Record<string, number>>({});

  // A mode change is a different agent, so the previous one is dropped rather
  // than reused: keeping a live agent around behind a mock-mode UI is how a
  // demo ends up quietly polling mainnet.
  //
  // The whole configuration is re-read rather than having `mode` patched in
  // place, because `problems` — the setup checklist — is *derived from* the
  // mode. Patching the mode alone leaves an empty list, and the dashboard
  // then sits on "Connecting…" forever with no explanation, which is the one
  // outcome the checklist exists to prevent.
  const setMode = useCallback(
    (mode: DashboardMode) => {
      try {
        window.localStorage.setItem(MOCK_MODE_STORAGE_KEY, mode);
      } catch {
        /* storage-disabled embedding — the toggle just will not persist */
      }
      setConfig(
        injected ?? readDashboardConfig({ ...viteEnv(), VITE_STELLARAGENT_MODE: mode }),
      );
    },
    [injected],
  );

  useEffect(() => {
    let cancelled = false;
    setAgent(null);
    setAgentError(null);

    if (config.mode === 'mock') {
      // The latency is the point: it renders the loading branch, which
      // otherwise never appears in a demo and so is never looked at.
      setAgent(createMockAgent({ latencyMs: 250 }));
      return;
    }

    if (!config.viewerKey) {
      // `config.problems` already explains this; leaving `agent` null is what
      // drives the shell to the setup checklist.
      return;
    }

    StellarAgent.create({
      network: config.network,
      contracts: config.contracts,
      assetContracts: config.assetContracts,
      signer: createReadOnlySigner(config.viewerKey),
      // Addresses are validated in `readDashboardConfig`. The check is skipped
      // because a dashboard may legitimately watch only the escrow contract
      // and have no reason to know the circuit breaker's address; a contract
      // it never calls cannot be the reason it fails to start.
      allowUnconfiguredContracts: true,
    })
      .then((created) => {
        if (!cancelled) setAgent(created);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAgent(null);
          setAgentError(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config]);

  // "Last active" comes from the payment feed, which the indexer serves; the
  // roster maps address -> most recent payment timestamp.
  useEffect(() => {
    if (config.mode === 'mock' || !config.indexerUrl) {
      setLastPayments({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const events = await fetchPaymentEvents(config.indexerUrl);
        const latest: Record<string, number> = {};
        for (const event of events) {
          const at = Date.parse(event.ledgerClosedAt);
          if (!Number.isFinite(at)) continue;
          if (latest[event.agent] === undefined || at > latest[event.agent]!) {
            latest[event.agent] = at;
          }
        }
        if (!cancelled) setLastPayments(latest);
      } catch {
        if (!cancelled) setLastPayments({});
      }
    };
    void load();
    const timer = setInterval(load, config.pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [config]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      config,
      mode: config.mode,
      agent,
      agentReady: agent !== null,
      agentError,
      setMode,
      lastPayments,
    }),
    [agent, agentError, config, lastPayments, setMode],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

// ─── The pre-panel states ─────────────────────────────────────────────────────

/**
 * Renders the app once an agent exists, and an explanation before then.
 *
 * The pages' hooks all call `useStellarAgent()`, which throws outside a
 * `<StellarAgentProvider>` — so there is no way to mount them without one. The
 * three states below are what stands in for "there is nothing to ask yet":
 *
 *   - **unconfigured** — live mode with missing env; a checklist, not a spinner
 *   - **connecting**  — live mode with an agent being built
 *   - **ready**       — the real tree
 */
export function DashboardAgentBoundary({ children }: { children: ReactNode }) {
  const { config, agent, agentError } = useDashboard();

  const unconfigured = config.mode === 'chain' && config.problems.length > 0;
  const connecting = config.mode === 'chain' && !unconfigured && agent === null && !agentError;

  if (unconfigured) {
    return <AgentUnavailable problems={config.problems} />;
  }

  if (agentError) {
    return <AgentUnavailable problems={[agentError.message]} />;
  }

  if (connecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sa-bg text-sa-text-dim">
        <p className="text-sm">Connecting to {config.network}…</p>
      </div>
    );
  }

  if (!agent) {
    // Mock mode builds its agent synchronously in an effect, so this is only
    // reachable for a single frame. Rendering the checklist is strictly better
    // than rendering a blank screen.
    return <AgentUnavailable problems={['No agent is available to read from.']} />;
  }

  return (
    <StellarAgentProvider config={AGENT_CONFIG_STUB} agent={agent}>
      {children}
    </StellarAgentProvider>
  );
}

/**
 * `StellarAgentProvider` requires a `config` even when `agent` is supplied;
 * the agent is always injected by the boundary above, so this is never read.
 */
const AGENT_CONFIG_STUB = { network: 'testnet' as const };

function AgentUnavailable({ problems }: { problems: string[] }) {
  const { setMode } = useDashboard();
  return (
    <div className="flex min-h-screen items-center justify-center bg-sa-bg p-8">
      <div className="card max-w-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="font-display text-lg font-semibold text-sa-text">
            The dashboard is not connected to a network
          </h1>
          <button
            type="button"
            onClick={() => setMode('mock')}
            className="btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
            data-testid="use-demo-data"
          >
            Use demo data
          </button>
        </div>
        <p className="text-sm text-sa-text-dim mb-5">
          These are real settings, not fixtures. Fix them, or use the demo data
          to look around — the badge in the sidebar always says which one you
          are looking at.
        </p>
        <ul className="space-y-3">
          {problems.map((problem) => (
            <li key={problem} className="text-sm text-sa-text border-l-2 border-sa-red/40 pl-3">
              {problem}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
