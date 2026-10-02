// Key handling lives behind the Signer abstraction in ../signer.ts.
import type { Horizon, SorobanRpc, xdr } from '@stellar/stellar-sdk';
import type {
  StellarAgentConfig,
  Network,
  NetworkConfig,
  OpenChannelParams,
  PayForAPIParams,
  RequestWorkParams,
  RateLimitConfig,
  RateLimitStatus,
  AgentInfo,
  ChannelInfo,
  JobInfo,
  SpendReport,
  TxResult,
  ContractAddresses,
  QuoteParams,
  PredictPaymentParams,
} from '../types/index.js';
import { predictPaymentOutcome, type PaymentPrediction } from '../math/predict.js';
import { toChannelSpendState, toRateLimitSpendState } from './decoding.js';
import { NETWORK_CONFIGS } from '../types/index.js';
import { StellarAgentError } from '../errors.js';
import { resolveContracts, assertDeployed } from '../contracts.js';
import { KeypairSigner, SigningError } from '../signer.js';
import type { Signer } from '../signer.js';
import type { LedgerCloseEstimate } from '../ledgerTime.js';
import type { SolvencyProof, SolvencyVerifyingKey } from './solvency.js';
import { initTelemetry } from '../telemetry/index.js';
import type { TelemetryContext } from '../telemetry/index.js';
import { asFeeStrategy, RecentFeeStrategy } from '../fleet/feeStrategy.js';
import type { FeeStrategy } from '../fleet/feeStrategy.js';
import { ChannelAccountPool } from '../fleet/channelPool.js';
import { SubmissionQueue } from '../fleet/submissionQueue.js';
import type { SponsorService } from '../fleet/sponsorship.js';
import { SponsoredChannelAccountFactory } from '../fleet/sponsorship.js';
import type { ChannelPoolStats } from '../fleet/channelPool.js';
import type { SubmissionQueueStats } from '../fleet/submissionQueue.js';
import type { InvocationFeeBumpConfig } from './invocation.js';
import { RoutePlanner } from '../routing/planner.js';
import type { PaymentQuote } from '../routing/planner.js';
import type { RouteQuote } from '../routing/types.js';
import { toStroops } from '../math/fixed-point.js';

import { createNetworkClients, fundFromFriendbot } from './config.js';
import { getLatestLedger, runInvocation } from './invocation.js';
import * as queries from './queries.js';
import * as mutations from './mutations.js';
import * as solvency from './solvency.js';

/**
 * Main SDK class for AI Agent payment operations on Stellar.
 *
 * @example
 * ```typescript
 * const agent = await StellarAgent.create({
 *   network: 'testnet',
 *   spendLimit: { amount: '10', asset: 'USDC', period: 'hourly' },
 * });
 *
 * await agent.payForAPI({
 *   endpoint: 'https://api.example.com/inference',
 *   amount: '0.001',
 *   asset: 'USDC',
 * });
 * ```
 */
export class StellarAgent {
  /**
   * Where signing happens. For a {@link RemoteSigner} this holds a URL and a
   * token — no key material — which is the entire point of the abstraction.
   */
  private signer: Signer;
  /**
   * Resolved once at `create()` time. Cached so `address` stays a synchronous
   * getter even when the signer derives it over the network.
   */
  private publicKey: string;
  private networkConfig: NetworkConfig;
  private contracts: ContractAddresses;
  private assetContracts: Record<string, string>;
  private horizon: Horizon.Server;
  private rpc: SorobanRpc.Server;
  private activeChannelId?: bigint;
  private telemetry: TelemetryContext;
  private channelPool?: ChannelAccountPool;
  private feeStrategy: FeeStrategy;
  private feeBump: InvocationFeeBumpConfig;
  private sponsorService?: SponsorService;
  private submissionQueue: SubmissionQueue;
  private ownsSubmissionQueue: boolean;
  private routePlanner?: RoutePlanner;

