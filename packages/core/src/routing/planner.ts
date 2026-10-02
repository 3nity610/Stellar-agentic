import { StellarAgentError } from '../errors.js';
import { DEFAULT_ROUTING_POLICY, rankRoutes, scoreRoute } from '../math/routing.js';
import type { RoutingPolicy, ScoredRoute } from '../math/routing.js';
import { discoverRoutes } from './discovery.js';
import type {
  RouteDiscoveryFailure,
  RouteDiscoveryOptions,
  RouteQuote,
  RouteRequest,
} from './types.js';

const BPS = 10_000n;

export interface RoutePlannerOptions extends RouteDiscoveryOptions {
  policy?: RoutingPolicy;
  /** Maximum quote lifetime when venues provide no earlier expiry. @default 20 */
  quoteValidityLedgers?: number;
  /** Caller slippage used to derive the final minimum. @default 100 (1%) */
  defaultSlippageToleranceBps?: number;
}

export interface PaymentQuoteRequest extends RouteRequest {
  slippageToleranceBps?: number;
}

/** Complete pre-commit artifact. Pass this object back to `payForAPI`. */
export interface PaymentQuote {
  route: ScoredRoute;
  minimumDestinationAmount: string;
  quotedAtLedger: number;
  validUntilLedger: number;
  failures: RouteDiscoveryFailure[];
}

/** Discovery + deterministic selection + quote freshness in one reusable service. */
export class RoutePlanner {
  private readonly discovery: RouteDiscoveryOptions;
  private readonly policy: RoutingPolicy;
  private readonly quoteValidityLedgers: number;
  private readonly defaultSlippageToleranceBps: number;

  constructor(options: RoutePlannerOptions) {
    this.discovery = {
      providers: [...options.providers],
      ...(options.oracle ? { oracle: options.oracle } : {}),
      ...(options.maxHops !== undefined ? { maxHops: options.maxHops } : {}),
      ...(options.maxCandidates !== undefined ? { maxCandidates: options.maxCandidates } : {}),
    };
    this.policy = options.policy ?? DEFAULT_ROUTING_POLICY;
    this.quoteValidityLedgers = positiveInteger(
      options.quoteValidityLedgers ?? 20,
      'quoteValidityLedgers',
    );
    this.defaultSlippageToleranceBps = basisPoints(
      options.defaultSlippageToleranceBps ?? 100,
      'defaultSlippageToleranceBps',
    );
    rankRoutes([], this.policy);
  }

  async quote(request: PaymentQuoteRequest): Promise<PaymentQuote> {
    const quotedAtLedger = request.currentLedger ?? 0;
    const slippageToleranceBps = basisPoints(
      request.slippageToleranceBps ?? this.defaultSlippageToleranceBps,
      'slippageToleranceBps',
    );
    const discovery = await discoverRoutes(
      { ...request, currentLedger: quotedAtLedger },
      this.discovery,
    );
    const route = rankRoutes(discovery.routes, this.policy)[0];
    if (!route) {
      const detail = discovery.failures.length
        ? `: ${discovery.failures.map((failure) =>
          `${failure.providerId}/${failure.code}`).join(', ')}`
        : '';
      throw new StellarAgentError('NO_ROUTE', `No admissible payment route${detail}`);
    }
    return this.finishQuote(route, quotedAtLedger, slippageToleranceBps, discovery.failures);
  }

  /** Validate a caller-selected route under the same safety policy. */
  quoteOverride(request: PaymentQuoteRequest, override: RouteQuote): PaymentQuote {
    const quotedAtLedger = request.currentLedger ?? 0;
    if (override.sourceAsset !== request.sourceAsset ||
      override.destinationAsset !== request.destinationAsset ||
      override.sourceAmount !== request.sourceAmount) {
      throw new StellarAgentError(
        'INVALID_ROUTE_OVERRIDE',
        'Route override does not match the requested assets and source amount',
      );
    }
    if (override.expiresAtLedger !== undefined && override.expiresAtLedger < quotedAtLedger) {
      throw new StellarAgentError('QUOTE_EXPIRED', 'Route override quote has expired');
    }
    const slippageToleranceBps = basisPoints(
      request.slippageToleranceBps ?? this.defaultSlippageToleranceBps,
      'slippageToleranceBps',
    );
    try {
      return this.finishQuote(
        scoreRoute(override, this.policy),
        quotedAtLedger,
        slippageToleranceBps,
        [],
      );
    } catch (error) {
      if (error instanceof StellarAgentError) throw error;
      throw new StellarAgentError('INVALID_ROUTE_OVERRIDE', 'Route override failed safety validation', {
        cause: error,
      });
    }
  }

  assertFresh(quote: PaymentQuote, currentLedger: number): void {
    if (!Number.isInteger(currentLedger) || currentLedger < 0) {
      throw new StellarAgentError('INVALID_ARGUMENT', 'currentLedger must be a non-negative integer');
    }
    if (currentLedger > quote.validUntilLedger) {
      throw new StellarAgentError('QUOTE_EXPIRED', 'Payment route quote has expired');
    }
  }

  private finishQuote(
    route: ScoredRoute,
    quotedAtLedger: number,
    slippageToleranceBps: number,
    failures: RouteDiscoveryFailure[],
  ): PaymentQuote {
    const defaultExpiry = quotedAtLedger + this.quoteValidityLedgers;
    if (defaultExpiry > 0xffff_ffff) {
      throw new StellarAgentError('INVALID_ARGUMENT', 'Quote expiry exceeds u32 ledger range');
    }
    const validUntilLedger = Math.min(route.expiresAtLedger ?? defaultExpiry, defaultExpiry);
    const expected = BigInt(route.expectedDestinationAmount);
    const minimum = expected * (BPS - BigInt(slippageToleranceBps)) / BPS;
    return {
      route: { ...route, expiresAtLedger: validUntilLedger },
      minimumDestinationAmount: minimum.toString(),
      quotedAtLedger,
      validUntilLedger,
      failures: [...failures],
    };
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new StellarAgentError('INVALID_ARGUMENT', `${name} must be a positive integer`);
  }
  return value;
}

function basisPoints(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 500) {
    throw new StellarAgentError('INVALID_ARGUMENT', `${name} must be an integer from 0 to 500`);
  }
  return value;
}

