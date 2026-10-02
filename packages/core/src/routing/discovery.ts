import { StellarAgentError } from '../errors.js';
import type {
  OracleReference,
  RouteDiscoveryFailure,
  RouteDiscoveryOptions,
  RouteDiscoveryResult,
  RouteHop,
  RoutePriceOracle,
  RouteQuote,
  RouteRequest,
  RouteUnavailableCode,
} from './types.js';

const BPS = 10_000n;

/** A provider may use this to classify a normal venue miss without throwing a generic error. */
export class RouteUnavailableError extends Error {
  readonly code: RouteUnavailableCode;

  constructor(code: RouteUnavailableCode, message: string) {
    super(message);
    this.name = 'RouteUnavailableError';
    this.code = code;
  }
}

/**
 * Enumerate and normalize every provider independently. A broken or illiquid
 * venue becomes a diagnostic entry while valid candidates remain selectable.
 */
export async function discoverRoutes(
  request: RouteRequest,
  options: RouteDiscoveryOptions,
): Promise<RouteDiscoveryResult> {
  validateRequest(request);
  const maxHops = positiveInteger(options.maxHops ?? 3, 'maxHops');
  const maxCandidates = positiveInteger(options.maxCandidates ?? 32, 'maxCandidates');
  if (options.providers.length === 0) {
    return { routes: [], failures: [] };
  }

  const settled = await Promise.allSettled(
    options.providers.map(async (provider) => ({
      providerId: provider.id,
      candidates: await provider.discover(request, { maxHops, maxCandidates }),
    })),
  );
  const failures: RouteDiscoveryFailure[] = [];
  const candidates: RouteQuote[] = [];

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index]!;
    const providerId = options.providers[index]!.id;
    if (result.status === 'rejected') {
      failures.push(failureFrom(providerId, result.reason));
      continue;
    }
    for (const hops of result.value.candidates.slice(0, maxCandidates)) {
      try {
        candidates.push(normalizeRoute(request, hops, maxHops));
      } catch (error) {
        failures.push(failureFrom(result.value.providerId, error, 'INVALID_QUOTE'));
      }
    }
  }

  const oracleReference = await loadOracleReference(options.oracle, request, failures);
  const normalized = oracleReference
    ? candidates.map((route) => applyOracleReference(route, oracleReference))
    : candidates;

  // Canonical sorting makes discovery output independent from provider timing.
  // For duplicate IDs retain the larger output, then the lower fee quote.
  const unique = new Map<string, RouteQuote>();
  for (const route of normalized) {
    const previous = unique.get(route.id);
    if (!previous || compareQuoteQuality(route, previous) < 0) unique.set(route.id, route);
  }
  const routes = [...unique.values()]
    .filter((route) => route.expiresAtLedger === undefined ||
      request.currentLedger === undefined || route.expiresAtLedger >= request.currentLedger)
    .sort((a, b) => compareUtf8(a.id, b.id))
    .slice(0, maxCandidates);

  return { routes, failures, ...(oracleReference ? { oracleReference } : {}) };
}

export function canonicalRouteId(hops: readonly RouteHop[]): string {
  if (hops.length === 0) return 'empty';
  const first = hops[0]!;
  const segments = hops.map((hop) => {
    const path = hop.path?.length ? `(${hop.path.map(escapeId).join(',')})` : '';
    return `${hop.venue}:${escapeId(hop.venueId)}${path}>${escapeId(hop.destinationAsset)}`;
  });
  return `${escapeId(first.sourceAsset)}>${segments.join('>')}`;
}

