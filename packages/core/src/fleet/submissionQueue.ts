import type { Metrics } from '../telemetry/metrics.js';
import { MetricNames } from '../telemetry/semantic.js';

export type RetryClassification = 'retryable' | 'expired' | 'permanent';
export type RetryClassifier = (error: unknown) => RetryClassification;

export interface SubmissionQueueOptions {
  /** Maximum tasks executing at once. @default 4 */
  concurrency?: number;
  /** Pending-task limit; running tasks do not count. @default 1000 */
  maxQueueSize?: number;
  /** Total executions including the first attempt. @default 3 */
  maxAttempts?: number;
  /** Initial exponential-backoff delay. @default 100 */
  retryDelayMs?: number;
  classifyError?: RetryClassifier;
  metrics?: Metrics;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface SubmitOptions {
  /** Tasks with the same key never overlap; unrelated keys stay concurrent. */
  orderingKey?: string;
  signal?: AbortSignal;
}

export interface SubmissionQueueStats {
  depth: number;
  running: number;
  completed: number;
  failed: number;
  expired: number;
  retries: number;
}

interface QueueItem<T> {
  task: (attempt: number) => Promise<T>;
  options: SubmitOptions;
  enqueuedAt: number;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  onAbort?: () => void;
}

/** Machine-readable queue/backpressure failure. */
export class SubmissionQueueError extends Error {
  constructor(
    readonly code: 'QUEUE_FULL' | 'QUEUE_CLOSED' | 'ABORTED',
    message: string,
  ) {
    super(message);
    this.name = 'SubmissionQueueError';
  }
}

/** Default classification for Stellar/RPC/network failures. */
export function classifySubmissionError(error: unknown): RetryClassification {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = String(candidate?.code ?? '');
  const message = String(candidate?.message ?? error ?? '');
  if (/expired|tx_too_late|time.?bound|TRANSACTION_TIMEOUT/i.test(`${code} ${message}`)) {
    return 'expired';
  }
  if (/TRY_AGAIN_LATER|429|rate.?limit|timeout|timed out|ECONNRESET|ECONNREFUSED|ENETUNREACH|bad.?seq|tx_bad_seq|NETWORK_ERROR/i.test(
    `${code} ${message}`,
  )) {
    return 'retryable';
  }
  return 'permanent';
}

/**
 * Bounded work queue with key-scoped ordering and retry classification.
 * Backpressure is explicit: once the pending bound is reached, producers get
 * `QUEUE_FULL` synchronously through the returned rejected promise.
 */
export class SubmissionQueue {
  readonly #concurrency: number;
  readonly #maxQueueSize: number;
  readonly #maxAttempts: number;
  readonly #retryDelayMs: number;
  readonly #classify: RetryClassifier;
  readonly #metrics?: Metrics;
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #pending: Array<QueueItem<unknown>> = [];
  readonly #activeKeys = new Set<string>();
  readonly #drainWaiters: Array<() => void> = [];
  #running = 0;
  #completed = 0;
  #failed = 0;
  #expired = 0;
  #retries = 0;
  #closed = false;

