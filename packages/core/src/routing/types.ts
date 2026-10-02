/** Canonical, venue-neutral routing types. Amounts are integer base units. */

export type RouteVenue = 'direct' | 'amm' | 'path_payment';

export type RouteUnavailableCode =
  | 'UNSUPPORTED_PAIR'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'VENUE_UNAVAILABLE'
  | 'QUOTE_EXPIRED'
  | 'INVALID_QUOTE';

/** One executable segment of a candidate route. */
export interface RouteHop {
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
export interface RouteQuote {
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

export interface RouteRequest {
  sourceAsset: string;
  destinationAsset: string;
  /** Integer base units, not a decimal display amount. */
  sourceAmount: string;
  currentLedger?: number;
  /** Assets that bounded multi-hop discovery may traverse. */
  allowedIntermediates?: string[];
}

export interface RouteProviderContext {
  maxHops: number;
  maxCandidates: number;
}

/** Venue adapter. Provider failures are isolated by the discovery engine. */
export interface RouteProvider {
  readonly id: string;
  discover(request: RouteRequest, context: RouteProviderContext): Promise<RouteHop[][]>;
}

/** Optional independent fair-value source; never treated as executable liquidity. */
export interface RoutePriceOracle {
  readonly id: string;
  quote(request: RouteRequest): Promise<OracleReference | null>;
}

export interface OracleReference {
  expectedDestinationAmount: string;
  reliabilityBps: number;
  expiresAtLedger?: number;
}

export interface RouteDiscoveryOptions {
  providers: RouteProvider[];
  oracle?: RoutePriceOracle;
  /** @default 3 */
  maxHops?: number;
  /** @default 32 */
  maxCandidates?: number;
}

export interface RouteDiscoveryFailure {
  providerId: string;
  code: RouteUnavailableCode;
  message: string;
}

export interface RouteDiscoveryResult {
  routes: RouteQuote[];
  failures: RouteDiscoveryFailure[];
  oracleReference?: OracleReference;
}

export interface AmmPair {
  sourceAsset: string;
  destinationAsset: string;
}

export interface AmmHopQuote {
  expectedOutput: string;
  feeAmount?: string;
  feeBps?: number;
  slippageBps?: number;
  reliabilityBps?: number;
  minOutput?: string;
}

export type AmmQuoteCallback = (
  pair: AmmPair,
  sourceAmount: string,
) => Promise<AmmHopQuote | null>;

export interface PathPaymentCandidate {
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

export type PathPaymentQuoteCallback = (
  request: RouteRequest,
) => Promise<PathPaymentCandidate[]>;

