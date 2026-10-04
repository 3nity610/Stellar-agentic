// ─── Network ─────────────────────────────────────────────────────────────────

export type Network = 'mainnet' | 'testnet' | 'local';

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  horizonUrl: string;
}

export const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  mainnet: {
    rpcUrl: 'https://soroban-rpc.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
  },
  testnet: {
    rpcUrl: 'https://soroban-rpc.testnet.stellar.gateway.fm',
    networkPassphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  local: {
    rpcUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: 'Standalone Network ; February 2017',
    horizonUrl: 'http://localhost:8000',
  },
};

// ─── Agent ───────────────────────────────────────────────────────────────────

export type SpendPeriod = 'per_ledger' | 'hourly' | 'daily';

export interface SpendLimit {
  /** Maximum amount per period */
  amount: string;
  /** Asset to limit (e.g. 'USDC') */
  asset: string;
  /** How often the limit resets */
  period: SpendPeriod;
}

export interface StellarAgentConfig {
  /** Stellar network to connect to */
  network: Network;
  /**
   * Where signing happens.
   *
   * Prefer this over `secretKey` for anything holding real funds: with a
   * `RemoteSigner` (or a hardware/wallet-backed one) the key never enters
   * this process, so a heap dump or a compromised transitive dependency
   * cannot yield it. Mutually exclusive with `secretKey`.
   *
   * Typed structurally rather than imported to keep `types/` free of runtime
   * imports; see `signer.ts` for the interface and its implementations.
   */
  signer?: {
    getPublicKey(): Promise<string>;
    signTransaction(xdr: string, options: { networkPassphrase: string }): Promise<string>;
    signAuthEntry(
      authEntryXdr: string,
      options: { networkPassphrase: string; validUntilLedgerSeq: number },
    ): Promise<string>;
  };
  /**
   * Private key for the agent wallet (keep secret!).
   *
   * Holding a raw secret in a long-lived process is a real risk for an agent
   * with funds — use `signer` instead where that matters. Mutually exclusive
   * with `signer`.
   */
  secretKey?: string;
  /** Spend limit enforced on-chain */
  spendLimit?: SpendLimit;
  /**
   * Contract addresses. Anything omitted falls back to the
   * `STELLARAGENT_<NETWORK>_<CONTRACT>` / `STELLARAGENT_<CONTRACT>`
   * environment variables, then to the network's unconfigured sentinel.
   */
  contracts?: Partial<ContractAddresses>;
  /**
   * Token contract IDs keyed by friendly asset code (for example `USDC`).
   * `XLM` resolves automatically, and a `C...` ID may be passed directly.
   */
  assetContracts?: Record<string, string>;
  /**
   * Skip the deployed-contracts check in `StellarAgent.create()`.
   *
   * By default an agent refuses to be created against contract addresses
   * that are not real deployed contract IDs, so the failure names the actual
   * problem instead of surfacing as an opaque RPC error mid-payment. Set
   * this when you only need calls that touch no contract at all — currently
   * `getBalance()` — or in tests. Any contract call made on such an agent
   * will still fail.
   *
   * @default false
   */
  allowUnconfiguredContracts?: boolean;
  /**
   * OpenTelemetry tracing, metrics, and logging. When omitted or
   * `{ enabled: false }`, telemetry is a no-op with zero overhead.
   */
  telemetry?: {
    enabled?: boolean;
    serviceName?: string;
    otlpEndpoint?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    /** Test-only injection — not for production use. */
    tracer?: import('../telemetry/tracer.js').Tracer;
    metrics?: import('../telemetry/metrics.js').Metrics;
  };
  /**
   * Fleet transaction source accounts. Each mutation exclusively leases one,
   * removing sequence-number contention from the agent authorization account.
   * `channelAccountPool` is retained as a descriptive alias.
   */
  channelPool?: import('../fleet/channelPool.js').ChannelAccountPool;
  channelAccountPool?: import('../fleet/channelPool.js').ChannelAccountPool;
  /** Dynamic transaction fee policy. Recent p90 network fees are used by default. */
  feeStrategy?:
    | import('../fleet/feeStrategy.js').FeeStrategy
    | import('../fleet/feeStrategy.js').FeeCallback
    | string
    | number
    | bigint;
  /** Fee-bump behavior for congestion and zero-XLM transaction sources. */
  feeBump?: FeeBumpConfig;
  /** Creates the agent's account with a sponsored reserve in `createAgentWallet()`. */
  sponsorService?: import('../fleet/sponsorship.js').SponsorService;
  /** An existing queue, useful when several agents share one fleet-wide bound. */
  submissionQueue?: import('../fleet/submissionQueue.js').SubmissionQueue;
  /** Build a queue owned by this agent. Omitted fields use fleet-safe defaults. */
  submission?: SubmissionPipelineConfig;
  /** Multi-venue discovery and deterministic route-selection configuration. */
  routing?: import('../routing/planner.js').RoutePlannerOptions;
}

export interface QuoteParams {
  sourceAsset: string;
  destinationAsset: string;
  /** Decimal display amount; converted to 7-decimal base units before discovery. */
  amount: string;
  allowedIntermediates?: string[];
  /** 0..500 basis points. @default 100 */
  slippageToleranceBps?: number;
}

