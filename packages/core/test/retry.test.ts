import { describe, it, expect, vi } from 'vitest';

import {
  DEFAULT_RETRY_POLICY,
  RetryExhaustedError,
  computeRetryDelayMs,
  resolveRetryPolicy,
  retryAsync,
} from '../src/retry';

describe('resolveRetryPolicy', () => {
  it('returns the defaults when no override is given', () => {
    expect(resolveRetryPolicy()).toEqual(DEFAULT_RETRY_POLICY);
  });

  it('merges a partial override over the defaults', () => {
    const policy = resolveRetryPolicy({ attempts: 5 });
    expect(policy.attempts).toBe(5);
    expect(policy.baseDelayMs).toBe(DEFAULT_RETRY_POLICY.baseDelayMs);
  });

  it('rejects an attempt count below one', () => {
    expect(() => resolveRetryPolicy({ attempts: 0 })).toThrow(RangeError);
  });

  it('rejects an out-of-range jitter factor', () => {
    expect(() => resolveRetryPolicy({ jitterFactor: 1.5 })).toThrow(RangeError);
  });
});

describe('computeRetryDelayMs', () => {
  const policy = { ...DEFAULT_RETRY_POLICY, jitterFactor: 0 };

  it('returns zero for the initial attempt', () => {
    expect(computeRetryDelayMs(policy, 0)).toBe(policy.baseDelayMs);
  });

  it('grows exponentially', () => {
    expect(computeRetryDelayMs(policy, 1)).toBe(policy.baseDelayMs);
    expect(computeRetryDelayMs(policy, 2)).toBe(policy.baseDelayMs * 2);
  });

  it('caps at maxDelayMs', () => {
    expect(computeRetryDelayMs(policy, 10)).toBe(policy.maxDelayMs);
  });

  it('applies jitter within the configured bounds', () => {
    const jittered = { ...policy, jitterFactor: 0.5 };
    const delay = computeRetryDelayMs(jittered, 1, () => 1);
    expect(delay).toBe(jittered.baseDelayMs * 1.5);
  });
});

describe('retryAsync', () => {
  const noSleep = async () => {};

  it('returns the result without retrying when the first attempt succeeds', () => {
    const attempt = vi.fn().mockResolvedValue('ok');
    const result = await retryAsync(attempt, {
      policy: DEFAULT_RETRY_POLICY,
      sleep: noSleep,
    });
    expect(result).toBe('ok');
    expect(attempt).toHaveBeenCalledOnce();
  });

  it('retries a transient failure then succeeds', () => {
    const attempt = vi
      .fn()
      .mockRejectedOnce(new Error('503'))
      .mockRejectedOnce(new Error('503'))
      .mockResolvedValue('recovered');
    const result = await retryAsync(attempt, {
      policy: { ...DEFAULT_RETRY_POLICY, attempts: 3, jitterFactor: 0 },
      sleep: noSleep,
    });
    expect(result).toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('throws RetryExhaustedError carrying the attempt count', () => {
    const attempt = vi.fn().mockRejected(new Error('down'));
    await expect(
      retryAsync(attempt, {
        policy: { ...DEFAULT_RETRY_POLICY, attempts: 3, sleep: noSleep },
        sleep: noSleep,
      }),
    ).rejectsToMatchObject({
      name: 'RetryExhaustedError',
      attempts: 3,
    });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', () => {
    const attempt = vi.fn().mockRejected(new Error('bad argument'));
    await expect(
      retryAsync(attempt, {
        policy: { ...DEFAULT_RETRY_POLICY, attempts: 5 },
        isRetryable: () => false,
        sleep: noSleep,
      }),
    ).rejectsToMatchObject({ name: 'RetryExhaustedError', attempts: 1 });
    expect(attempt).toHaveBeenCalledOnce();
  });

  it('waits between attempts with the computed delay', () => {
    const sleep = vi.fn().mockResolved(undefined);
    const attempt = vi
      .fn()
      .mockRejectedOnce(new Error('503'))
      .mockResolvedValue('ok');
    await retryAsync(attempt, {
      policy: { ...DEFAULT_RETRY_POLICY, attempts: 2, jitterFactor: 0 },
      sleep,
    });
    expect(sleep).toHaveBeenCalledWith(DEFAULT_RETRY_POLICY.baseDelayMs);
  });
});