export function normalizeRoute(
  request: RouteRequest,
  hops: readonly RouteHop[],
  maxHops: number,
): RouteQuote {
  if (hops.length === 0) throw new RouteUnavailableError('INVALID_QUOTE', 'route has no hops');
  const economicDepth = hops.reduce((sum, hop) => sum + 1 + (hop.path?.length ?? 0), 0);
  if (economicDepth > maxHops) {
    throw new RouteUnavailableError(
      'INVALID_QUOTE',
      `route depth ${economicDepth} exceeds maximum ${maxHops}`,
    );
  }

  const assets = [request.sourceAsset];
  let expectedSource = parsePositiveInteger(request.sourceAmount, 'sourceAmount');
  let totalFeeBps = 0;
  let totalSlippageBps = 0;
  let reliabilityBps = 10_000;
  let previousAsset = request.sourceAsset;

  for (const [index, hop] of hops.entries()) {
    validateHop(hop, index);
    if (hop.sourceAsset !== previousAsset) {
      throw new RouteUnavailableError('INVALID_QUOTE', `route is discontinuous at hop ${index}`);
    }
    if (parsePositiveInteger(hop.sourceAmount, `hop ${index} sourceAmount`) !== expectedSource) {
      throw new RouteUnavailableError('INVALID_QUOTE', `amount is discontinuous at hop ${index}`);
    }
    const traversed = [...(hop.path ?? []), hop.destinationAsset];
    for (const asset of traversed) {
      const identityDirect = hops.length === 1 && index === 0 &&
        hop.venue === 'direct' && hop.sourceAsset === hop.destinationAsset;
      if (assets.includes(asset) && !identityDirect) {
        throw new RouteUnavailableError('INVALID_QUOTE', `route contains an asset cycle at ${asset}`);
      }
      if (!identityDirect) assets.push(asset);
    }
    totalFeeBps = Math.min(10_000, totalFeeBps + hop.feeBps);
    totalSlippageBps = Math.min(10_000, totalSlippageBps + hop.slippageBps);
    reliabilityBps = Math.min(reliabilityBps, hop.reliabilityBps);
    expectedSource = parsePositiveInteger(hop.expectedOutput, `hop ${index} expectedOutput`);
    previousAsset = hop.destinationAsset;
  }
  if (previousAsset !== request.destinationAsset) {
    throw new RouteUnavailableError('INVALID_QUOTE', 'route does not reach the destination asset');
  }
  const allowed = new Set(request.allowedIntermediates ?? []);
  for (const intermediate of assets.slice(1, -1)) {
    if (request.allowedIntermediates && !allowed.has(intermediate)) {
      throw new RouteUnavailableError(
        'INVALID_QUOTE',
        `route uses disallowed intermediate asset ${intermediate}`,
      );
    }
  }

  return {
    id: canonicalRouteId(hops),
    sourceAsset: request.sourceAsset,
    destinationAsset: request.destinationAsset,
    sourceAmount: request.sourceAmount,
    expectedDestinationAmount: expectedSource.toString(),
    totalFeeBps,
    expectedSlippageBps: totalSlippageBps,
    reliabilityBps,
    hopCount: economicDepth,
    hops: hops.map((hop) => ({ ...hop, path: hop.path ? [...hop.path] : undefined })),
  };
}

export function applyOracleReference(
  route: RouteQuote,
  reference: OracleReference,
): RouteQuote {
  const fair = parsePositiveInteger(
    reference.expectedDestinationAmount,
    'oracle expectedDestinationAmount',
  );
  const actual = parsePositiveInteger(route.expectedDestinationAmount, 'expectedDestinationAmount');
  const shortfall = fair > actual ? fair - actual : 0n;
  const oracleSlippage = Number((shortfall * BPS) / fair);
  const expires = [route.expiresAtLedger, reference.expiresAtLedger]
    .filter((value): value is number => value !== undefined);
  return {
    ...route,
    expectedSlippageBps: Math.max(route.expectedSlippageBps, oracleSlippage),
    reliabilityBps: Math.min(route.reliabilityBps, reference.reliabilityBps),
    ...(expires.length ? { expiresAtLedger: Math.min(...expires) } : {}),
  };
}

