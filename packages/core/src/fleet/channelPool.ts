import type { Signer } from '../signer.js';

/** An account whose sequence number may be used as a transaction channel. */
export interface ChannelAccount {
  /** Public Stellar address used as the transaction source. */
  address: string;
  /** Signs the transaction envelope. Contract authorization stays with the agent signer. */
  signer: Signer;
  /** Caller-owned data retained for the lifetime of the pool entry. */
  metadata?: Readonly<Record<string, unknown>>;
}

/** Creates and reclaims accounts as a pool grows and shrinks. */
export interface ChannelAccountFactory {
  create(): Promise<ChannelAccount>;
  reclaim?(account: ChannelAccount): Promise<void>;
}

export type ChannelLeaseOutcome = 'committed' | 'rolled_back';

export interface ChannelAccountPoolOptions {
  /** Accounts available immediately. */
  accounts?: readonly ChannelAccount[];
  /** Lifecycle used when demand changes the pool size. */
  factory?: ChannelAccountFactory;
  /** Lowest size retained by idle reclamation. @default accounts.length */
  minSize?: number;
  /** Hard upper bound, including accounts being created. @default max(minSize, accounts.length) */
  maxSize?: number;
  /** Maximum time to wait for a lease. Zero disables the timeout. @default 30000 */
  leaseTimeoutMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface LeaseOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ChannelPoolStats {
  size: number;
  maxSize: number;
  available: number;
  leased: number;
  creating: number;
  waiting: number;
  targetSize: number;
  committed: number;
  rolledBack: number;
}

/** A single-use, exclusive claim on one channel account. */
export interface ChannelAccountLease {
  readonly account: ChannelAccount;
  readonly address: string;
  readonly signer: Signer;
  /**
   * Release the account. A rollback means no transaction was accepted, so the
   * next lease reloads the on-chain sequence instead of advancing a local cursor.
   */
  release(outcome?: ChannelLeaseOutcome): Promise<void>;
  /** Run work and always release, committing only after the callback succeeds. */
  use<T>(work: (account: ChannelAccount) => Promise<T>): Promise<T>;
}

interface Entry {
  account: ChannelAccount;
  leased: boolean;
  retire: boolean;
  lastUsedAt: number;
}

interface Waiter {
  resolve: (lease: ChannelAccountLease) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/** Raised when a lease cannot enter the pool. */
export class ChannelPoolError extends Error {
  constructor(
    readonly code: 'POOL_CLOSED' | 'LEASE_TIMEOUT' | 'LEASE_ABORTED' | 'FACTORY_FAILED',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ChannelPoolError';
  }
}

/**
 * Exclusive channel-account leasing with demand-driven growth.
 *
 * A lease owns an account from sequence load through terminal submission. The
 * pool deliberately does not cache or pre-allocate sequence numbers: the
 * invocation pipeline reloads the account after every release. Consequently a
 * failed build/sign/send rolls back without burning a local sequence or leaving
 * a gap, while accepted transactions are never raced by another caller.
 */
export class ChannelAccountPool {
  readonly #entries = new Map<string, Entry>();
  readonly #factory?: ChannelAccountFactory;
  readonly #maxSize: number;
  readonly #leaseTimeoutMs: number;
  readonly #now: () => number;
  readonly #waiters: Waiter[] = [];
  #targetSize: number;
  #creating = 0;
  #closed = false;
  #committed = 0;
  #rolledBack = 0;

  constructor(options: ChannelAccountPoolOptions = {}) {
    const accounts = options.accounts ?? [];
    const minSize = options.minSize ?? accounts.length;
    const maxSize = options.maxSize ?? Math.max(1, minSize, accounts.length);
    if (!Number.isInteger(minSize) || minSize < 0) {
      throw new RangeError('ChannelAccountPool minSize must be a non-negative integer');
    }
    if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize < minSize) {
      throw new RangeError('ChannelAccountPool maxSize must be an integer >= minSize and >= 1');
    }
    if (accounts.length > maxSize) {
      throw new RangeError('ChannelAccountPool has more initial accounts than maxSize');
    }
    if (minSize > accounts.length && !options.factory) {
      throw new RangeError('ChannelAccountPool needs a factory to reach minSize');
    }
    this.#factory = options.factory;
    this.#maxSize = maxSize;
    this.#targetSize = Math.max(minSize, accounts.length);
    this.#leaseTimeoutMs = options.leaseTimeoutMs ?? 30_000;
    if (!Number.isFinite(this.#leaseTimeoutMs) || this.#leaseTimeoutMs < 0) {
      throw new RangeError('ChannelAccountPool leaseTimeoutMs must be non-negative');
    }
    this.#now = options.now ?? Date.now;
    for (const account of accounts) this.#add(account);
  }

