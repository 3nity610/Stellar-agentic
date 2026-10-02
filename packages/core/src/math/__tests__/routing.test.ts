import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTING_POLICY,
  isRouteEligible,
  rankRoutes,
  scoreRoute,
  selectRoute,
  validateRoutingPolicy,
} from '../routing.js';
import type { RouteQuote } from '../../routing/types.js';

function route(overrides: Partial<RouteQuote> = {}): RouteQuote {
  const id = overrides.id ?? 'XLM>amm:pool>USDC';
  return {
    id,
    sourceAsset: 'XLM',
    destinationAsset: 'USDC',
    sourceAmount: '100000000',
    expectedDestinationAmount: '20000000',
    totalFeeBps: 30,
    expectedSlippageBps: 20,
    reliabilityBps: 9_500,
    hopCount: 1,
    hops: [{
      venue: 'amm',
      venueId: id,
      sourceAsset: 'XLM',
      destinationAsset: 'USDC',
      sourceAmount: '100000000',
      expectedOutput: overrides.expectedDestinationAmount ?? '20000000',
      feeAmount: '300000',
      feeBps: 30,
      slippageBps: 20,
      reliabilityBps: 9_500,
    }],
    ...overrides,
  };
}

describe('scoreRoute', () => {
  it('uses integer weighted cost, slippage, reliability, and hop penalties', () => {
    const scored = scoreRoute(route({ hopCount: 3 }));
    expect(scored.score).toBe('131');
    expect(scored.breakdown).toEqual({
      weightedCost: '15',
      weightedSlippage: '6',
      weightedReliability: '100',
      hopPenalty: '10',
    });
  });

  it('truncates every weighted component using integer division', () => {
    const scored = scoreRoute(route({
      totalFeeBps: 1,
      expectedSlippageBps: 1,
      reliabilityBps: 9_999,
    }), {
      ...DEFAULT_ROUTING_POLICY,
      costWeight: 3_333,
      slippageWeight: 3_333,
      reliabilityWeight: 3_334,
      hopPenalty: 0,
    });
    expect(scored.score).toBe('0');
    expect(scored.breakdown).toEqual({
      weightedCost: '0',
      weightedSlippage: '0',
      weightedReliability: '0',
      hopPenalty: '0',
    });
  });

  it('rejects an otherwise valid route outside policy bounds', () => {
    expect(() => scoreRoute(route({ expectedSlippageBps: 1_001 })))
      .toThrow(/outside routing policy bounds/);
  });
});