  private constructor(
    signer: Signer,
    publicKey: string,
    networkConfig: NetworkConfig,
    contracts: ContractAddresses,
    assetContracts: Record<string, string>,
    telemetry: TelemetryContext,
    channelPool: ChannelAccountPool | undefined,
    feeStrategy: FeeStrategy,
    feeBump: InvocationFeeBumpConfig,
    sponsorService: SponsorService | undefined,
    submissionQueue: SubmissionQueue,
    ownsSubmissionQueue: boolean,
    routePlanner: RoutePlanner | undefined,
  ) {
    this.signer = signer;
    this.publicKey = publicKey;
    this.networkConfig = networkConfig;
    this.contracts = contracts;
    this.assetContracts = assetContracts;
    this.telemetry = telemetry;
    this.channelPool = channelPool;
    this.feeStrategy = feeStrategy;
    this.feeBump = feeBump;
    this.sponsorService = sponsorService;
    this.submissionQueue = submissionQueue;
    this.ownsSubmissionQueue = ownsSubmissionQueue;
    this.routePlanner = routePlanner;
    const { horizon, rpc } = createNetworkClients(networkConfig);
    this.horizon = horizon;
    this.rpc = rpc;
  }

  // ── Factory Methods ──────────────────────────────────────────────────────

  /**
   * Create a new StellarAgent instance.
   *
   * Supply exactly one of:
   * - `signer` — any {@link Signer}. The secret never enters this process.
   * - `secretKey` — an in-memory keypair, wrapped in a {@link KeypairSigner}.
   * - neither — a fresh random keypair is generated.
   *
   * Contract addresses resolve from `config.contracts`, then from
   * `STELLARAGENT_*` environment variables, then from the per-network
   * unconfigured sentinels. If the result is not a set of real deployed
   * contract IDs this throws {@link ContractsNotDeployedError} immediately,
   * rather than letting an opaque RPC error surface later from the middle of
   * a payment. Pass `allowUnconfiguredContracts: true` to skip that check
   * when you only need read-only, contract-free calls such as
   * {@link StellarAgent.getBalance}.
   *
   * @example Remote signer — no key material in this process
   * ```typescript
   * const agent = await StellarAgent.create({
   *   network: 'testnet',
   *   signer: new RemoteSigner({ url: 'https://signer.internal', token: TOKEN }),
   * });
   * ```
   *
   * @throws {ContractsNotDeployedError} when contracts are not deployed
   */
  static async create(config: StellarAgentConfig): Promise<StellarAgent> {
    if (config.signer && config.secretKey) {
      throw new Error(
        'StellarAgent.create: pass either `signer` or `secretKey`, not both. ' +
          'Supplying a secret alongside a remote signer would defeat the point of the signer.',
      );
    }

    const generatedKeypair = !config.signer && !config.secretKey;
    const signer: Signer = config.signer
      ? config.signer
      : config.secretKey
        ? KeypairSigner.fromSecret(config.secretKey)
        : KeypairSigner.random();

    // Derived through the Signer interface, so a remote signer reports its
    // address without the secret ever being loaded here.
    const publicKey = await signer.getPublicKey();

    const networkConfig = NETWORK_CONFIGS[config.network];
    const contracts = resolveContracts(config.network, config.contracts);

    if (!config.allowUnconfiguredContracts) {
      assertDeployed(config.network, contracts);
    }

    const telemetry = await initTelemetry({
      enabled: config.telemetry?.enabled,
      serviceName: config.telemetry?.serviceName,
      otlpEndpoint: config.telemetry?.otlpEndpoint,
      logLevel: config.telemetry?.logLevel,
      tracer: config.telemetry?.tracer,
      metrics: config.telemetry?.metrics,
      network: config.network,
      agentAddress: publicKey,
    });

    const feeStrategy = asFeeStrategy(config.feeStrategy);
    const defaultBumpStrategy = new RecentFeeStrategy({ multiplier: 1.25 });
    const triggerAfterAttempts = config.feeBump?.triggerAfterAttempts ?? 3;
    const expiryThresholdSeconds = config.feeBump?.expiryThresholdSeconds ?? 10;
    const maxBumps = config.feeBump?.maxBumps ?? 1;
    if (!Number.isInteger(triggerAfterAttempts) || triggerAfterAttempts < 1) {
      throw new RangeError('feeBump.triggerAfterAttempts must be a positive integer');
    }
    if (!Number.isFinite(expiryThresholdSeconds) || expiryThresholdSeconds < 0) {
      throw new RangeError('feeBump.expiryThresholdSeconds must be non-negative');
    }
    if (!Number.isInteger(maxBumps) || maxBumps < 0) {
      throw new RangeError('feeBump.maxBumps must be a non-negative integer');
    }
    const bumpMode = config.feeBump?.mode ?? (config.sponsorService ? 'always' : 'on_expiry');
    if ((config.feeBump?.enabled ?? true) && bumpMode === 'always' && maxBumps < 1) {
      throw new RangeError('feeBump.maxBumps must be at least 1 in always mode');
    }
    const feeBump: InvocationFeeBumpConfig = {
      enabled: config.feeBump?.enabled ?? true,
      mode: bumpMode,
      signer: config.feeBump?.signer ?? config.sponsorService?.feePayerSigner,
      strategy: config.feeBump?.strategy
        ? asFeeStrategy(config.feeBump.strategy)
        : defaultBumpStrategy,
      triggerAfterAttempts,
      expiryThresholdSeconds,
      maxBumps,
    };

    if (config.channelPool && config.channelAccountPool &&
      config.channelPool !== config.channelAccountPool) {
      throw new Error('StellarAgent.create: channelPool and channelAccountPool refer to different pools');
    }
    let channelPool = config.channelPool ?? config.channelAccountPool;
    if (!channelPool && config.sponsorService) {
      const concurrency = config.submission?.concurrency ?? 4;
      const minSize = config.submission?.minChannels ?? 1;
      const maxSize = config.submission?.maxChannels ?? concurrency;
      channelPool = await ChannelAccountPool.create({
        factory: new SponsoredChannelAccountFactory(config.sponsorService),
        minSize,
        maxSize,
      });
    }
    const submissionQueue = config.submissionQueue ?? new SubmissionQueue({
      concurrency: config.submission?.concurrency ?? (channelPool ? 4 : 1),
      maxQueueSize: config.submission?.maxQueueSize,
      // Retrying an entire already-simulated contract call can duplicate side
      // effects. The generic queue supports retries, but the agent defaults to
      // one attempt; applications opt in after choosing a domain classifier.
      maxAttempts: config.submission?.maxAttempts ?? 1,
      retryDelayMs: config.submission?.retryDelayMs,
      classifyError: config.submission?.classifyError,
      metrics: telemetry.metrics,
    });
    const routePlanner = config.routing ? new RoutePlanner(config.routing) : undefined;

    const agent = new StellarAgent(
      signer,
      publicKey,
      networkConfig,
      contracts,
      config.assetContracts ?? {},
      telemetry,
      channelPool,
      feeStrategy,
      feeBump,
      config.sponsorService,
      submissionQueue,
      !config.submissionQueue,
      routePlanner,
    );

    // Only a freshly generated keypair gets friendbot funding — a supplied
    // secret or an external signer is assumed to already have an account.
    if (config.network === 'testnet' && generatedKeypair && !config.sponsorService) {
      await fundFromFriendbot(agent.address);
    }

    return agent;
  }

