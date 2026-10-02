import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Account,
  Address,
  SorobanDataBuilder,
  SorobanRpc,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

import { StellarAgent, StellarAgentError } from '../index.js';
import type { Signer } from '../signer.js';
import { TEST_PUBLIC, TEST_SECRET, DEPLOYED_CONTRACTS } from './fixtures.js';

// The same JSON is checked against the WASM-derived contract specs and read by
// the Python generated-type test. Restore the native values returned by RPC.
const contractResponses = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../fixtures/contract-responses.json'), 'utf8'),
  (_key, value: unknown) => {
    if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
    if (typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
      return Buffer.from(value.slice(2), 'hex');
    }
    return value;
  },
) as Record<string, unknown>;

function addressAuthEntry(): xdr.SorobanAuthorizationEntry {
  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(DEPLOYED_CONTRACTS.paymentChannel).toScAddress(),
    functionName: 'open_channel',
    args: [],
  });
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(TEST_PUBLIC).toScAddress(),
        nonce: xdr.Int64.fromString('1'),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction
        .sorobanAuthorizedFunctionTypeContractFn(invokeArgs),
      subInvocations: [],
    }),
  });
}

function simulation(retval: xdr.ScVal, auth: xdr.SorobanAuthorizationEntry[] = []) {
  return {
    id: 'simulation',
    latestLedger: 100,
    events: [],
    _parsed: true,
    transactionData: new SorobanDataBuilder(),
    minResourceFee: '0',
    cost: { cpuInsns: '0', memBytes: '0' },
    result: { auth, retval },
  };
}

async function agentWithRpc(rpc: Record<string, unknown>) {
  const agent = await StellarAgent.create({
    network: 'testnet',
    secretKey: TEST_SECRET,
    contracts: DEPLOYED_CONTRACTS,
  });
  (agent as unknown as { rpc: Record<string, unknown> }).rpc = rpc;
  return agent;
}