  constructor(options: SubmissionQueueOptions = {}) {
    this.#concurrency = options.concurrency ?? 4;
    this.#maxQueueSize = options.maxQueueSize ?? 1_000;
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#retryDelayMs = options.retryDelayMs ?? 100;
    if (!Number.isInteger(this.#concurrency) || this.#concurrency < 1) {
      throw new RangeError('SubmissionQueue concurrency must be a positive integer');
    }
    if (!Number.isInteger(this.#maxQueueSize) || this.#maxQueueSize < 0) {
      throw new RangeError('SubmissionQueue maxQueueSize must be a non-negative integer');
    }
    if (!Number.isInteger(this.#maxAttempts) || this.#maxAttempts < 1) {
      throw new RangeError('SubmissionQueue maxAttempts must be a positive integer');
    }
    if (!Number.isFinite(this.#retryDelayMs) || this.#retryDelayMs < 0) {
      throw new RangeError('SubmissionQueue retryDelayMs must be non-negative');
    }
    this.#classify = options.classifyError ?? classifySubmissionError;
    this.#metrics = options.metrics;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get stats(): SubmissionQueueStats {
    return {
      depth: this.#pending.length,
      running: this.#running,
      completed: this.#completed,
      failed: this.#failed,
      expired: this.#expired,
      retries: this.#retries,
    };
  }

  submit<T>(task: (attempt: number) => Promise<T>, options: SubmitOptions = {}): Promise<T> {
    if (this.#closed) {
      return Promise.reject(new SubmissionQueueError('QUEUE_CLOSED', 'Submission queue is closed'));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new SubmissionQueueError('ABORTED', 'Submission was aborted'));
    }
    const canStartImmediately = this.#running < this.#concurrency &&
      (!options.orderingKey || !this.#activeKeys.has(options.orderingKey));
    if (!canStartImmediately && this.#pending.length >= this.#maxQueueSize) {
      return Promise.reject(new SubmissionQueueError(
        'QUEUE_FULL',
        `Submission queue is full (${this.#maxQueueSize} pending tasks)`,
      ));
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        task,
        options,
        enqueuedAt: this.#now(),
        resolve,
        reject,
      };
      if (options.signal) {
        item.onAbort = () => {
          const index = this.#pending.indexOf(item as QueueItem<unknown>);
          if (index < 0) return;
          this.#pending.splice(index, 1);
          reject(new SubmissionQueueError('ABORTED', 'Submission was aborted'));
          this.#recordDepth();
          this.#resolveDrain();
        };
        options.signal.addEventListener('abort', item.onAbort, { once: true });
      }
      this.#pending.push(item as QueueItem<unknown>);
      this.#recordDepth();
      this.#schedule();
    });
  }

  /** Resolve once both queued and running work have reached zero. */
  async drain(): Promise<void> {
    if (this.#pending.length === 0 && this.#running === 0) return;
    await new Promise<void>((resolve) => this.#drainWaiters.push(resolve));
  }

  /** Stop accepting work, then wait for accepted work to finish. */
  async close(): Promise<void> {
    this.#closed = true;
    await this.drain();
  }

  #schedule(): void {
    while (this.#running < this.#concurrency) {
      const index = this.#pending.findIndex((item) =>
        !item.options.orderingKey || !this.#activeKeys.has(item.options.orderingKey));
      if (index < 0) break;
      const [item] = this.#pending.splice(index, 1) as [QueueItem<unknown>];
      if (item.options.signal && item.onAbort) {
        item.options.signal.removeEventListener('abort', item.onAbort);
      }
      const key = item.options.orderingKey;
      if (key) this.#activeKeys.add(key);
      this.#running += 1;
      this.#recordDepth();
      void this.#run(item).finally(() => {
        this.#running -= 1;
        if (key) this.#activeKeys.delete(key);
        this.#schedule();
        this.#resolveDrain();
      });
    }
  }

  async #run(item: QueueItem<unknown>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      try {
        const result = await item.task(attempt);
        this.#completed += 1;
        this.#metrics?.recordHistogram(
          MetricNames.submissionLatencyMs,
          this.#now() - item.enqueuedAt,
          { attempts: attempt },
        );
        item.resolve(result);
        return;
      } catch (error) {
        lastError = error;
        const classification = this.#classify(error);
        if (classification === 'expired') {
          this.#expired += 1;
          this.#metrics?.incrementCounter(MetricNames.submissionExpiries, 1);
          break;
        }
        if (classification !== 'retryable' || attempt >= this.#maxAttempts) break;
        this.#retries += 1;
        this.#metrics?.incrementCounter(MetricNames.submissionRetries, 1);
        await this.#sleep(this.#retryDelayMs * 2 ** (attempt - 1));
      }
    }
    this.#failed += 1;
    item.reject(lastError);
  }

  #recordDepth(): void {
    this.#metrics?.recordHistogram(MetricNames.submissionQueueDepth, this.#pending.length);
  }

  #resolveDrain(): void {
    if (this.#pending.length > 0 || this.#running > 0) return;
    for (const resolve of this.#drainWaiters.splice(0)) resolve();
  }
}
