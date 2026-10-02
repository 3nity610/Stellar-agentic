import { BASE_FEE } from '@stellar/stellar-sdk';

export type FeePhase = 'initial' | 'fee_bump' | 'sponsorship';
export type FeePercentile = 'min' | 'mode' | 'p10' | 'p20' | 'p30' | 'p40' |
  'p50' | 'p60' | 'p70' | 'p80' | 'p90' | 'p95' | 'p99' | 'max';

export interface FeeDistribution {
  min: string;
  mode: string;
  p10: string;
  p20: string;
  p30: string;
  p40: string;
  p50: string;
  p60: string;
  p70: string;
  p80: string;
  p90: string;
  p95: string;
  p99: string;
  max: string;
}

export interface FeeStats {
  inclusionFee: FeeDistribution;
  sorobanInclusionFee: FeeDistribution;
  latestLedger?: number;
}

export interface FeeContext {
  phase: FeePhase;
  operationCount: number;
  /** Lower bound imposed by protocol or a previously submitted envelope. */
  minimumFee?: string;
  /** The fee rate on the inner transaction when building a fee bump. */
  previousFee?: string;
  /** Soroban invocations use the Soroban distribution by default. */
  soroban?: boolean;
  getFeeStats?: () => Promise<FeeStats>;
}

/** Resolves a base fee rate in stroops per operation. */
export interface FeeStrategy {
  getFee(context: FeeContext): string | Promise<string>;
}

export type FeeCallback = (context: FeeContext) => string | number | bigint | Promise<string | number | bigint>;

export interface RecentFeeStrategyOptions {
  percentile?: FeePercentile;
  multiplier?: number;
  minimumFee?: string | number | bigint;
  maximumFee?: string | number | bigint;
  fallbackFee?: string | number | bigint;
  /** Cache fee stats to avoid one RPC request per payment. @default 5000 */
  cacheMs?: number;
  now?: () => number;
}

const FEE_PERCENTILES: readonly FeePercentile[] = [
  'min', 'mode', 'p10', 'p20', 'p30', 'p40', 'p50', 'p60', 'p70', 'p80',
  'p90', 'p95', 'p99', 'max',
];

function positiveFee(value: string | number | bigint, label = 'fee'): bigint {
  let parsed: bigint;
  try {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new Error('not a safe integer');
      parsed = BigInt(value);
    } else {
      parsed = BigInt(value);
    }
  } catch {
    throw new RangeError(`${label} must be a positive integer number of stroops`);
  }
  if (parsed <= 0n) throw new RangeError(`${label} must be a positive integer number of stroops`);
  return parsed;
}

function multiplyCeil(value: bigint, multiplier: number): bigint {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new RangeError('Fee multiplier must be a finite number greater than zero');
  }
  const scale = 1_000_000n;
  const scaled = BigInt(Math.ceil(multiplier * Number(scale)));
  return (value * scaled + scale - 1n) / scale;
}

function clampToContext(value: bigint, context: FeeContext): string {
  const protocolMinimum = positiveFee(context.minimumFee ?? BASE_FEE, 'minimum fee');
  return (value < protocolMinimum ? protocolMinimum : value).toString();
}

