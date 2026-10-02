/**
 * Cancellation and per-call timeouts for network methods.
 *
 * Invariants:
 *  1. A call whose signal is already aborted issues NO request.
 *  2. Aborting rejects promptly with a typed error (OperationAbortedError, or
 *     OperationTimeoutError when the cause was the timeout).
 *  3. After abort, no further requests are started (checked before every step).
 *  4. Timers and event listeners are always cleaned up, on success, failure and abort.
 *  5. Passing no options keeps the old behaviour, except that the default timeout applies.
 */

export {
  OperationAbortedError,
  OperationTimeoutError,
  DEFAULT_TIMEOUT_MS,
  type CallOptions,
} from './abort';

export class OperationAbortedError extends Error {
  readonly code = 'ABORTED';
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'OperationAbortedError';
  }
}

export class OperationTimeoutError extends Error {
  readonly code = 'TIMEOUT';
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'OperationTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** Options accepted by every public network method. */
export interface CallOptions {
  /** Abort the call. Rejects with OperationAbortedError. */
  signal?: AbortSignal;
  /** Per-call timeout in ms. Overrides the client default. `0` disables the timeout. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

function toAbortError(signal: AbortSignal): Error {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason;
  if (reason instanceof OperationTimeoutError || reason instanceof OperationAbortedError) {
    return reason;
  }
  return new OperationAbortedError();
}

/** Throws the typed error if the signal is already aborted. Call before every network step. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw toAbortError(signal);
}

/**
 * Run one unit of network work. If the signal is already aborted the work is never started.
 * If it aborts while the work is in flight, the returned promise rejects immediately;
 * the late result of the underlying request is ignored.
 */
export function abortable<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(toAbortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    work().then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/** Abort-aware sleep for polling/retry loops. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(toAbortError(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Combine the caller's signal with a timeout and run `fn` with the combined signal.
 * Timer and listener are always cleaned up.
 */
export async function runCall<T>(
  options: CallOptions | undefined,
  defaultTimeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const external = options?.signal;
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;

  const onExternalAbort = () => controller.abort(new OperationAbortedError());
  if (external) {
    if (external.aborted) {
      controller.abort(new OperationAbortedError());
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs > 0 && !controller.signal.aborted) {
    timer = setTimeout(() => controller.abort(new OperationTimeoutError(timeoutMs)), timeoutMs);
  }

  try {
    return await fn(controller.signal);
  } finally {
    if (timer) clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}
