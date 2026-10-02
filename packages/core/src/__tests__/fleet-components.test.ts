import { describe, expect, it, vi } from 'vitest';
import { Account, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  CallbackFeeStrategy,
  ChannelAccountPool,
  ChannelPoolError,
  FixedFeeStrategy,
  InMemoryMetrics,
  KeypairSigner,
  MultiplierFeeStrategy,
  RecentFeeStrategy,
  SponsorService,
  SubmissionQueue,
  SubmissionQueueError,
  classifySubmissionError,
} from '../index.js';
import type { ChannelAccount, FeeStats } from '../index.js';

function channel(): ChannelAccount {
  const signer = KeypairSigner.random();
  return { address: signer.publicKey(), signer };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const distribution = (value: string) => ({
  min: value,
  mode: value,
  p10: value,
  p20: value,
  p30: value,
  p40: value,
  p50: value,
  p60: value,
  p70: value,
  p80: value,
  p90: value,
  p95: value,
  p99: value,
  max: value,
});

const feeStats = (classic: string, soroban: string): FeeStats => ({
  inclusionFee: distribution(classic),
  sorobanInclusionFee: distribution(soroban),
  latestLedger: 100,
});

describe('ChannelAccountPool', () => {
  it('leases accounts exclusively and wakes waiters in release order', async () => {
    const first = channel();
    const pool = new ChannelAccountPool({ accounts: [first], maxSize: 1, leaseTimeoutMs: 100 });
    const lease = await pool.lease();
    const waiting = pool.lease();

    expect(pool.stats).toMatchObject({ leased: 1, waiting: 1, available: 0 });
    await lease.release('committed');
    const next = await waiting;
    expect(next.address).toBe(first.address);
    expect(pool.stats.committed).toBe(1);
    await next.release('rolled_back');
    expect(pool.stats.rolledBack).toBe(1);
  });

  it('grows under pressure and reclaims accounts when resized', async () => {
    const created: ChannelAccount[] = [];
    const reclaimed: string[] = [];
    const pool = await ChannelAccountPool.create({
      minSize: 1,
      maxSize: 4,
      factory: {
        create: vi.fn(async () => {
          const account = channel();
          created.push(account);
          return account;
        }),
        reclaim: vi.fn(async (account) => {
          reclaimed.push(account.address);
        }),
      },
    });

    const one = await pool.lease();
    const [two, three] = await Promise.all([pool.lease(), pool.lease()]);
    expect(new Set([one.address, two.address, three.address]).size).toBe(3);
    expect(pool.stats.size).toBe(3);

    const shrinking = pool.resize(1);
    await one.release('committed');
    await two.release('committed');
    await three.release('committed');
    await shrinking;
    expect(pool.stats.size).toBe(1);
    expect(reclaimed).toHaveLength(2);
    expect(created).toHaveLength(3);
  });

  it('rolls back a failed use and never strands the account', async () => {
    const pool = new ChannelAccountPool({ accounts: [channel()], maxSize: 1 });
    await expect(pool.use(async () => {
      throw new Error('build failed before submission');
    })).rejects.toThrow('build failed');
    expect(pool.stats).toMatchObject({ available: 1, leased: 0, rolledBack: 1 });
    await expect(pool.use(async (account) => account.address)).resolves.toMatch(/^G/);
  });

  it('times out, aborts, and closes pending leases predictably', async () => {
    const pool = new ChannelAccountPool({ accounts: [channel()], maxSize: 1, leaseTimeoutMs: 5 });
    const lease = await pool.lease();
    await expect(pool.lease()).rejects.toMatchObject({ code: 'LEASE_TIMEOUT' });

    const controller = new AbortController();
    const aborted = pool.lease({ signal: controller.signal, timeoutMs: 0 });
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: 'LEASE_ABORTED' });

    await lease.release();
    await pool.close();
    await expect(pool.lease()).rejects.toBeInstanceOf(ChannelPoolError);
  });
});

