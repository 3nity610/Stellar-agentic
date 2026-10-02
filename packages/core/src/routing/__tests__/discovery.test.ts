import { describe, expect, it } from 'vitest';
import {
  AmmRouteProvider,
  CallbackRouteProvider,
  DirectRouteProvider,
  RouteUnavailableError,
  StellarPathPaymentProvider,
  applyOracleReference,
  canonicalRouteId,
  discoverRoutes,
  normalizeRoute,
} from '../index.js';
import type { AmmPair, RouteHop, RouteRequest } from '../index.js';

const BASE: RouteRequest = {
  sourceAsset: 'XLM',
  destinationAsset: 'USDC',
  sourceAmount: '100000000',
  currentLedger: 100,
  allowedIntermediates: ['AQUA', 'EURC'],
};

const PRICES: Record<string, bigint> = {
  'XLM/USDC': 20_000_000n,
  'XLM/AQUA': 200_000_000n,
  'AQUA/USDC': 10_100_000n,
  'XLM/EURC': 19_000_000n,
  'EURC/USDC': 10_000_000n,
};

function amm(pairs: AmmPair[] = Object.keys(PRICES).map((key) => {
  const [sourceAsset, destinationAsset] = key.split('/');
  return { sourceAsset: sourceAsset!, destinationAsset: destinationAsset! };
})) {
  return new AmmRouteProvider({
    venueId: 'CAMM',
    pairs,
    quote: async (pair, amount) => {
      const rate = PRICES[`${pair.sourceAsset}/${pair.destinationAsset}`];
      if (!rate) return null;
      return {
        expectedOutput: (BigInt(amount) * rate / 100_000_000n).toString(),
        feeAmount: '30000',
        feeBps: 30,
        slippageBps: pair.destinationAsset === 'AQUA' ? 20 : 10,
        reliabilityBps: 9_700,
      };
    },
  });
}

describe('route discovery', () => {
  it('returns the identity route only for matching assets', async () => {
    const result = await discoverRoutes(
      { ...BASE, destinationAsset: 'XLM' },
      { providers: [new DirectRouteProvider()] },
    );
    expect(result.failures).toEqual([]);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      id: 'XLM>direct:direct>XLM',
      expectedDestinationAmount: BASE.sourceAmount,
      totalFeeBps: 0,
      expectedSlippageBps: 0,
      reliabilityBps: 10_000,
    });
  });

  it('enumerates direct AMM and bounded multi-hop candidates', async () => {
    const result = await discoverRoutes(BASE, { providers: [amm()], maxHops: 3 });
    expect(result.routes.map((route) => route.hops.map((hop) => hop.destinationAsset)))
      .toEqual(expect.arrayContaining([
        ['USDC'],
        ['AQUA', 'USDC'],
        ['EURC', 'USDC'],
      ]));
    expect(result.routes.find((route) => route.hopCount === 2)).toMatchObject({
      expectedDestinationAmount: '20200000',
      totalFeeBps: 60,
      expectedSlippageBps: 30,
      reliabilityBps: 9_700,
    });
  });

  it('quotes classic path payments, including their economic depth', async () => {
    const provider = new StellarPathPaymentProvider({
      quote: async () => [{
        venueId: 'horizon:testnet',
        path: ['AQUA'],
        expectedDestinationAmount: '20300000',
        feeBps: 12,
        slippageBps: 15,
        reliabilityBps: 9_800,
      }],
    });
    const result = await discoverRoutes(BASE, { providers: [provider], maxHops: 2 });
    expect(result.routes[0]).toMatchObject({ hopCount: 2, expectedDestinationAmount: '20300000' });
    expect(result.routes[0]!.hops[0]!.path).toEqual(['AQUA']);
  });

  it('isolates an unavailable venue and retains successful quotes', async () => {
    const failed = new CallbackRouteProvider('offline', async () => {
      throw new RouteUnavailableError('VENUE_UNAVAILABLE', 'RPC timed out');
    });
    const result = await discoverRoutes(BASE, { providers: [failed, amm()] });
    expect(result.routes.length).toBe(3);
    expect(result.failures).toEqual([{
      providerId: 'offline',
      code: 'VENUE_UNAVAILABLE',
      message: 'RPC timed out',
    }]);
  });

  it('isolates one unavailable AMM pair while exploring the rest of its graph', async () => {
    const provider = new AmmRouteProvider({
      venueId: 'CAMM',
      pairs: [
        { sourceAsset: 'XLM', destinationAsset: 'AQUA' },
        { sourceAsset: 'XLM', destinationAsset: 'USDC' },
        { sourceAsset: 'AQUA', destinationAsset: 'USDC' },
      ],
      quote: async (pair, amount) => {
        if (pair.destinationAsset === 'AQUA') throw new Error('pool paused');
        return { expectedOutput: amount };
      },
    });
    const result = await discoverRoutes(BASE, { providers: [provider] });
    expect(result.routes.map((route) => route.hops.length)).toEqual([1]);
  });

  it('uses the oracle as a reference rather than as executable liquidity', async () => {
    const result = await discoverRoutes(BASE, {
      providers: [amm()],
      oracle: {
        id: 'oracle',
        quote: async () => ({
          expectedDestinationAmount: '20500000',
          reliabilityBps: 9_400,
          expiresAtLedger: 120,
        }),
      },
    });
    const directAmm = result.routes.find((route) => route.hops.length === 1)!;
    expect(directAmm.expectedSlippageBps).toBe(243);
    expect(directAmm.reliabilityBps).toBe(9_400);
    expect(directAmm.expiresAtLedger).toBe(120);
    expect(result.routes.every((route) => route.hops.every((hop) => hop.venue !== ('oracle' as never))))
      .toBe(true);
  });

  it('keeps routes when the independent oracle is unavailable', async () => {
    const result = await discoverRoutes(BASE, {
      providers: [amm()],
      oracle: { id: 'oracle', quote: async () => { throw new Error('stale feed'); } },
    });
    expect(result.routes.length).toBe(3);
    expect(result.failures).toEqual([{
      providerId: 'oracle',
      code: 'VENUE_UNAVAILABLE',
      message: 'stale feed',
    }]);
  });

  it('does not return expired routes', async () => {
    const hop = validHop();
    const provider = new CallbackRouteProvider('expired', async () => [[hop]]);
    const result = await discoverRoutes(BASE, {
      providers: [provider],
      oracle: {
        id: 'old-oracle',
        quote: async () => ({
          expectedDestinationAmount: hop.expectedOutput,
          reliabilityBps: 10_000,
          expiresAtLedger: 99,
        }),
      },
    });
    expect(result.routes).toEqual([]);
  });

  it('bounds candidate count in canonical order', async () => {
    const providers = ['z', 'a', 'm'].map((id) => new CallbackRouteProvider(id, async () => [[
      { ...validHop(), venueId: id },
    ]]));
    const result = await discoverRoutes(BASE, { providers, maxCandidates: 2 });
    expect(result.routes.map((route) => route.hops[0]!.venueId)).toEqual(['a', 'm']);
  });

  it('deduplicates equal canonical routes using deterministic quote quality', async () => {
    const worse = new CallbackRouteProvider('worse', async () => [[validHop('190000000')]]);
    const better = new CallbackRouteProvider('better', async () => [[validHop('200000000')]]);
    const result = await discoverRoutes(BASE, { providers: [worse, better] });
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.expectedDestinationAmount).toBe('200000000');
  });
});

