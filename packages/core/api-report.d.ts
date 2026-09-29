// GENERATED FILE — do not edit by hand.
// Public API surface of @stellaragent/core, derived from its built .d.ts with
// `private` members stripped. Regenerate with `pnpm docs:api`.
// A diff here in review is a public-surface change — call it out.

import BigNumber from 'bignumber.js';
export { default as BigNumber } from 'bignumber.js';
import { Keypair, Account, Transaction, FeeBumpTransaction, SorobanRpc, xdr } from '@stellar/stellar-sdk';

/**
 * Deterministic fixed-point arithmetic for Stellar agent payment calculations.
 *
 * ## Why this module exists
 *
 * JavaScript's native `number` type uses IEEE 754 double-precision floating
 * point.  The x87/SSE2 FPU on x86 processors and the VFP/NEON unit on ARM
 * (M1/M2) can produce **different intermediate rounding results** for the same
 * mathematical expression, causing hash mismatches when agent bid scores are
 * used in on-chain operations.
 *
 * This module solves that by delegating every calculation to `bignumber.js`,
 * which implements arbitrary-precision decimal arithmetic in **pure
 * JavaScript** (no native bindings) and is therefore completely deterministic
 * across all CPU architectures and operating systems.
 *
 * ## Design rules
 * - **Never** use native `+`, `-`, `*`, `/` or `Math.*` on monetary/score
 *   values.  Always use the helpers exported here.
 * - Monetary amounts are always represented as **strings** at the API
 *   boundary so JS floats never touch them.
 * - On-chain values use `i128` stroops (integer).  Use `toStroops` /
 *   `fromStroops` to convert.
 * - `STROOP_SCALE` = 10 000 000 (1 XLM = 10^7 stroops), matching Stellar.
 *
 * @module fixed-point
 */

/** Stellar stroop denominator: 1 XLM = 10^7 stroops */
declare const STROOP_SCALE: BigNumber;
/** Basis-point denominator (100.00% = 10 000 bps) */
declare const BPS_SCALE: BigNumber;
/**
 * Wrap any string/number into a BigNumber, throwing immediately if the value
 * is not a valid finite decimal.  Using this at every entry point prevents
 * `NaN` / `Infinity` from silently propagating through calculations.
 */
declare function bn(value: string | number | bigint | BigNumber): BigNumber;
/** Deterministic addition:  a + b */
declare function add(a: string | BigNumber, b: string | BigNumber): BigNumber;
/** Deterministic subtraction:  a − b */
declare function sub(a: string | BigNumber, b: string | BigNumber): BigNumber;
/** Deterministic multiplication:  a × b */
declare function mul(a: string | BigNumber, b: string | BigNumber): BigNumber;
/**
 * Deterministic division:  a ÷ b
 * Uses ROUND_DOWN (truncation) so the result can never exceed the true value,
 * which is the safe direction for spend-limit comparisons.
 */
declare function div(a: string | BigNumber, b: string | BigNumber): BigNumber;
/**
 * Percentage of `value` out of `total` (0 – 100), rounded down to
 * `decimalPlaces` (default 4).  Safe for progress-bar rendering.
 *
 * @example
 * pct('1.45', '5.00')  // → BigNumber('29.0000')
 */
declare function pct(value: string | BigNumber, total: string | BigNumber, decimalPlaces?: number): BigNumber;
/** Clamp a value to [min, max] */
declare function clamp(value: string | BigNumber, min: string | BigNumber, max: string | BigNumber): BigNumber;
/** Sum an array of string decimal values deterministically */
declare function sumStrings(values: string[]): BigNumber;
/**
 * Convert a human-readable decimal amount (e.g. "1.50") to Stellar stroops
 * as a `bigint` (i128-compatible).  Truncates sub-stroop fractions.
 *
 * @example
 * toStroops('1.5000001')  // → 15000001n
 */
declare function toStroops(amount: string): bigint;
/**
 * Convert on-chain stroops (i128 represented as `bigint`) to a
 * human-readable decimal string with `decimalPlaces` precision.
 *
 * @example
 * fromStroops(15000001n, 7)  // → '1.5000001'
 */
declare function fromStroops(stroops: bigint, decimalPlaces?: number): string;
/**
 * Format a decimal amount for display, rounding down to `places` decimal
 * places.  Never uses `Number.toFixed` to avoid float coercion.
 *
 * @example
 * fmt('8.2300001', 2)  // → '8.23'
 */
declare function fmt(value: string | BigNumber, places?: number): string;
/**
 * Stringify a BigNumber result back to a plain decimal string for storage or
 * wire transmission.  Uses enough precision to avoid any scientific notation.
 */
declare function toStr(value: BigNumber, places?: number): string;
declare function gt(a: string | BigNumber, b: string | BigNumber): boolean;
declare function gte(a: string | BigNumber, b: string | BigNumber): boolean;
declare function lt(a: string | BigNumber, b: string | BigNumber): boolean;
declare function lte(a: string | BigNumber, b: string | BigNumber): boolean;
declare function eq(a: string | BigNumber, b: string | BigNumber): boolean;
declare function isZero(a: string | BigNumber): boolean;
declare function isPositive(a: string | BigNumber): boolean;

/**
 * Deterministic agent bidding algorithm.
 *
 * ## Background
 *
 * When multiple agents compete for an escrow job the requester (or the
 * on-chain arbiter) needs a reproducible **bid score** so the same input
 * always produces the same winner, regardless of which CPU architecture
 * computed it.
 *
 * Historically this was done with native JS floats, which diverge between
 * x86 (SSE2) and ARM (M1/M2 NEON) due to intermediate-precision differences
 * in the FPU pipelines.  This file replaces every float operation with calls
 * to the `fixed-point` module, which uses `bignumber.js` pure-JS arithmetic.
 *
 * ## Scoring formula
 *
 * Each bid is scored 0–100 using a weighted combination of:
 *
 *   score = (priceWeight   × priceScore)
 *         + (repWeight     × repScore)
 *         + (latencyWeight × latencyScore)
 *         + (reliabWeight  × reliabScore)
 *
 * Where individual sub-scores are normalised to [0, 100]:
 *   - priceScore   = 100 × (1 − bid / maxBid)   — lower price is better
 *   - repScore     = reputation (0–100 input)
 *   - latencyScore = 100 × (1 − latency / maxLatency) — lower latency better
 *   - reliabScore  = successRate × 100           — 0.0–1.0 input
 *
 * All weights must sum to 1.0 (expressed as decimal strings).
 *
 * @module bid
 */
/** A single agent's bid for an escrow job */
interface AgentBid {
    /** Unique agent address */
    agentAddress: string;
    /**
     * Price the agent is willing to accept for the job.
     * Must be a decimal string (e.g. "0.05") — never a JS number.
     */
    price: string;
    /**
     * Agent's reputation score 0–100 (integer or decimal string).
     * Sourced from on-chain historical data.
     */
    reputation: string;
    /**
     * Expected task completion time in seconds (decimal string).
     * Lower is better.
     */
    estimatedLatencySeconds: string;
    /**
     * Lifetime success rate as a decimal fraction 0–1 (e.g. "0.97").
     * Computed as successfulJobs / totalJobs.
     */
    successRate: string;
}
/** Weights controlling the relative importance of each dimension */
interface BidWeights {
    /** Weight for price competitiveness (0–1, decimal string) */
    price: string;
    /** Weight for reputation (0–1, decimal string) */
    reputation: string;
    /** Weight for latency (0–1, decimal string) */
    latency: string;
    /** Weight for reliability / success rate (0–1, decimal string) */
    reliability: string;
}
/** Default weights — equal split across all four dimensions */
declare const DEFAULT_BID_WEIGHTS: BidWeights;
/** A scored bid ready for ranking */
interface ScoredBid {
    agentAddress: string;
    /** Final composite score 0–100, rounded down to 4 decimal places */
    score: string;
    /** Individual sub-scores for transparency */
    breakdown: {
        priceScore: string;
        reputationScore: string;
        latencyScore: string;
        reliabilityScore: string;
    };
}
/**
 * Compute a deterministic composite score for a single bid.
 *
 * All intermediate values are `BigNumber` — no native JS floats are used.
 * The result is identical on x86, ARM, WASM, and any other platform where
 * `bignumber.js` runs.
 *
 * @param bid       - The agent's bid to score
 * @param maxBid    - The highest price among all competing bids (normaliser)
 * @param maxLatency - The highest latency among all competing bids (normaliser)
 * @param weights   - Dimension weights (must sum to 1)
 */
declare function scoreBid(bid: AgentBid, maxBid: string, maxLatency: string, weights?: BidWeights): ScoredBid;
/**
 * Rank a set of competing agent bids deterministically.
 *
 * Steps:
 * 1. Compute `maxBid` and `maxLatency` over the full bid set (normalisation).
 * 2. Score every bid using `scoreBid`.
 * 3. Sort descending by score (ties broken by `agentAddress` lexicographically
 *    so the ordering is always reproducible).
 *
 * @returns Bids sorted best-first with their scores attached.
 */
declare function rankBids(bids: AgentBid[], weights?: BidWeights): ScoredBid[];
/**
 * Select the single best bid from a pool.
 * Returns `null` when the pool is empty.
 */
declare function selectBestBid(bids: AgentBid[], weights?: BidWeights): ScoredBid | null;
/**
 * Determine whether a proposed payment is within an agent's spend limit.
 *
 * Replicates the on-chain `PaymentChannel.pay` guard in TypeScript so the SDK
 * can pre-validate without a network round-trip.  Uses the same integer-safe
 * arithmetic as the contract (amounts in stroops).
 *
 * @param spentThisPeriod  - Already spent in current period (stroop string)
 * @param limitPerPeriod   - Configured period limit (stroop string)
 * @param proposedAmount   - Amount about to be spent (stroop string)
 */
declare function isWithinSpendLimit(spentThisPeriod: string, limitPerPeriod: string, proposedAmount: string): boolean;
/**
 * Compute remaining budget in a period.
 *
 * @returns Remaining as a stroop decimal string (never negative).
 */
declare function remainingBudget(spentThisPeriod: string, limitPerPeriod: string): string;

/**
 * Off-chain-verifiable attestations for bid scoring.
 *
 * ## Background
 *
 * {@link rankBids} and {@link selectBestBid} (see `./bid.ts`) are pure,
 * deterministic functions, but they are trusted, off-chain ones: whoever runs
 * the scoring service can simply not run it, or run it and then tell the
 * counterparty about a different "winner" than the one it actually computed.
 * A worker that is only handed a bid set and a claimed result has no way to
 * check that after the fact.
 *
 * This module lets the scoring service produce a **signed attestation**
 * alongside its result, and gives any third party — a worker, an auditor, an
 * arbiter — a standalone verifier that needs nothing from the scorer except
 * that attestation, the original bid set, and a directory of which public
 * keys the scorer is allowed to sign with. The verifier both re-derives the
 * ranking itself (catching a scorer that reports a different bid than the one
 * it actually computed) and checks the signature (catching tampering with the
 * bids or the reported result in transit).
 *
 * This is the lighter-weight, off-chain alternative to full on-chain
 * commit-reveal settlement — useful before that lands, or for callers that
 * don't want the on-chain settlement overhead at all.
 *
 * ## Key rotation
 *
 * An attestation names the `keyEpoch` it was signed under rather than only a
 * bare public key. Verification takes a {@link ScorerKeyDirectory} mapping
 * epochs to public keys (plus an optional validity window per epoch), not a
 * single hard-coded key. That makes rotation a directory update instead of a
 * breaking change:
 *
 * - Retiring a key means giving its epoch a `validUntil`, or dropping it from
 *   the directory outright once no attestation signed under it needs to
 *   verify any more. Attestations already issued before that cutoff keep
 *   verifying; new ones claiming that epoch after the cutoff do not — so a
 *   compromised key can be cut off going forward without invalidating
 *   history.
 * - `issuedAt` / `expiresAt` bound every attestation's own lifetime
 *   independently of key rotation, so a leaked (bids, result, attestation)
 *   tuple can't be replayed indefinitely as "proof" of a stale ranking.
 *
 * @module attestation
 */

declare const ATTESTATION_VERSION: 1;
/**
 * A signed claim that `rankBids(bids, weights)` produced `result` at
 * `issuedAt`, under the key identified by `keyEpoch` / `scorerPublicKey`.
 */
