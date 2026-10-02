/**
 * Retry policy for transient RPC failures.
 *
 * Only safe, idempotent phases of a contract invocation may be retried:
 * reading the source account and simulating the transaction. A transaction
 * that has been submitted to the network is never resubmitted automatically,
 * because a dropped response does not imply the transaction did not land.
 */

/** Retry policy configuration. */
export interface RetryPolicy {
  /** Total attempts, including the initial one. Must be at least 1. */
  readonly attempts: number;
  /** Base delay in milliseconds before the first retry. */
  readonly baseDelayMs: number;
  /** Maximum delay in milliseconds after exponential backoff. */
  readonly maxDelayMs: number;
  /** Fraction of the computed delay to randomize by, in [0, 1]. */
  readonly jitterFactor: number;
}

/** Default retry policy: three attempts with exponential backoff and jitter. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4,000,
  jitterFactor: 0.25,
};

/** Partial override accepted by `RetryPolicy`-aware constructors. */
export type RetryPolicyInput = Partial<RetryPolicy>;

/** The attempt count carried on a retry-exhausted error. */
export interface RetryAttemptInfo {
  /** Number of attempts actually made. */
  readonly attempts: number;
  /** The last error that caused the final failure. */
  readonly lastError: unknown;
}

/** Thrown when all retry attempts for a safe phase have been exhausted. */
export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly lastError: unknown;

  constructor(message: string, info: RetryAttemptInfo) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.attempts = info.attempts;
    this.lastError = info.lastError;
  }
}

/** Narrow a partial override into a fully-resolved policy. */
export function resolveRetryPolicy(
  input?: RetryPolicyInput,
): RetryPolicy {
  const merged: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...input };
  if (!Number.isInteger(merged.attempts) || merged.attempts < 1) {
    throw new RangeError('retry.attempts must be an integer >= 1');
  }
  if (merged.baseDelayMs < 0 || merged.maxDelayMs < 0) {
    throw new RangeError('retry delays must be non-negative');
  }
  if (merged.jitterFactor < 0 || merged.jitterFactor > 1) {
    throw new RangeError('retry.jitterFactor must be in [0, 1]');
  }
  return merged;
}

/**
 * Compute the delay before attempt `attemptIndex` (0-based).
 *
 * Exponential backoff capped at `maxDelayM`, then randomized by up to `jeffectiveDelay *
 * `jitterFactor`. The jitter is subtracted or added around the base delay so
 * concurrent clients de-synchronize after a provider-wide outage.
 */
export function computeRetryDelayMs(
  policy: RetryPolicy,
  attemptIndex: number,
  random: () => number = Math.random,
): number {
  if (attemptIndex <= 0) return 0;
  const exponential = policy.baseDelayMs * 2 ** (attemptIndex - 1);
  const capped = Math.min(exponential, policy.maxDelayMs);
  if (policy.jitterFactor === 0) return capped;
  const spread = capped * policy.jitterFactor;
  const offset = (random() * 2 - 1) * spread;
  return Math.max(0, capped + offset);
}

/** Options for `retryAsync`. */
export interface RetryOptions {
  /** Policy to apply. */
  readonly policy: RetryPolicy;
  /** Label used in the exhausted error message. */
  readonly label?: string;
  /** Decides whether a given error is worth retrying. Defaults: always true. */
  readonly isRetryable?: (error: unknown) => boolean;
  /** Sleep implementation, injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Random source for jitter, injectable for tests. */
  readonly random?: () => number;
  /** Called before each retry with the attempt number and delay. */
  readonly onRetry?: (attempt: number, delayMs: number) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `attempt` with the given retry policy.
 *
 * Retries only when `isRetryable` accepts the thrown error. On exhaustion throws a
 * `RetryExhaustedError` carrying the attempt count and the last underlying error.
 */
export async function retryAsync<T>(
  attempt: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    policy,
    label = 'operation',
    isRetryable = () => true,
    sleep = defaultSleep,
    random = Math.random,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attemptIndex = 0; attemptIndex < policy.attempts; attemptIndex++) {
    try {
      return await attempt(attemptIndex + 1);
    } catch (error) {
      lastError = error;
      const isLast = attemptIndex === policy.attempts - 1;
      if (isLast || !isRetryable(error)) {
        break;
      }
      const delayMs = computeRetryDelayMs(policy, attemptIndex + 1, random);
      onRetry?.(attemptIndex + 1, delayMs);
      await sleep(delayMs);
    }
  }

  const attemptsMade = policy.attempts - 1 + 1;
  throw new RetryExhaustedError(
    `${label} failed after ${attemptsMade} attempt(s)`,
    { attempts: attemptsMade, lastError: lastError },
  );
}