describe('route normalization guards', () => {
  it('rejects amount discontinuity', () => {
    expect(() => normalizeRoute(BASE, [
      { ...validHop('500'), destinationAsset: 'AQUA' },
      { ...validHop('600'), sourceAsset: 'AQUA', sourceAmount: '499' },
    ], 3)).toThrow(/amount is discontinuous/);
  });

  it('rejects asset discontinuity', () => {
    expect(() => normalizeRoute(BASE, [
      { ...validHop('500'), destinationAsset: 'AQUA' },
      { ...validHop('600'), sourceAsset: 'EURC', sourceAmount: '500' },
    ], 3)).toThrow(/route is discontinuous/);
  });

  it('rejects cycles', () => {
    expect(() => normalizeRoute(
      { ...BASE, destinationAsset: 'XLM' },
      [
        { ...validHop('500'), destinationAsset: 'AQUA' },
        {
          ...validHop('600'),
          sourceAsset: 'AQUA',
          sourceAmount: '500',
          destinationAsset: 'XLM',
        },
      ],
      3,
    )).toThrow(/asset cycle/);
  });

  it('rejects disallowed intermediates', () => {
    expect(() => normalizeRoute(BASE, [
      { ...validHop('500'), destinationAsset: 'BTC' },
      { ...validHop('600'), sourceAsset: 'BTC', sourceAmount: '500' },
    ], 3)).toThrow(/disallowed intermediate/);
  });

  it('rejects malformed base-unit amounts and basis points', () => {
    expect(() => normalizeRoute(BASE, [{ ...validHop(), feeAmount: '1.2' }], 3))
      .toThrow(/canonical integer/);
    expect(() => normalizeRoute(BASE, [{ ...validHop(), feeBps: 10_001 }], 3))
      .toThrow(/0 to 10000/);
  });

  it('rejects invalid request and bound values', async () => {
    await expect(discoverRoutes({ ...BASE, sourceAmount: '0' }, { providers: [amm()] }))
      .rejects.toThrow(/positive/);
    await expect(discoverRoutes(BASE, { providers: [amm()], maxHops: 0 }))
      .rejects.toThrow(/maxHops must be a positive integer/);
    await expect(discoverRoutes(
      { ...BASE, allowedIntermediates: ['AQUA', 'AQUA'] },
      { providers: [amm()] },
    )).rejects.toThrow(/contains duplicates/);
  });

  it('creates an escaped stable canonical identifier', () => {
    const route = [{ ...validHop(), venueId: 'pool/one', path: ['A B'] }];
    expect(canonicalRouteId(route)).toBe('XLM>amm:pool~2Fone(A~20B)>USDC');
  });

  it('never reduces provider-declared slippage when applying oracle data', () => {
    const route = normalizeRoute(BASE, [{ ...validHop(), slippageBps: 500 }], 3);
    expect(applyOracleReference(route, {
      expectedDestinationAmount: route.expectedDestinationAmount,
      reliabilityBps: 10_000,
    }).expectedSlippageBps).toBe(500);
  });
});

function validHop(expectedOutput = '200000000'): RouteHop {
  return {
    venue: 'amm',
    venueId: 'CAMM',
    sourceAsset: 'XLM',
    destinationAsset: 'USDC',
    sourceAmount: BASE.sourceAmount,
    expectedOutput,
    feeAmount: '30000',
    feeBps: 30,
    slippageBps: 10,
    reliabilityBps: 9_700,
  };
}
