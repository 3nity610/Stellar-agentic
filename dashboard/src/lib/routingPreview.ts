import {
  fromStroops,
  selectRoute,
  toStroops,
  type PaymentQuote,
  type RouteHop,
  type RouteQuote,
} from '@stellaragent/core';

const BPS = 10_000n;
const PREVIEW_LEDGER = 12_340;

/** Produce the same pre-commit artifact that the SDK quote() surface returns. */
export function buildPaymentPreview(
  routes: readonly RouteQuote[],
  slippageToleranceBps = 100,
  quotedAtLedger = PREVIEW_LEDGER,
): PaymentQuote | null {
  if (!Number.isInteger(slippageToleranceBps) ||
    slippageToleranceBps < 0 || slippageToleranceBps > 500) {
    throw new RangeError('slippageToleranceBps must be an integer from 0 to 500');
  }
  const route = selectRoute(routes);
  if (!route) return null;
  const routeExpiry = route.expiresAtLedger ?? quotedAtLedger + 20;
  const validUntilLedger = Math.min(routeExpiry, quotedAtLedger + 20);
  const minimum = BigInt(route.expectedDestinationAmount) *
    (BPS - BigInt(slippageToleranceBps)) / BPS;
  return {
    route: { ...route, expiresAtLedger: validUntilLedger },
    minimumDestinationAmount: minimum.toString(),
    quotedAtLedger,
    validUntilLedger,
    failures: [],
  };
}

/**
 * Browser fixture for the dashboard preview. Production callers supply live
 * quotes from RoutePlanner; keeping these normalized candidates here ensures
 * the UI exercises the production selector rather than duplicating it.
 */
export function dashboardRouteCandidates(
  sourceAsset: string,
  destinationAsset: string,
  decimalAmount: string,
): RouteQuote[] {
  const sourceAmount = toStroops(decimalAmount);
  if (sourceAmount <= 0n) throw new RangeError('amount must be greater than zero');

  if (sourceAsset === destinationAsset) {
    const hop = routeHop(
      'direct',
      'stellar-direct',
      sourceAsset,
      destinationAsset,
      sourceAmount,
      sourceAmount,
      0,
      0,
      10_000,
    );
    return [routeQuote('direct', [hop], 0, 0, 10_000, 1)];
  }

  const ammOutput = ratio(sourceAmount, 9_970);
  const pathOutput = ratio(sourceAmount, 9_980);
  const intermediateOutput = ratio(sourceAmount, 9_985);
  const multiOutput = ratio(intermediateOutput, 9_985);
  const amm = routeHop(
    'amm', 'amm-primary', sourceAsset, destinationAsset,
    sourceAmount, ammOutput, 30, 20, 9_700,
  );
  const path = routeHop(
    'path_payment', 'stellar-path', sourceAsset, destinationAsset,
    sourceAmount, pathOutput, 10, 15, 9_300, [intermediateAsset(sourceAsset, destinationAsset)],
  );
  const first = routeHop(
    'amm', 'amm-deep-a', sourceAsset, intermediateAsset(sourceAsset, destinationAsset),
    sourceAmount, intermediateOutput, 20, 5, 9_650,
  );
  const second = routeHop(
    'amm', 'amm-deep-b', first.destinationAsset, destinationAsset,
    intermediateOutput, multiOutput, 20, 5, 9_650,
  );

  return [
    routeQuote('amm-direct', [amm], 30, 20, 9_700, 1),
    routeQuote('stellar-path', [path], 10, 15, 9_300, 2),
    routeQuote('amm-multi-hop', [first, second], 40, 10, 9_650, 2),
  ];
}

export function formatRoutePath(route: RouteQuote): string {
  const segments = [route.sourceAsset];
  for (const hop of route.hops) {
    const venue = hop.venue === 'path_payment' ? 'Stellar path' :
      hop.venue === 'amm' ? 'AMM' : 'Direct';
    segments.push(`${venue} · ${hop.destinationAsset}`);
  }
  return segments.join('  →  ');
}

export function displayBaseUnits(amount: string): string {
  return fromStroops(BigInt(amount));
}

export function displayBasisPoints(value: number): string {
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, '0');
  return `${whole}.${fraction}%`;
}

function routeHop(
  venue: RouteHop['venue'],
  venueId: string,
  sourceAsset: string,
  destinationAsset: string,
  sourceAmount: bigint,
  expectedOutput: bigint,
  feeBps: number,
  slippageBps: number,
  reliabilityBps: number,
  path?: string[],
): RouteHop {
  return {
    venue,
    venueId,
    sourceAsset,
    destinationAsset,
    sourceAmount: sourceAmount.toString(),
    expectedOutput: expectedOutput.toString(),
    feeAmount: ratio(sourceAmount, feeBps).toString(),
    feeBps,
    slippageBps,
    reliabilityBps,
    ...(path ? { path } : {}),
  };
}

function routeQuote(
  label: string,
  hops: RouteHop[],
  totalFeeBps: number,
  expectedSlippageBps: number,
  reliabilityBps: number,
  hopCount: number,
): RouteQuote {
  const first = hops[0];
  const last = hops.at(-1);
  if (!first || !last) throw new RangeError('a route requires at least one hop');
  return {
    id: `${first.sourceAsset}>${last.destinationAsset}|${label}`,
    sourceAsset: first.sourceAsset,
    destinationAsset: last.destinationAsset,
    sourceAmount: first.sourceAmount,
    expectedDestinationAmount: last.expectedOutput,
    totalFeeBps,
    expectedSlippageBps,
    reliabilityBps,
    hopCount,
    hops,
    expiresAtLedger: PREVIEW_LEDGER + 20,
  };
}

function ratio(amount: bigint, bps: number): bigint {
  return amount * BigInt(bps) / BPS;
}

function intermediateAsset(sourceAsset: string, destinationAsset: string): string {
  return sourceAsset !== 'AQUA' && destinationAsset !== 'AQUA' ? 'AQUA' : 'XLM';
}
