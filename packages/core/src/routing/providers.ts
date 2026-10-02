import { RouteUnavailableError } from './discovery.js';
import type {
  AmmPair,
  AmmQuoteCallback,
  PathPaymentQuoteCallback,
  RouteHop,
  RouteProvider,
  RouteProviderContext,
  RouteRequest,
} from './types.js';

/** Same-asset candidate. It performs no conversion and charges no fee. */
export class DirectRouteProvider implements RouteProvider {
  readonly id = 'direct';

  async discover(request: RouteRequest): Promise<RouteHop[][]> {
    if (request.sourceAsset !== request.destinationAsset) return [];
    return [[{
      venue: 'direct',
      venueId: 'direct',
      sourceAsset: request.sourceAsset,
      destinationAsset: request.destinationAsset,
      sourceAmount: request.sourceAmount,
      expectedOutput: request.sourceAmount,
      feeAmount: '0',
      feeBps: 0,
      slippageBps: 0,
      reliabilityBps: 10_000,
      minOutput: request.sourceAmount,
    }]];
  }
}

export interface AmmRouteProviderOptions {
  id?: string;
  /** Execution contract or other stable venue identifier. */
  venueId: string;
  pairs: AmmPair[];
  quote: AmmQuoteCallback;
}

/** Bounded graph discovery over one AMM/aggregator adapter. */
export class AmmRouteProvider implements RouteProvider {
  readonly id: string;
  private readonly venueId: string;
  private readonly pairs: AmmPair[];
  private readonly quoteHop: AmmQuoteCallback;

  constructor(options: AmmRouteProviderOptions) {
    this.id = options.id ?? `amm:${options.venueId}`;
    this.venueId = options.venueId;
    this.pairs = [...options.pairs].sort((a, b) =>
      compareUtf8(pairKey(a), pairKey(b)));
    this.quoteHop = options.quote;
  }

  async discover(
    request: RouteRequest,
    context: RouteProviderContext,
  ): Promise<RouteHop[][]> {
    if (request.sourceAsset === request.destinationAsset) return [];
    const allowed = new Set(request.allowedIntermediates ?? []);
    const routes: RouteHop[][] = [];

    const walk = async (
      asset: string,
      amount: string,
      hops: RouteHop[],
      visited: Set<string>,
    ): Promise<void> => {
      if (routes.length >= context.maxCandidates || hops.length >= context.maxHops) return;
      const outgoing = this.pairs.filter((pair) => pair.sourceAsset === asset);
      for (const pair of outgoing) {
        if (visited.has(pair.destinationAsset)) continue;
        const isDestination = pair.destinationAsset === request.destinationAsset;
        if (!isDestination && request.allowedIntermediates && !allowed.has(pair.destinationAsset)) {
          continue;
        }
        let quote;
        try {
          quote = await this.quoteHop(pair, amount);
        } catch {
          // One pool can be unavailable while other pairs at this venue work.
          continue;
        }
        if (!quote) continue;
        const hop: RouteHop = {
          venue: 'amm',
          venueId: this.venueId,
          sourceAsset: pair.sourceAsset,
          destinationAsset: pair.destinationAsset,
          sourceAmount: amount,
          expectedOutput: quote.expectedOutput,
          feeAmount: quote.feeAmount ?? '0',
          feeBps: quote.feeBps ?? 0,
          slippageBps: quote.slippageBps ?? 0,
          reliabilityBps: quote.reliabilityBps ?? 9_500,
          ...(quote.minOutput !== undefined ? { minOutput: quote.minOutput } : {}),
        };
        const next = [...hops, hop];
        if (isDestination) {
          routes.push(next);
          if (routes.length >= context.maxCandidates) return;
        } else {
          await walk(
            pair.destinationAsset,
            quote.expectedOutput,
            next,
            new Set([...visited, pair.destinationAsset]),
          );
        }
      }
    };

    await walk(
      request.sourceAsset,
      request.sourceAmount,
      [],
      new Set([request.sourceAsset]),
    );
    return routes;
  }
}

export interface StellarPathPaymentProviderOptions {
  id?: string;
  quote: PathPaymentQuoteCallback;
}

/** Adapter around Horizon strict-send path discovery or a compatible service. */
export class StellarPathPaymentProvider implements RouteProvider {
  readonly id: string;
  private readonly quotePaths: PathPaymentQuoteCallback;

  constructor(options: StellarPathPaymentProviderOptions) {
    this.id = options.id ?? 'stellar-path-payment';
    this.quotePaths = options.quote;
  }

  async discover(
    request: RouteRequest,
    context: RouteProviderContext,
  ): Promise<RouteHop[][]> {
    if (request.sourceAsset === request.destinationAsset) return [];
    const candidates = await this.quotePaths(request);
    return candidates
      .filter((candidate) => candidate.path.length + 1 <= context.maxHops)
      .slice(0, context.maxCandidates)
      .map((candidate) => [{
        venue: 'path_payment' as const,
        venueId: candidate.venueId,
        sourceAsset: request.sourceAsset,
        destinationAsset: request.destinationAsset,
        sourceAmount: request.sourceAmount,
        expectedOutput: candidate.expectedDestinationAmount,
        feeAmount: candidate.feeAmount ?? '0',
        feeBps: candidate.feeBps ?? 0,
        slippageBps: candidate.slippageBps ?? 0,
        reliabilityBps: candidate.reliabilityBps ?? 9_000,
        path: [...candidate.path],
        ...(candidate.minDestinationAmount !== undefined
          ? { minOutput: candidate.minDestinationAmount }
          : {}),
      }]);
  }
}

/** Small fixture/application adapter for a custom venue implementation. */
export class CallbackRouteProvider implements RouteProvider {
  readonly id: string;
  private readonly callback: RouteProvider['discover'];

  constructor(id: string, callback: RouteProvider['discover']) {
    if (!id.trim()) throw new RouteUnavailableError('INVALID_QUOTE', 'provider id is required');
    this.id = id;
    this.callback = callback;
  }

  discover(request: RouteRequest, context: RouteProviderContext): Promise<RouteHop[][]> {
    return this.callback(request, context);
  }
}

function pairKey(pair: AmmPair): string {
  return `${pair.sourceAsset}\u0000${pair.destinationAsset}`;
}

function compareUtf8(a: string, b: string): number {
  if (a === b) return 0;
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index]! < right[index]! ? -1 : 1;
  }
  return left.length < right.length ? -1 : 1;
}