  /**
   * Restore an agent from an existing secret key.
   *
   * `options` forwards the rest of {@link StellarAgentConfig} — notably
   * `contracts` and `allowUnconfiguredContracts`, without which a restored
   * agent could only ever target contracts resolved from the environment.
   */
  static async fromSecret(
    secretKey: string,
    network: Network = 'testnet',
    options: Omit<StellarAgentConfig, 'network' | 'secretKey'> = {},
  ): Promise<StellarAgent> {
    return StellarAgent.create({ ...options, network, secretKey });
  }

  // ── Identity ─────────────────────────────────────────────────────────────

  /**
   * The agent's Stellar public address.
   *
   * Resolved through the {@link Signer} at `create()` time, so this works
   * identically for a remote signer that never exposes its secret.
   */
  get address(): string {
    return this.publicKey;
  }

  /**
   * The agent's secret key.
   *
   * Only available when the agent was built from an in-memory keypair. With
   * any other {@link Signer} there is no secret in this process to return —
   * which is the point — so this throws rather than returning something
   * misleading.
   *
   * @deprecated Reading key material off a live agent is the pattern the
   * {@link Signer} abstraction exists to remove. Hold the secret yourself if
   * you need it, or use a {@link RemoteSigner} and stop having one.
   *
   * @throws {SigningError} when signing is not backed by a local keypair
   */
  get secretKey(): string {
    if (!(this.signer instanceof KeypairSigner)) {
      throw new SigningError(
        'This agent has no secret key to expose — it signs via ' +
          `${this.signer.constructor.name}, which holds the key elsewhere. ` +
          'That is the intended behaviour for a remote signer.',
      );
    }
    return this.signer.exportSecret();
  }

