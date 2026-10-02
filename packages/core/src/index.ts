// This file is the package's public surface and nothing else — every
// concrete implementation lives in a dedicated module and is re-exported
// here. See docs/architecture/core-modules.md for the module map and the
// reasoning behind it.
import {
  runCall,
  abortable,
  sleep,
  throwIfAborted,
  DEFAULT_TIMEOUT_MS,
  type CallOptions,
} from './abort';

// ─── Deterministic math (re-exported for consumers) ──────────────────────────
export * as math from './math/index.js';
export {
  // fixed-point primitives
  bn,
  add,
  sub,
  mul,
  div,
  pct,
  clamp,
  sumStrings,
  toStroops,
  fromStroops,
  fmt,
  toStr,
  gt, gte, lt, lte, eq,
  isZero,
  isPositive,
  STROOP_SCALE,
  BPS_SCALE,
  BigNumber,
  // bidding algorithm
  scoreBid,
  rankBids,
  selectBestBid,
  isWithinSpendLimit,
  remainingBudget,
  DEFAULT_BID_WEIGHTS,
  // bid attestation
  attestRankBids,
  verifyBidAttestation,
  // payment-outcome prediction
  predictPaymentOutcome,
  isWindowExpired,
  ledgersRemainingInWindow,
  LEDGERS_PER_CHANNEL_PERIOD,
  RATE_LIMIT_LEDGERS_PER_HOUR,
  RATE_LIMIT_LEDGERS_PER_DAY,
  // deterministic routing
  ROUTING_WEIGHT_SCALE,
  DEFAULT_ROUTING_POLICY,
  scoreRoute,
  isRouteEligible,
  rankRoutes,
  selectRoute,
  validateRoutingPolicy,
} from './math/index.js';
export type {
  AgentBid,
  BidWeights,
  ScoredBid,
} from './math/bid.js';
export type {
  BidAttestation,
  AttestRankBidsOptions,
  AttestedRanking,
  ScorerKeyRecord,
  ScorerKeyDirectory,
  VerifyBidAttestationOptions,
  BidAttestationVerification,
} from './math/attestation.js';
export type {
  ChannelSpendState,
  RateLimitSpendState,
  PredictPaymentOutcomeParams,
  PaymentPrediction,
  BlockReason,
} from './math/predict.js';
export type {
  RoutingPolicy,
  RouteScoreBreakdown,
  ScoredRoute,
} from './math/routing.js';

// ─── Multi-asset route discovery ────────────────────────────────────────────

export {
  discoverRoutes,
  normalizeRoute,
  canonicalRouteId,
  applyOracleReference,
  RouteUnavailableError,
  DirectRouteProvider,
  AmmRouteProvider,
  StellarPathPaymentProvider,
  CallbackRouteProvider,
  RoutePlanner,
} from './routing/index.js';
export type {
  RouteVenue,
  RouteUnavailableCode,
  RouteHop,
  RouteQuote,
  RouteRequest,
  RouteProviderContext,
  RouteProvider,
  RoutePriceOracle,
  OracleReference,
  RouteDiscoveryOptions,
  RouteDiscoveryFailure,
  RouteDiscoveryResult,
  AmmPair,
  AmmHopQuote,
  AmmQuoteCallback,
  PathPaymentCandidate,
  PathPaymentQuoteCallback,
  RoutePlannerOptions,
  PaymentQuoteRequest,
  PaymentQuote,
} from './routing/index.js';

// ─── Ledger-window wall-clock estimation ─────────────────────────────
//
// `RateLimiter`/`PaymentChannel` track their rolling windows in ledger
// sequence numbers, not timestamps. See ./ledgerTime.ts for why "5s per
// ledger" is treated as a fallback rather than a hard-coded constant.

export {
  estimateLedgerCloseSeconds,
  estimateSecondsRemaining,
  fetchLedgerCloseEstimate,
  FALLBACK_LEDGER_CLOSE_SECONDS,
} from './ledgerTime.js';
export type { LedgerCloseSample, LedgerCloseEstimate } from './ledgerTime.js';

// Public type surface — previously only imported internally, never
// re-exported, so consumers (e.g. @stellaragent/react) had no way to
// import these from the package root at all.
export type {
  Network,
  NetworkConfig,
  SpendPeriod,
  SpendLimit,
  StellarAgentConfig,
  AgentInfo,
  OpenChannelParams,
  PayForAPIParams,
  PredictPaymentParams,
  ChannelInfo,
  SpendReport,
  JobStatus,
  RequestWorkParams,
  JobInfo,
  RateLimitConfig,
  RateLimitStatus,
  ContractAddresses,
  AgentEvent,
  TxResult,
  FeeBumpConfig,
  SubmissionPipelineConfig,
  QuoteParams,
} from './types/index.js';

export { StellarAgentError } from './errors.js';
export type { StellarAgentErrorCode } from './errors.js';

// ─── Circuit Breaker (emergency pause) ────────────────────────────────────────
export {
  CircuitBreaker,
  asPublicAddress,
} from './circuitBreaker.js';
export type { CircuitBreakerOptions, PublicAddress } from './circuitBreaker.js';

// ─── Contract address resolution ─────────────────────────────────────────────
//
// Addresses used to be hard-coded here as obviously-fake placeholders. They
// now resolve from explicit config or environment variables, and an
// unconfigured network fails fast at create() time. See ./contracts.ts.