describe('fee strategies', () => {
  it('supports fixed, multiplier, and callback policies', async () => {
    expect(new FixedFeeStrategy(250).getFee({
      phase: 'initial', operationCount: 1,
    })).toBe('250');
    await expect(new MultiplierFeeStrategy(1.5, new FixedFeeStrategy(200)).getFee({
      phase: 'initial', operationCount: 1,
    })).resolves.toBe('300');
    await expect(new CallbackFeeStrategy((context) =>
      context.phase === 'fee_bump' ? 900 : 300).getFee({
      phase: 'fee_bump', operationCount: 2,
    })).resolves.toBe('900');
  });

  it('uses recent Soroban percentiles, clamps, and caches one fee-stat request', async () => {
    let now = 1_000;
    const load = vi.fn(async () => feeStats('200', '1000'));
    const strategy = new RecentFeeStrategy({
      percentile: 'p90',
      multiplier: 1.2,
      maximumFee: 2_000,
      cacheMs: 5_000,
      now: () => now,
    });
    const context = {
      phase: 'initial' as const,
      operationCount: 1,
      soroban: true,
      getFeeStats: load,
    };
    await expect(strategy.getFee(context)).resolves.toBe('1200');
    await expect(strategy.getFee(context)).resolves.toBe('1200');
    expect(load).toHaveBeenCalledOnce();
    now += 5_001;
    await strategy.getFee(context);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('falls back during an RPC outage and honors a replacement minimum', async () => {
    const strategy = new RecentFeeStrategy({ fallbackFee: 100, multiplier: 1.5 });
    await expect(strategy.getFee({
      phase: 'initial', operationCount: 1,
      getFeeStats: async () => { throw new Error('offline'); },
    })).resolves.toBe('100');
    await expect(strategy.getFee({
      phase: 'fee_bump',
      operationCount: 2,
      minimumFee: '1000',
      getFeeStats: async () => { throw new Error('offline'); },
    })).resolves.toBe('1000');
  });
});

describe('SubmissionQueue', () => {
  it('runs unrelated keys concurrently but strictly orders equal keys', async () => {
    const queue = new SubmissionQueue({ concurrency: 3, maxAttempts: 1 });
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const started: string[] = [];
    const a1 = queue.submit(async () => { started.push('a1'); await gates[0].promise; return 'a1'; }, { orderingKey: 'a' });
    const a2 = queue.submit(async () => { started.push('a2'); await gates[1].promise; return 'a2'; }, { orderingKey: 'a' });
    const b1 = queue.submit(async () => { started.push('b1'); await gates[2].promise; return 'b1'; }, { orderingKey: 'b' });

    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1']);
    gates[0].resolve();
    await a1;
    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1', 'a2']);
    gates[1].resolve();
    gates[2].resolve();
    await expect(Promise.all([a2, b1])).resolves.toEqual(['a2', 'b1']);
  });

  it('enforces backpressure and records queue depth, latency, retry, and expiry metrics', async () => {
    const metrics = new InMemoryMetrics();
    const gate = deferred<void>();
    const queue = new SubmissionQueue({
      concurrency: 1,
      maxQueueSize: 1,
      maxAttempts: 2,
      retryDelayMs: 0,
      sleep: async () => undefined,
      metrics,
    });
    const running = queue.submit(async () => { await gate.promise; return 1; });
    const queued = queue.submit(async () => 2);
    await expect(queue.submit(async () => 3)).rejects.toBeInstanceOf(SubmissionQueueError);
    gate.resolve();
    await expect(Promise.all([running, queued])).resolves.toEqual([1, 2]);

    let attempts = 0;
    await expect(queue.submit(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('429 try again later');
      return 'retried';
    })).resolves.toBe('retried');
    await expect(queue.submit(async () => {
      throw new Error('tx_too_late: expired');
    })).rejects.toThrow('expired');

    expect(queue.stats).toMatchObject({ completed: 3, retries: 1, expired: 1 });
    expect(metrics.histograms.some((item) => item.name.endsWith('queue_depth'))).toBe(true);
    expect(metrics.histograms.some((item) => item.name.endsWith('latency_ms'))).toBe(true);
    expect(metrics.counters.some((item) => item.name.endsWith('retries'))).toBe(true);
    expect(metrics.counters.some((item) => item.name.endsWith('expiries'))).toBe(true);
  });

  it('classifies sequence/network errors without retrying contract failures', () => {
    expect(classifySubmissionError(new Error('tx_bad_seq'))).toBe('retryable');
    expect(classifySubmissionError(new Error('ECONNRESET'))).toBe('retryable');
    expect(classifySubmissionError(new Error('transaction timebound expired'))).toBe('expired');
    expect(classifySubmissionError(new Error('spend limit exceeded'))).toBe('permanent');
  });
});

describe('SponsorService', () => {
  it('creates an account at zero balance inside begin/create/end sponsorship', async () => {
    const sponsorKeypair = Keypair.random();
    const targetKeypair = Keypair.random();
    const sponsorSigner = new KeypairSigner(sponsorKeypair);
    const targetSigner = new KeypairSigner(targetKeypair);
    const sent: Array<ReturnType<typeof TransactionBuilder.fromXDR>> = [];
    const rpc = {
      getAccount: vi.fn(async (address: string) => new Account(address, '9')),
      getFeeStats: vi.fn(async () => feeStats('100', '100')),
      sendTransaction: vi.fn(async (transaction: ReturnType<typeof TransactionBuilder.fromXDR>) => {
        sent.push(transaction);
        return { status: 'PENDING', hash: 'sponsor-create' };
      }),
      getTransaction: vi.fn(async () => ({ status: 'SUCCESS', ledger: 44 })),
    };
    const service = new SponsorService({
      sponsorSigner,
      rpc,
      networkPassphrase: Networks.TESTNET,
      pollIntervalMs: 0,
    });

    const record = await service.createSponsoredAccount(targetSigner);
    expect(record).toMatchObject({
      account: targetKeypair.publicKey(),
      sponsor: sponsorKeypair.publicKey(),
      active: true,
      createdByService: true,
    });
    const transaction = sent[0]! as Extract<typeof sent[number], { source: string }>;
    expect(transaction.source).toBe(sponsorKeypair.publicKey());
    expect(transaction.signatures).toHaveLength(2);
    expect(transaction.operations.map((operation) => operation.type)).toEqual([
      'beginSponsoringFutureReserves',
      'createAccount',
      'endSponsoringFutureReserves',
    ]);
    expect(transaction.operations[1]).toMatchObject({
      destination: targetKeypair.publicKey(),
      startingBalance: '0.0000000',
    });
    expect(record.transaction?.feePaid).toBe(transaction.fee);
    await expect(service.ensureSponsoredAccount(targetSigner)).resolves.toMatchObject({
      active: true,
      createdByService: true,
    });
    expect(rpc.sendTransaction).toHaveBeenCalledOnce();
  });

  it('returns an already-existing account without submitting creation', async () => {
    const sponsorSigner = KeypairSigner.random();
    const targetSigner = KeypairSigner.random();
    const rpc = {
      getAccount: vi.fn(async (address: string) => new Account(address, '1')),
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
    };
    const service = new SponsorService({ sponsorSigner, rpc, networkPassphrase: Networks.TESTNET });
    await expect(service.ensureSponsoredAccount(targetSigner)).resolves.toMatchObject({
      createdByService: false,
      active: false,
    });
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('serializes sponsor-source sequences during concurrent fleet growth', async () => {
    const sponsorSigner = KeypairSigner.random();
    let sequence = 0n;
    let active = 0;
    let peak = 0;
    const rpc = {
      getAccount: vi.fn(async (address: string) => new Account(address, sequence.toString())),
      sendTransaction: vi.fn(async (envelope: ReturnType<typeof TransactionBuilder.fromXDR>) => {
        const transaction = envelope as Extract<typeof envelope, { source: string }>;
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        expect(BigInt(transaction.sequence)).toBe(sequence + 1n);
        sequence += 1n;
        active -= 1;
        return { status: 'PENDING', hash: `create-${sequence}` };
      }),
      getTransaction: vi.fn(async () => ({ status: 'SUCCESS', ledger: 10 })),
    };
    const service = new SponsorService({
      sponsorSigner,
      rpc,
      networkPassphrase: Networks.TESTNET,
      pollIntervalMs: 0,
    });
    await Promise.all(Array.from({ length: 4 }, () =>
      service.createSponsoredAccount(KeypairSigner.random())));
    expect(sequence).toBe(4n);
    expect(peak).toBe(1);
  });
});