  /**
   * Whether this agent holds key material in-process.
   *
   * `false` for a remote or hardware signer. Useful for asserting a
   * production deployment is not running with an in-memory secret.
   */
  get holdsSecretKey(): boolean {
    return this.signer instanceof KeypairSigner;
  }

  /** Current channel utilization and queue/backpressure counters. */
  getFleetStats(): {
    channels?: ChannelPoolStats;
    submissions: SubmissionQueueStats;
  } {
    return {
      channels: this.channelPool?.stats,
      submissions: this.submissionQueue.stats,
    };
  }

  /** Grow or reclaim the configured channel-account fleet. */
  async resizeChannelPool(size: number): Promise<void> {
    if (!this.channelPool) {
      throw new StellarAgentError(
        'INVALID_ARGUMENT',
        'No channel account pool is configured for this agent',
      );
    }
    await this.channelPool.resize(size);
  }

  /** Drain accepted submissions and reclaim agent-owned channel accounts. */
  async shutdown(): Promise<void> {
    if (this.ownsSubmissionQueue) await this.submissionQueue.close();
    else await this.submissionQueue.drain();
    await this.channelPool?.close();
  }

  /** Register this wallet in the configured AgentWalletFactory contract. */
  async createAgentWallet(name = 'StellarAgent'): Promise<bigint> {
    if (this.sponsorService) {
      await this.sponsorService.ensureSponsoredAccount(this.signer);
    }
    return mutations.createAgentWallet(
      this.invokeContract.bind(this),
      this.contracts.agentWalletFactory,
      this.address,
      name,
    );
  }

  /** Read and decode an agent registered in AgentWalletFactory. */
  async getAgent(agentId: bigint): Promise<AgentInfo> {
    return queries.getAgent(
      this.invokeContract.bind(this),
      this.contracts.agentWalletFactory,
      agentId,
    );
  }

  // ── Payment Channel ──────────────────────────────────────────────────────

  /**
   * Open a payment channel for this agent.
   * Deposits tokens and sets a per-period spend limit.
   *
   * @returns The channel ID
   */
  async openChannel(params: OpenChannelParams): Promise<bigint> {
    const channelId = await mutations.openChannel(
      this.invokeContract.bind(this),
      this.contracts.paymentChannel,
      this.address,
      this.assetContracts,
      this.networkConfig.networkPassphrase,
      params,
    );
    this.activeChannelId = channelId;
    return channelId;
  }

  /** Close a payment channel and return its remaining token balance. */
  async closeChannel(channelId = this.activeChannelId): Promise<TxResult> {
    if (channelId === undefined) {
      throw new StellarAgentError(
        'NO_ACTIVE_CHANNEL',
        'No active payment channel. Call openChannel() first.',
      );
    }
    const tx = await mutations.closeChannel(
      this.invokeContract.bind(this),
      this.contracts.paymentChannel,
      this.address,
      channelId,
    );
    if (this.activeChannelId === channelId) this.activeChannelId = undefined;
    return tx;
  }