export interface FeeBumpConfig {
  /** @default true */
  enabled?: boolean;
  /** `always` is required when the inner source has zero XLM. @default on_expiry */
  mode?: 'on_expiry' | 'always';
  /** Outer fee source. Defaults to the sponsor, channel, or agent signer in that order. */
  signer?: import('../signer.js').Signer;
  /** A distinct policy for bumps. Defaults to 10x the initial fee or recent fees, whichever is higher. */
  strategy?:
    | import('../fleet/feeStrategy.js').FeeStrategy
    | import('../fleet/feeStrategy.js').FeeCallback
    | string
    | number
    | bigint;
  /** Poll attempts before a pending inner transaction is bumped. @default 3 */
  triggerAfterAttempts?: number;
  /** Remaining transaction lifetime that triggers a bump. @default 10 */
  expiryThresholdSeconds?: number;
  /** Maximum replacement envelopes for one invocation. @default 1 */
  maxBumps?: number;
}

export interface SubmissionPipelineConfig {
  concurrency?: number;
  maxQueueSize?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  classifyError?: import('../fleet/submissionQueue.js').RetryClassifier;
  /** Eager sponsored channel count when `sponsorService` creates the pool. @default 1 */
  minChannels?: number;
  /** Demand-driven sponsored channel limit. @default concurrency */
  maxChannels?: number;
}

export interface AgentInfo {
  id: bigint;
  address: string;
  name: string;
  owner: string;
  active: boolean;
  createdAt: number;
  totalOps: bigint;
}

// ─── Payment Channel ─────────────────────────────────────────────────────────

export interface OpenChannelParams {
  /**
   * Token to use for payments (defaults to XLM). This remains the
   * channel's single funding/settlement asset — `limitPerPeriod` is always
   * denominated in it, even for cross-asset payments made via
   * `payForAPI`'s `destAsset` (see `PayForAPIParams`). Cross-asset support
   * lets one channel pay recipients in other assets; it does not make the
   * channel itself multi-asset.
   */
  token?: string;
  /** Initial deposit amount (as string to avoid precision issues) */
  deposit: string;
  /** Max spend per period, denominated in `token` */
  limitPerPeriod: string;
  period: SpendPeriod;
}

export interface PayForAPIParams {
  /** API endpoint being paid for (stored in memo) */
  endpoint: string;
  /** Amount to pay, denominated in the channel's settlement asset */
  amount: string;
  /** Asset to pay with (must match the channel's settlement asset) */
  asset?: string;
  /** Explicit source asset; `asset` remains a backwards-compatible alias. */
  sourceAsset?: string;
  /** Channel ID to use (uses default if not specified) */
  channelId?: bigint;
  /**
   * Stellar account or contract receiving the payment. Defaults to the
   * agent address for compatibility; real API payments should set this.
   */
  recipient?: string;
  /**
   * Asset the recipient should actually receive, if different from the
   * channel's settlement asset (`asset`) — e.g. a channel funded in XLM
   * paying a provider that only accepts USDC. With `StellarAgentConfig.routing`
   * configured, the SDK discovers and deterministically selects an AMM,
   * Stellar path-payment adapter, or bounded multi-hop route. Without routing
   * configuration, the legacy single-AMM `pay_with_conversion` path remains
   * available and requires `minReceived`. Spend limits always remain in the
   * channel's settlement asset.
   */
  destAsset?: string;
  /** Recipient asset; `destAsset` remains a backwards-compatible alias. */
  recipientAsset?: string;
  /**
   * Minimum amount of `destAsset` the recipient must receive (slippage
   * floor), as a decimal string in `destAsset` units. Automatic routing
   * derives this from `slippageToleranceBps`; when both are supplied the
   * stricter floor wins. It is required only for the legacy single-AMM path.
   * The contract additionally enforces its oracle-derived end-to-end floor.
   */
  minReceived?: string;
  /**
   * Reuse a prior `quote()` result or override automatic selection with a
   * normalized route. Policy, intent, amount, and expiry remain enforced.
   */
  route?: import('../routing/planner.js').PaymentQuote | import('../routing/types.js').RouteQuote;
  /** Intermediate assets automatic discovery may traverse. */
  allowedIntermediates?: string[];
  /** Automatic-quote slippage tolerance in basis points, capped at 500. */
  slippageToleranceBps?: number;
}

export interface PredictPaymentParams {
  /** Proposed payment amount, as a decimal string. */
  amount: string;
  /**
   * Channel to evaluate against. Defaults to the agent's active channel if open.
   * Pass `null` to explicitly skip channel evaluation even when an active channel exists.
   */
  channelId?: bigint | null;
  /**
   * Stellar address of the agent to check rate limits for.
   * Defaults to this agent's address.
   */
  agentAddress?: string;
}