function validateRequest(request: RouteRequest): void {
  if (!request.sourceAsset.trim() || !request.destinationAsset.trim()) {
    throw new StellarAgentError('INVALID_ARGUMENT', 'sourceAsset and destinationAsset are required');
  }
  parsePositiveInteger(request.sourceAmount, 'sourceAmount');
  if (request.currentLedger !== undefined &&
    (!Number.isInteger(request.currentLedger) || request.currentLedger < 0)) {
    throw new StellarAgentError('INVALID_ARGUMENT', 'currentLedger must be a non-negative integer');
  }
  if (request.allowedIntermediates &&
    new Set(request.allowedIntermediates).size !== request.allowedIntermediates.length) {
    throw new StellarAgentError('INVALID_ARGUMENT', 'allowedIntermediates contains duplicates');
  }
}

function validateHop(hop: RouteHop, index: number): void {
  if (!hop.venueId.trim() || !hop.sourceAsset.trim() || !hop.destinationAsset.trim()) {
    throw new RouteUnavailableError('INVALID_QUOTE', `hop ${index} has an empty identifier`);
  }
  if (hop.sourceAsset === hop.destinationAsset && hop.venue !== 'direct') {
    throw new RouteUnavailableError('INVALID_QUOTE', `hop ${index} does not change assets`);
  }
  parseNonNegativeInteger(hop.feeAmount, `hop ${index} feeAmount`);
  assertBps(hop.feeBps, `hop ${index} feeBps`);
  assertBps(hop.slippageBps, `hop ${index} slippageBps`);
  assertBps(hop.reliabilityBps, `hop ${index} reliabilityBps`);
  if (hop.minOutput !== undefined) {
    parseNonNegativeInteger(hop.minOutput, `hop ${index} minOutput`);
  }
}

function assertBps(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new RouteUnavailableError('INVALID_QUOTE', `${name} must be an integer from 0 to 10000`);
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new StellarAgentError('INVALID_ARGUMENT', `${name} must be a positive integer`);
  }
  return value;
}

function parsePositiveInteger(value: string, name: string): bigint {
  const parsed = parseNonNegativeInteger(value, name);
  if (parsed === 0n) throw new RouteUnavailableError('INVALID_QUOTE', `${name} must be positive`);
  return parsed;
}

function parseNonNegativeInteger(value: string, name: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new RouteUnavailableError('INVALID_QUOTE', `${name} must be canonical integer base units`);
  }
  return BigInt(value);
}

async function loadOracleReference(
  oracle: RoutePriceOracle | undefined,
  request: RouteRequest,
  failures: RouteDiscoveryFailure[],
): Promise<OracleReference | undefined> {
  if (!oracle) return undefined;
  try {
    const reference = await oracle.quote(request);
    if (!reference) return undefined;
    parsePositiveInteger(reference.expectedDestinationAmount, 'oracle expectedDestinationAmount');
    assertBps(reference.reliabilityBps, 'oracle reliabilityBps');
    return reference;
  } catch (error) {
    failures.push(failureFrom(oracle.id, error));
    return undefined;
  }
}

function failureFrom(
  providerId: string,
  reason: unknown,
  fallback: RouteUnavailableCode = 'VENUE_UNAVAILABLE',
): RouteDiscoveryFailure {
  return {
    providerId,
    code: reason instanceof RouteUnavailableError ? reason.code : fallback,
    message: reason instanceof Error ? reason.message : String(reason),
  };
}

function compareQuoteQuality(a: RouteQuote, b: RouteQuote): number {
  const outputA = BigInt(a.expectedDestinationAmount);
  const outputB = BigInt(b.expectedDestinationAmount);
  if (outputA !== outputB) return outputA > outputB ? -1 : 1;
  if (a.totalFeeBps !== b.totalFeeBps) return a.totalFeeBps - b.totalFeeBps;
  return a.expectedSlippageBps - b.expectedSlippageBps;
}

function escapeId(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '~');
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
