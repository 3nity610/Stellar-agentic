import { describe, expect, it } from 'vitest';
import {
  toAgentInfo,
  toChannelInfo,
  toChannelSpendState,
  toJobInfo,
  toRateLimitSpendState,
  toRateLimitStatus,
} from '../decoding.js';

describe('toAgentInfo', () => {
  it('maps a raw AgentWalletFactory record onto AgentInfo', () => {
    const info = toAgentInfo(2n, {
      address: 'GADDRESS',
      name: 'worker',
      owner: 'GOWNER',
      active: true,
      created_at: 9,
      total_ops: 3n,
    });
    expect(info).toEqual({
      id: 2n,
      address: 'GADDRESS',
      name: 'worker',
      owner: 'GOWNER',
      active: true,
      createdAt: 9,
      totalOps: 3n,
    });
  });
});

describe('toChannelInfo', () => {
  it('maps a raw PaymentChannel record onto ChannelInfo, ignoring fields ChannelInfo does not surface', () => {
    const info = toChannelInfo(3n, {
      agent: 'GAGENT',
      owner: 'GOWNER',
      token: 'CTOKEN',
      limit_per_period: 50n,
      period: 'hourly',
      spent_this_period: 10n,
      period_start_ledger: 700,
      total_spent: 20n,
      active: true,
      allocated: 0n,
      collateral: 100n,
      dispute_ledgers: 17280,
      voucher_signer: null,
    });
    expect(info).toEqual({
      id: 3n,
      agent: 'GAGENT',
      owner: 'GOWNER',
      token: 'CTOKEN',
      limitPerPeriod: 50n,
      period: 'hourly',
      spentThisPeriod: 10n,
      periodStartLedger: 700,
      totalSpent: 20n,
      active: true,
    });
  });
});

describe('toJobInfo', () => {
  it('maps a raw Escrow record onto JobInfo, decoding the UTF-8 byte fields', () => {
    const info = toJobInfo(4n, {
      requester: 'GREQ',
      worker: 'GWORKER',
      arbiter: null,
      token: 'CTOKEN',
      amount: 25n,
      task_description: new TextEncoder().encode('task'),
      result: new TextEncoder().encode('done'),
      deadline_ledger: 99,
      status: 'pending_release',
      created_at: 8,
      dispute_deadline_ledger: null,
    });
    expect(info).toEqual({
      id: 4n,
      requester: 'GREQ',
      worker: 'GWORKER',
      arbiter: null,
      token: 'CTOKEN',
      amount: 25n,
      taskDescription: 'task',
      result: 'done',
      deadlineLedger: 99,
      status: 'pending_release',
      createdAt: 8,
    });
  });

  it('maps a null result to null rather than decoding it', () => {
    const info = toJobInfo(4n, {
      requester: 'GREQ',
      worker: null,
      arbiter: null,
      token: 'CTOKEN',
      amount: 25n,
      task_description: new TextEncoder().encode('task'),
      result: null,
      deadline_ledger: 99,
      status: 'open',
      created_at: 8,
      dispute_deadline_ledger: null,
    });
    expect(info.result).toBeNull();
    expect(info.worker).toBeNull();
  });
});

describe('toRateLimitStatus', () => {
  it('maps a raw RateLimiter record onto RateLimitStatus, converting stroops to decimal strings', () => {
    const status = toRateLimitStatus({
      active: true,
      agent: 'GAGENT',
      owner: 'GOWNER',
      max_per_tx: 10_000_000n,
      max_per_hour: 20_000_000n,
      max_per_day: 30_000_000n,
      max_txs_per_hour: 4,
      hourly_spend: 5_000_000n,
      daily_spend: 6_000_000n,
      hourly_tx_count: 2,
      hour_window_start: 700,
      day_window_start: 100,
    });
    expect(status).toEqual({
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
});

describe('toChannelSpendState', () => {
  it('reshapes ChannelInfo into ChannelSpendState for payment prediction', () => {
    const state = toChannelSpendState({
      id: 3n,
      agent: 'GAGENT',
      owner: 'GOWNER',
      token: 'CTOKEN',
      limitPerPeriod: 50n,
      period: 'hourly',
      spentThisPeriod: 10n,
      periodStartLedger: 700,
      totalSpent: 20n,
      active: true,
    });
    expect(state).toEqual({
      active: true,
      limitPerPeriod: '50',
      spentThisPeriod: '10',
      periodStartLedger: 700,
      period: 'hourly',
    });
  });
});

describe('toRateLimitSpendState', () => {
  it('reshapes RateLimitStatus into RateLimitSpendState for payment prediction', () => {
    const state = toRateLimitSpendState({
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
    expect(state).toEqual({
      configured: true,
      active: true,
      maxPerTx: '1.0000000',
      maxPerHour: '2.0000000',
      maxPerDay: '3.0000000',
      maxTxsPerHour: 4,
      hourlySpend: '0.5000000',
      dailySpend: '0.6000000',
      hourlyTxCount: 2,
      hourWindowStartLedger: 700,
      dayWindowStartLedger: 100,
    });
  });
});