  /**
   * Pay for an API call. Deducts from the active payment channel.
   * Respects on-chain spend limits automatically.
   *
   * If `recipientAsset` differs from the channel's settlement asset and
   * routing providers are configured, this discovers, scores, and executes
   * one direct, AMM, path-payment-adapter, or bounded multi-hop route through
   * `PaymentChannel.pay_with_route`. A quote returned by {@link quote} may be
   * supplied as `route` so the reviewed route is exactly the one submitted.
   * Spend limits remain denominated in the channel's settlement asset.
   *
   * @example
   * ```typescript
   * await agent.payForAPI({
   *   endpoint: 'https://api.openai.com/v1/chat',
   *   amount: '0.001',
   *   asset: 'USDC',
   * });
   *
   * // Channel funded in XLM, provider only accepts USDC. The configured
   * // routing providers choose the route and derive the output floor:
   * const quote = await agent.quote({
   *   sourceAsset: 'XLM',
   *   destinationAsset: 'USDC',
   *   amount: '0.001',
   * });
   * await agent.payForAPI({
   *   endpoint: 'https://api.example.com/inference',
   *   amount: '0.001',
   *   sourceAsset: 'XLM',
   *   recipientAsset: 'USDC',
   *   route: quote,
   * });
   * ```
   */
  async payForAPI(params: PayForAPIParams): Promise<TxResult> {
    const channelId = params.channelId ?? this.activeChannelId;
    if (channelId === undefined) {
      throw new StellarAgentError(
        'NO_ACTIVE_CHANNEL',
        'No active payment channel. Call openChannel() first.',
      );
    }
    const sourceAsset = coalesceAssetAlias(
      params.sourceAsset,
      params.asset,
      'sourceAsset',
      'asset',
    ) ?? 'XLM';
    const destinationAsset = coalesceAssetAlias(
      params.recipientAsset,
      params.destAsset,
      'recipientAsset',
      'destAsset',
    );
    let routed: mutations.RoutedPaymentExecution | undefined;
    if (destinationAsset && (params.route || this.routePlanner)) {
      const currentLedger = await this.getLatestLedger();
      const planner = this.routePlanner ?? new RoutePlanner({ providers: [] });
      const request = {
        sourceAsset,
        destinationAsset,
        sourceAmount: toStroops(params.amount).toString(),
        currentLedger,
        ...(params.allowedIntermediates
          ? { allowedIntermediates: params.allowedIntermediates }
          : {}),
        ...(params.slippageToleranceBps !== undefined
          ? { slippageToleranceBps: params.slippageToleranceBps }
          : {}),
      };

      let quote: PaymentQuote;
      if (params.route && isPaymentQuote(params.route)) {
        const validated = planner.quoteOverride(request, params.route.route);
        planner.assertFresh(params.route, currentLedger);
        if (BigInt(params.route.minimumDestinationAmount) <
          BigInt(validated.minimumDestinationAmount)) {
          throw new StellarAgentError(
            'INVALID_ROUTE_OVERRIDE',
            'Payment quote minimum is below the configured slippage floor',
          );
        }
        quote = params.route;
      } else if (params.route) {
        quote = planner.quoteOverride(request, params.route);
      } else {
        quote = await planner.quote(request);
      }
      if (params.minReceived !== undefined) {
        const callerMinimum = toStroops(params.minReceived).toString();
        if (BigInt(callerMinimum) > BigInt(quote.minimumDestinationAmount)) {
          quote = { ...quote, minimumDestinationAmount: callerMinimum };
        }
      }
      routed = { quote };
    }

    return mutations.payForAPI(
      this.invokeContract.bind(this),
      this.contracts.paymentChannel,
      this.address,
      this.assetContracts,
      this.networkConfig.networkPassphrase,
      channelId,
      { ...params, sourceAsset, ...(destinationAsset ? { recipientAsset: destinationAsset } : {}) },
      routed,
    );
  }

  /** Discover, score, and return the exact payment route before committing. */
  async quote(params: QuoteParams): Promise<PaymentQuote> {
    if (!this.routePlanner) {
      throw new StellarAgentError(
        'NO_ROUTE',
        'No routing providers are configured for this agent',
      );
    }
    const currentLedger = await this.getLatestLedger();
    return this.routePlanner.quote({
      sourceAsset: params.sourceAsset,
      destinationAsset: params.destinationAsset,
      sourceAmount: toStroops(params.amount).toString(),
      currentLedger,
      ...(params.allowedIntermediates
        ? { allowedIntermediates: params.allowedIntermediates }
        : {}),
      ...(params.slippageToleranceBps !== undefined
        ? { slippageToleranceBps: params.slippageToleranceBps }
        : {}),
    });
  }

  // ── Agent-to-Agent Escrow ────────────────────────────────────────────────

  /**
   * Create an escrow job delegating work to another agent.
   * Locks payment until the work is delivered and released.
   *
   * @example
   * ```typescript
   * const job = await agent.requestWork({
   *   workerAgent: 'G...WORKER_ADDRESS',
   *   task: 'Summarize this document: ipfs://Qm...',
   *   escrowAmount: '0.05',
   *   asset: 'USDC',
   * });
   * ```
   */
  async requestWork(params: RequestWorkParams): Promise<bigint> {
    return mutations.requestWork(
      this.invokeContract.bind(this),
      this.getLatestLedger.bind(this),
      this.contracts.escrow,
      this.address,
      this.assetContracts,
      this.networkConfig.networkPassphrase,
      params,
    );
  }

  /**
   * Accept an open escrow job as a worker agent
   */
  async acceptJob(jobId: bigint): Promise<TxResult> {
    return mutations.acceptJob(this.invokeContract.bind(this), this.contracts.escrow, this.address, jobId);
  }