  /** Build a pool and eagerly satisfy `minSize`. */
  static async create(options: ChannelAccountPoolOptions = {}): Promise<ChannelAccountPool> {
    const pool = new ChannelAccountPool(options);
    try {
      await pool.resize(pool.#targetSize);
      return pool;
    } catch (error) {
      await pool.close();
      throw error;
    }
  }

  get stats(): ChannelPoolStats {
    let leased = 0;
    for (const entry of this.#entries.values()) if (entry.leased) leased += 1;
    return {
      size: this.#entries.size,
      maxSize: this.#maxSize,
      available: this.#entries.size - leased,
      leased,
      creating: this.#creating,
      waiting: this.#waiters.length,
      targetSize: this.#targetSize,
      committed: this.#committed,
      rolledBack: this.#rolledBack,
    };
  }

  /** Lease one account, growing by one when every existing account is busy. */
  async lease(options: LeaseOptions = {}): Promise<ChannelAccountLease> {
    if (this.#closed) throw new ChannelPoolError('POOL_CLOSED', 'Channel account pool is closed');
    if (options.signal?.aborted) {
      throw new ChannelPoolError('LEASE_ABORTED', 'Channel account lease was aborted');
    }

    const available = this.#availableEntry();
    if (available) return this.#makeLease(available);
    if (this.#entries.size === 0 && this.#creating === 0 && !this.#factory) {
      throw new ChannelPoolError('FACTORY_FAILED', 'Channel account pool has no accounts or factory');
    }

    const timeoutMs = options.timeoutMs ?? this.#leaseTimeoutMs;
    const pending = new Promise<ChannelAccountLease>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal: options.signal };
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          if (!this.#removeWaiter(waiter)) return;
          reject(new ChannelPoolError(
            'LEASE_TIMEOUT',
            `Timed out after ${timeoutMs}ms waiting for a channel account`,
          ));
        }, timeoutMs);
      }
      if (options.signal) {
        waiter.onAbort = () => {
          if (!this.#removeWaiter(waiter)) return;
          reject(new ChannelPoolError('LEASE_ABORTED', 'Channel account lease was aborted'));
        };
        options.signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.#waiters.push(waiter);
    });

    this.#dispatch();
    return pending;
  }

  /** Convenience wrapper around `lease` + `ChannelAccountLease.use`. */
  async use<T>(work: (account: ChannelAccount) => Promise<T>, options?: LeaseOptions): Promise<T> {
    return (await this.lease(options)).use(work);
  }

  /**
   * Change the desired fleet size. Growth is awaited; shrink reclaims idle
   * accounts immediately and marks busy accounts for reclamation on release.
   */
  async resize(size: number): Promise<void> {
    if (this.#closed) throw new ChannelPoolError('POOL_CLOSED', 'Channel account pool is closed');
    if (!Number.isInteger(size) || size < 0 || size > this.#maxSize) {
      throw new RangeError(`ChannelAccountPool size must be between 0 and ${this.#maxSize}`);
    }
    if (size > this.#entries.size + this.#creating && !this.#factory) {
      throw new ChannelPoolError('FACTORY_FAILED', 'Channel account pool has no account factory');
    }
    this.#targetSize = size;

    const creations: Promise<void>[] = [];
    while (this.#entries.size + this.#creating < size) creations.push(this.#startCreate());
    await Promise.all(creations);

    let excess = this.#entries.size - size;
    if (excess <= 0) return;
    const entries = [...this.#entries.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    for (const entry of entries) {
      if (excess <= 0) break;
      if (entry.leased) {
        entry.retire = true;
      } else {
        await this.#reclaim(entry);
      }
      excess -= 1;
    }
  }

  /** Reject waiters and reclaim all idle accounts; leased accounts retire on release. */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#targetSize = 0;
    for (const waiter of this.#waiters.splice(0)) {
      this.#cleanWaiter(waiter);
      waiter.reject(new ChannelPoolError('POOL_CLOSED', 'Channel account pool is closed'));
    }
    await Promise.all([...this.#entries.values()].map(async (entry) => {
      if (entry.leased) entry.retire = true;
      else await this.#reclaim(entry);
    }));
  }