/** Always bids the same fee rate. */
export class FixedFeeStrategy implements FeeStrategy {
  readonly #fee: bigint;
  constructor(fee: string | number | bigint = BASE_FEE) {
    this.#fee = positiveFee(fee);
  }
  getFee(context: FeeContext): string {
    return clampToContext(this.#fee, context);
  }
}

/** Multiplies another strategy (recent-fee strategy by default). */
export class MultiplierFeeStrategy implements FeeStrategy {
  readonly #multiplier: number;
  readonly #base: FeeStrategy;
  constructor(multiplier: number, base: FeeStrategy = new RecentFeeStrategy()) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new RangeError('Fee multiplier must be a finite number greater than zero');
    }
    this.#multiplier = multiplier;
    this.#base = base;
  }
  async getFee(context: FeeContext): Promise<string> {
    const fee = positiveFee(await this.#base.getFee(context));
    return clampToContext(multiplyCeil(fee, this.#multiplier), context);
  }
}

/** Delegates the decision to application code while retaining validation. */
export class CallbackFeeStrategy implements FeeStrategy {
  constructor(readonly callback: FeeCallback) {
    if (typeof callback !== 'function') throw new TypeError('Fee callback must be a function');
  }
  async getFee(context: FeeContext): Promise<string> {
    return clampToContext(positiveFee(await this.callback(context), 'callback fee'), context);
  }
}

/**
 * Uses recent RPC fee statistics and falls back to the protocol base fee when
 * the endpoint is unavailable or has not observed relevant transactions.
 */
export class RecentFeeStrategy implements FeeStrategy {
  readonly #percentile: FeePercentile;
  readonly #multiplier: number;
  readonly #minimum: bigint;
  readonly #maximum?: bigint;
  readonly #fallback: bigint;
  readonly #cacheMs: number;
  readonly #now: () => number;
  #cached?: { expiresAt: number; stats: FeeStats };
  #pending?: Promise<FeeStats>;

  constructor(options: RecentFeeStrategyOptions = {}) {
    this.#percentile = options.percentile ?? 'p90';
    if (!FEE_PERCENTILES.includes(this.#percentile)) {
      throw new RangeError(`Unsupported fee percentile: ${String(this.#percentile)}`);
    }
    this.#multiplier = options.multiplier ?? 1.1;
    if (!Number.isFinite(this.#multiplier) || this.#multiplier <= 0) {
      throw new RangeError('Fee multiplier must be a finite number greater than zero');
    }
    this.#minimum = positiveFee(options.minimumFee ?? BASE_FEE, 'minimum fee');
    this.#maximum = options.maximumFee === undefined
      ? undefined
      : positiveFee(options.maximumFee, 'maximum fee');
    if (this.#maximum !== undefined && this.#maximum < this.#minimum) {
      throw new RangeError('maximumFee must be greater than or equal to minimumFee');
    }
    this.#fallback = positiveFee(options.fallbackFee ?? BASE_FEE, 'fallback fee');
    this.#cacheMs = options.cacheMs ?? 5_000;
    if (!Number.isFinite(this.#cacheMs) || this.#cacheMs < 0) {
      throw new RangeError('Fee cacheMs must be non-negative');
    }
    this.#now = options.now ?? Date.now;
  }

  async getFee(context: FeeContext): Promise<string> {
    let sampled = this.#fallback;
    let sampledNetwork = false;
    if (context.getFeeStats) {
      try {
        const stats = await this.#stats(context.getFeeStats);
        const distribution = context.soroban === false
          ? stats.inclusionFee
          : stats.sorobanInclusionFee;
        sampled = positiveFee(distribution[this.#percentile], `fee statistic ${this.#percentile}`);
        sampledNetwork = true;
      } catch {
        sampled = this.#fallback;
      }
    }
    // During a fee-stats outage, preserve the explicit fallback exactly. The
    // multiplier describes how aggressively to bid over observed congestion.
    let fee = sampledNetwork ? multiplyCeil(sampled, this.#multiplier) : sampled;
    if (fee < this.#minimum) fee = this.#minimum;
    if (this.#maximum !== undefined && fee > this.#maximum) fee = this.#maximum;
    return clampToContext(fee, context);
  }

  async #stats(load: () => Promise<FeeStats>): Promise<FeeStats> {
    const now = this.#now();
    if (this.#cached && this.#cached.expiresAt > now) return this.#cached.stats;
    if (!this.#pending) {
      this.#pending = load().then((stats) => {
        this.#cached = { stats, expiresAt: this.#now() + this.#cacheMs };
        return stats;
      }).finally(() => {
        this.#pending = undefined;
      });
    }
    return this.#pending;
  }
}

/** Accept the ergonomic config forms used by `StellarAgentConfig`. */
export function asFeeStrategy(
  strategy?: FeeStrategy | FeeCallback | string | number | bigint,
): FeeStrategy {
  if (strategy === undefined) return new RecentFeeStrategy();
  if (typeof strategy === 'function') return new CallbackFeeStrategy(strategy);
  if (typeof strategy === 'string' || typeof strategy === 'number' || typeof strategy === 'bigint') {
    return new FixedFeeStrategy(strategy);
  }
  if (typeof strategy.getFee !== 'function') throw new TypeError('Invalid fee strategy');
  return strategy;
}
