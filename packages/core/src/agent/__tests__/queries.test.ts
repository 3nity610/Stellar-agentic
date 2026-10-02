import { describe, expect, it, vi } from 'vitest';
import type { InvokeFn } from '../invocation.js';
import {
  checkRateLimit,
  getAgent,
  getBalance,
  getChannel,
  getJob,
  getRateLimitStatus,
  getSpendReport,
} from '../queries.js';
import { StellarAgentError } from '../../errors.js';
import { TEST_PUBLIC } from '../../__tests__/fixtures.js';

function invokeReturning(value: unknown): InvokeFn {
  return vi.fn(async () => ({ value, tx: { hash: '', success: true } }));
}

describe('getAgent', () => {
  it('calls get_agent read-only and maps the result onto AgentInfo', async () => {
    const invoke = invokeReturning({
      address: 'GADDR', name: 'worker', owner: 'GOWNER', active: true, created_at: 1, total_ops: 2n,
    });
    const info = await getAgent(invoke, 'CFACTORY', 5n);
    expect(info).toMatchObject({ id: 5n, name: 'worker', totalOps: 2n });
    expect(invoke).toHaveBeenCalledWith('CFACTORY', 'get_agent', expect.any(Array), true);
  });
});

describe('getBalance', () => {
  it('returns the native balance', async () => {
    const horizon = {
      loadAccount: vi.fn(async () => ({
        balances: [{ asset_type: 'native', balance: '42.0000000' }],
      })),
    };
    await expect(getBalance(horizon as never, 'GADDR')).resolves.toBe('42.0000000');
  });

  it('returns "0" when the account has no native balance', async () => {
    const horizon = { loadAccount: vi.fn(async () => ({ balances: [] })) };
    await expect(getBalance(horizon as never, 'GADDR')).resolves.toBe('0');
  });

  it('returns "0" rather than throwing when the account lookup fails', async () => {
    const horizon = { loadAccount: vi.fn(async () => { throw new Error('404'); }) };
    await expect(getBalance(horizon as never, 'GADDR')).resolves.toBe('0');
  });
});

describe('getSpendReport', () => {
  it('throws NO_ACTIVE_CHANNEL when no channel id is given', async () => {
    const invoke = invokeReturning(undefined);
    const error = await getSpendReport(invoke, 'CCHANNEL', undefined).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe('NO_ACTIVE_CHANNEL');
  });

  it('combines get_channel and remaining_this_period into a SpendReport', async () => {
    const invoke = vi.fn(async (_id: string, method: string) => {
      if (method === 'get_channel') {
        return {
          value: {
            agent: 'GAGENT', owner: 'GOWNER', token: 'CTOKEN', limit_per_period: 50n,
            period: ['Hourly'], spent_this_period: 10n, period_start_ledger: 700,
            total_spent: 20n, active: true,
            allocated: 0n, collateral: 100n, dispute_ledgers: 17280, voucher_signer: null,
          },
          tx: { hash: '', success: true },
        };
      }
      return { value: 40n, tx: { hash: '', success: true } };
    }) as unknown as InvokeFn;
    const report = await getSpendReport(invoke, 'CCHANNEL', 1n);
    expect(report).toEqual({
      spentThisPeriod: '0.0000010',
      remainingThisPeriod: '0.0000040',
      totalLifetime: '0.0000020',
    });
  });
});

describe('getChannel', () => {
  it('maps a raw channel record onto ChannelInfo', async () => {
    const invoke = invokeReturning({
      agent: 'GAGENT', owner: 'GOWNER', token: 'CTOKEN', limit_per_period: 50n,
      period: ['Daily'], spent_this_period: 0n, period_start_ledger: 1,
      total_spent: 0n, active: true,
      allocated: 0n, collateral: 100n, dispute_ledgers: 17280, voucher_signer: null,
    });
    const info = await getChannel(invoke, 'CCHANNEL', 3n);
    expect(info).toMatchObject({ id: 3n, period: 'daily' });
  });
});

describe('getJob', () => {
  it('maps a raw job record onto JobInfo', async () => {
    const invoke = invokeReturning({
      requester: 'GREQ', worker: null, arbiter: null, token: 'CTOKEN', amount: 1n,
      task_description: Buffer.from('t'), result: null, deadline_ledger: 1,
      status: ['Open'], created_at: 1, dispute_deadline_ledger: null,
    });
    const info = await getJob(invoke, 'CESCROW', 4n);
    expect(info).toMatchObject({ id: 4n, status: 'open', result: null });
  });
});

describe('getRateLimitStatus', () => {
  it('reports unconfigured rather than propagating a RATE_LIMIT_NOT_FOUND panic', async () => {
    const invoke: InvokeFn = vi.fn(async () => {
      throw new StellarAgentError('RATE_LIMIT_NOT_FOUND', 'no rate limit for agent');
    });
    const status = await getRateLimitStatus(invoke, 'CLIMITER', TEST_PUBLIC);
    expect(status).toMatchObject({ configured: false });
  });

  it('re-throws any other error', async () => {
    const invoke: InvokeFn = vi.fn(async () => { throw new Error('rpc offline'); });
    await expect(getRateLimitStatus(invoke, 'CLIMITER', TEST_PUBLIC)).rejects.toThrow('rpc offline');
  });

  it('maps a configured raw record onto RateLimitStatus', async () => {
    const invoke = invokeReturning({
      active: true, agent: TEST_PUBLIC, owner: TEST_PUBLIC,
      max_per_tx: 1n, max_per_hour: 2n, max_per_day: 3n, max_txs_per_hour: 1,
      hourly_spend: 0n, daily_spend: 0n, hourly_tx_count: 0, hour_window_start: 0, day_window_start: 0,
    });
    const status = await getRateLimitStatus(invoke, 'CLIMITER', TEST_PUBLIC);
    expect(status.configured).toBe(true);
  });
});

describe('checkRateLimit', () => {
  it('returns the boolean simulation result', async () => {
    const invoke = invokeReturning(true);
    await expect(checkRateLimit(invoke, 'CLIMITER', TEST_PUBLIC, '1')).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('CLIMITER', 'check', expect.any(Array), true);
  });
});
