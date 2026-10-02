/**
 * Deterministic multi-asset route selection.
 *
 * The selector consumes only normalized integer quotes. It performs no I/O,
 * reads no clock, uses no floating point, and defines a total tie-break order.
 */
import type { RouteQuote } from '../routing/types.js';

export const ROUTING_WEIGHT_SCALE = 10_000;

export interface RoutingPolicy {
  /** Relative weight of source-normalized fees. */
  costWeight: number;
  /** Relative weight of expected price impact. */
  slippageWeight: number;
  /** Relative weight of the reliability shortfall. */
  reliabilityWeight: number;
  /** Fixed score added for every economic hop after the first. */
  hopPenalty: number;
  /** Routes above this expected slippage are inadmissible. */
  maxSlippageBps: number;
  /** Routes below this reliability are inadmissible. */
  minReliabilityBps: number;
}

export const DEFAULT_ROUTING_POLICY: Readonly<RoutingPolicy> = Object.freeze({
  costWeight: 5_000,
  slippageWeight: 3_000,
  reliabilityWeight: 2_000,
  hopPenalty: 5,
  maxSlippageBps: 1_000,
  minReliabilityBps: 5_000,
});

export interface RouteScoreBreakdown {
  weightedCost: string;
  weightedSlippage: string;
  weightedReliability: string;
  hopPenalty: string;
}

export interface ScoredRoute extends RouteQuote {
  /** Lower is better. Integer score for byte-identical TS/Python output. */
  score: string;
  breakdown: RouteScoreBreakdown;
}

/** Validate and score one normalized route, including policy admission bounds. */
export function scoreRoute(
  route: RouteQuote,
  policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
): ScoredRoute {
  validatePolicy(policy);
  validateRoute(route);
  if (!isRouteEligible(route, policy)) {
    throw new RangeError(`route ${route.id} is outside routing policy bounds`);
  }

  const weightedCost = weighted(route.totalFeeBps, policy.costWeight);
  const weightedSlippage = weighted(route.expectedSlippageBps, policy.slippageWeight);
  const reliabilityShortfall = ROUTING_WEIGHT_SCALE - route.reliabilityBps;
  const weightedReliability = weighted(reliabilityShortfall, policy.reliabilityWeight);
  const hopPenalty = BigInt(route.hopCount - 1) * BigInt(policy.hopPenalty);
  const score = weightedCost + weightedSlippage + weightedReliability + hopPenalty;

  return {
    ...route,
    score: score.toString(),
    breakdown: {
      weightedCost: weightedCost.toString(),
      weightedSlippage: weightedSlippage.toString(),
      weightedReliability: weightedReliability.toString(),
      hopPenalty: hopPenalty.toString(),
    },
  };
}

/** Whether a structurally valid route clears policy reliability/slippage bounds. */
export function isRouteEligible(
  route: RouteQuote,
  policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
): boolean {
  return route.expectedSlippageBps <= policy.maxSlippageBps &&
    route.reliabilityBps >= policy.minReliabilityBps;
}

/**
 * Rank routes with a total, input-order-independent comparison:
 * score, output (descending), slippage, hop count, then canonical route ID.
 */
export function rankRoutes(
  routes: readonly RouteQuote[],
  policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
): ScoredRoute[] {
  validatePolicy(policy);
  const scored = routes
    .filter((route) => {
      validateRoute(route);
      return isRouteEligible(route, policy);
    })
    .map((route) => scoreRoute(route, policy));
  scored.sort(compareScoredRoutes);
  return scored;
}

/** Select the deterministic winner, or null when no route is admissible. */
export function selectRoute(
  routes: readonly RouteQuote[],
  policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
): ScoredRoute | null {
  return rankRoutes(routes, policy)[0] ?? null;
}

export function validateRoutingPolicy(policy: RoutingPolicy): void {
  validatePolicy(policy);
}

function compareScoredRoutes(a: ScoredRoute, b: ScoredRoute): number {
  const scoreA = BigInt(a.score);
  const scoreB = BigInt(b.score);
  if (scoreA !== scoreB) return scoreA < scoreB ? -1 : 1;
  const outputA = BigInt(a.expectedDestinationAmount);
  const outputB = BigInt(b.expectedDestinationAmount);
  if (outputA !== outputB) return outputA > outputB ? -1 : 1;
  if (a.expectedSlippageBps !== b.expectedSlippageBps) {
    return a.expectedSlippageBps - b.expectedSlippageBps;
  }
  if (a.hopCount !== b.hopCount) return a.hopCount - b.hopCount;
  return binaryCompare(a.id, b.id);
}

function weighted(value: number, weight: number): bigint {
  return (BigInt(value) * BigInt(weight)) / BigInt(ROUTING_WEIGHT_SCALE);
}

function validatePolicy(policy: RoutingPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  const weightSum = policy.costWeight + policy.slippageWeight + policy.reliabilityWeight;
  if (weightSum !== ROUTING_WEIGHT_SCALE) {
    throw new RangeError(`routing weights must sum to ${ROUTING_WEIGHT_SCALE}, got ${weightSum}`);
  }
  if (policy.maxSlippageBps > ROUTING_WEIGHT_SCALE ||
    policy.minReliabilityBps > ROUTING_WEIGHT_SCALE) {
    throw new RangeError('routing basis-point bounds must not exceed 10000');
  }
}

function validateRoute(route: RouteQuote): void {
  if (!route.id) throw new RangeError('route id is required');
  if (!/^[1-9][0-9]*$/.test(route.sourceAmount) ||
    !/^[1-9][0-9]*$/.test(route.expectedDestinationAmount)) {
    throw new RangeError('route amounts must be positive canonical integers');
  }
  for (const [name, value] of [
    ['totalFeeBps', route.totalFeeBps],
    ['expectedSlippageBps', route.expectedSlippageBps],
    ['reliabilityBps', route.reliabilityBps],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > ROUTING_WEIGHT_SCALE) {
      throw new RangeError(`${name} must be an integer from 0 to 10000`);
    }
  }
  if (!Number.isInteger(route.hopCount) || route.hopCount < 1) {
    throw new RangeError('hopCount must be a positive integer');
  }
}

function binaryCompare(a: string, b: string): number {
  if (a === b) return 0;
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index]! < right[index]! ? -1 : 1;
  }
  return left.length < right.length ? -1 : 1;
}