  /**
   * Submit work result for an escrow job
   */
  async submitResult(jobId: bigint, result: string): Promise<TxResult> {
    return mutations.submitResult(
      this.invokeContract.bind(this),
      this.contracts.escrow,
      this.address,
      jobId,
      result,
    );
  }

  /**
   * Release escrow payment to the worker after work is complete
   */
  async releasePayment(jobId: bigint): Promise<TxResult> {
    return mutations.releasePayment(this.invokeContract.bind(this), this.contracts.escrow, this.address, jobId);
  }

  // ── Rate Limits ──────────────────────────────────────────────────────────

  /**
   * Configure rate limits for this agent on-chain.
   * Protects against runaway spending.
   */
  async setRateLimits(config: RateLimitConfig): Promise<TxResult> {
    return mutations.setRateLimits(this.invokeContract.bind(this), this.contracts.rateLimiter, this.address, config);
  }

  /**
   * Check if a payment would be blocked by rate limits (read-only)
   */
  async checkRateLimit(amount: string): Promise<boolean> {
    return queries.checkRateLimit(this.invokeContract.bind(this), this.contracts.rateLimiter, this.address, amount);
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  /**
   * Get current XLM balance
   */
  async getBalance(): Promise<string> {
    return queries.getBalance(this.horizon, this.address);
  }

  /**
   * Get spend report for the current period
   */
  async getSpendReport(channelId = this.activeChannelId): Promise<SpendReport> {
    return queries.getSpendReport(this.invokeContract.bind(this), this.contracts.paymentChannel, channelId);
  }

  /**
   * Get info about a payment channel
   */
  async getChannel(channelId: bigint): Promise<ChannelInfo> {
    return queries.getChannel(this.invokeContract.bind(this), this.contracts.paymentChannel, channelId);
  }

  /**
   * Get info about a job
   */
  async getJob(jobId: bigint): Promise<JobInfo> {
    return queries.getJob(this.invokeContract.bind(this), this.contracts.escrow, jobId);
  }

  /**
   * Get current rate-limit usage alongside the configured limits.
   *
   * `RateLimiter.get_limits` is keyed by an arbitrary agent address, not
   * necessarily this agent's own — an owner monitoring several agents can
   * query any of them read-only through one signed-in `StellarAgent`.
   * Defaults to {@link StellarAgent.address} (checking this agent's own
   * limits) when omitted.
   */
  async getRateLimitStatus(agentAddress: string = this.address): Promise<RateLimitStatus> {
    return queries.getRateLimitStatus(this.invokeContract.bind(this), this.contracts.rateLimiter, agentAddress);
  }

  /**
   * Derive the current ledger sequence and an *estimated* average ledger
   * close time from a handful of recently observed ledgers via Horizon.
   *
   * Ledgers close roughly every 5 seconds, but that figure drifts with
   * network conditions rather than being contractually fixed — so this
   * measures it from real recent closes instead of assuming a constant. Used
   * to convert a `RateLimiter`/`PaymentChannel` ledger-count window (e.g.
   * "720 ledgers until the hourly window resets") into a human wall-clock
   * estimate. See `ledgerTime.ts` for the derivation and its caveats.
   */
  async getLedgerCloseEstimate(): Promise<LedgerCloseEstimate> {
    return queries.getLedgerCloseEstimate(this.networkConfig.horizonUrl);
  }

  /**
   * Pre-flight prediction of whether a proposed payment would be blocked by
   * either a payment channel's spend limit or a configured rate limiter,
   * computed from on-chain channel, rate-limit, and ledger state.
   *
   * Gathers channel state (via {@link StellarAgent.getChannel}), rate-limit
   * status (via {@link StellarAgent.getRateLimitStatus}), and current ledger
   * sequence without making state mutations or paying transaction fees.
   *
   * @param params Prediction parameters including the proposed payment amount.
   * @returns Prediction outcome indicating whether the payment would block and why.
   */
  async predictPayment(params: PredictPaymentParams): Promise<PaymentPrediction> {
    const channelId = params.channelId === null ? undefined : (params.channelId ?? this.activeChannelId);
    const [channel, rateLimit, currentLedger] = await Promise.all([
      channelId !== undefined ? this.getChannel(channelId) : Promise.resolve(null),
      this.getRateLimitStatus(params.agentAddress ?? this.address),
      this.getLatestLedger(),
    ]);

    const channelState = channel ? toChannelSpendState(channel) : null;
    const rateLimitState = toRateLimitSpendState(rateLimit);

    return predictPaymentOutcome({
      channelState,
      rateLimitState,
      amount: params.amount,
      currentLedger,
    });
  }

  // ── Solvency proofs (ZK) ─────────────────────────────────────────────────

  /**
   * Install (or rotate) the Groth16 verifying key that
   * {@link StellarAgent.verifySolvencyProof} checks proofs against.
   *
   * Admin-only: the **first** caller to set a key becomes the admin for every
   * future rotation, mirroring `setCircuitBreaker`. Rotating the key is
   * therefore a one-way door unless the channel is redeployed — set it from
   * the same key you would want to trust in six months.
   *
   * @example
   * ```typescript
   * // From the prover's output — see zk/solvency_proof.
   * await agent.setSolvencyVk({
   *   alphaG1: vk.alphaG1,     // 96 bytes
   *   betaG2: vk.betaG2,       // 192 bytes
   *   gammaG2: vk.gammaG2,     // 192 bytes
   *   deltaG2: vk.deltaG2,     // 192 bytes
   *   gammaAbcG1: vk.gammaAbcG1, // exactly 3 × 96 bytes
   * });
   * ```
   *
   * @throws {StellarAgentError} `INVALID_ARGUMENT` when a point is not a
   *   96/192-byte Soroban-encoded BLS12-381 point, or when `gammaAbcG1` does
   *   not hold exactly three entries.
   */
  async setSolvencyVk(vk: SolvencyVerifyingKey): Promise<TxResult> {
    return solvency.setSolvencyVk(
      this.invokeContract.bind(this),
      this.contracts.paymentChannel,
      this.address,
      vk,
    );
  }

  /**
   * Verify a Groth16 solvency proof for `channelId` (read-only).
   *
   * A valid proof says that *some* ordering of undisclosed payments into
   * spend-limit periods never exceeded the channel's `limitPerPeriod`, and
   * that those payments sum to exactly its `totalSpent` — a statement about
   * the *existence* of a consistent history, not about which payments those
   * were. See `docs/zk-solvency-design.md`.
   *
   * Returns `false` for a proof that does not verify; that is the expected
   * answer, not an error. It throws only when no verifying key has been set
   * on the contract yet — `setSolvencyVk` — which is a deployment gap rather
   * than a property of the proof.
   *
   * @example
   * ```typescript
   * const ok = await agent.verifySolvencyProof(channelId, {
   *   a: proof.a, b: proof.b, c: proof.c,
   * });
   * ```
   */
  async verifySolvencyProof(
    channelId: bigint,
    proof: SolvencyProof,
  ): Promise<boolean> {
    return solvency.verifySolvencyProof(
      this.invokeContract.bind(this),
      this.contracts.paymentChannel,
      channelId,
      proof,
    );
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Build and simulate every contract call. Mutations additionally sign the
   * simulated auth entries, assemble the footprint/resources, sign and submit
   * the envelope, and wait for a terminal transaction status.
   */
  private async invokeContract(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    readOnly = false,
  ): Promise<{ value: unknown; tx: TxResult }> {
    const invoke = () => runInvocation(
        {
          signer: this.signer,
          rpc: this.rpc,
          networkConfig: this.networkConfig,
          address: this.address,
          telemetry: this.telemetry,
          channelPool: this.channelPool,
          feeStrategy: this.feeStrategy,
          feeBump: this.feeBump,
        },
        contractId,
        method,
        args,
        readOnly,
      );
    // Reads never consume a sequence and should not wait behind writes.
    return readOnly ? invoke() : this.submissionQueue.submit(invoke);
  }

  private async getLatestLedger(): Promise<number> {
    return getLatestLedger(this.rpc);
  }
}

function isPaymentQuote(value: PaymentQuote | RouteQuote): value is PaymentQuote {
  return 'route' in value && 'minimumDestinationAmount' in value && 'validUntilLedger' in value;
}

function coalesceAssetAlias(
  preferred: string | undefined,
  legacy: string | undefined,
  preferredName: string,
  legacyName: string,
): string | undefined {
  if (preferred && legacy && preferred !== legacy) {
    throw new StellarAgentError(
      'INVALID_ARGUMENT',
      `${preferredName} and ${legacyName} must refer to the same asset`,
    );
  }
  return preferred ?? legacy;
}