export {
  resolveContracts,
  assertDeployed,
  isDeployedAddress,
  envVarNames,
  ContractsNotDeployedError,
  UNCONFIGURED_CONTRACTS,
  CONTRACT_KEYS,
} from './contracts.js';
export type { ContractKey } from './contracts.js';

// ─── Signing ─────────────────────────────────────────────────────────────────
//
// The agent signs through a Signer rather than an in-memory Keypair, so key
// material need never live in this process. See ./signer.ts.

export {
  KeypairSigner,
  RemoteSigner,
  SignerAdapter,
  SigningError,
  isSigner,
} from './signer.js';
export type {
  Signer,
  SignTransactionOptions,
  SignAuthEntryOptions,
  RemoteSignerOptions,
  Sep43Like,
} from './signer.js';

// ─── Fleet throughput ───────────────────────────────────────────────────────

export {
  ChannelAccountPool,
  ChannelPoolError,
} from './fleet/channelPool.js';
export type {
  ChannelAccount,
  ChannelAccountFactory,
  ChannelAccountLease,
  ChannelAccountPoolOptions,
  ChannelLeaseOutcome,
  ChannelPoolStats,
  LeaseOptions,
} from './fleet/channelPool.js';
export {
  FixedFeeStrategy,
  MultiplierFeeStrategy,
  CallbackFeeStrategy,
  RecentFeeStrategy,
  asFeeStrategy,
} from './fleet/feeStrategy.js';
export type {
  FeeStrategy,
  FeeCallback,
  FeeContext,
  FeePhase,
  FeePercentile,
  FeeStats,
  FeeDistribution,
  RecentFeeStrategyOptions,
} from './fleet/feeStrategy.js';
export {
  SubmissionQueue,
  SubmissionQueueError,
  classifySubmissionError,
} from './fleet/submissionQueue.js';
export type {
  SubmissionQueueOptions,
  SubmissionQueueStats,
  SubmitOptions,
  RetryClassification,
  RetryClassifier,
} from './fleet/submissionQueue.js';
export {
  SponsorService,
  SponsorshipError,
  SponsoredChannelAccountFactory,
} from './fleet/sponsorship.js';
export type {
  SponsorServiceOptions,
  SponsorRpc,
  SponsoredAccountOptions,
  SponsorshipRecord,
} from './fleet/sponsorship.js';

// ─── Telemetry (tracing, metrics, logging) ───────────────────────────────────
//
// Opt-in via `StellarAgentConfig.telemetry`; a no-op with zero overhead when
// omitted. See ./telemetry/index.ts.

export {
  initTelemetry,
  getTelemetry,
  createTelemetry,
  RedactingLogger,
  InMemoryTracer,
  InMemoryMetrics,
  redactForExport,
  noopLogger,
  noopTracer,
  noopMetrics,
  SemConv,
  SpanNames,
  MetricNames,
  SEMCONV_VERSION,
  createOtelBridge,
} from './telemetry/index.js';
export type { OtelBridgeOptions } from './telemetry/index.js';
export {
  createPaymentId,
  registerPaymentTrace,
  attachTransactionHash,
  lookupPaymentIdByTxHash,
  getPaymentTrace,
  clearPaymentTraceRegistry,
  activePaymentTraceCount,
} from './telemetry/context.js';
export type { PaymentTraceRecord } from './telemetry/context.js';
export type {
  TelemetryConfig,
  TelemetryContext,
  Logger,
  Tracer,
  Metrics,
  RecordedSpan,
} from './telemetry/index.js';

// ─── Solvency proofs (Groth16 over BLS12-381) ─────────────────────────────────
//
// `PaymentChannel.set_solvency_vk` / `verify_solvency_proof` are on-chain
// only until the SDK encodes the points for them. The encoding is not the
// library default — arkworks and Soroban disagree about endianness and
// Montgomery form — so it is hand-rolled here and cross-checked against
// `soroban_sdk`'s own known-answer vector. See ./agent/solvency.ts.

export {
  setSolvencyVk,
  verifySolvencyProof,
  solvencyVerifyingKeyVal,
  solvencyProofVal,
  toSolvencyG1,
  toSolvencyG2,
  g1Generator,
  g1Infinity,
  FP_SIZE,
  FP2_SIZE,
  FR_SIZE,
  G1_POINT_SIZE,
  G2_POINT_SIZE,
  SOLVENCY_PUBLIC_INPUTS,
  GAMMA_ABC_G1_SIZE,
  SOROBAN_G1_GENERATOR,
} from './agent/solvency.js';
export type {
  SolvencyProof,
  SolvencyVerifyingKey,
  SolvencyG1Point,
  SolvencyG2Point,
} from './agent/solvency.js';

// ─── Contract struct types (generated from contracts/specs/*.json) ───────────
//
// `SolvencyVerifyingKey` and `SolvencyProof` are in there too — the types
// above are the ergonomic (camelCase, validated) view of the same shape the
// generated decoders produce.

export {
  decodeSolvencyVerifyingKey,
  decodeSolvencyProof,
} from './generated/contract-types.js';
export type {
  RawSolvencyVerifyingKey,
  RawSolvencyProof,
} from './generated/contract-types.js';

// ─── StellarAgent ─────────────────────────────────────────────────────────────
//
// The class itself lives under ./agent/, split into invocation, encoding,
// decoding, queries, mutations, and configuration modules — see
// ./agent/StellarAgent.ts and docs/architecture/core-modules.md.

export { StellarAgent } from './agent/StellarAgent.js';
