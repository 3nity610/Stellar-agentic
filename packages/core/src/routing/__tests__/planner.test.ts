import { describe, expect, it } from 'vitest';
import { StellarAgentError } from '../../errors.js';
import { CallbackRouteProvider, RoutePlanner } from '../index.js';
import type { RouteHop, RouteQuote } from '../index.js';

const request = {
  sourceAsset: 'XLM',
  destinationAsset: 'USDC',
  sourceAmount: '100000000',
  currentLedger: 100,
};

function hop(overrides: Partial<RouteHop> = {}): RouteHop {
  return {
    venue: 'amm',
    venueId: 'CAMM',
    sourceAsset: 'XLM',
    destinationAsset: 'USDC',
    sourceAmount: '100000000',
    expectedOutput: '20000000',
    feeAmount: '30000',
    feeBps: 30,
    slippageBps: 20,
    reliabilityBps: 9_500,
    ...overrides,
  };
}

function planner(hops: RouteHop[][] = [[hop()]]) {
  return new RoutePlanner({
    providers: [new CallbackRouteProvider('fixture', async () => hops)],
  });
}

describe('RoutePlanner', () => {
  it('returns route, cost, minimum, and expiry before payment', async () => {
    const quote = await planner().quote(request);
    expect(quote.route.id).toBe('XLM>amm:CAMM>USDC');
    expect(quote.route.totalFeeBps).toBe(30);
    expect(quote.route.expectedDestinationAmount).toBe('20000000');
    expect(quote.minimumDestinationAmount).toBe('19800000');
    expect(quote.quotedAtLedger).toBe(100);
    expect(quote.validUntilLedger).toBe(120);
    expect(quote.route.expiresAtLedger).toBe(120);
  });

  it('uses a venue expiry when earlier than the planner lifetime', async () => {
    const service = new RoutePlanner({
      providers: [new CallbackRouteProvider('fixture', async () => [[hop()]])],
      oracle: {
        id: 'oracle',
        quote: async () => ({
          expectedDestinationAmount: '20000000',
          reliabilityBps: 9_500,
          expiresAtLedger: 105,
        }),
      },
    });
    expect((await service.quote(request)).validUntilLedger).toBe(105);
  });

  it('selects deterministically rather than using provider order', async () => {
    const expensive = hop({ venueId: 'expensive', feeBps: 500 });
    const cheap = hop({ venueId: 'cheap', feeBps: 1 });
    expect((await planner([[expensive], [cheap]]).quote(request)).route.hops[0]!.venueId)
      .toBe('cheap');
  });

  it('surfaces provider diagnostics when no route remains', async () => {
    const service = new RoutePlanner({
      providers: [new CallbackRouteProvider('offline', async () => {
        throw new Error('timeout');
      })],
    });
    const error = await service.quote(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe('NO_ROUTE');
    expect(error.message).toContain('offline/VENUE_UNAVAILABLE');
  });

  it('reports no route for a healthy but empty venue set', async () => {
    const error = await planner([]).quote(request).catch((caught) => caught);
    expect(error.code).toBe('NO_ROUTE');
    expect(error.message).toBe('No admissible payment route');
  });

  it('supports zero and maximum contract-safe tolerances', async () => {
    expect((await planner().quote({ ...request, slippageToleranceBps: 0 }))
      .minimumDestinationAmount).toBe('20000000');
    expect((await planner().quote({ ...request, slippageToleranceBps: 500 }))
      .minimumDestinationAmount).toBe('19000000');
  });

  it('validates caller route overrides against intent and policy', () => {
    const service = planner();
    const override = normalized();
    expect(service.quoteOverride(request, override).route.id).toBe(override.id);
    expect(() => service.quoteOverride(request, { ...override, sourceAmount: '1' }))
      .toThrow(/does not match/);
    expect(() => service.quoteOverride(request, { ...override, reliabilityBps: 0 }))
      .toThrow(/safety validation/);
  });

  it('rejects expired overrides and stale reusable quotes', () => {
    const service = planner();
    expect(() => service.quoteOverride(request, { ...normalized(), expiresAtLedger: 99 }))
      .toThrow(/expired/);
    const quote = service.quoteOverride(request, normalized());
    expect(() => service.assertFresh(quote, 110)).not.toThrow();
    expect(() => service.assertFresh(quote, 111)).toThrow(/expired/);
  });

  it('validates ledgers, tolerances, lifetimes, and policy eagerly', async () => {
    expect(() => planner().assertFresh(planner().quoteOverride(request, normalized()), -1))
      .toThrow(/currentLedger/);
    await expect(planner().quote({ ...request, slippageToleranceBps: 501 }))
      .rejects.toThrow(/0 to 500/);
    expect(() => new RoutePlanner({ providers: [], quoteValidityLedgers: 0 }))
      .toThrow(/positive integer/);
    expect(() => new RoutePlanner({ providers: [], defaultSlippageToleranceBps: -1 }))
      .toThrow(/0 to 500/);
    expect(() => new RoutePlanner({
      providers: [],
      policy: {
        costWeight: 1,
        slippageWeight: 1,
        reliabilityWeight: 1,
        hopPenalty: 0,
        maxSlippageBps: 100,
        minReliabilityBps: 0,
      },
    })).toThrow(/weights must sum/);
  });

  it('rejects quote expiry beyond the u32 ledger range', async () => {
    await expect(planner().quote({ ...request, currentLedger: 0xffff_ffff }))
      .rejects.toThrow(/u32 ledger range/);
  });
});

function normalized(): RouteQuote {
  return {
    id: 'override',
    sourceAsset: 'XLM',
    destinationAsset: 'USDC',
    sourceAmount: '100000000',
    expectedDestinationAmount: '20000000',
    totalFeeBps: 30,
    expectedSlippageBps: 20,
    reliabilityBps: 9_500,
    hopCount: 1,
    hops: [hop()],
    expiresAtLedger: 110,
  };
}