describe('shared Soroban invocation pipeline', () => {
  it('simulates, signs auth and envelope, submits, polls, and tracks the channel', async () => {
    const auth = addressAuthEntry();
    const rpc = {
      getAccount: vi.fn(async () => new Account(TEST_PUBLIC, '1')),
      simulateTransaction: vi.fn(async (_transaction: unknown) => simulation(
        nativeToScVal(7n, { type: 'u64' }),
        [auth],
      )),
      sendTransaction: vi.fn(async () => ({ status: 'PENDING', hash: 'tx-hash' })),
      getTransaction: vi.fn(async () => ({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        ledger: 123,
        returnValue: nativeToScVal(7n, { type: 'u64' }),
      })),
    };
    const agent = await agentWithRpc(rpc);
    const signer = (agent as unknown as { signer: Signer }).signer;
    const authSpy = vi.spyOn(signer, 'signAuthEntry').mockImplementation(
      async (entry: string) => entry,
    );
    const txSpy = vi.spyOn(signer, 'signTransaction');

    await expect(agent.openChannel({
      deposit: '10',
      limitPerPeriod: '1',
      period: 'hourly',
    })).resolves.toBe(7n);

    expect(rpc.simulateTransaction).toHaveBeenCalledOnce();
    const simulatedTx = rpc.simulateTransaction.mock.calls[0]![0] as {
      operations: Array<{
        func: { invokeContract(): { args(): xdr.ScVal[] } };
      }>;
    };
    const invokeArgs = simulatedTx.operations[0].func.invokeContract().args();
    expect(invokeArgs.map((arg: xdr.ScVal) => arg.switch().name)).toEqual([
      'scvAddress', 'scvAddress', 'scvAddress', 'scvI128', 'scvI128', 'scvVec',
    ]);
    expect(scValToNative(invokeArgs[3])).toBe(100_000_000n);
    expect(scValToNative(invokeArgs[4])).toBe(10_000_000n);
    expect(scValToNative(invokeArgs[5])).toEqual(['Hourly']);
    expect(authSpy).toHaveBeenCalledWith(auth.toXDR('base64'), {
      networkPassphrase: 'Test SDF Network ; September 2015',
      validUntilLedgerSeq: 200,
    });
    expect(txSpy).toHaveBeenCalledOnce();
    expect(rpc.sendTransaction).toHaveBeenCalledOnce();
    expect(rpc.getTransaction).toHaveBeenCalledWith('tx-hash');
    expect((agent as unknown as { activeChannelId?: bigint }).activeChannelId).toBe(7n);
  });

  it('uses simulation-only execution for reads and decodes the result', async () => {
    const rpc = {
      getAccount: vi.fn(async () => new Account(TEST_PUBLIC, '1')),
      simulateTransaction: vi.fn(async () => simulation(xdr.ScVal.scvBool(false))),
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
    };
    const agent = await agentWithRpc(rpc);

    await expect(agent.checkRateLimit('1.25')).resolves.toBe(false);
    expect(rpc.simulateTransaction).toHaveBeenCalledOnce();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('maps contract panics to a stable machine-readable code', async () => {
    const rpc = {
      getAccount: vi.fn(async () => new Account(TEST_PUBLIC, '1')),
      simulateTransaction: vi.fn(async () => ({
        id: 'simulation',
        latestLedger: 100,
        events: [],
        _parsed: true,
        error: 'contract panic: spend limit exceeded for this period',
      })),
    };
    const agent = await agentWithRpc(rpc);
    (agent as unknown as { activeChannelId?: bigint }).activeChannelId = 1n;

    const error = await agent.payForAPI({
      endpoint: 'https://api.example.com',
      amount: '2',
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe('SPEND_LIMIT_EXCEEDED');
  });

  it('wraps RPC transport failures without misclassifying them as contract panics', async () => {
    const rpcError = new Error('connection refused');
    const agent = await agentWithRpc({
      getAccount: vi.fn(async () => { throw rpcError; }),
    });

    const error = await agent.getChannel(1n).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.cause).toBe(rpcError);
  });

  it('decodes AgentInfo, Channel, Job, and RateLimit contract structs', async () => {
    const agent = await agentWithRpc({});
    vi.spyOn(agent as unknown as {
      invokeContract(...args: unknown[]): Promise<unknown>;
    }, 'invokeContract').mockImplementation(
      async (...args: unknown[]) => {
        const method = String(args[1]);
        return { value: contractResponses[method], tx: { hash: '', success: true } };
      },
    );

    await expect(agent.getAgent(2n)).resolves.toMatchObject({
      id: 2n, name: 'worker', totalOps: 3n,
    });
    await expect(agent.getChannel(3n)).resolves.toMatchObject({
      id: 3n, limitPerPeriod: 50n, totalSpent: 20n,
      period: 'hourly', periodStartLedger: 700,
    });
    await expect(agent.getJob(4n)).resolves.toMatchObject({
      id: 4n, taskDescription: 'task', result: 'done', status: 'pending_release',
    });
    await expect(agent.getRateLimitStatus()).resolves.toEqual({
      configured: true,
      active: true,
      maxPerTx: '1.0000000',
      maxPerHour: '2.0000000',
      maxPerDay: '3.0000000',
      maxTxsPerHour: 4,
      spentThisHour: '0.5000000',
      spentToday: '0.6000000',
      txsThisHour: 2,
      hourWindowStartLedger: 700,
      dayWindowStartLedger: 100,
    });
  });

  // `RateLimiter.get_limits` panics for an agent `set_limits` was never called
  // for, and that panic is the only signal distinguishing "no limits" from
  // "limits that happen to be zero" — `is_active` returns `true` for both.
  it('reports an unconfigured rate limiter instead of propagating its panic', async () => {
    const agent = await agentWithRpc({});
    vi.spyOn(agent as unknown as {
      invokeContract(...args: unknown[]): Promise<unknown>;
    }, 'invokeContract').mockImplementation(async () => {
      throw new StellarAgentError(
        'RATE_LIMIT_NOT_FOUND',
        'get_limits simulation failed: no rate limit for agent',
      );
    });

    await expect(agent.getRateLimitStatus()).resolves.toMatchObject({
      configured: false,
      maxPerTx: '0',
      txsThisHour: 0,
    });
  });

  describe('predictPayment', () => {
    it('gathers channel, rate-limit, and ledger state and allows payment under limits', async () => {
      const agent = await agentWithRpc({
        getLatestLedger: vi.fn(async () => ({ sequence: 800 })),
      });
      vi.spyOn(agent as unknown as {
        invokeContract(...args: unknown[]): Promise<unknown>;
      }, 'invokeContract').mockImplementation(
        async (_contract: string, method: string) => {
          const values: Record<string, unknown> = {
            get_channel: {
              agent: TEST_PUBLIC,
              owner: TEST_PUBLIC,
              token: DEPLOYED_CONTRACTS.paymentChannel,
              limit_per_period: 50n,
              period: ['Hourly'],
              spent_this_period: 10n,
              period_start_ledger: 700,
              total_spent: 20n,
              active: true,
              allocated: 0n,
              collateral: 100n,
              dispute_ledgers: 17280,
              voucher_signer: null,
            },
            get_limits: {
              agent: TEST_PUBLIC,
              owner: TEST_PUBLIC,
              max_per_tx: 10_000_000n,
              max_per_hour: 20_000_000n,
              max_per_day: 30_000_000n,
              max_txs_per_hour: 4,
              hourly_spend: 5_000_000n,
              daily_spend: 6_000_000n,
              hourly_tx_count: 2,
              hour_window_start: 700,
              day_window_start: 100,
              active: true,
            },
          };
          return { value: values[method], tx: { hash: '', success: true } };
        },
      );

      const prediction = await agent.predictPayment({ amount: '0.1', channelId: 3n });
      expect(prediction).toEqual({
        wouldBlock: false,
        reasons: [],
      });
    });

    it('identifies blocked payments and cites reasons when limits are exceeded', async () => {
      const agent = await agentWithRpc({
        getLatestLedger: vi.fn(async () => ({ sequence: 800 })),
      });
      vi.spyOn(agent as unknown as {
        invokeContract(...args: unknown[]): Promise<unknown>;
      }, 'invokeContract').mockImplementation(
        async (_contract: string, method: string) => {
          const values: Record<string, unknown> = {
            get_channel: {
              agent: TEST_PUBLIC,
              owner: TEST_PUBLIC,
              token: DEPLOYED_CONTRACTS.paymentChannel,
              limit_per_period: 50n,
              period: ['Hourly'],
              spent_this_period: 45n,
              period_start_ledger: 700,
              total_spent: 45n,
              active: true,
              allocated: 0n,
              collateral: 100n,
              dispute_ledgers: 17280,
              voucher_signer: null,
            },
            get_limits: {
              agent: TEST_PUBLIC,
              owner: TEST_PUBLIC,
              max_per_tx: 10_000_000n,
              max_per_hour: 20_000_000n,
              max_per_day: 30_000_000n,
              max_txs_per_hour: 4,
              hourly_spend: 5_000_000n,
              daily_spend: 6_000_000n,
              hourly_tx_count: 2,
              hour_window_start: 700,
              day_window_start: 100,
              active: true,
            },
          };
          return { value: values[method], tx: { hash: '', success: true } };
        },
      );

      const prediction = await agent.predictPayment({ amount: '10', channelId: 3n });
      expect(prediction.wouldBlock).toBe(true);
      expect(prediction.reasons).toContain('channel_spend_limit');
      expect(prediction.reasons).toContain('rate_limit_per_tx');
    });

    it('predicts correctly with an unconfigured rate limiter', async () => {
      const agent = await agentWithRpc({
        getLatestLedger: vi.fn(async () => ({ sequence: 800 })),
      });
      vi.spyOn(agent as unknown as {
        invokeContract(...args: unknown[]): Promise<unknown>;
      }, 'invokeContract').mockImplementation(
        async (_contract: string, method: string) => {
          if (method === 'get_limits') {
            throw new StellarAgentError(
              'RATE_LIMIT_NOT_FOUND',
              'get_limits simulation failed: no rate limit for agent',
            );
          }
          if (method === 'get_channel') {
            return {
              value: {
                agent: TEST_PUBLIC,
                owner: TEST_PUBLIC,
                token: DEPLOYED_CONTRACTS.paymentChannel,
                limit_per_period: 50n,
                period: ['Hourly'],
                spent_this_period: 10n,
                period_start_ledger: 700,
                total_spent: 10n,
                active: true,
                allocated: 0n,
                collateral: 100n,
                dispute_ledgers: 17280,
                voucher_signer: null,
              },
              tx: { hash: '', success: true },
            };
          }
          return { value: null, tx: { hash: '', success: true } };
        },
      );

      const allowed = await agent.predictPayment({ amount: '5', channelId: 3n });
      expect(allowed).toEqual({ wouldBlock: false, reasons: [] });

      const blocked = await agent.predictPayment({ amount: '45', channelId: 3n });
      expect(blocked).toEqual({
        wouldBlock: true,
        reasons: ['channel_spend_limit'],
      });
    });

    it('predicts without channel state when no channelId or activeChannelId is present', async () => {
      const agent = await agentWithRpc({
        getLatestLedger: vi.fn(async () => ({ sequence: 800 })),
      });
      vi.spyOn(agent as unknown as {
        invokeContract(...args: unknown[]): Promise<unknown>;
      }, 'invokeContract').mockImplementation(
        async (_contract: string, method: string) => {
          if (method === 'get_limits') {
            return {
              value: {
                agent: TEST_PUBLIC,
                owner: TEST_PUBLIC,
                max_per_tx: 10_000_000n,
                max_per_hour: 50_000_000n,
                max_per_day: 30_000_000n,
                max_txs_per_hour: 4,
                hourly_spend: 5_000_000n,
                daily_spend: 6_000_000n,
                hourly_tx_count: 2,
                hour_window_start: 700,
                day_window_start: 100,
                active: true,
              },
              tx: { hash: '', success: true },
            };
          }
          throw new Error(`unexpected method ${method}`);
        },
      );

      const prediction = await agent.predictPayment({ amount: '0.5' });
      expect(prediction).toEqual({ wouldBlock: false, reasons: [] });

      const blocked = await agent.predictPayment({ amount: '1.2' });
      expect(blocked).toEqual({
        wouldBlock: true,
        reasons: ['rate_limit_per_tx'],
      });
    });

    it('defaults to activeChannelId when channelId parameter is omitted', async () => {
      const agent = await agentWithRpc({
        getLatestLedger: vi.fn(async () => ({ sequence: 800 })),
      });
      (agent as unknown as { activeChannelId: bigint }).activeChannelId = 9n;

      const getChannelSpy = vi.spyOn(agent, 'getChannel').mockResolvedValue({
        id: 9n,
        agent: TEST_PUBLIC,
        owner: TEST_PUBLIC,
        token: DEPLOYED_CONTRACTS.paymentChannel,
        limitPerPeriod: 50n,
        spentThisPeriod: 10n,
        periodStartLedger: 700,
        totalSpent: 10n,
        period: 'hourly',
        active: true,
      });
      vi.spyOn(agent, 'getRateLimitStatus').mockResolvedValue({
        configured: false,
        active: true,
        maxPerTx: '0',
        maxPerHour: '0',
        maxPerDay: '0',
        maxTxsPerHour: 0,
        spentThisHour: '0',
        spentToday: '0',
        txsThisHour: 0,
        hourWindowStartLedger: 0,
        dayWindowStartLedger: 0,
      });

      const result = await agent.predictPayment({ amount: '5' });
      expect(getChannelSpy).toHaveBeenCalledWith(9n);
      expect(result).toEqual({ wouldBlock: false, reasons: [] });
    });
  });
});