export interface ChannelInfo {
  id: bigint;
  agent: string;
  owner: string;
  token: string;
  limitPerPeriod: bigint;
  spentThisPeriod: bigint;
  totalSpent: bigint;
  active: boolean;
  /** Reset cadence for `spentThisPeriod`, mirroring `Channel.period` on-chain. */
  period: SpendPeriod;
  /**
   * Ledger sequence at which the current period started, mirroring
   * `Channel.period_start_ledger`. `PaymentChannel.pay` resets
   * `spentThisPeriod` to 0 once `currentLedger >= periodStartLedger +
   * <ledgers for period>` — needed to predict spend-limit outcomes without
   * a stale `spentThisPeriod` (see `math/predict.ts`).
   */
  periodStartLedger: number;
}

export interface SpendReport {
  spentThisPeriod: string;
  remainingThisPeriod: string;
  totalLifetime: string;
}

// ─── Escrow / Jobs ───────────────────────────────────────────────────────────

export type JobStatus =
  | 'open'
  | 'in_progress'
  | 'pending_release'
  | 'completed'
  | 'refunded'
  | 'disputed';

export interface RequestWorkParams {
  /** Address of the worker agent */
  workerAgent: string;
  /** Task description or IPFS hash */
  task: string;
  /** Amount to lock in escrow */
  escrowAmount: string;
  /** Asset to pay with */
  asset?: string;
  /** Deadline in ledgers from now */
  deadlineLedgers?: number;
  /** Optional arbiter address for disputes */
  arbiter?: string;
}

export interface JobInfo {
  id: bigint;
  requester: string;
  worker: string | null;
  arbiter: string | null;
  token: string;
  amount: bigint;
  taskDescription: string;
  result: string | null;
  deadlineLedger: number;
  status: JobStatus;
  createdAt: number;
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  maxPerTx: string;
  maxPerHour: string;
  maxPerDay: string;
  maxTxsPerHour: number;
}

/** Current rate-limit usage alongside the configured limits, for `RateLimiter`. */
export interface RateLimitStatus extends RateLimitConfig {
  /** Amount spent in the current rolling hour */
  spentThisHour: string;
  /** Amount spent in the current rolling day */
  spentToday: string;
  /** Transaction count in the current rolling hour */
  txsThisHour: number;
  /**
   * Whether `RateLimiter.set_limits` has ever been called for this agent
   * (mirrors the contract's internal `has_limit` check). When `false`,
   * every other field on this object is meaningless — `RateLimiter.check`
   * returns `true` unconditionally for an unconfigured agent, so payments
   * are unrestricted by the rate limiter (though still subject to a
   * payment channel's own spend limit, if any). Distinct from `active`:
   * an agent can be `configured: true, active: false` (killed).
   */
  configured: boolean;
  /**
   * Mirrors the contract's `RateLimit.active` flag (set by `kill_agent`).
   * When `false`, `RateLimiter.check` returns `false` on-chain for every
   * amount — a killed agent is blocked outright. `predictPaymentOutcome`
   * mirrors that by emitting `rate_limit_inactive` when `configured` is true
   * and `active` is false. Treat this as a blocking signal, not a badge.
   */
  active: boolean;
  /** Ledger sequence at which the current hourly window started. */
  hourWindowStartLedger: number;
  /** Ledger sequence at which the current daily window started. */
  dayWindowStartLedger: number;
}

// ─── Contracts ───────────────────────────────────────────────────────────────

export interface ContractAddresses {
  agentWalletFactory: string;
  paymentChannel: string;
  escrow: string;
  rateLimiter: string;
  circuitBreaker: string;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface AgentEvent {
  type: 'payment' | 'job_created' | 'job_completed' | 'rate_limit_hit' | 'agent_killed';
  agentId: bigint;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface TxResult {
  /** Transaction hash */
  hash: string;
  /** Whether the transaction succeeded */
  success: boolean;
  /** Ledger number it was confirmed in */
  ledger?: number;
  /** Fee charged by the confirmed transaction result, in stroops. */
  feePaid?: string;
  /** Whether confirmation came through a fee-bump envelope. */
  feeBumped?: boolean;
  /** Inner transaction source (the leased channel account when pooling is enabled). */
  sourceAccount?: string;
  /** Outer fee source when different from `sourceAccount`. */
  feeSource?: string;
  /** Number of envelopes accepted for this operation, including a replacement. */
  submissionAttempts?: number;
  /** Deterministic route executed for a converted payment. */
  route?: import('../routing/types.js').RouteQuote;
  /** Quoted destination amount in integer base units. */
  expectedDestinationAmount?: string;
  /** End-to-end contract floor in destination base units. */
  minimumDestinationAmount?: string;
}

// ─── Multi-Sig ────────────────────────────────────────────────────────────────

export interface SignerWeight {
  key: string;
  weight: number;
}

export interface MultiSigConfig {
  signers: SignerWeight[];
  masterWeight: number;
  lowThreshold: number;
  medThreshold: number;
  highThreshold: number;
}

export interface UnsignedTxBuild {
  transactionXdr: string;
  authEntryXdrs: string[];
  validUntilLedgerSeq: number;
  threshold: number;
  signaturesCollected: number;
}

export interface TopUpParams {
  channelId?: bigint;
  amount: string;
  token?: string;
}