interface BidAttestation {
    /** Attestation schema version. */
    version: typeof ATTESTATION_VERSION;
    /** Identifies which scorer keypair signed this — see key-rotation notes above. */
    keyEpoch: number;
    /** The scorer's Stellar public address (`G...`) for this epoch. */
    scorerPublicKey: string;
    /** The weights the scorer ran `rankBids` with. */
    weights: BidWeights;
    /** Unix seconds when this attestation was produced. */
    issuedAt: number;
    /** Unix seconds after which this attestation must no longer be trusted. */
    expiresAt: number;
    /** Hex sha256 over the canonicalized (bids, weights, result) triple. */
    digest: string;
    /** Base64 ed25519 signature, produced by the scorer keypair, over the rest of this object. */
    signature: string;
}
interface AttestRankBidsOptions {
    /** Which epoch `scorerKeypair` belongs to. Bump this when rotating keys. */
    keyEpoch: number;
    /** How long the attestation remains valid for, in seconds. @default 300 */
    ttlSeconds?: number;
    /** Injectable clock, for tests. @default Date.now */
    now?: () => number;
}
interface AttestedRanking {
    /** Identical to `rankBids(bids, weights)` — nothing about scoring changes. */
    result: ScoredBid[];
    attestation: BidAttestation;
}
/** One scorer key a verifier is willing to trust, and for how long. */
interface ScorerKeyRecord {
    /** Matches {@link BidAttestation.keyEpoch}. */
    epoch: number;
    /** The Stellar public address this epoch is allowed to sign with. */
    publicKey: string;
    /** Unix seconds before which this epoch's key was not yet in use, if bounded. */
    validFrom?: number;
    /** Unix seconds after which this epoch's key was retired, if bounded. */
    validUntil?: number;
}
/** The set of scorer keys (current and, optionally, recently-retired) a verifier trusts. */
type ScorerKeyDirectory = readonly ScorerKeyRecord[];
interface VerifyBidAttestationOptions {
    /** Injectable clock, for tests. @default Date.now */
    now?: () => number;
}
type BidAttestationVerification = {
    valid: true;
    recomputed: ScoredBid[];
} | {
    valid: false;
    reason: string;
};
/**
 * Run `rankBids` and sign an attestation over the (bids, weights, result)
 * triple with `scorerKeypair`.
 *
 * `scorerKeypair` must hold a secret key — this is meant to run inside the
 * scoring service, not on a verifier. See {@link verifyBidAttestation} for
 * the side that only needs the public key.
 *
 * @throws {RangeError} if `scorerKeypair` has no secret, `keyEpoch` isn't a
 *   non-negative integer, or `ttlSeconds` isn't positive. Propagates
 *   `rankBids`'s own `RangeError` for invalid weights or bid fields.
 */
declare function attestRankBids(bids: AgentBid[], weights: BidWeights | undefined, scorerKeypair: Keypair, options: AttestRankBidsOptions): AttestedRanking;
/**
 * Independently confirm that a scoring service didn't cheat.
 *
 * Given only `bids`, the `result` it claims to have produced, its
 * `attestation`, and a directory of which scorer keys are trusted, this:
 *
 * 1. Looks up `attestation.keyEpoch` in `trustedKeys` and rejects an unknown
 *    epoch, a public-key mismatch for a known epoch, or an epoch used outside
 *    its trusted validity window.
 * 2. Rejects an expired attestation.
 * 3. Verifies the ed25519 signature over the attestation header — this
 *    authenticates every field on the attestation, including `digest` and
 *    `weights`.
 * 4. Recomputes the digest from `bids`/`result` and checks it matches
 *    `attestation.digest` — this catches tampering with either in transit.
 * 5. Recomputes `rankBids(bids, attestation.weights)` from scratch using the
 *    exported `bid.ts` functions and checks it structurally matches `result`
 *    — this is what catches a scorer that computed one ranking but reported
 *    a different "winner".
 *
 * All five must pass for `valid: true`.
 */
declare function verifyBidAttestation(bids: AgentBid[], result: ScoredBid[], attestation: BidAttestation, trustedKeys: ScorerKeyDirectory, options?: VerifyBidAttestationOptions): BidAttestationVerification;

/** Canonical, venue-neutral routing types. Amounts are integer base units. */
type RouteVenue = 'direct' | 'amm' | 'path_payment';
type RouteUnavailableCode = 'UNSUPPORTED_PAIR' | 'INSUFFICIENT_LIQUIDITY' | 'VENUE_UNAVAILABLE' | 'QUOTE_EXPIRED' | 'INVALID_QUOTE';
/** One executable segment of a candidate route. */
interface RouteHop {
    venue: RouteVenue;
    /** Stable venue identifier. A contract-backed venue uses its C... address. */
    venueId: string;
    sourceAsset: string;
    destinationAsset: string;
    sourceAmount: string;
    expectedOutput: string;
    /** Fee charged by this segment, in its source asset's base units. */
    feeAmount: string;
    /** Source-normalized fee, in basis points. */
    feeBps: number;
    /** Expected price impact/slippage, in basis points. */
    slippageBps: number;
    /** 0..10,000; 10,000 represents the most reliable quote. */
    reliabilityBps: number;
    /** Intermediate assets embedded in a classic Stellar path-payment quote. */
    path?: string[];
    /** Per-hop execution floor. The final route still has one end-to-end floor. */
    minOutput?: string;
}
/** A normalized executable quote consumed by the deterministic selector. */
interface RouteQuote {
    /** Canonical identifier derived from assets, venues, and path. */
    id: string;
    sourceAsset: string;
    destinationAsset: string;
    sourceAmount: string;
    expectedDestinationAmount: string;
    totalFeeBps: number;
    expectedSlippageBps: number;
    reliabilityBps: number;
    /** Economic depth, including assets embedded in path-payment operations. */
    hopCount: number;
    hops: RouteHop[];
    /** Last ledger in which every component quote is valid. */
    expiresAtLedger?: number;
}
interface RouteRequest {
    sourceAsset: string;
    destinationAsset: string;
    /** Integer base units, not a decimal display amount. */
    sourceAmount: string;
    currentLedger?: number;
    /** Assets that bounded multi-hop discovery may traverse. */
    allowedIntermediates?: string[];
}
interface RouteProviderContext {
    maxHops: number;
    maxCandidates: number;
}
/** Venue adapter. Provider failures are isolated by the discovery engine. */
interface RouteProvider {
    readonly id: string;
    discover(request: RouteRequest, context: RouteProviderContext): Promise<RouteHop[][]>;
}
/** Optional independent fair-value source; never treated as executable liquidity. */
interface RoutePriceOracle {
    readonly id: string;
    quote(request: RouteRequest): Promise<OracleReference | null>;
}
interface OracleReference {
    expectedDestinationAmount: string;
    reliabilityBps: number;
    expiresAtLedger?: number;
}
interface RouteDiscoveryOptions {
    providers: RouteProvider[];
    oracle?: RoutePriceOracle;
    /** @default 3 */
    maxHops?: number;
    /** @default 32 */
    maxCandidates?: number;
}
interface RouteDiscoveryFailure {
    providerId: string;
    code: RouteUnavailableCode;
    message: string;
}
interface RouteDiscoveryResult {
    routes: RouteQuote[];
    failures: RouteDiscoveryFailure[];
    oracleReference?: OracleReference;
}
interface AmmPair {
    sourceAsset: string;
    destinationAsset: string;
}
interface AmmHopQuote {
    expectedOutput: string;
    feeAmount?: string;
    feeBps?: number;
    slippageBps?: number;
    reliabilityBps?: number;
    minOutput?: string;
}
type AmmQuoteCallback = (pair: AmmPair, sourceAmount: string) => Promise<AmmHopQuote | null>;
interface PathPaymentCandidate {
    /** Stable liquidity-source identifier, or an execution-adapter contract ID. */
    venueId: string;
    /** Assets between source and destination, excluding both endpoints. */
    path: string[];
    expectedDestinationAmount: string;
    feeAmount?: string;
    feeBps?: number;
    slippageBps?: number;
    reliabilityBps?: number;
    minDestinationAmount?: string;
}
type PathPaymentQuoteCallback = (request: RouteRequest) => Promise<PathPaymentCandidate[]>;

/**
 * Signing abstraction.
 *
 * ## Why this module exists
 *
 * `StellarAgent` was built entirely around `Keypair.fromSecret(config.secretKey)`
 * and exposed `get secretKey()` returning the raw secret string. For an agent
 * running with real funds that is a serious risk: the secret sits in a
 * long-lived Node.js process for its whole lifetime, reachable from a heap
 * dump, a `process.env` leak, an error report that serialises the object
 * graph, or any of the many transitive dependencies `@stellar/stellar-sdk`
 * pulls in.
 *
 * This module separates *what to sign* from *what holds the key*. The agent
 * gets a {@link Signer}; where the key actually lives is the Signer's
 * problem.
 *
 * ## The interface shape
 *
 * `signTransaction` / `signAuthEntry` over base64 XDR is deliberately the
 * same shape as SEP-43, the Stellar wallet-interface standard. That means an
 * existing browser wallet, a hardware device, or a signing service can be
 * adapted with a thin wrapper, and it keeps the boundary at "here are bytes,
 * give me back signed bytes" — the narrowest interface that never requires
 * key material to cross it.
 *
 * Soroban needs both halves: `signTransaction` covers the transaction
 * envelope, and `signAuthEntry` covers `SorobanAuthorizationEntry` values,
 * which are signed separately from the envelope that carries them.
 *
 * ## Why a remote-signing service rather than Ledger
 *
 * The issue asked for one remote backend — a Ledger integration or a
 * remote-signing RPC protocol — and said to document the choice. This module
 * implements {@link RemoteSigner}, an HTTP signing service.
 *
 * A Ledger requires a physical button press for every signature. That is a
 * good property for a human treasury and a fatal one here: the entire premise
 * of this SDK is an *autonomous* agent paying $0.001 per API call without a
 * human in the loop. A hardware wallet cannot serve an unattended process
 * making a payment per inference request — the first payment would block
 * forever waiting for a press. Hardware signing is the right answer for the
 * *admin* keys that deploy and configure contracts; it is the wrong answer
 * for the agent's hot operational key, which is what `StellarAgent` holds.
 *
 * A remote signing service does fit: the key lives in an HSM/KMS behind a
 * network boundary, the agent process holds only a URL and an auth token, and
 * the service is where policy belongs — rate limits, spend ceilings, an audit
 * log, revocation. Compromising the agent process then yields the ability to
 * *request* signatures subject to that policy, not the key itself. Rotation
 * means rotating a token, not redeploying every agent.
 *
 * {@link SignerAdapter} exists for anyone who does want Ledger or a browser
 * wallet: both already speak the SEP-43 method shape.
 *
 * @module signer
 */

interface SignTransactionOptions {
    /** Network passphrase the signature must be bound to. */
    networkPassphrase: string;
}
interface SignAuthEntryOptions {
    /** Network passphrase the signature must be bound to. */
    networkPassphrase: string;
    /** Ledger sequence after which the authorization is no longer valid. */
    validUntilLedgerSeq: number;
}
/**
 * Somewhere that can sign on behalf of one Stellar account.
 *
 * Implementations must never require the caller to hold key material. The
 * only thing a `StellarAgent` ever learns from a Signer is a public address
 * and some signed bytes.
 */
interface Signer {
    /**
     * The Stellar public address (`G...`) this signer signs for.
     *
     * Must be obtainable **without** the secret being present in the calling
     * process — a remote signer derives it on the far side of the boundary and
     * returns just the address.
     */
    getPublicKey(): Promise<string>;
    /**
     * Sign a transaction envelope.
     *
     * @param xdr - base64 transaction envelope XDR
     * @returns base64 **signed** transaction envelope XDR
     */
    signTransaction(xdr: string, options: SignTransactionOptions): Promise<string>;
    /**
     * Sign a Soroban authorization entry.
     *
     * Soroban auth entries are signed separately from the envelope that carries
     * them, so a signer that only implements `signTransaction` cannot authorize
     * a contract invocation.
     *
     * @param authEntryXdr - base64 `SorobanAuthorizationEntry` XDR
     * @returns base64 **signed** `SorobanAuthorizationEntry` XDR
     */
    signAuthEntry(authEntryXdr: string, options: SignAuthEntryOptions): Promise<string>;
}
/** Thrown when a signer cannot produce a signature. */
declare class SigningError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
}
/**
 * The original behaviour, kept for backward compatibility: an in-memory
 * `Keypair`.
 *
 * This is fine for testnet, for development, and for agents holding
 * negligible value. It is explicitly *not* what you want for an agent with
 * real funds — see {@link RemoteSigner}.
 *
 * The secret is held in a module-private closure rather than on the instance,
 * so it does not appear when the signer (or an agent holding it) is logged,
 * serialised by an error reporter, or walked by a heap inspector that only
 * follows enumerable properties.
 */