  #add(account: ChannelAccount): Entry {
    if (!account.address || !account.signer) {
      throw new TypeError('A channel account requires address and signer');
    }
    if (this.#entries.has(account.address)) {
      throw new TypeError(`Duplicate channel account ${account.address}`);
    }
    const entry: Entry = {
      account,
      leased: false,
      retire: false,
      lastUsedAt: this.#now(),
    };
    this.#entries.set(account.address, entry);
    return entry;
  }

  #availableEntry(): Entry | undefined {
    return [...this.#entries.values()]
      .filter((entry) => !entry.leased && !entry.retire)
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
  }

  #makeLease(entry: Entry): ChannelAccountLease {
    entry.leased = true;
    let released = false;
    const release = async (outcome: ChannelLeaseOutcome = 'rolled_back') => {
      if (released) return;
      released = true;
      if (outcome === 'committed') this.#committed += 1;
      else this.#rolledBack += 1;
      entry.leased = false;
      entry.lastUsedAt = this.#now();
      if (entry.retire || this.#closed || this.#entries.size > this.#targetSize) {
        await this.#reclaim(entry);
      }
      this.#dispatch();
    };
    return {
      account: entry.account,
      address: entry.account.address,
      signer: entry.account.signer,
      release,
      use: async <T>(work: (account: ChannelAccount) => Promise<T>) => {
        try {
          const result = await work(entry.account);
          await release('committed');
          return result;
        } catch (error) {
          await release('rolled_back');
          throw error;
        }
      },
    };
  }

  #dispatch(): void {
    while (this.#waiters.length > 0) {
      const entry = this.#availableEntry();
      if (!entry) break;
      const waiter = this.#waiters.shift()!;
      this.#cleanWaiter(waiter);
      waiter.resolve(this.#makeLease(entry));
    }

    const demand = this.#waiters.length;
    const room = this.#maxSize - this.#entries.size - this.#creating;
    if (demand > this.#creating && room > 0 && this.#factory) {
      const growth = Math.min(demand - this.#creating, room);
      this.#targetSize = Math.max(this.#targetSize, this.#entries.size + this.#creating + growth);
      for (let i = 0; i < growth; i += 1) {
        // The waiting lease receives FACTORY_FAILED. Consume the internal
        // promise too so a lifecycle failure never becomes an unhandled rejection.
        void this.#startCreate().catch(() => undefined);
      }
    }
  }

  async #startCreate(): Promise<void> {
    if (!this.#factory) {
      throw new ChannelPoolError('FACTORY_FAILED', 'Channel account pool has no account factory');
    }
    this.#creating += 1;
    try {
      const account = await this.#factory.create();
      if (this.#closed || this.#entries.size >= this.#targetSize) {
        await this.#factory.reclaim?.(account);
      } else {
        this.#add(account);
      }
    } catch (error) {
      const wrapped = error instanceof ChannelPoolError
        ? error
        : new ChannelPoolError(
            'FACTORY_FAILED',
            `Creating a channel account failed: ${error instanceof Error ? error.message : String(error)}`,
            error,
          );
      const waiter = this.#waiters.shift();
      if (waiter) {
        this.#cleanWaiter(waiter);
        waiter.reject(wrapped);
      }
      throw wrapped;
    } finally {
      this.#creating -= 1;
      this.#dispatch();
    }
  }

  async #reclaim(entry: Entry): Promise<void> {
    if (!this.#entries.delete(entry.account.address)) return;
    await this.#factory?.reclaim?.(entry.account);
  }

  #removeWaiter(waiter: Waiter): boolean {
    const index = this.#waiters.indexOf(waiter);
    if (index < 0) return false;
    this.#waiters.splice(index, 1);
    this.#cleanWaiter(waiter);
    return true;
  }

  #cleanWaiter(waiter: Waiter): void {
    if (waiter.timer) clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener('abort', waiter.onAbort);
    }
  }
}