describe('rankRoutes', () => {
  it('selects the lowest composite score', () => {
    const cheap = route({ id: 'cheap', totalFeeBps: 1, reliabilityBps: 9_900 });
    const expensive = route({ id: 'expensive', totalFeeBps: 500, reliabilityBps: 9_900 });
    expect(selectRoute([expensive, cheap])!.id).toBe('cheap');
  });

  it('breaks an exact score tie by larger destination output', () => {
    const low = route({ id: 'low', expectedDestinationAmount: '19999999' });
    const high = route({ id: 'high', expectedDestinationAmount: '20000001' });
    expect(rankRoutes([low, high]).map((entry) => entry.id)).toEqual(['high', 'low']);
  });

  it('then breaks ties by lower slippage', () => {
    const policy = {
      ...DEFAULT_ROUTING_POLICY,
      costWeight: 10_000,
      slippageWeight: 0,
      reliabilityWeight: 0,
    };
    const high = route({ id: 'high', expectedSlippageBps: 100 });
    const low = route({ id: 'low', expectedSlippageBps: 10 });
    expect(rankRoutes([high, low], policy).map((entry) => entry.id)).toEqual(['low', 'high']);
  });

  it('then breaks ties by fewer hops when hop penalty is disabled', () => {
    const policy = { ...DEFAULT_ROUTING_POLICY, hopPenalty: 0 };
    const long = route({ id: 'long', hopCount: 3 });
    const short = route({ id: 'short', hopCount: 1 });
    expect(rankRoutes([long, short], policy).map((entry) => entry.id)).toEqual(['short', 'long']);
  });

  it('finally breaks ties by binary canonical ID', () => {
    const upper = route({ id: 'Z-route' });
    const lower = route({ id: 'a-route' });
    expect(rankRoutes([lower, upper]).map((entry) => entry.id)).toEqual(['Z-route', 'a-route']);
  });

  it('uses UTF-8 byte order for non-BMP IDs exactly like Python', () => {
    const privateUse = route({ id: '\uE000-route' });
    const astral = route({ id: '\u{10000}-route' });
    expect(rankRoutes([astral, privateUse]).map((entry) => entry.id))
      .toEqual(['\uE000-route', '\u{10000}-route']);
  });

  it('orders an ID before its longer UTF-8 prefix extension in either input order', () => {
    const prefix = route({ id: 'route' });
    const extension = route({ id: 'route/long' });
    expect(rankRoutes([extension, prefix]).map((entry) => entry.id))
      .toEqual(['route', 'route/long']);
    expect(rankRoutes([prefix, extension]).map((entry) => entry.id))
      .toEqual(['route', 'route/long']);
  });

  it('returns equal duplicate IDs without comparator instability', () => {
    const first = route({ id: 'same' });
    const second = route({ id: 'same' });
    expect(rankRoutes([first, second]).map((entry) => entry.id)).toEqual(['same', 'same']);
  });

  it('is invariant to input order', () => {
    const pool = [
      route({ id: 'c', totalFeeBps: 50 }),
      route({ id: 'a', totalFeeBps: 10 }),
      route({ id: 'b', totalFeeBps: 30 }),
    ];
    expect(rankRoutes(pool).map((entry) => entry.id))
      .toEqual(rankRoutes([...pool].reverse()).map((entry) => entry.id));
  });

  it('filters routes outside either admission bound', () => {
    const valid = route({ id: 'valid' });
    const unreliable = route({ id: 'unreliable', reliabilityBps: 4_999 });
    const slippery = route({ id: 'slippery', expectedSlippageBps: 1_001 });
    expect(rankRoutes([unreliable, valid, slippery]).map((entry) => entry.id)).toEqual(['valid']);
    expect(isRouteEligible(unreliable)).toBe(false);
    expect(isRouteEligible(slippery)).toBe(false);
    expect(isRouteEligible(valid)).toBe(true);
  });

  it('returns null when the route set is empty or inadmissible', () => {
    expect(selectRoute([])).toBeNull();
    expect(selectRoute([route({ reliabilityBps: 0 })])).toBeNull();
  });

  it('scores values larger than Number.MAX_SAFE_INTEGER without precision loss', () => {
    const huge = route({ expectedDestinationAmount: '170141183460469231731687303715884105727' });
    const almost = route({
      id: 'almost',
      expectedDestinationAmount: '170141183460469231731687303715884105726',
    });
    expect(rankRoutes([almost, huge])[0]!.expectedDestinationAmount)
      .toBe('170141183460469231731687303715884105727');
  });
});

describe('validation', () => {
  it('accepts the documented default policy', () => {
    expect(() => validateRoutingPolicy(DEFAULT_ROUTING_POLICY)).not.toThrow();
  });

  it.each([
    ['negative', { ...DEFAULT_ROUTING_POLICY, hopPenalty: -1 }, /non-negative safe integer/],
    ['fractional', { ...DEFAULT_ROUTING_POLICY, hopPenalty: 0.5 }, /non-negative safe integer/],
    ['unsafe', { ...DEFAULT_ROUTING_POLICY, hopPenalty: Number.MAX_VALUE }, /safe integer/],
    ['weights', { ...DEFAULT_ROUTING_POLICY, costWeight: 4_999 }, /weights must sum/],
    ['slippage bound', { ...DEFAULT_ROUTING_POLICY, maxSlippageBps: 10_001 }, /must not exceed/],
    ['reliability bound', { ...DEFAULT_ROUTING_POLICY, minReliabilityBps: 10_001 }, /must not exceed/],
  ] as const)('rejects an invalid %s policy', (_name, policy, expected) => {
    expect(() => validateRoutingPolicy(policy)).toThrow(expected);
  });

  it.each([
    ['id', { id: '' }, /route id is required/],
    ['source zero', { sourceAmount: '0' }, /positive canonical integers/],
    ['source leading zero', { sourceAmount: '01' }, /positive canonical integers/],
    ['output decimal', { expectedDestinationAmount: '1.1' }, /positive canonical integers/],
    ['fee bps', { totalFeeBps: -1 }, /totalFeeBps/],
    ['slippage bps', { expectedSlippageBps: 10_001 }, /expectedSlippageBps/],
    ['reliability bps', { reliabilityBps: 1.5 }, /reliabilityBps/],
    ['hop count zero', { hopCount: 0 }, /hopCount/],
    ['hop count fraction', { hopCount: 1.5 }, /hopCount/],
  ] as const)('rejects invalid route %s', (_name, override, expected) => {
    expect(() => rankRoutes([route(override)])).toThrow(expected);
  });
});
