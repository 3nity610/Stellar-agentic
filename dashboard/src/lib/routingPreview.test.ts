import { describe, expect, it } from 'vitest';
import type { RouteQuote } from '@stellaragent/core';
import {
  buildPaymentPreview,
  dashboardRouteCandidates,
  displayBaseUnits,
  displayBasisPoints,
  formatRoutePath,
} from './routingPreview.js';

describe('dashboard routing preview', () => {
  it('selects through the shared deterministic core selector', () => {
    const candidates = dashboardRouteCandidates('XLM', 'USDC', '25');
    const preview = buildPaymentPreview(candidates);

    expect(preview?.route.id).toBe('XLM>USDC|amm-direct');
    expect(preview?.route.score).toBe('81');
    expect(preview?.minimumDestinationAmount).toBe('246757500');
    expect(preview?.validUntilLedger).toBe(12_360);
  });

  it('is independent of candidate input order', () => {
    const candidates = dashboardRouteCandidates('XLM', 'USDC', '25');
    const forward = buildPaymentPreview(candidates);
    const reverse = buildPaymentPreview([...candidates].reverse());
    expect(reverse).toEqual(forward);
  });

  it('builds a zero-cost direct route for the same asset', () => {
    const preview = buildPaymentPreview(dashboardRouteCandidates('USDC', 'USDC', '1.5'));
    expect(preview?.route.hops[0]?.venue).toBe('direct');
    expect(preview?.route.expectedDestinationAmount).toBe('15000000');
    expect(preview?.route.totalFeeBps).toBe(0);
  });

  it('returns null when every venue is unavailable', () => {
    expect(buildPaymentPreview([])).toBeNull();
  });

  it('rejects unsafe slippage tolerances and non-positive amounts', () => {
    expect(() => buildPaymentPreview([], 501)).toThrow(/0 to 500/);
    expect(() => dashboardRouteCandidates('XLM', 'USDC', '0')).toThrow(/greater than zero/);
  });

  it('formats path details and exact monetary values', () => {
    const path = dashboardRouteCandidates('XLM', 'USDC', '1')[1] as RouteQuote;
    expect(formatRoutePath(path)).toBe('XLM  →  Stellar path · USDC');
    expect(displayBaseUnits('12345678')).toBe('1.2345678');
    expect(displayBasisPoints(30)).toBe('0.30%');
    expect(displayBasisPoints(1_005)).toBe('10.05%');
  });
});