declare class KeypairSigner implements Signer {
    #private;
    constructor(keypair: Keypair);
    /** Build from a `S...` secret key string. */
    static fromSecret(secretKey: string): KeypairSigner;
    /** Generate a fresh random keypair. */
    static random(): KeypairSigner;
    getPublicKey(): Promise<string>;
    /** Synchronous accessor — available because the key is local. */
    publicKey(): string;
    /**
     * Reveal the raw secret.
     *
     * Deliberately a method with a blunt name rather than a `secretKey` getter:
     * exporting key material should be a visible, greppable act, not something
     * that happens by reading a property.
     */
    exportSecret(): string;
    signTransaction(xdr: string, options: SignTransactionOptions): Promise<string>;
    signAuthEntry(authEntryXdr: string, options: SignAuthEntryOptions): Promise<string>;
}
interface RemoteSignerOptions {
    /** Base URL of the signing service, e.g. `https://signer.internal:8443`. */
    url: string;
    /**
     * Bearer token presented on every request. This is the *only* credential
     * the agent process holds — losing it costs a token rotation, not a key
     * rotation and a migration of every funded account.
     */
    token?: string;
    /**
     * Public address this signer is expected to sign for. When set, it is
     * checked against what the service reports and a mismatch is rejected, so
     * a misconfigured or swapped-out service cannot quietly sign as a different
     * account.
     */
    expectedPublicKey?: string;
    /** Per-request timeout in milliseconds. @default 10000 */
    timeoutMs?: number;
    /** Extra headers (mTLS proxies, tracing, tenant routing). */
    headers?: Record<string, string>;
    /** Injectable `fetch`, for tests and for custom agents/proxies. */
    fetch?: typeof globalThis.fetch;
}
/**
 * A {@link Signer} backed by an HTTP signing service.
 *
 * ## Protocol
 *
 * Three endpoints, all JSON. The key never crosses the boundary.
 *
 * ### `GET {url}/v1/public-key`
 * ```json
 * → 200 { "publicKey": "G..." }
 * ```
 *
 * ### `POST {url}/v1/sign/transaction`
 * ```json
 * ← { "xdr": "<base64 envelope>", "networkPassphrase": "..." }
 * → 200 { "signedXdr": "<base64 signed envelope>" }
 * ```
 *
 * ### `POST {url}/v1/sign/auth-entry`
 * ```json
 * ← { "authEntryXdr": "<base64>", "networkPassphrase": "...",
 *     "validUntilLedgerSeq": 12345 }
 * → 200 { "signedAuthEntryXdr": "<base64>" }
 * ```
 *
 * Errors return a non-2xx status with `{ "error": "<message>" }`. A service
 * that refuses on policy grounds — spend ceiling, rate limit, revoked token —
 * should use `403` with a description; it surfaces here as a
 * {@link SigningError} carrying that text.
 *
 * ## Why signed XDR rather than a raw signature
 *
 * Returning `signedXdr` means the service parses what it is signing and can
 * therefore apply policy to it — reject payments over a ceiling, enforce a
 * destination allow-list, log the operation. A service that only returned a
 * signature over an opaque hash could not do any of that, which would waste
 * the main advantage of moving the key behind a boundary in the first place.
 */
declare class RemoteSigner implements Signer {
    #private;
    constructor(options: RemoteSignerOptions);
    getPublicKey(): Promise<string>;
    signTransaction(xdr: string, options: SignTransactionOptions): Promise<string>;
    signAuthEntry(authEntryXdr: string, options: SignAuthEntryOptions): Promise<string>;
}
/**
 * Wrap anything already exposing SEP-43's method shape — Freighter and other
 * browser wallets, `@ledgerhq`-backed signers, an in-house module — as a
 * {@link Signer}.
 *
 * This is the extension point for a Ledger integration: hardware signing is
 * the right choice for admin keys even though it is the wrong choice for an
 * agent's hot key (see the module doc).
 */
interface Sep43Like {
    getAddress(): Promise<{
        address: string;
    }> | Promise<string> | {
        address: string;
    } | string;
    signTransaction(xdr: string, opts?: {
        networkPassphrase?: string;
    }): Promise<{
        signedTxXdr: string;
    } | string>;
    signAuthEntry?(entryXdr: string, opts?: {
        networkPassphrase?: string;
    }): Promise<{
        signedAuthEntry: string;
    } | string>;
}
declare class SignerAdapter implements Signer {
    #private;
    constructor(wallet: Sep43Like);
    getPublicKey(): Promise<string>;
    signTransaction(xdr: string, options: SignTransactionOptions): Promise<string>;
    signAuthEntry(authEntryXdr: string, options: SignAuthEntryOptions): Promise<string>;
}
/** Duck-typed check — `instanceof` fails across duplicated package copies. */
declare function isSigner(value: unknown): value is Signer;

/**
 * Deterministic multi-asset route selection.
 *
 * The selector consumes only normalized integer quotes. It performs no I/O,
 * reads no clock, uses no floating point, and defines a total tie-break order.
 */

declare const ROUTING_WEIGHT_SCALE = 10000;
interface RoutingPolicy {
    /** Relative weight of source-normalized fees. */
    costWeight: number;
    /** Relative weight of expected price impact. */
    slippageWeight: number;
    /** Relative weight of the reliability shortfall. */
    reliabilityWeight: number;
    /** Fixed score added for every economic hop after the first. */
    hopPenalty: number;
    /** Routes above this expected slippage are inadmissible. */
    maxSlippageBps: number;
    /** Routes below this reliability are inadmissible. */
    minReliabilityBps: number;
}
declare const DEFAULT_ROUTING_POLICY: Readonly<RoutingPolicy>;
interface RouteScoreBreakdown {
    weightedCost: string;
    weightedSlippage: string;
    weightedReliability: string;
    hopPenalty: string;
}
interface ScoredRoute extends RouteQuote {
    /** Lower is better. Integer score for byte-identical TS/Python output. */
    score: string;
    breakdown: RouteScoreBreakdown;
}
/** Validate and score one normalized route, including policy admission bounds. */
declare function scoreRoute(route: RouteQuote, policy?: RoutingPolicy): ScoredRoute;
/** Whether a structurally valid route clears policy reliability/slippage bounds. */
declare function isRouteEligible(route: RouteQuote, policy?: RoutingPolicy): boolean;
/**
 * Rank routes with a total, input-order-independent comparison:
 * score, output (descending), slippage, hop count, then canonical route ID.
 */
declare function rankRoutes(routes: readonly RouteQuote[], policy?: RoutingPolicy): ScoredRoute[];
/** Select the deterministic winner, or null when no route is admissible. */
declare function selectRoute(routes: readonly RouteQuote[], policy?: RoutingPolicy): ScoredRoute | null;
declare function validateRoutingPolicy(policy: RoutingPolicy): void;

interface RoutePlannerOptions extends RouteDiscoveryOptions {
    policy?: RoutingPolicy;
    /** Maximum quote lifetime when venues provide no earlier expiry. @default 20 */
    quoteValidityLedgers?: number;
    /** Caller slippage used to derive the final minimum. @default 100 (1%) */
    defaultSlippageToleranceBps?: number;
}
interface PaymentQuoteRequest extends RouteRequest {
    slippageToleranceBps?: number;
}
/** Complete pre-commit artifact. Pass this object back to `payForAPI`. */
interface PaymentQuote {
    route: ScoredRoute;
    minimumDestinationAmount: string;
    quotedAtLedger: number;
    validUntilLedger: number;
    failures: RouteDiscoveryFailure[];
}
/** Discovery + deterministic selection + quote freshness in one reusable service. */
declare class RoutePlanner {
    constructor(options: RoutePlannerOptions);
    quote(request: PaymentQuoteRequest): Promise<PaymentQuote>;
    /** Validate a caller-selected route under the same safety policy. */
    quoteOverride(request: PaymentQuoteRequest, override: RouteQuote): PaymentQuote;
    assertFresh(quote: PaymentQuote, currentLedger: number): void;
}

