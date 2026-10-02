import { describe, expect, it, vi } from 'vitest';
import {
  Account,
  SorobanDataBuilder,
  SorobanRpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  ChannelAccountPool,
  FixedFeeStrategy,
  KeypairSigner,
  SponsorService,
  StellarAgent,
} from '../index.js';
import type { ChannelAccount } from '../index.js';
import { DEPLOYED_CONTRACTS, TEST_PUBLIC, TEST_SECRET } from './fixtures.js';

function simulation(retval: xdr.ScVal = xdr.ScVal.scvVoid()) {
  return {
    id: 'simulation',
    latestLedger: 100,
    events: [],
    _parsed: true,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: '0',
    cost: { cpuInsns: '0', memBytes: '0' },
    result: { auth: [], retval },
  };
}

function channels(count: number): ChannelAccount[] {
  return Array.from({ length: count }, () => {
    const signer = KeypairSigner.random();
    return { address: signer.publicKey(), signer };
  });
}

describe('fleet invocation pipeline', () => {
  it('sustains concurrent payments without source/sequence collisions or gaps', async () => {
    const accounts = channels(8);
    const pool = new ChannelAccountPool({ accounts, minSize: 8, maxSize: 8 });
    const sequences = new Map(accounts.map((account) => [account.address, 0n]));
    const accepted: Array<{ source: string; sequence: bigint }> = [];
    let activeSubmissions = 0;
    let peakSubmissions = 0;
    let hashCounter = 0;
    const rpc = {
      getAccount: vi.fn(async (address: string) =>
        new Account(address, String(sequences.get(address) ?? 0n))),
      simulateTransaction: vi.fn(async () => simulation()),
      sendTransaction: vi.fn(async (transaction: ReturnType<typeof TransactionBuilder.fromXDR>) => {
        activeSubmissions += 1;
        peakSubmissions = Math.max(peakSubmissions, activeSubmissions);
        await new Promise((resolve) => setTimeout(resolve, 2));
        const inner = transaction as Extract<typeof transaction, { source: string }>;
        const source = inner.source;
        const sequence = BigInt(inner.sequence);
        const current = sequences.get(source) ?? 0n;
        activeSubmissions -= 1;
        if (sequence !== current + 1n) {
          return { status: 'ERROR', hash: '', errorResult: undefined };
        }
        sequences.set(source, sequence);
        accepted.push({ source, sequence });
        hashCounter += 1;
        return { status: 'PENDING', hash: `load-${hashCounter}` };
      }),
      getTransaction: vi.fn(async () => ({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 500,
      })),
    };
    const agent = await StellarAgent.create({
      network: 'testnet',
      secretKey: TEST_SECRET,
      contracts: DEPLOYED_CONTRACTS,
      channelPool: pool,
      feeStrategy: new FixedFeeStrategy(100),
      feeBump: { enabled: false },
      submission: { concurrency: 8, maxQueueSize: 256 },
    });
    (agent as unknown as { rpc: typeof rpc; activeChannelId: bigint }).rpc = rpc;
    (agent as unknown as { activeChannelId: bigint }).activeChannelId = 1n;

    const count = 128;
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: count }, (_, index) =>
      agent.payForAPI({ endpoint: `/load/${index}`, amount: '0.0000001' })));
    const elapsedSeconds = Math.max(0.001, (performance.now() - start) / 1_000);
    const paymentsPerSecond = count / elapsedSeconds;

    expect(results).toHaveLength(count);
    expect(accepted).toHaveLength(count);
    expect(new Set(accepted.map(({ source, sequence }) => `${source}:${sequence}`)).size).toBe(count);
    for (const account of accounts) {
      const accountSequences = accepted
        .filter(({ source }) => source === account.address)
        .map(({ sequence }) => sequence)
        .sort((a, b) => Number(a - b));
      expect(accountSequences).toEqual(
        Array.from({ length: accountSequences.length }, (_, index) => BigInt(index + 1)),
      );
    }
    expect(peakSubmissions).toBeGreaterThan(1);
    expect(paymentsPerSecond).toBeGreaterThan(10);
    expect(pool.stats).toMatchObject({ committed: count, rolledBack: 0, leased: 0 });
  });

  it('rolls back a channel lease when submission is rejected before acceptance', async () => {
    const account = channels(1)[0]!;
    const cleanPool = new ChannelAccountPool({ accounts: [account], maxSize: 1 });
    const rpc = {
      getAccount: vi.fn(async () => new Account(account.address, '0')),
      simulateTransaction: vi.fn(async () => simulation()),
      sendTransaction: vi.fn(async () => ({ status: 'ERROR', hash: '' })),
      getTransaction: vi.fn(),
    };
    const agent = await StellarAgent.create({
      network: 'testnet',
      secretKey: TEST_SECRET,
      contracts: DEPLOYED_CONTRACTS,
      channelPool: cleanPool,
      feeStrategy: 100,
      feeBump: { enabled: false },
    });
    (agent as unknown as { rpc: typeof rpc; activeChannelId: bigint }).rpc = rpc;
    (agent as unknown as { activeChannelId: bigint }).activeChannelId = 1n;

    await expect(agent.payForAPI({ endpoint: '/failure', amount: '1' }))
      .rejects.toMatchObject({ code: 'SUBMISSION_FAILED' });
    expect(cleanPool.stats).toMatchObject({ rolledBack: 1, committed: 0, available: 1 });
  });

  it('replaces a congested expiring transaction with a higher-fee envelope', async () => {
    const sent: Array<ReturnType<typeof TransactionBuilder.fromXDR>> = [];
    const rpc = {
      getAccount: vi.fn(async () => new Account(TEST_PUBLIC, '4')),
      simulateTransaction: vi.fn(async () => simulation()),
      sendTransaction: vi.fn(async (transaction: ReturnType<typeof TransactionBuilder.fromXDR>) => {
        sent.push(transaction);
        const feeBump = transaction.constructor.name === 'FeeBumpTransaction';
        return { status: 'PENDING', hash: feeBump ? 'bumped-hash' : 'inner-hash' };
      }),
      getTransaction: vi.fn(async (hash: string) => hash === 'inner-hash'
        ? { status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND }
        : { status: SorobanRpc.Api.GetTransactionStatus.SUCCESS, ledger: 777 }),
    };
    const agent = await StellarAgent.create({
      network: 'testnet',
      secretKey: TEST_SECRET,
      contracts: DEPLOYED_CONTRACTS,
      feeStrategy: 100,
      feeBump: {
        enabled: true,
        mode: 'on_expiry',
        triggerAfterAttempts: 1,
        strategy: new FixedFeeStrategy(100),
      },
    });
    (agent as unknown as { rpc: typeof rpc; activeChannelId: bigint }).rpc = rpc;
    (agent as unknown as { activeChannelId: bigint }).activeChannelId = 1n;

    const result = await agent.payForAPI({ endpoint: '/congested', amount: '0.1' });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.constructor.name).toBe('Transaction');
    expect(sent[1]!.constructor.name).toBe('FeeBumpTransaction');
    expect(BigInt(sent[1]!.fee)).toBeGreaterThan(BigInt(sent[0]!.fee));
    expect(result).toMatchObject({
      hash: 'bumped-hash',
      success: true,
      feeBumped: true,
      feeSource: TEST_PUBLIC,
      sourceAccount: TEST_PUBLIC,
      submissionAttempts: 2,
    });
    expect(BigInt(result.feePaid!)).toBeGreaterThan(BigInt(sent[0]!.fee));
  });

  it('retries TRY_AGAIN_LATER with identical signed XDR and no sequence gap', async () => {
    const sentXdr: string[] = [];
    const rpc = {
      getAccount: vi.fn(async () => new Account(TEST_PUBLIC, '11')),
      simulateTransaction: vi.fn(async () => simulation()),
      sendTransaction: vi.fn(async (transaction: ReturnType<typeof TransactionBuilder.fromXDR>) => {
        sentXdr.push(transaction.toXDR());
        return sentXdr.length === 1
          ? { status: 'TRY_AGAIN_LATER', hash: '' }
          : { status: 'PENDING', hash: 'accepted-after-retry' };
      }),
      getTransaction: vi.fn(async () => ({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 900,
      })),
    };
    const agent = await StellarAgent.create({
      network: 'testnet',
      secretKey: TEST_SECRET,
      contracts: DEPLOYED_CONTRACTS,
      feeStrategy: 100,
      feeBump: { enabled: false },
    });
    (agent as unknown as { rpc: typeof rpc; activeChannelId: bigint }).rpc = rpc;
    (agent as unknown as { activeChannelId: bigint }).activeChannelId = 1n;

    await expect(agent.payForAPI({ endpoint: '/retry', amount: '1' }))
      .resolves.toMatchObject({ hash: 'accepted-after-retry', submissionAttempts: 1 });
    expect(sentXdr).toHaveLength(2);
    expect(sentXdr[1]).toBe(sentXdr[0]);
    expect(TransactionBuilder.fromXDR(sentXdr[0]!, 'Test SDF Network ; September 2015'))
      .toMatchObject({ sequence: '12' });
  });

  it('creates a zero-XLM agent under sponsorship and submits through an outer fee payer', async () => {
    const sponsorSigner = KeypairSigner.random();
    const channelSigner = KeypairSigner.random();
    let agentExists = false;
    const lifecycleEnvelopes: Array<ReturnType<typeof TransactionBuilder.fromXDR>> = [];
    const lifecycleRpc = {
      getAccount: vi.fn(async (address: string) => {
        if (address === TEST_PUBLIC && !agentExists) throw new Error('account not found');
        return new Account(address, '10');
      }),
      sendTransaction: vi.fn(async (transaction: ReturnType<typeof TransactionBuilder.fromXDR>) => {
        lifecycleEnvelopes.push(transaction);
        agentExists = true;
        return { status: 'PENDING', hash: 'sponsored-account' };
      }),
      getTransaction: vi.fn(async () => ({ status: 'SUCCESS', ledger: 600 })),
    };
    const sponsorService = new SponsorService({
      sponsorSigner,
      rpc: lifecycleRpc,
      networkPassphrase: 'Test SDF Network ; September 2015',
      pollIntervalMs: 0,
    });
    const pool = new ChannelAccountPool({
      accounts: [{ address: channelSigner.publicKey(), signer: channelSigner }],
      maxSize: 1,
    });
    const submitted: Array<ReturnType<typeof TransactionBuilder.fromXDR>> = [];
    const rpc = {
      getAccount: vi.fn(async (address: string) => new Account(address, '0')),
      simulateTransaction: vi.fn(async () => simulation(xdr.ScVal.scvU64(new xdr.Uint64(9n)))),
      sendTransaction: vi.fn(async (transaction: ReturnType<typeof TransactionBuilder.fromXDR>) => {
        submitted.push(transaction);
        return { status: 'PENDING', hash: 'sponsored-invocation' };
      }),
      getTransaction: vi.fn(async () => ({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 601,
        returnValue: xdr.ScVal.scvU64(new xdr.Uint64(9n)),
      })),
    };
    const agent = await StellarAgent.create({
      network: 'testnet',
      secretKey: TEST_SECRET,
      contracts: DEPLOYED_CONTRACTS,
      sponsorService,
      channelPool: pool,
      feeStrategy: 100,
      feeBump: { strategy: 100 },
    });
    (agent as unknown as { rpc: typeof rpc }).rpc = rpc;

    await expect(agent.createAgentWallet('zero-xlm')).resolves.toBe(9n);
    expect(agentExists).toBe(true);
    expect(lifecycleEnvelopes[0]!.operations.map((operation) => operation.type)).toEqual([
      'beginSponsoringFutureReserves',
      'createAccount',
      'endSponsoringFutureReserves',
    ]);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.constructor.name).toBe('FeeBumpTransaction');
    expect((submitted[0] as unknown as { feeSource: string }).feeSource)
      .toBe(await sponsorSigner.getPublicKey());
    expect(pool.stats).toMatchObject({ committed: 1, rolledBack: 0 });
  });
});
