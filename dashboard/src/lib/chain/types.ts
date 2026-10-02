/**
 * View models the dashboard's panels render.
 *
 * These are the shapes that used to be declared inside `lib/mockData.ts` and
 * imported straight from the fixtures. They live here now because they are no
 * longer mock data's property: a panel needs an `Agent` whether the row came
 * off the chain or out of a fixture, and the point of this layer is that the
 * two are interchangeable *above* this line. `mockData.ts` re-exports them so
 * existing imports keep working.
 *
 * Everything monetary is a **decimal string**, never a `number`. These values
 * are the same quantities `packages/core/src/math` treats as strings for
 * cross-platform determinism; a float that agrees on x86 and disagrees on ARM
 * is a silent correctness bug, not a rounding nuisance. Use
 * `lib/deterministic-math.ts` to do arithmetic on them.
 */

/** `'active' | 'inactive' | 'warning'` — the three states `StatusDot` renders. */
export type AgentStatus = 'active' | 'inactive' | 'warning';

export interface Agent {
  id: string;
  name: string;
  address: string;
  status: AgentStatus;
  balance: string;
  asset: string;
  spentToday: string;
  spentThisHour: string;
  limitPerHour: string;
  limitPerDay: string;
  totalOps: number;
  lastActive: string;
  channelId: string;
}

export type PaymentStatus = 'success' | 'failed' | 'pending';

/**
 * Resource cost figures returned by a transaction simulation.
 *
 * Mirrors the cost fields `packages/core` surfaces on `TxResult`; every
 * monetary value is a decimal string for the same determinism reasons as the
 * rest of this file.
 */
export interface SimulationCost {
  /** Minimum resource fee the network will charge, in stroops. */
  minResourceFee: string;
  /** CPU instructions consumed by the simulation. */
  cpuInsns: string;
  /** Memory bytes consumed by the simulation. */
  memBytes: string;
}

/**
 * The result of a simulated (and optionally submitted) contract invocation.
 *
 * `simulateOnly` callers get this back without a transaction ever hitting the
 * network, so a call can be priced before it is paid for.
 */
export interface TxResult {
  /** Whether the transaction was actually submitted. */
  submitted: boolean;
  /** Transaction hash, present only when `submitted` is true. */
  txHash?: string;
  /** Simulation cost estimate, when the source could supply one. */
  cost?: SimulationCost;
}

export interface Payment {
  id: string;
  agentId: string;
  agentName: string;
  recipient: string;
  amount: string;
  asset: string;
  endpoint: string;
  ledger: number;
  timestamp: string;
  status: PaymentStatus;
  /** Stellar transaction hash, when the source could supply one. */
  txHash?: string;
}

export type JobStatus =
  | 'open'
  | 'in_progress'
  | 'pending_release'
  | 'completed'
  | 'refunded'
  | 'disputed';

export interface Job {
  id: string;
  requester: string;
  requesterName: string;
  worker: string | null;
  workerName: string | null;
  task: string;
  amount: string;
  asset: string;
  status: JobStatus;
  deadline: string;
  createdAt: string;
}

export interface SpendDataPoint {
  time: string;
  spend: number;
  ops: number;
}

/**
 * The four states every panel can be in.
 *
 * `idle` is distinct from `loading`: `idle` means "not started, and not
 * supposed to have" (nothing configured to show), `loading` means a fetch is
 * in flight. Collapsing them is how a dashboard ends up showing a spinner
 * forever on a deployment that was never configured.
 */
export type PanelStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * One panel's data plus its lifecycle.
 *
 * Deliberately the same shape `@stellaragent/react`'s `usePolling` returns, so
 * a panel can be driven by either without a translation layer.
 */
export interface Panel<T> {
  data: T | null;
  status: PanelStatus;
  error: Error | null;
  refetch: () => void;
}

/**
 * A per-item failure inside an otherwise-successful panel.
 *
 * One unreachable address should not blank a table of fifty; the panel reports
 * `status: 'ready'` with `data` for everything that resolved and a `failures`
 * entry for everything that did not, and the UI shows both.
 */
export interface PanelFailure {
  /** The configured id (agent address, job id) that could not be read. */
  id: string;
  error: Error;
}

export interface PanelResult<T> extends Panel<T> {
  failures: PanemFailure[];
}
