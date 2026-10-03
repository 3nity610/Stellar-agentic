import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BASE_FEE } from '@stellar/stellar-sdk';
import {
  FixedFeeStrategy,
  MultiplierFeeStrategy,
  CallbackFeeStrategy,
  RecentFeeStrategy,
  asFeeStrategy,
  type FeeContext,
  type FeeStats
} from '../feeStrategy.js';

const MOCK_STATS: FeeStats = {
  inclusionFee: {
    min: '100', mode: '100', p10: '100', p20: '100', p30: '100',
    p40: '100', p50: '150', p60: '150', p70: '150', p80: '200',
    p90: '250', p95: '300', p99: '400', max: '500',
  },
  sorobanInclusionFee: {
    min: '1000', mode: '1000', p10: '1000', p20: '1000', p30: '1000',
    p40: '1000', p50: '1500', p60: '1500', p70: '1500', p80: '2000',
    p90: '2500', p95: '3000', p99: '4000', max: '5000',
  },
  latestLedger: 12345,
};

function createMockContext(overrides?: Partial<FeeContext>): FeeContext {
  return {
    phase: 'initial',
    operationCount: 1,
    minimumFee: BASE_FEE,
    soroban: true,
    getFeeStats: vi.fn().mockResolvedValue(MOCK_STATS),
    ...overrides,
  };
}

describe('Fee Strategies', () => {
  describe('FixedFeeStrategy', () => {
    it('returns the exact configured fee', async () => {
      const strategy = new FixedFeeStrategy('5000');
      const ctx = createMockContext();
      expect(await strategy.getFee(ctx)).toBe('5000');
    });

    it('clamps to the protocol minimum fee', async () => {
      const strategy = new FixedFeeStrategy('50');
      const ctx = createMockContext({ minimumFee: '100' });
      expect(await strategy.getFee(ctx)).toBe('100');
    });
  });

  describe('MultiplierFeeStrategy', () => {
    it('multiplies the base strategy fee and applies a ceiling', async () => {
      const base = new FixedFeeStrategy('1000');
      const strategy = new MultiplierFeeStrategy(1.5, base);
      const ctx = createMockContext();
      expect(await strategy.getFee(ctx)).toBe('1500');
    });

    it('clamps the multiplied result to the context minimum', async () => {
      const base = new FixedFeeStrategy('1000');
      // base returns 1000. 1000 * 0.5 = 500. Clamped back up to the minimum of 800.
      const strategy = new MultiplierFeeStrategy(0.5, base);
      const ctx = createMockContext({ minimumFee: '800' });
      expect(await strategy.getFee(ctx)).toBe('800');
    });
  });

  describe('CallbackFeeStrategy', () => {
    it('evaluates the custom callback logic', async () => {
      const strategy = new CallbackFeeStrategy((ctx) => {
        return ctx.phase === 'fee_bump' ? 10000 : 2000;
      });
      const initialCtx = createMockContext({ phase: 'initial' });
      const bumpCtx = createMockContext({ phase: 'fee_bump' });
      
      expect(await strategy.getFee(initialCtx)).toBe('2000');
      expect(await strategy.getFee(bumpCtx)).toBe('10000');
    });
  });

  describe('RecentFeeStrategy', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('fetches soroban p90 fees and applies the default 1.1x multiplier', async () => {
      const strategy = new RecentFeeStrategy();
      const ctx = createMockContext();
      
      const fee = await strategy.getFee(ctx);
      // p90 soroban is 2500. 2500 * 1.1 = 2750
      expect(fee).toBe('2750');
      expect(ctx.getFeeStats).toHaveBeenCalledOnce();
    });

    it('fetches non-soroban fees when the context specifies soroban: false', async () => {
      const strategy = new RecentFeeStrategy({ percentile: 'p50', multiplier: 2.0 });
      const ctx = createMockContext({ soroban: false });
      
      const fee = await strategy.getFee(ctx);
      // p50 non-soroban is 150. 150 * 2.0 = 300
      expect(fee).toBe('300');
    });

    it('clamps to maximumFee during congestion', async () => {
      const strategy = new RecentFeeStrategy({ percentile: 'max', multiplier: 10.0, maximumFee: '10000' });
      const ctx = createMockContext();
      
      const fee = await strategy.getFee(ctx);
      // max soroban is 5000. 5000 * 10 = 50000. Clamped to 10000.
      expect(fee).toBe('10000');
    });

    it('falls back to the explicit fallbackFee if the RPC errors out', async () => {
      const strategy = new RecentFeeStrategy({ fallbackFee: '9999' });
      const ctx = createMockContext({
        getFeeStats: vi.fn().mockRejectedValue(new Error('RPC Down')),
      });
      
      const fee = await strategy.getFee(ctx);
      expect(fee).toBe('9999'); // Network failed, fallback preserved exactly without multiplier
    });

    it('caches the RPC response for the configured cache duration', async () => {
      const strategy = new RecentFeeStrategy({ cacheMs: 5000 });
      const ctx = createMockContext();
      
      await strategy.getFee(ctx);
      await strategy.getFee(ctx);
      expect(ctx.getFeeStats).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(5001);
      
      await strategy.getFee(ctx);
      expect(ctx.getFeeStats).toHaveBeenCalledTimes(2);
    });
  });

  describe('asFeeStrategy', () => {
    it('converts undefined to RecentFeeStrategy', () => {
      const strategy = asFeeStrategy(undefined);
      expect(strategy).toBeInstanceOf(RecentFeeStrategy);
    });

    it('converts a function to CallbackFeeStrategy', () => {
      const strategy = asFeeStrategy(() => 100);
      expect(strategy).toBeInstanceOf(CallbackFeeStrategy);
    });

    it('converts numbers and strings to FixedFeeStrategy', () => {
      expect(asFeeStrategy(5000)).toBeInstanceOf(FixedFeeStrategy);
      expect(asFeeStrategy('5000')).toBeInstanceOf(FixedFeeStrategy);
    });
  });
});