interface HistogramRecord {
    name: string;
    value: number;
    attributes?: Record<string, string | number | boolean>;
}
interface CounterRecord {
    name: string;
    delta: number;
    attributes?: Record<string, string | number | boolean>;
}
interface Metrics {
    recordHistogram(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;
    incrementCounter(name: string, delta?: number, attributes?: Record<string, string | number | boolean>): void;
}
declare const noopMetrics: Metrics;
/** In-memory metrics recorder for tests. */
declare class InMemoryMetrics implements Metrics {
    readonly histograms: HistogramRecord[];
    readonly counters: CounterRecord[];
    recordHistogram(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;
    incrementCounter(name: string, delta?: number, attributes?: Record<string, string | number | boolean>): void;
}

type RetryClassification = 'retryable' | 'expired' | 'permanent';
type RetryClassifier = (error: unknown) => RetryClassification;
interface SubmissionQueueOptions {
    /** Maximum tasks executing at once. @default 4 */
    concurrency?: number;
    /** Pending-task limit; running tasks do not count. @default 1000 */
    maxQueueSize?: number;
    /** Total executions including the first attempt. @default 3 */
    maxAttempts?: number;
    /** Initial exponential-backoff delay. @default 100 */
    retryDelayMs?: number;
    classifyError?: RetryClassifier;
    metrics?: Metrics;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
}
interface SubmitOptions {
    /** Tasks with the same key never overlap; unrelated keys stay concurrent. */
    orderingKey?: string;
    signal?: AbortSignal;
}
interface SubmissionQueueStats {
    depth: number;
    running: number;
    completed: number;
    failed: number;
    expired: number;
    retries: number;
}
/** Machine-readable queue/backpressure failure. */
declare class SubmissionQueueError extends Error {
    readonly code: 'QUEUE_FULL' | 'QUEUE_CLOSED' | 'ABORTED';
    constructor(code: 'QUEUE_FULL' | 'QUEUE_CLOSED' | 'ABORTED', message: string);
}
/** Default classification for Stellar/RPC/network failures. */
declare function classifySubmissionError(error: unknown): RetryClassification;
/**
 * Bounded work queue with key-scoped ordering and retry classification.
 * Backpressure is explicit: once the pending bound is reached, producers get
 * `QUEUE_FULL` synchronously through the returned rejected promise.
 */
declare class SubmissionQueue {
    #private;
    constructor(options?: SubmissionQueueOptions);
    get stats(): SubmissionQueueStats;
    submit<T>(task: (attempt: number) => Promise<T>, options?: SubmitOptions): Promise<T>;
    /** Resolve once both queued and running work have reached zero. */
    drain(): Promise<void>;
    /** Stop accepting work, then wait for accepted work to finish. */
    close(): Promise<void>;
}

/** An account whose sequence number may be used as a transaction channel. */
interface ChannelAccount {
    /** Public Stellar address used as the transaction source. */
    address: string;
    /** Signs the transaction envelope. Contract authorization stays with the agent signer. */
    signer: Signer;
    /** Caller-owned data retained for the lifetime of the pool entry. */
    metadata?: Readonly<Record<string, unknown>>;
}
/** Creates and reclaims accounts as a pool grows and shrinks. */
interface ChannelAccountFactory {
    create(): Promise<ChannelAccount>;
    reclaim?(account: ChannelAccount): Promise<void>;
}
type ChannelLeaseOutcome = 'committed' | 'rolled_back';
interface ChannelAccountPoolOptions {
    /** Accounts available immediately. */
    accounts?: readonly ChannelAccount[];
    /** Lifecycle used when demand changes the pool size. */
    factory?: ChannelAccountFactory;
    /** Lowest size retained by idle reclamation. @default accounts.length */
    minSize?: number;
    /** Hard upper bound, including accounts being created. @default max(minSize, accounts.length) */
    maxSize?: number;
    /** Maximum time to wait for a lease. Zero disables the timeout. @default 30000 */
    leaseTimeoutMs?: number;
    /** Injectable clock for deterministic tests. */
    now?: () => number;
}
interface LeaseOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
interface ChannelPoolStats {
    size: number;
    maxSize: number;
    available: number;
    leased: number;
    creating: number;
    waiting: number;
    targetSize: number;
    committed: number;
    rolledBack: number;
}
/** A single-use, exclusive claim on one channel account. */
interface ChannelAccountLease {
    readonly account: ChannelAccount;
    readonly address: string;
    readonly signer: Signer;
    /**
     * Release the account. A rollback means no transaction was accepted, so the
     * next lease reloads the on-chain sequence instead of advancing a local cursor.
     */
    release(outcome?: ChannelLeaseOutcome): Promise<void>;
    /** Run work and always release, committing only after the callback succeeds. */
    use<T>(work: (account: ChannelAccount) => Promise<T>): Promise<T>;
}
/** Raised when a lease cannot enter the pool. */
declare class ChannelPoolError extends Error {
    readonly code: 'POOL_CLOSED' | 'LEASE_TIMEOUT' | 'LEASE_ABORTED' | 'FACTORY_FAILED';
    readonly cause?: unknown | undefined;
    constructor(code: 'POOL_CLOSED' | 'LEASE_TIMEOUT' | 'LEASE_ABORTED' | 'FACTORY_FAILED', message: string, cause?: unknown | undefined);
}
/**
 * Exclusive channel-account leasing with demand-driven growth.
 *
 * A lease owns an account from sequence load through terminal submission. The
 * pool deliberately does not cache or pre-allocate sequence numbers: the
 * invocation pipeline reloads the account after every release. Consequently a
 * failed build/sign/send rolls back without burning a local sequence or leaving
 * a gap, while accepted transactions are never raced by another caller.
 */
declare class ChannelAccountPool {
    #private;
    constructor(options?: ChannelAccountPoolOptions);
    /** Build a pool and eagerly satisfy `minSize`. */
    static create(options?: ChannelAccountPoolOptions): Promise<ChannelAccountPool>;
    get stats(): ChannelPoolStats;
    /** Lease one account, growing by one when every existing account is busy. */
    lease(options?: LeaseOptions): Promise<ChannelAccountLease>;
    /** Convenience wrapper around `lease` + `ChannelAccountLease.use`. */
    use<T>(work: (account: ChannelAccount) => Promise<T>, options?: LeaseOptions): Promise<T>;
    /**
     * Change the desired fleet size. Growth is awaited; shrink reclaims idle
     * accounts immediately and marks busy accounts for reclamation on release.
     */
    resize(size: number): Promise<void>;
    /** Reject waiters and reclaim all idle accounts; leased accounts retire on release. */
    close(): Promise<void>;
}

type FeePhase = 'initial' | 'fee_bump' | 'sponsorship';
type FeePercentile = 'min' | 'mode' | 'p10' | 'p20' | 'p30' | 'p40' | 'p50' | 'p60' | 'p70' | 'p80' | 'p90' | 'p95' | 'p99' | 'max';
interface FeeDistribution {
    min: string;
    mode: string;
    p10: string;
    p20: string;
    p30: string;
    p40: string;
    p50: string;
    p60: string;
    p70: string;
    p80: string;
    p90: string;
    p95: string;
    p99: string;
    max: string;
}
interface FeeStats {
    inclusionFee: FeeDistribution;
    sorobanInclusionFee: FeeDistribution;
    latestLedger?: number;
}
interface FeeContext {
    phase: FeePhase;
    operationCount: number;
    /** Lower bound imposed by protocol or a previously submitted envelope. */
    minimumFee?: string;
    /** The fee rate on the inner transaction when building a fee bump. */
    previousFee?: string;
    /** Soroban invocations use the Soroban distribution by default. */
    soroban?: boolean;
    getFeeStats?: () => Promise<FeeStats>;
}
/** Resolves a base fee rate in stroops per operation. */
interface FeeStrategy {
    getFee(context: FeeContext): string | Promise<string>;
}
type FeeCallback = (context: FeeContext) => string | number | bigint | Promise<string | number | bigint>;
interface RecentFeeStrategyOptions {
    percentile?: FeePercentile;
    multiplier?: number;
    minimumFee?: string | number | bigint;
    maximumFee?: string | number | bigint;
    fallbackFee?: string | number | bigint;
    /** Cache fee stats to avoid one RPC request per payment. @default 5000 */
    cacheMs?: number;
    now?: () => number;
}
/** Always bids the same fee rate. */
declare class FixedFeeStrategy implements FeeStrategy {
    #private;
    constructor(fee?: string | number | bigint);
    getFee(context: FeeContext): string;
}
/** Multiplies another strategy (recent-fee strategy by default). */
declare class MultiplierFeeStrategy implements FeeStrategy {
    #private;
    constructor(multiplier: number, base?: FeeStrategy);
    getFee(context: FeeContext): Promise<string>;
}
/** Delegates the decision to application code while retaining validation. */
declare class CallbackFeeStrategy implements FeeStrategy {
    readonly callback: FeeCallback;
    constructor(callback: FeeCallback);
    getFee(context: FeeContext): Promise<string>;
}
/**
 * Uses recent RPC fee statistics and falls back to the protocol base fee when
 * the endpoint is unavailable or has not observed relevant transactions.
 */
declare class RecentFeeStrategy implements FeeStrategy {
    #private;
    constructor(options?: RecentFeeStrategyOptions);
    getFee(context: FeeContext): Promise<string>;
}
/** Accept the ergonomic config forms used by `StellarAgentConfig`. */
declare function asFeeStrategy(strategy?: FeeStrategy | FeeCallback | string | number | bigint): FeeStrategy;

/** Minimal RPC surface needed for classic sponsorship transactions. */
interface SponsorRpc {
    getAccount(address: string): Promise<Account>;
    sendTransaction(transaction: Transaction | FeeBumpTransaction): Promise<{
        status: string;
        hash: string;
        errorResult?: {
            toXDR(format: 'base64'): string;
        };
    }>;
    getTransaction(hash: string): Promise<{
        status: string;
        ledger?: number;
        resultXdr?: {
            feeCharged(): {
                toString(): string;
            };
        };
    }>;
    getFeeStats?(): Promise<FeeStats>;
}
interface SponsorServiceOptions {
    sponsorSigner: Signer;
    rpc: SponsorRpc;
    networkPassphrase: string;
    feeStrategy?: FeeStrategy | string | number | bigint;
    /** Transaction validity window. @default 60 */
    timeoutSeconds?: number;
    /** Confirmation polls before timing out. @default 30 */
    confirmationAttempts?: number;
    /** Delay between confirmation polls. @default 1000 */
    pollIntervalMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
}
interface SponsoredAccountOptions {
    /** Valid under sponsorship; the sponsor supplies the reserve. @default "0" */
    startingBalance?: string;
}
interface SponsorshipRecord {
    account: string;
    sponsor: string;
    active: boolean;
    createdByService: boolean;
    transaction?: TxResult;
}
/** Sponsorship lifecycle failure with the rejected transaction hash when known. */
declare class SponsorshipError extends Error {
    readonly code: 'SUBMISSION_FAILED' | 'TRANSACTION_FAILED' | 'TRANSACTION_TIMEOUT';
    readonly transactionHash?: string | undefined;
    constructor(code: 'SUBMISSION_FAILED' | 'TRANSACTION_FAILED' | 'TRANSACTION_TIMEOUT', message: string, transactionHash?: string | undefined);
}
/**
 * Creates zero-balance accounts by sponsoring their account-entry reserve.
 * The creation envelope contains begin/create/end operations atomically and is
 * signed by both sponsor and target. The sponsor is also the transaction source,
 * so the new account never needs XLM for this lifecycle operation.
 */
declare class SponsorService {
    #private;
    constructor(options: SponsorServiceOptions);
    /** Signer used as the outer fee source for sponsored account transactions. */
    get feePayerSigner(): Signer;
    getSponsorAddress(): Promise<string>;
    getRecord(account: string): SponsorshipRecord | undefined;
    list(): SponsorshipRecord[];
    /** Return an existing account unchanged, or atomically create it sponsored. */
    ensureSponsoredAccount(accountSigner: Signer, options?: SponsoredAccountOptions): Promise<SponsorshipRecord>;
    /** Atomically sponsor the reserve and create a target account. */
    createSponsoredAccount(accountSigner: Signer, options?: SponsoredAccountOptions): Promise<SponsorshipRecord>;
    /**
     * Revoke sponsorship of the account entry. The target must hold enough XLM
     * for its own reserve before the network will accept this operation.
     */
    revokeAccountSponsorship(account: string): Promise<TxResult>;
    /**
     * Reclaim a disposable sponsored account by merging it into the sponsor.
     * The target authorizes the merge while the sponsor pays the transaction fee.
     */
    closeSponsoredAccount(accountSigner: Signer, destination?: string): Promise<TxResult>;
}
/** Pool lifecycle backed by zero-balance sponsored accounts. */
declare class SponsoredChannelAccountFactory implements ChannelAccountFactory {
    readonly sponsor: SponsorService;
    constructor(sponsor: SponsorService);
    create(): Promise<ChannelAccount>;
    reclaim(account: ChannelAccount): Promise<void>;
}

/**
 * StellarAgent semantic conventions for OpenTelemetry spans and metrics.
 *
 * @version 1.0.0 — stable; dashboards and alerts depend on these names.
 * @see docs/telemetry-conventions.md
 */
declare const SEMCONV_VERSION = "1.0.0";
declare const SemConv: {
    readonly version: "stellaragent.semconv.version";
    readonly agent: {
        readonly id: "stellaragent.agent.id";
        readonly address: "stellaragent.agent.address";
        readonly name: "stellaragent.agent.name";
    };
    readonly channel: {
        readonly id: "stellaragent.channel.id";
    };
    readonly job: {
        readonly id: "stellaragent.job.id";
        readonly status: "stellaragent.job.status";
    };
    readonly contract: {
        readonly id: "stellaragent.contract.id";
        readonly method: "stellaragent.contract.method";
        readonly kind: "stellaragent.contract.kind";
    };
    readonly network: "stellaragent.network";
    readonly payment: {
        readonly amount: "stellaragent.payment.amount";
        readonly asset: "stellaragent.payment.asset";
        readonly endpoint: "stellaragent.payment.endpoint";
        readonly recipient: "stellaragent.payment.recipient";
    };
    readonly transaction: {
        readonly hash: "stellaragent.transaction.hash";
        readonly ledger: "stellaragent.transaction.ledger";
    };
    readonly error: {
        readonly code: "stellaragent.error.code";
    };
    readonly indexer: {
        readonly fromLedger: "stellaragent.indexer.from_ledger";
        readonly throughLedger: "stellaragent.indexer.through_ledger";
        readonly eventCount: "stellaragent.indexer.event_count";
        readonly lagLedgers: "stellaragent.indexer.lag_ledgers";
        readonly decodeFailures: "stellaragent.indexer.decode_failures";
    };
    readonly trace: {
        readonly paymentId: "stellaragent.trace.payment_id";
    };
};
/** Span names for the SDK invocation lifecycle. */
declare const SpanNames: {
    readonly contractInvoke: "stellaragent.contract.invoke";
    readonly simulate: "stellaragent.contract.simulate";
    readonly sign: "stellaragent.contract.sign";
    readonly submit: "stellaragent.contract.submit";
    readonly confirm: "stellaragent.contract.confirm";
    readonly payForApi: "stellaragent.payment.pay_for_api";
    readonly indexerRun: "stellaragent.indexer.run";
    readonly indexerDecode: "stellaragent.indexer.decode";
};
/** Metric names exported by the SDK and indexer. */
declare const MetricNames: {
    readonly paymentLatencyMs: "stellaragent.payment.latency_ms";
    readonly paymentFailures: "stellaragent.payment.failures";
    readonly paymentFeesStroops: "stellaragent.payment.fees_stroops";
    readonly submissionQueueDepth: "stellaragent.submission.queue_depth";
    readonly submissionLatencyMs: "stellaragent.submission.latency_ms";
    readonly submissionExpiries: "stellaragent.submission.expiries";
    readonly submissionRetries: "stellaragent.submission.retries";
    readonly indexerLagLedgers: "stellaragent.indexer.lag_ledgers";
    readonly indexerThroughputEvents: "stellaragent.indexer.throughput_events";
    readonly indexerDecodeFailures: "stellaragent.indexer.decode_failures";
};
type SemanticAttributes = Record<string, string | number | boolean>;

interface Span {
    setAttribute(key: string, value: string | number | boolean): void;
    setAttributes(attrs: SemanticAttributes): void;
    recordException(error: unknown): void;
    end(): void;
}
interface Tracer {
    startSpan(name: string, attributes?: SemanticAttributes): Span;
    startActiveSpan<T>(name: string, attributes: SemanticAttributes | undefined, fn: (span: Span) => T | Promise<T>): T | Promise<T>;
}
declare const noopTracer: Tracer;
/** In-memory span recorder for tests — no OpenTelemetry dependency. */
interface RecordedSpan {
    name: string;
    attributes: SemanticAttributes;
    exceptions: unknown[];
    ended: boolean;
}
declare class InMemoryTracer implements Tracer {
    readonly spans: RecordedSpan[];
    startSpan(name: string, attributes?: SemanticAttributes): Span;
    startActiveSpan<T>(name: string, attributes: SemanticAttributes | undefined, fn: (span: Span) => T | Promise<T>): T | Promise<T>;
}

type Network = 'mainnet' | 'testnet' | 'local';
interface NetworkConfig {
    rpcUrl: string;
    networkPassphrase: string;
    horizonUrl: string;
}
type SpendPeriod = 'per_ledger' | 'hourly' | 'daily';
interface SpendLimit {
    /** Maximum amount per period */
    amount: string;
    /** Asset to limit (e.g. 'USDC') */
    asset: string;
    /** How often the limit resets */
    period: SpendPeriod;
}
interface StellarAgentConfig {
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
        signTransaction(xdr: string, options: {
            networkPassphrase: string;
        }): Promise<string>;
        signAuthEntry(authEntryXdr: string, options: {
            networkPassphrase: string;
            validUntilLedgerSeq: number;
        }): Promise<string>;
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
        tracer?: Tracer;
        metrics?: Metrics;
    };
    /**
     * Fleet transaction source accounts. Each mutation exclusively leases one,
     * removing sequence-number contention from the agent authorization account.
     * `channelAccountPool` is retained as a descriptive alias.
     */
    channelPool?: ChannelAccountPool;
    channelAccountPool?: ChannelAccountPool;
    /** Dynamic transaction fee policy. Recent p90 network fees are used by default. */
    feeStrategy?: FeeStrategy | FeeCallback | string | number | bigint;
    /** Fee-bump behavior for congestion and zero-XLM transaction sources. */
    feeBump?: FeeBumpConfig;
    /** Creates the agent's account with a sponsored reserve in `createAgentWallet()`. */
    sponsorService?: SponsorService;
    /** An existing queue, useful when several agents share one fleet-wide bound. */
    submissionQueue?: SubmissionQueue;
    /** Build a queue owned by this agent. Omitted fields use fleet-safe defaults. */
    submission?: SubmissionPipelineConfig;
    /** Multi-venue discovery and deterministic route-selection configuration. */
    routing?: RoutePlannerOptions;
}
interface QuoteParams {
    sourceAsset: string;
    destinationAsset: string;
    /** Decimal display amount; converted to 7-decimal base units before discovery. */
    amount: string;
    allowedIntermediates?: string[];
    /** 0..500 basis points. @default 100 */
    slippageToleranceBps?: number;
}
interface FeeBumpConfig {
    /** @default true */
    enabled?: boolean;
    /** `always` is required when the inner source has zero XLM. @default on_expiry */
    mode?: 'on_expiry' | 'always';
    /** Outer fee source. Defaults to the sponsor, channel, or agent signer in that order. */
    signer?: Signer;
    /** A distinct policy for bumps. Defaults to 10x the initial fee or recent fees, whichever is higher. */
    strategy?: FeeStrategy | FeeCallback | string | number | bigint;
    /** Poll attempts before a pending inner transaction is bumped. @default 3 */
    triggerAfterAttempts?: number;
    /** Remaining transaction lifetime that triggers a bump. @default 10 */
    expiryThresholdSeconds?: number;
    /** Maximum replacement envelopes for one invocation. @default 1 */
    maxBumps?: number;
}
interface SubmissionPipelineConfig {
    concurrency?: number;
    maxQueueSize?: number;
    maxAttempts?: number;
    retryDelayMs?: number;
    classifyError?: RetryClassifier;
    /** Eager sponsored channel count when `sponsorService` creates the pool. @default 1 */
    minChannels?: number;
    /** Demand-driven sponsored channel limit. @default concurrency */
    maxChannels?: number;
}
interface AgentInfo {
    id: bigint;
    address: string;
    name: string;
    owner: string;
    active: boolean;
    createdAt: number;
    totalOps: bigint;
}
interface OpenChannelParams {
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
interface PayForAPIParams {
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
    route?: PaymentQuote | RouteQuote;
    /** Intermediate assets automatic discovery may traverse. */
    allowedIntermediates?: string[];
    /** Automatic-quote slippage tolerance in basis points, capped at 500. */
    slippageToleranceBps?: number;
}
interface ChannelInfo {
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
interface SpendReport {
    spentThisPeriod: string;
    remainingThisPeriod: string;
    totalLifetime: string;
}
type JobStatus = 'open' | 'in_progress' | 'pending_release' | 'completed' | 'refunded' | 'disputed';
interface RequestWorkParams {
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
interface JobInfo {
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
interface RateLimitConfig {
    maxPerTx: string;
    maxPerHour: string;
    maxPerDay: string;
    maxTxsPerHour: number;
}
/** Current rate-limit usage alongside the configured limits, for `RateLimiter`. */
interface RateLimitStatus extends RateLimitConfig {
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
     * Note this does **not** by itself change what `RateLimiter.check`
     * returns on-chain today — see `predictPaymentOutcome`'s doc comment —
     * so treat this as informational (e.g. "killed" badge), not as a
     * blocking signal on its own.
     */
    active: boolean;
    /** Ledger sequence at which the current hourly window started. */
    hourWindowStartLedger: number;
    /** Ledger sequence at which the current daily window started. */
    dayWindowStartLedger: number;
}
interface ContractAddresses {
    agentWalletFactory: string;
    paymentChannel: string;
    escrow: string;
    rateLimiter: string;
    circuitBreaker: string;
}
interface AgentEvent {
    type: 'payment' | 'job_created' | 'job_completed' | 'rate_limit_hit' | 'agent_killed';
    agentId: bigint;
    timestamp: number;
    data: Record<string, unknown>;
}
interface TxResult {
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
    route?: RouteQuote;
    /** Quoted destination amount in integer base units. */
    expectedDestinationAmount?: string;
    /** End-to-end contract floor in destination base units. */
    minimumDestinationAmount?: string;
}

/**
 * Pre-flight prediction of whether a proposed payment would be blocked by
 * either a `PaymentChannel`'s per-period spend limit or a configured
 * `RateLimiter`, computed entirely off already-fetched on-chain state — no
 * RPC round trip, no transaction fee.
 *
 * This is a deliberately low-level, environment-agnostic function: it takes
 * plain state objects rather than live contract clients, so it's usable from
 * `@stellaragent/react`'s `useRateLimitStatus` hook, a future CLI dry-run
 * command, or a test — anything that already knows the relevant on-chain
 * state.
 *
 * ## Why this has to replicate the contracts' own logic, not just call them
 *
 * Both `PaymentChannel.pay` and `RateLimiter.check` reset their rolling
 * windows (`spent_this_period` / `hourly_spend` + `daily_spend`) *before*
 * evaluating the proposed amount, whenever the current ledger has moved past
 * the window's expiry — see `reset_windows_if_needed` in
 * `contracts/rate_limiter/src/lib.rs` and the inline reset in
 * `contracts/payment_channel/src/lib.rs`'s `pay`. A caller holding
 * yesterday's `spentThisPeriod` would otherwise predict a block that the
 * chain itself will not enforce (the window already rolled over). This
 * module takes `currentLedger` explicitly and performs the same
 * reset-then-check sequence.
 *
 * ## Boundary conditions matter
 *
 * Every one of the contracts' own limit checks uses strict `>` (a payment
 * that lands *exactly* on the limit is allowed) except the hourly
 * transaction-count check, which uses `>=` (once `max_txs_per_hour` slots are
 * used, the next one is refused). Getting these backwards is an off-by-one
 * that either double-blocks a legitimate last payment or lets one through
 * that the chain would reject — the source of truth for every comparison
 * below is cited inline against `contracts/rate_limiter/src/lib.rs` and
 * `contracts/payment_channel/src/lib.rs`.
 *
 * ## A deliberate faithfulness quirk: `active` does not gate `check()`
 *
 * `RateLimiter.kill_agent` sets `RateLimit.active = false`, but
 * `RateLimiter::check` never reads that field — only `is_active()` (a
 * separate query) does. So a killed agent's `check()` call still evaluates
 * (and can pass) the per-tx/hourly/daily/tx-count comparisons on-chain today.
 * This function mirrors that exactly, because its contract is "agrees with
 * `RateLimiter.check`", not "agrees with what `RateLimiter.check` probably
 * should do". `RateLimitSpendState.active` is exposed for callers that want
 * to surface a "killed" badge, but it does not participate in `wouldBlock`.
 *
 * @module predict
 */

/**
 * Ledgers per channel period, mirroring `PaymentChannel::ledgers_per_period`
 * in `contracts/payment_channel/src/lib.rs` (~5s ledgers).
 */
declare const LEDGERS_PER_CHANNEL_PERIOD: Record<SpendPeriod, number>;
/**
 * `RateLimiter`'s hourly/daily windows are fixed cadences, independent of any
 * channel's own configurable period — mirroring the constants inside
 * `RateLimiter::reset_windows_if_needed` in
 * `contracts/rate_limiter/src/lib.rs`.
 */
declare const RATE_LIMIT_LEDGERS_PER_HOUR = 720;
declare const RATE_LIMIT_LEDGERS_PER_DAY = 17280;
/** The subset of `Channel` (contracts/payment_channel/src/lib.rs) needed to predict `pay`'s spend-limit check. */
interface ChannelSpendState {
    active: boolean;
    limitPerPeriod: string;
    spentThisPeriod: string;
    periodStartLedger: number;
    period: SpendPeriod;
}
/** The subset of `RateLimit` (contracts/rate_limiter/src/lib.rs) needed to predict `check`. */
interface RateLimitSpendState {
    /** `has_limit(agent)` on-chain — `false` means `check()` always returns `true`. */
    configured: boolean;
    /** `RateLimit.active` — see the module doc for why this does not gate `wouldBlock`. */
    active: boolean;
    maxPerTx: string;
    maxPerHour: string;
    maxPerDay: string;
    maxTxsPerHour: number;
    hourlySpend: string;
    dailySpend: string;
    hourlyTxCount: number;
    hourWindowStartLedger: number;
    dayWindowStartLedger: number;
}
interface PredictPaymentOutcomeParams {
    /** Omit (or pass `null`) if the payment isn't going through a channel at all. */
    channelState?: ChannelSpendState | null;
    /** Omit (or pass `null`) if no `RateLimiter` applies to this agent/path. */
    rateLimitState?: RateLimitSpendState | null;
    /** Proposed payment amount, same unit as the channel/rate-limit state (stroops as a decimal string). */
    amount: string;
    /** Current ledger sequence — used to replicate the contracts' reset-before-check window semantics. */
    currentLedger: number;
}
/** Every distinct reason `predictPaymentOutcome` can cite for a block, each tied to one specific on-chain check. */
type BlockReason = 'invalid_amount' | 'channel_inactive' | 'channel_spend_limit' | 'rate_limit_per_tx' | 'rate_limit_hourly' | 'rate_limit_daily' | 'rate_limit_tx_count';
interface PaymentPrediction {
    /** `true` if any reason fired — i.e. the on-chain call(s) are predicted to fail. */
    wouldBlock: boolean;
    /** Every check that would fail, most upstream first. Empty when `wouldBlock` is `false`. */
    reasons: BlockReason[];
}
/** Whether a rolling window that started at `windowStartLedger` has expired by `currentLedger`. */
declare function isWindowExpired(windowStartLedger: number, ledgersPerWindow: number, currentLedger: number): boolean;
/**
 * Ledgers remaining until a rolling window resets, floored at 0 (an expired
 * window has 0 remaining, not a negative count).
 */
declare function ledgersRemainingInWindow(windowStartLedger: number, ledgersPerWindow: number, currentLedger: number): number;
/**
 * Predict whether a proposed `amount` would be blocked by a channel's spend
 * limit and/or a configured rate limiter, without an RPC round trip.
 *
 * Pass `channelState: null`/`undefined` and/or `rateLimitState:
 * null`/`undefined` to skip either check (e.g. a payment with no channel, or
 * an agent with no `RateLimiter` configured at all).
 */
declare function predictPaymentOutcome({ channelState, rateLimitState, amount, currentLedger, }: PredictPaymentOutcomeParams): PaymentPrediction;

/**
 * Deterministic math utilities for Stellar Agent SDK.
 *
 * Import from this barrel to get both the fixed-point primitives and the
 * bidding algorithm helpers in one shot:
 *
 * @example
 * ```typescript
 * import { rankBids, fmt, toStroops } from '@stellaragent/core/math';
 * ```
 */

type index_AgentBid = AgentBid;
type index_AttestRankBidsOptions = AttestRankBidsOptions;
type index_AttestedRanking = AttestedRanking;
declare const index_BPS_SCALE: typeof BPS_SCALE;
type index_BidAttestation = BidAttestation;
type index_BidAttestationVerification = BidAttestationVerification;
type index_BidWeights = BidWeights;
declare const index_BigNumber: typeof BigNumber;
type index_BlockReason = BlockReason;
type index_ChannelSpendState = ChannelSpendState;
declare const index_DEFAULT_BID_WEIGHTS: typeof DEFAULT_BID_WEIGHTS;
declare const index_DEFAULT_ROUTING_POLICY: typeof DEFAULT_ROUTING_POLICY;
declare const index_LEDGERS_PER_CHANNEL_PERIOD: typeof LEDGERS_PER_CHANNEL_PERIOD;
type index_PaymentPrediction = PaymentPrediction;
type index_PredictPaymentOutcomeParams = PredictPaymentOutcomeParams;
declare const index_RATE_LIMIT_LEDGERS_PER_DAY: typeof RATE_LIMIT_LEDGERS_PER_DAY;
declare const index_RATE_LIMIT_LEDGERS_PER_HOUR: typeof RATE_LIMIT_LEDGERS_PER_HOUR;
declare const index_ROUTING_WEIGHT_SCALE: typeof ROUTING_WEIGHT_SCALE;
type index_RateLimitSpendState = RateLimitSpendState;
type index_RouteScoreBreakdown = RouteScoreBreakdown;
type index_RoutingPolicy = RoutingPolicy;
declare const index_STROOP_SCALE: typeof STROOP_SCALE;
type index_ScoredBid = ScoredBid;
type index_ScoredRoute = ScoredRoute;
type index_ScorerKeyDirectory = ScorerKeyDirectory;
type index_ScorerKeyRecord = ScorerKeyRecord;
type index_VerifyBidAttestationOptions = VerifyBidAttestationOptions;
declare const index_add: typeof add;
declare const index_attestRankBids: typeof attestRankBids;
declare const index_bn: typeof bn;
declare const index_clamp: typeof clamp;
declare const index_div: typeof div;
declare const index_eq: typeof eq;
declare const index_fmt: typeof fmt;
declare const index_fromStroops: typeof fromStroops;
declare const index_gt: typeof gt;
declare const index_gte: typeof gte;
declare const index_isPositive: typeof isPositive;
declare const index_isRouteEligible: typeof isRouteEligible;
declare const index_isWindowExpired: typeof isWindowExpired;
declare const index_isWithinSpendLimit: typeof isWithinSpendLimit;
declare const index_isZero: typeof isZero;
declare const index_ledgersRemainingInWindow: typeof ledgersRemainingInWindow;
declare const index_lt: typeof lt;
declare const index_lte: typeof lte;
declare const index_mul: typeof mul;
declare const index_pct: typeof pct;
declare const index_predictPaymentOutcome: typeof predictPaymentOutcome;
declare const index_rankBids: typeof rankBids;
declare const index_rankRoutes: typeof rankRoutes;
declare const index_remainingBudget: typeof remainingBudget;
declare const index_scoreBid: typeof scoreBid;
declare const index_scoreRoute: typeof scoreRoute;
declare const index_selectBestBid: typeof selectBestBid;
declare const index_selectRoute: typeof selectRoute;
declare const index_sub: typeof sub;
declare const index_sumStrings: typeof sumStrings;
declare const index_toStr: typeof toStr;
declare const index_toStroops: typeof toStroops;
declare const index_validateRoutingPolicy: typeof validateRoutingPolicy;
declare const index_verifyBidAttestation: typeof verifyBidAttestation;
declare namespace index {
  export { type index_AgentBid as AgentBid, type index_AttestRankBidsOptions as AttestRankBidsOptions, type index_AttestedRanking as AttestedRanking, index_BPS_SCALE as BPS_SCALE, type index_BidAttestation as BidAttestation, type index_BidAttestationVerification as BidAttestationVerification, type index_BidWeights as BidWeights, index_BigNumber as BigNumber, type index_BlockReason as BlockReason, type index_ChannelSpendState as ChannelSpendState, index_DEFAULT_BID_WEIGHTS as DEFAULT_BID_WEIGHTS, index_DEFAULT_ROUTING_POLICY as DEFAULT_ROUTING_POLICY, index_LEDGERS_PER_CHANNEL_PERIOD as LEDGERS_PER_CHANNEL_PERIOD, type index_PaymentPrediction as PaymentPrediction, type index_PredictPaymentOutcomeParams as PredictPaymentOutcomeParams, index_RATE_LIMIT_LEDGERS_PER_DAY as RATE_LIMIT_LEDGERS_PER_DAY, index_RATE_LIMIT_LEDGERS_PER_HOUR as RATE_LIMIT_LEDGERS_PER_HOUR, index_ROUTING_WEIGHT_SCALE as ROUTING_WEIGHT_SCALE, type index_RateLimitSpendState as RateLimitSpendState, type index_RouteScoreBreakdown as RouteScoreBreakdown, type index_RoutingPolicy as RoutingPolicy, index_STROOP_SCALE as STROOP_SCALE, type index_ScoredBid as ScoredBid, type index_ScoredRoute as ScoredRoute, type index_ScorerKeyDirectory as ScorerKeyDirectory, type index_ScorerKeyRecord as ScorerKeyRecord, type index_VerifyBidAttestationOptions as VerifyBidAttestationOptions, index_add as add, index_attestRankBids as attestRankBids, index_bn as bn, index_clamp as clamp, index_div as div, index_eq as eq, index_fmt as fmt, index_fromStroops as fromStroops, index_gt as gt, index_gte as gte, index_isPositive as isPositive, index_isRouteEligible as isRouteEligible, index_isWindowExpired as isWindowExpired, index_isWithinSpendLimit as isWithinSpendLimit, index_isZero as isZero, index_ledgersRemainingInWindow as ledgersRemainingInWindow, index_lt as lt, index_lte as lte, index_mul as mul, index_pct as pct, index_predictPaymentOutcome as predictPaymentOutcome, index_rankBids as rankBids, index_rankRoutes as rankRoutes, index_remainingBudget as remainingBudget, index_scoreBid as scoreBid, index_scoreRoute as scoreRoute, index_selectBestBid as selectBestBid, index_selectRoute as selectRoute, index_sub as sub, index_sumStrings as sumStrings, index_toStr as toStr, index_toStroops as toStroops, index_validateRoutingPolicy as validateRoutingPolicy, index_verifyBidAttestation as verifyBidAttestation };
}

/** A provider may use this to classify a normal venue miss without throwing a generic error. */
declare class RouteUnavailableError extends Error {
    readonly code: RouteUnavailableCode;
    constructor(code: RouteUnavailableCode, message: string);
}
/**
 * Enumerate and normalize every provider independently. A broken or illiquid
 * venue becomes a diagnostic entry while valid candidates remain selectable.
 */
declare function discoverRoutes(request: RouteRequest, options: RouteDiscoveryOptions): Promise<RouteDiscoveryResult>;
declare function canonicalRouteId(hops: readonly RouteHop[]): string;
declare function normalizeRoute(request: RouteRequest, hops: readonly RouteHop[], maxHops: number): RouteQuote;
declare function applyOracleReference(route: RouteQuote, reference: OracleReference): RouteQuote;

/** Same-asset candidate. It performs no conversion and charges no fee. */
declare class DirectRouteProvider implements RouteProvider {
    readonly id = "direct";
    discover(request: RouteRequest): Promise<RouteHop[][]>;
}
interface AmmRouteProviderOptions {
    id?: string;
    /** Execution contract or other stable venue identifier. */
    venueId: string;
    pairs: AmmPair[];
    quote: AmmQuoteCallback;
}
/** Bounded graph discovery over one AMM/aggregator adapter. */
declare class AmmRouteProvider implements RouteProvider {
    readonly id: string;
    constructor(options: AmmRouteProviderOptions);
    discover(request: RouteRequest, context: RouteProviderContext): Promise<RouteHop[][]>;
}
interface StellarPathPaymentProviderOptions {
    id?: string;
    quote: PathPaymentQuoteCallback;
}
/** Adapter around Horizon strict-send path discovery or a compatible service. */
declare class StellarPathPaymentProvider implements RouteProvider {
    readonly id: string;
    constructor(options: StellarPathPaymentProviderOptions);
    discover(request: RouteRequest, context: RouteProviderContext): Promise<RouteHop[][]>;
}
/** Small fixture/application adapter for a custom venue implementation. */
declare class CallbackRouteProvider implements RouteProvider {
    readonly id: string;
    constructor(id: string, callback: RouteProvider['discover']);
    discover(request: RouteRequest, context: RouteProviderContext): Promise<RouteHop[][]>;
}

/**
 * Wall-clock estimation for Stellar's ledger-sequence-based windows.
 *
 * `RateLimiter` (`contracts/rate_limiter/src/lib.rs`) and `PaymentChannel`
 * (`contracts/payment_channel/src/lib.rs`) both track their rolling windows
 * in **ledger sequence numbers**, not timestamps — `hour_window_start`,
 * `day_window_start`, `period_start_ledger`. Ledgers close roughly every 5
 * seconds, but that number drifts with network conditions and is not
 * contractually guaranteed, so hard-coding "5 seconds" would silently
 * mislead a UI showing "resets in ~N seconds" whenever the real network runs
 * faster or slower than that assumption.
 *
 * This module instead derives an actual average close time from a handful of
 * recently observed ledgers (via Horizon's `/ledgers` endpoint) and uses that
 * to convert a ledger count into an estimated number of seconds. Every value
 * this produces is explicitly an estimate — never treat
 * `estimateSecondsRemaining`'s result as exact.
 *
 * @module ledgerTime
 */
/** A single observed ledger close, as needed to derive an average close time. */
interface LedgerCloseSample {
    sequence: number;
    /** ISO 8601 timestamp, as returned by Horizon's `closed_at` field. */
    closedAt: string;
}
/**
 * Fallback average ledger close time, in seconds, used only when fewer than
 * two samples are available to derive a real observed average from (e.g. a
 * brand new standalone network with a single ledger closed so far). This is
 * the commonly cited Stellar figure, but it is a fallback, not a
 * measurement — prefer {@link estimateLedgerCloseSeconds} against real
 * samples whenever they're available.
 */
declare const FALLBACK_LEDGER_CLOSE_SECONDS = 5;
/**
 * Derive the observed average seconds-per-ledger from a set of recent ledger
 * close samples, by summing the wall-clock gaps between consecutive
 * sequences and dividing by the total number of ledgers those gaps span
 * (rather than simply averaging per-pair ratios, so a single irregular gap
 * doesn't get equal weight against many one-ledger gaps).
 *
 * Samples need not be pre-sorted or contiguous. Any pair with a
 * non-positive ledger delta or a negative/invalid time delta is skipped —
 * defensive against a misbehaving RPC provider returning out-of-order or
 * duplicate records — and falls back to {@link FALLBACK_LEDGER_CLOSE_SECONDS}
 * if fewer than two usable samples remain after that filtering.
 */
declare function estimateLedgerCloseSeconds(samples: readonly LedgerCloseSample[]): number;
/**
 * Convert a ledger count into an estimated number of wall-clock seconds
 * using an already-derived average close time. Purely `ledgers *
 * avgLedgerCloseSeconds` — split out from {@link estimateLedgerCloseSeconds}
 * so callers (e.g. `useRateLimitStatus`) can recompute this on every render
 * as `ledgersRemaining` ticks down without re-deriving the average each time.
 */
declare function estimateSecondsRemaining(ledgersRemaining: number, avgLedgerCloseSeconds: number): number;
interface LedgerCloseEstimate {
    /** The highest ledger sequence among the fetched samples — i.e. the current tip. */
    currentLedger: number;
    /** Observed (or, absent enough samples, fallback) average seconds per ledger. */
    avgLedgerCloseSeconds: number;
    /**
     * `true` when `avgLedgerCloseSeconds` came from real observed ledger
     * closes; `false` when there weren't enough samples and the
     * {@link FALLBACK_LEDGER_CLOSE_SECONDS} constant was used instead. Surface
     * this alongside any "resets in ~N seconds" display so it's clear when the
     * estimate is a network measurement versus a rough guess.
     */
    observed: boolean;
}
/**
 * Fetch the most recent `sampleSize` ledgers from Horizon and derive both
 * the current ledger sequence and an observed average close time from them
 * — a single round trip covers everything a caller needs to turn a
 * ledger-count window into a wall-clock estimate.
 */
declare function fetchLedgerCloseEstimate(horizonUrl: string, sampleSize?: number): Promise<LedgerCloseEstimate>;

/** Stable machine-readable codes for StellarAgent failures. */
type StellarAgentErrorCode = 'INVALID_ARGUMENT' | 'NO_ACTIVE_CHANNEL' | 'NO_ROUTE' | 'QUOTE_EXPIRED' | 'INVALID_ROUTE_OVERRIDE' | 'INSUFFICIENT_LIQUIDITY' | 'VENUE_UNAVAILABLE' | 'SPEND_LIMIT_EXCEEDED' | 'CHANNEL_NOT_FOUND' | 'CHANNEL_CLOSED' | 'JOB_NOT_FOUND' | 'JOB_NOT_OPEN' | 'JOB_EXPIRED' | 'NOT_AUTHORIZED' | 'RATE_LIMIT_NOT_FOUND' | 'CONTRACT_ERROR' | 'SIMULATION_FAILED' | 'SUBMISSION_FAILED' | 'TRANSACTION_FAILED' | 'TRANSACTION_TIMEOUT' | 'NETWORK_ERROR';
/** Error thrown for SDK validation, Soroban RPC, and contract failures. */
declare class StellarAgentError extends Error {
    readonly code: StellarAgentErrorCode;
    readonly cause?: unknown;
    readonly transactionHash?: string;
    constructor(code: StellarAgentErrorCode, message: string, options?: {
        cause?: unknown;
        transactionHash?: string;
    });
}

/**
 * CircuitBreaker SDK wrapper for the Soroban multi‑sig pause contract.
 *
 * The contract lives in `contracts/circuit_breaker` and exposes:
 *   - `propose_pause(node)`   – a trusted node records its approval to pause.
 *   - `execute_pause()`       – flips `is_paused` to true once >=5 distinct
 *                               trusted nodes have called `propose_pause`
 *                               within the contract's validity window.
 *   - `propose_unpause(node)` – a trusted node records its approval to unpause.
 *   - `unpause()`             – flips `is_paused` back to false once quorum
 *                               is reached on unpause proposals.
 *   - `is_paused()`           – view function returning the current pause state.
 *
 * The trusted-node set lives on-chain in the contract (see `set_trusted_nodes`,
 * admin-only). This wrapper does **not** maintain a client-side allow-list of
 * signers — a hardcoded list of secret keys is exactly the anti-pattern this
 * contract exists to avoid. Whether a signer is trusted is enforced by the
 * contract at `propose_pause` / `propose_unpause` time via `require_auth()`.
 */

/** Stellar account public key (`G...`). Secret keys (`S...`) are rejected. */
type PublicAddress = string & {
    readonly __brand: unique symbol;
};
/**
 * Parse and validate a Stellar public address. Rejects secret keys so a
 * trusted-node list can never accidentally hold signing material.
 */
declare function asPublicAddress(value: string): PublicAddress;
interface CircuitBreakerOptions {
    /**
     * Soroban RPC endpoint (e.g., https://soroban-testnet.stellar.org).
     * Ignored when `rpc` is provided.
     */
    rpcUrl: string;
    /** The contract ID (address) of the deployed CircuitBreaker contract. */
    contractId: string;
    /** Network passphrase to sign transactions for. Defaults to testnet. */
    networkPassphrase?: string;
    /**
     * Default signer for write methods. When set, callers can omit passing a
     * signer/secret on each call. Prefer {@link Signer} (remote/HSM) over raw
     * secret keys in production.
     */
    signer?: Signer;
    /** Inject a Soroban RPC client (used by unit tests). */
    rpc?: SorobanRpc.Server;
}
declare class CircuitBreaker {
    readonly contractId: string;
    constructor(options: CircuitBreakerOptions);
    /** Whether the system is currently paused. */
    isPaused(sourcePublicKey?: string): Promise<boolean>;
    /** Distinct trusted-node pause proposals still within the validity window. */
    pauseQuorumCount(sourcePublicKey?: string): Promise<number>;
    /** Distinct trusted-node unpause proposals still within the validity window. */
    unpauseQuorumCount(sourcePublicKey?: string): Promise<number>;
    /** A trusted node records its approval to pause the system. */
    proposePause(signer?: string | Signer): Promise<TxResult>;
    /** Execute the pause once enough on-chain proposals have been recorded. */
    executePause(signer?: string | Signer): Promise<TxResult>;
    /** A trusted node records its approval to unpause the system. */
    proposeUnpause(signer?: string | Signer): Promise<TxResult>;
    /** Lift the pause once enough on-chain unpause proposals have been recorded. */
    unpause(signer?: string | Signer): Promise<TxResult>;
}

/**
 * Contract address resolution.
 *
 * ## Why this module exists
 *
 * `DEFAULT_CONTRACTS` used to hard-code addresses like
 * `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` for testnet
 * and empty strings for mainnet/local. Those are not real contract IDs — they
 * are 60-61 characters long where a Stellar contract ID is exactly 56, and
 * none of them carry a valid strkey checksum. Any call made against them
 * would have failed deep inside a Soroban RPC round-trip with an opaque
 * error, long after the real mistake (never having deployed) was made.
 *
 * This module replaces that with three things:
 *
 * 1. An explicit, named set of **unconfigured sentinels** — the same fake
 *    values, but now labelled as what they are rather than posing as
 *    deployment output.
 * 2. **Resolution** from environment variables, so a real deployment can be
 *    supplied without recompiling.
 * 3. A **fast-fail check** that rejects an unconfigured or malformed address
 *    at `StellarAgent.create()` time with a message pointing at the runbook.
 *
 * ## Why environment variables rather than reading the generated file
 *
 * `scripts/deploy.ts` writes `deployments/<network>.json`. This package,
 * however, is bundled for browsers as well as Node — `@stellaragent/dashboard`
 * imports it directly — so it cannot `fs.readFile` a path at runtime without
 * breaking that build. Environment variables are the portable channel (the
 * issue sanctions either), and the deploy script prints a ready-to-paste
 * `.env` block alongside the JSON so the two stay in step. Callers who do
 * want the file can import the JSON and pass it as `config.contracts`, which
 * takes precedence over everything here.
 *
 * @module contracts
 */

/** Every key of `ContractAddresses`, in deployment order. */
declare const CONTRACT_KEYS: readonly ["agentWalletFactory", "paymentChannel", "escrow", "rateLimiter", "circuitBreaker"];
type ContractKey = (typeof CONTRACT_KEYS)[number];
/**
 * Placeholder addresses standing in for "nothing has been deployed to this
 * network yet".
 *
 * These are deliberately kept — removing them would make an unconfigured
 * agent fail with `undefined` rather than a message — but they are no longer
 * called "defaults", because nothing about them is usable. `assertDeployed`
 * rejects every one of them.
 */
declare const UNCONFIGURED_CONTRACTS: Record<Network, ContractAddresses>;
/**
 * Whether a string is a real, deployable Stellar contract ID.
 *
 * Uses strkey validation rather than a pattern match against the known
 * placeholders: that also catches truncated addresses, addresses pasted from
 * the wrong network's output, and single-character typos — all of which
 * otherwise surface as the same opaque RPC failure.
 */
declare function isDeployedAddress(address: string | undefined): boolean;
/**
 * Environment variable names consulted for a contract, most specific first:
 * `STELLARAGENT_TESTNET_PAYMENT_CHANNEL` then `STELLARAGENT_PAYMENT_CHANNEL`.
 * The network-scoped form lets one process talk to more than one network.
 */
declare function envVarNames(network: Network, key: ContractKey): [string, string];
/**
 * Resolve the contract addresses for a network.
 *
 * Precedence, highest first:
 * 1. `overrides` — what the caller passed as `config.contracts`
 * 2. `STELLARAGENT_<NETWORK>_<CONTRACT>` environment variable
 * 3. `STELLARAGENT_<CONTRACT>` environment variable
 * 4. the unconfigured sentinel for that network
 *
 * Resolution never throws — it reports what it found. Use `assertDeployed`
 * to reject the result if it is still unconfigured.
 */
declare function resolveContracts(network: Network, overrides?: Partial<ContractAddresses>): ContractAddresses;
/** Thrown when an agent is created against contracts that are not deployed. */
declare class ContractsNotDeployedError extends Error {
    readonly network: Network;
    /** The contract keys that failed validation, in `CONTRACT_KEYS` order. */
    readonly missing: ContractKey[];
    constructor(network: Network, missing: ContractKey[]);
}
/**
 * Throw unless every contract address is a real deployed contract ID.
 *
 * This runs at `StellarAgent.create()` time so the failure names the actual
 * problem, instead of surfacing later as a confusing RPC error from the
 * middle of a payment.
 */
declare function assertDeployed(network: Network, contracts: ContractAddresses): void;

/** Log levels supported by the StellarAgent logger. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface LogRecord {
    level: LogLevel;
    message: string;
    attributes?: Record<string, unknown>;
    timestamp?: number;
}
interface Logger {
    debug(message: string, attributes?: Record<string, unknown>): void;
    info(message: string, attributes?: Record<string, unknown>): void;
    warn(message: string, attributes?: Record<string, unknown>): void;
    error(message: string, attributes?: Record<string, unknown>): void;
}
declare function redactForExport(value: unknown): unknown;
interface LoggerOptions {
    sink?: (record: LogRecord) => void;
    minLevel?: LogLevel;
}
declare class RedactingLogger implements Logger {
    constructor(options?: LoggerOptions);
    debug(message: string, attributes?: Record<string, unknown>): void;
    info(message: string, attributes?: Record<string, unknown>): void;
    warn(message: string, attributes?: Record<string, unknown>): void;
    error(message: string, attributes?: Record<string, unknown>): void;
}
/** Zero-cost logger used when telemetry is not configured. */
declare const noopLogger: Logger;

/**
 * Optional OpenTelemetry bridge — only loaded when telemetry is enabled and
 * the consumer has installed @opentelemetry/* packages.
 */

interface OtelBridgeOptions {
    serviceName: string;
    otlpEndpoint: string;
}
declare function createOtelBridge(options: OtelBridgeOptions): Promise<{
    tracer: Tracer;
    metrics: Metrics;
}>;

/** In-process registry linking submitted tx hashes to SDK payment trace IDs. */
interface PaymentTraceRecord {
    paymentId: string;
    agentAddress: string;
    method: string;
    amount?: string;
    endpoint?: string;
    submittedAt: number;
    transactionHash?: string;
}
declare function createPaymentId(): string;
declare function registerPaymentTrace(record: PaymentTraceRecord): void;
declare function attachTransactionHash(paymentId: string, transactionHash: string): void;
declare function lookupPaymentIdByTxHash(txHash: string): string | undefined;
declare function getPaymentTrace(paymentId: string): PaymentTraceRecord | undefined;
/** Test helper — clears registries between tests. */
declare function clearPaymentTraceRegistry(): void;
declare function activePaymentTraceCount(): number;

interface TelemetryConfig {
    /** When false (default), all telemetry is no-op with zero overhead. */
    enabled?: boolean;
    /** Service name reported to exporters. */
    serviceName?: string;
    /** OTLP endpoint for traces and metrics (e.g. http://localhost:4318). */
    otlpEndpoint?: string;
    /** Custom logger sink — receives redacted records only. */
    logSink?: (record: LogRecord) => void;
    /** Minimum log level when a custom sink is configured. */
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    /** Inject tracers/metrics for tests. */
    tracer?: Tracer;
    metrics?: Metrics;
    logger?: Logger;
}
interface TelemetryContext {
    enabled: boolean;
    tracer: Tracer;
    metrics: Metrics;
    logger: Logger;
    network?: Network;
    agentAddress?: string;
}
declare function getTelemetry(): TelemetryContext;
declare function createTelemetry(config?: TelemetryConfig): TelemetryContext;
/**
 * Initialize global telemetry. When `enabled` is false, this is a no-op and
 * OpenTelemetry packages are never loaded.
 */
declare function initTelemetry(config?: TelemetryConfig & {
    network?: Network;
    agentAddress?: string;
}): Promise<TelemetryContext>;

/**
 * Shared Soroban build/simulate/sign/submit pipeline.
 *
 * Agent authorization and transaction sequencing are intentionally separate:
 * authorization entries are signed by `ctx.signer`, while an exclusive channel
 * lease supplies the envelope source/signature. This lets one logical agent use
 * many independent sequence streams without changing on-chain authorization.
 */

/**
 * A bound reference to `StellarAgent`'s private `invokeContract` method —
 * what every query/mutation helper calls through.
 */
type InvokeFn = (contractId: string, method: string, args: xdr.ScVal[], readOnly?: boolean) => Promise<{
    value: unknown;
    tx: TxResult;
}>;

/**
 * Groth16 solvency proofs: point encoding, and the two `PaymentChannel`
 * entrypoints that install a verifying key and check a proof against it.
 *
 * ## The wire format problem this module exists to solve
 *
 * Soroban and arkworks agree on the curve (BLS12-381) and disagree about
 * almost everything else. arkworks' `CanonicalSerialize` emits
 * little-endian, Montgomery-form bytes; Soroban follows the ZCash/IETF
 * convention — **uncompressed**, **big-endian** coordinates, with three flag
 * bits packed into the top of the first byte. Feeding arkworks' own bytes
 * straight to `env.crypto().bls12_381()` would produce a different (or
 * outright invalid) point, and the failure shows up as a `pairing_check` that
 * returns `false` for a proof that is in fact valid — the worst kind of
 * failure, because it is indistinguishable from a fraudulent proof.
 *
 * `zk/solvency_proof/src/soroban_encoding.rs` is the Rust side of this same
 * conversion, and its tests assert against the known-answer G1 generator
 * vector published in `soroban_sdk`'s own rustdoc. {@link SOROBAN_G1_GENERATOR}
 * below is that same vector, and {@link G1_POINT_SIZE} /
 * {@link G2_POINT_SIZE} are the same constants — keep the two in step.
 *
 * ## What the on-chain check actually asserts
 *
 * `PaymentChannel.verify_solvency_proof` folds the channel's **own** public
 * `limit_per_period` and `total_spent` into the Groth16 public-input term
 * and runs the pairing check. A valid proof therefore says: *some* ordering of
 * undisclosed payments into spend-limit periods never exceeded the limit, and
 * those payments sum to exactly the channel's recorded total. It says nothing
 * about who was paid, when, or in how many transactions — see
 * `docs/zk-solvency-design.md`.
 *
 * @module solvency
 */

/** Size of a BLS12-381 base-field element, in bytes. */
declare const FP_SIZE = 48;
/** Size of a compressed-free (uncompressed) G1 point: `be(X) || be(Y)`. */
declare const G1_POINT_SIZE: number;
/** Size of an Fp2 element: two base-field elements. */
declare const FP2_SIZE: number;
/** Size of an uncompressed G2 point: `be(X_c1) || be(X_c0) || be(Y_c1) || be(Y_c0)`. */
declare const G2_POINT_SIZE: number;
/** Size of a scalar field element, in bytes. */
declare const FR_SIZE = 32;
/** The `SolvencyVerifyingKey.gamma_abc_g1` length the contract enforces. */
declare const SOLVENCY_PUBLIC_INPUTS = 2;
declare const GAMMA_ABC_G1_SIZE: number;
/**
 * The known-answer BLS12-381 G1 generator, in Soroban's encoding.
 *
 * Lifted from `soroban_sdk::crypto::bls12_381`'s own rustdoc example for
 * `g1_add(zero, one)`. If this constant ever stops decoding to a well-formed
 * point, the SDK and the Rust crate have diverged and every proof the SDK
 * submits will be rejected on-chain for a reason that looks like a bad proof.
 */
declare const SOROBAN_G1_GENERATOR: string;
/** An uncompressed BLS12-381 G1 point, 96 bytes, as `BytesN<96>` reaches the wire. */
type SolvencyG1Point = Uint8Array;
/** An uncompressed BLS12-381 G2 point, 192 bytes. */
type SolvencyG2Point = Uint8Array;
/**
 * A Groth16 verifying key for the solvency circuit, in the same shape
 * `PaymentChannel.SolvencyVerifyingKey` decodes to.
 *
 * `gammaAbcG1` must hold exactly {@link GAMMA_ABC_G1_SIZE} points: the constant
 * term, then one per public input in circuit order (`limitPerPeriod`, then
 * `totalSpent`). The contract rejects any other length, so this is checked
 * here too — a bad key is otherwise only discoverable by spending a
 * transaction on a revert.
 */
interface SolvencyVerifyingKey {
    alphaG1: SolvencyG1Point;
    betaG2: SolvencyG2Point;
    gammaG2: SolvencyG2Point;
    deltaG2: SolvencyG2Point;
    gammaAbcG1: SolvencyG1Point[];
}
/** A Groth16 proof for the solvency circuit. */
interface SolvencyProof {
    a: SolvencyG1Point;
    b: SolvencyG2Point;
    c: SolvencyG1Point;
}
/** Validate a G1 point and return its bytes. */
declare function toSolvencyG1(value: Uint8Array | string, name?: string): SolvencyG1Point;
/** Validate a G2 point and return its bytes. */
declare function toSolvencyG2(value: Uint8Array | string, name?: string): SolvencyG2Point;
/** The BLS12-381 G1 generator, as the SDK encodes it. Useful as a test vector. */
declare function g1Generator(): SolvencyG1Point;
/** The G1 point at infinity, as the SDK encodes it. */
declare function g1Infinity(): SolvencyG1Point;
/** Encode a verifying key as the `SolvencyVerifyingKey` contract struct. */
declare function solvencyVerifyingKeyVal(vk: SolvencyVerifyingKey): xdr.ScVal;
/** Encode a proof as the `SolvencyProof` contract struct. */
declare function solvencyProofVal(proof: SolvencyProof): xdr.ScVal;
/**
 * Install (or rotate) the Groth16 verifying key used by
 * `PaymentChannel.verify_solvency_proof`.
 *
 * Admin-only, and the **first** caller to set a key becomes the admin for
 * every future rotation — mirroring `set_circuit_breaker`. A key set by
 * someone who is not the recorded admin reverts, and so does one whose
 * `gamma_abc_g1` is not exactly {@link GAMMA_ABC_G1_SIZE} long.
 */
declare function setSolvencyVk(invoke: InvokeFn, paymentChannel: string, address: string, vk: SolvencyVerifyingKey): Promise<TxResult>;
/**
 * Verify a Groth16 solvency proof against a channel's own
 * `limit_per_period` and `total_spent`.
 *
 * Read-only, and returns `false` rather than throwing for a proof that does
 * not verify — an invalid proof is the expected answer, not an error. It still
 * *throws* when no verifying key has been configured, because that is a
 * deployment gap rather than a statement about the proof.
 */
declare function verifySolvencyProof(invoke: InvokeFn, paymentChannel: string, channelId: bigint, proof: SolvencyProof): Promise<boolean>;

/**
 * A Groth16 verifying key for the solvency circuit (see
 * `zk/solvency_proof`), encoded as native BLS12-381 points so it can be
 * checked on-chain via `env.crypto().bls12_381().pairing_check`.
 * `gamma_abc_g1` must have exactly 3 entries: the constant term followed
 * by one entry per public input (`limit_per_period`, `total_spent`, in
 * that order), per the circuit's declared public inputs.
 */
interface RawSolvencyVerifyingKey {
    alpha_g1: Uint8Array;
    beta_g2: Uint8Array;
    delta_g2: Uint8Array;
    gamma_abc_g1: Uint8Array[];
    gamma_g2: Uint8Array;
}
declare function decodeSolvencyVerifyingKey(value: unknown): RawSolvencyVerifyingKey;
/** A Groth16 proof for the solvency circuit. */
interface RawSolvencyProof {
    a: Uint8Array;
    b: Uint8Array;
    c: Uint8Array;
}
declare function decodeSolvencyProof(value: unknown): RawSolvencyProof;

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
declare class StellarAgent {
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
    static create(config: StellarAgentConfig): Promise<StellarAgent>;
    /**
     * Restore an agent from an existing secret key.
     *
     * `options` forwards the rest of {@link StellarAgentConfig} — notably
     * `contracts` and `allowUnconfiguredContracts`, without which a restored
     * agent could only ever target contracts resolved from the environment.
     */
    static fromSecret(secretKey: string, network?: Network, options?: Omit<StellarAgentConfig, 'network' | 'secretKey'>): Promise<StellarAgent>;
    /**
     * The agent's Stellar public address.
     *
     * Resolved through the {@link Signer} at `create()` time, so this works
     * identically for a remote signer that never exposes its secret.
     */
    get address(): string;
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
    get secretKey(): string;
    /**
     * Whether this agent holds key material in-process.
     *
     * `false` for a remote or hardware signer. Useful for asserting a
     * production deployment is not running with an in-memory secret.
     */
    get holdsSecretKey(): boolean;
    /** Current channel utilization and queue/backpressure counters. */
    getFleetStats(): {
        channels?: ChannelPoolStats;
        submissions: SubmissionQueueStats;
    };
    /** Grow or reclaim the configured channel-account fleet. */
    resizeChannelPool(size: number): Promise<void>;
    /** Drain accepted submissions and reclaim agent-owned channel accounts. */
    shutdown(): Promise<void>;
    /** Register this wallet in the configured AgentWalletFactory contract. */
    createAgentWallet(name?: string): Promise<bigint>;
    /** Read and decode an agent registered in AgentWalletFactory. */
    getAgent(agentId: bigint): Promise<AgentInfo>;
    /**
     * Open a payment channel for this agent.
     * Deposits tokens and sets a per-period spend limit.
     *
     * @returns The channel ID
     */
    openChannel(params: OpenChannelParams): Promise<bigint>;
    /** Close a payment channel and return its remaining token balance. */
    closeChannel(channelId?: bigint | undefined): Promise<TxResult>;
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
    payForAPI(params: PayForAPIParams): Promise<TxResult>;
    /** Discover, score, and return the exact payment route before committing. */
    quote(params: QuoteParams): Promise<PaymentQuote>;
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
    requestWork(params: RequestWorkParams): Promise<bigint>;
    /**
     * Accept an open escrow job as a worker agent
     */
    acceptJob(jobId: bigint): Promise<TxResult>;
    /**
     * Submit work result for an escrow job
     */
    submitResult(jobId: bigint, result: string): Promise<TxResult>;
    /**
     * Release escrow payment to the worker after work is complete
     */
    releasePayment(jobId: bigint): Promise<TxResult>;
    /**
     * Configure rate limits for this agent on-chain.
     * Protects against runaway spending.
     */
    setRateLimits(config: RateLimitConfig): Promise<TxResult>;
    /**
     * Check if a payment would be blocked by rate limits (read-only)
     */
    checkRateLimit(amount: string): Promise<boolean>;
    /**
     * Get current XLM balance
     */
    getBalance(): Promise<string>;
    /**
     * Get spend report for the current period
     */
    getSpendReport(): Promise<SpendReport>;
    /**
     * Get info about a payment channel
     */
    getChannel(channelId: bigint): Promise<ChannelInfo>;
    /**
     * Get info about a job
     */
    getJob(jobId: bigint): Promise<JobInfo>;
    /**
     * Get current rate-limit usage alongside the configured limits.
     *
     * `RateLimiter.get_limits` is keyed by an arbitrary agent address, not
     * necessarily this agent's own — an owner monitoring several agents can
     * query any of them read-only through one signed-in `StellarAgent`.
     * Defaults to {@link StellarAgent.address} (checking this agent's own
     * limits) when omitted.
     */
    getRateLimitStatus(agentAddress?: string): Promise<RateLimitStatus>;
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
    getLedgerCloseEstimate(): Promise<LedgerCloseEstimate>;
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
    setSolvencyVk(vk: SolvencyVerifyingKey): Promise<TxResult>;
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
    verifySolvencyProof(channelId: bigint, proof: SolvencyProof): Promise<boolean>;
}

export { type AgentBid, type AgentEvent, type AgentInfo, type AmmHopQuote, type AmmPair, type AmmQuoteCallback, AmmRouteProvider, type AttestRankBidsOptions, type AttestedRanking, BPS_SCALE, type BidAttestation, type BidAttestationVerification, type BidWeights, type BlockReason, CONTRACT_KEYS, CallbackFeeStrategy, CallbackRouteProvider, type ChannelAccount, type ChannelAccountFactory, type ChannelAccountLease, ChannelAccountPool, type ChannelAccountPoolOptions, type ChannelInfo, type ChannelLeaseOutcome, ChannelPoolError, type ChannelPoolStats, type ChannelSpendState, CircuitBreaker, type CircuitBreakerOptions, type ContractAddresses, type ContractKey, ContractsNotDeployedError, DEFAULT_BID_WEIGHTS, DEFAULT_ROUTING_POLICY, DirectRouteProvider, FALLBACK_LEDGER_CLOSE_SECONDS, FP2_SIZE, FP_SIZE, FR_SIZE, type FeeBumpConfig, type FeeCallback, type FeeContext, type FeeDistribution, type FeePercentile, type FeePhase, type FeeStats, type FeeStrategy, FixedFeeStrategy, G1_POINT_SIZE, G2_POINT_SIZE, GAMMA_ABC_G1_SIZE, InMemoryMetrics, InMemoryTracer, type JobInfo, type JobStatus, KeypairSigner, LEDGERS_PER_CHANNEL_PERIOD, type LeaseOptions, type LedgerCloseEstimate, type LedgerCloseSample, type Logger, MetricNames, type Metrics, MultiplierFeeStrategy, type Network, type NetworkConfig, type OpenChannelParams, type OracleReference, type OtelBridgeOptions, type PathPaymentCandidate, type PathPaymentQuoteCallback, type PayForAPIParams, type PaymentPrediction, type PaymentQuote, type PaymentQuoteRequest, type PaymentTraceRecord, type PredictPaymentOutcomeParams, type PublicAddress, type QuoteParams, RATE_LIMIT_LEDGERS_PER_DAY, RATE_LIMIT_LEDGERS_PER_HOUR, ROUTING_WEIGHT_SCALE, type RateLimitConfig, type RateLimitSpendState, type RateLimitStatus, type RawSolvencyProof, type RawSolvencyVerifyingKey, RecentFeeStrategy, type RecentFeeStrategyOptions, type RecordedSpan, RedactingLogger, RemoteSigner, type RemoteSignerOptions, type RequestWorkParams, type RetryClassification, type RetryClassifier, type RouteDiscoveryFailure, type RouteDiscoveryOptions, type RouteDiscoveryResult, type RouteHop, RoutePlanner, type RoutePlannerOptions, type RoutePriceOracle, type RouteProvider, type RouteProviderContext, type RouteQuote, type RouteRequest, type RouteScoreBreakdown, type RouteUnavailableCode, RouteUnavailableError, type RouteVenue, type RoutingPolicy, SEMCONV_VERSION, SOLVENCY_PUBLIC_INPUTS, SOROBAN_G1_GENERATOR, STROOP_SCALE, type ScoredBid, type ScoredRoute, type ScorerKeyDirectory, type ScorerKeyRecord, SemConv, type Sep43Like, type SignAuthEntryOptions, type SignTransactionOptions, type Signer, SignerAdapter, SigningError, type SolvencyG1Point, type SolvencyG2Point, type SolvencyProof, type SolvencyVerifyingKey, SpanNames, type SpendLimit, type SpendPeriod, type SpendReport, type SponsorRpc, SponsorService, type SponsorServiceOptions, type SponsoredAccountOptions, SponsoredChannelAccountFactory, SponsorshipError, type SponsorshipRecord, StellarAgent, type StellarAgentConfig, StellarAgentError, type StellarAgentErrorCode, StellarPathPaymentProvider, type SubmissionPipelineConfig, SubmissionQueue, SubmissionQueueError, type SubmissionQueueOptions, type SubmissionQueueStats, type SubmitOptions, type TelemetryConfig, type TelemetryContext, type Tracer, type TxResult, UNCONFIGURED_CONTRACTS, type VerifyBidAttestationOptions, activePaymentTraceCount, add, applyOracleReference, asFeeStrategy, asPublicAddress, assertDeployed, attachTransactionHash, attestRankBids, bn, canonicalRouteId, clamp, classifySubmissionError, clearPaymentTraceRegistry, createOtelBridge, createPaymentId, createTelemetry, decodeSolvencyProof, decodeSolvencyVerifyingKey, discoverRoutes, div, envVarNames, eq, estimateLedgerCloseSeconds, estimateSecondsRemaining, fetchLedgerCloseEstimate, fmt, fromStroops, g1Generator, g1Infinity, getPaymentTrace, getTelemetry, gt, gte, initTelemetry, isDeployedAddress, isPositive, isRouteEligible, isSigner, isWindowExpired, isWithinSpendLimit, isZero, ledgersRemainingInWindow, lookupPaymentIdByTxHash, lt, lte, index as math, mul, noopLogger, noopMetrics, noopTracer, normalizeRoute, pct, predictPaymentOutcome, rankBids, rankRoutes, redactForExport, registerPaymentTrace, remainingBudget, resolveContracts, scoreBid, scoreRoute, selectBestBid, selectRoute, setSolvencyVk, solvencyProofVal, solvencyVerifyingKeyVal, sub, sumStrings, toSolvencyG1, toSolvencyG2, toStr, toStroops, validateRoutingPolicy, verifyBidAttestation, verifySolvencyProof };
