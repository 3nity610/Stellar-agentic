import { describe, expect, it, vi } from 'vitest';
import { scValToNative } from '@stellar/stellar-sdk';
import type { InvokeFn } from '../invocation.js';
import {
  acceptJob,
  closeChannel,
  createAgentWallet,
  openChannel,
  payForAPI,
  releasePayment,
  requestWork,
  setRateLimits,
  submitResult,
} from '../mutations.js';
import { StellarAgentError } from '../../errors.js';
import { DEPLOYED_CONTRACTS, TEST_PUBLIC } from '../../__tests__/fixtures.js';

function invokeReturning(value: unknown): InvokeFn {
  return vi.fn(async () => ({ value, tx: { hash: 'tx', success: true } }));
}

describe('createAgentWallet', () => {
  it('invokes create_agent and returns the decoded agent id', async () => {
    const invoke = invokeReturning(9n);
    await expect(createAgentWallet(invoke, 'CFACTORY', TEST_PUBLIC, 'my-agent')).resolves.toBe(9n);
    expect(invoke).toHaveBeenCalledWith('CFACTORY', 'create_agent', expect.any(Array));
  });
});

describe('openChannel', () => {
  it('invokes open_channel and returns the decoded channel id', async () => {
    const invoke = invokeReturning(7n);
    const channelId = await openChannel(invoke, 'CCHANNEL', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015', {
      deposit: '10',
      limitPerPeriod: '1',
      period: 'hourly',
    });
    expect(channelId).toBe(7n);
    const args = (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(scValToNative(args[5])).toEqual(['Hourly']);
  });
});

describe('closeChannel', () => {
  it('invokes close_channel and returns its tx result', async () => {
    const invoke = invokeReturning(undefined);
    await expect(closeChannel(invoke, 'CCHANNEL', TEST_PUBLIC, 1n)).resolves.toEqual({ hash: 'tx', success: true });
    expect(invoke).toHaveBeenCalledWith('CCHANNEL', 'close_channel', expect.any(Array));
  });
});

describe('payForAPI', () => {
  it('routes a same-asset payment through pay', async () => {
    const invoke = invokeReturning(undefined);
    await payForAPI(invoke, 'CCHANNEL', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015', 1n, {
      endpoint: 'https://api.example.com',
      amount: '0.001',
    });
    expect(invoke).toHaveBeenCalledWith('CCHANNEL', 'pay', expect.any(Array));
  });

  it('routes a cross-asset payment through pay_with_conversion', async () => {
    const invoke = invokeReturning(undefined);
    await payForAPI(invoke, 'CCHANNEL', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015', 1n, {
      endpoint: 'https://api.example.com',
      amount: '0.001',
      destAsset: 'XLM',
      minReceived: '0.0009',
    });
    expect(invoke).toHaveBeenCalledWith('CCHANNEL', 'pay_with_conversion', expect.any(Array));
  });

  it('rejects destAsset without minReceived', async () => {
    const invoke = invokeReturning(undefined);
    const error = await payForAPI(invoke, 'CCHANNEL', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015', 1n, {
      endpoint: 'https://api.example.com',
      amount: '0.001',
      destAsset: 'XLM',
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe('INVALID_ARGUMENT');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('executes an explicit quote through pay_with_route and surfaces it on TxResult', async () => {
    const invoke = invokeReturning(undefined);
    const route = {
      id: 'XLM>amm:fixture>USDC',
      sourceAsset: 'XLM',
      destinationAsset: 'USDC',
      sourceAmount: '10000',
      expectedDestinationAmount: '20000',
      totalFeeBps: 30,
      expectedSlippageBps: 20,
      reliabilityBps: 9_500,
      hopCount: 1,
      hops: [{
        venue: 'amm' as const,
        venueId: DEPLOYED_CONTRACTS.escrow,
        sourceAsset: 'XLM',
        destinationAsset: 'USDC',
        sourceAmount: '10000',
        expectedOutput: '20000',
        feeAmount: '30',
        feeBps: 30,
        slippageBps: 20,
        reliabilityBps: 9_500,
        minOutput: '19500',
      }],
      score: '121',
      breakdown: {
        weightedCost: '15', weightedSlippage: '6', weightedReliability: '100', hopPenalty: '0',
      },
      expiresAtLedger: 120,
    };
    const result = await payForAPI(
      invoke,
      'CCHANNEL',
      TEST_PUBLIC,
      { USDC: DEPLOYED_CONTRACTS.rateLimiter },
      'Test SDF Network ; September 2015',
      1n,
      { endpoint: 'https://api.example.com', amount: '0.001', recipientAsset: 'USDC' },
      {
        quote: {
          route,
          minimumDestinationAmount: '19800',
          quotedAtLedger: 100,
          validUntilLedger: 120,
          failures: [],
        },
      },
    );
    expect(invoke).toHaveBeenCalledWith('CCHANNEL', 'pay_with_route', expect.any(Array));
    const args = (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(scValToNative(args[5])).toHaveLength(1);
    expect(scValToNative(args[6])).toBe(19_800n);
    expect(scValToNative(args[7])).toBe(120);
    expect(result).toMatchObject({
      hash: 'tx',
      route,
      expectedDestinationAmount: '20000',
      minimumDestinationAmount: '19800',
    });
  });

  it('rejects conflicting destination aliases and a routed payment without one', async () => {
    const invoke = invokeReturning(undefined);
    await expect(payForAPI(
      invoke, 'CCHANNEL', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015', 1n,
      {
        endpoint: 'x', amount: '1', destAsset: 'XLM',
        recipientAsset: DEPLOYED_CONTRACTS.escrow, minReceived: '1',
      },
    )).rejects.toThrow(/must refer to the same asset/);

    const quote = {
      route: {
        id: 'direct', sourceAsset: 'XLM', destinationAsset: 'XLM', sourceAmount: '1',
        expectedDestinationAmount: '1', totalFeeBps: 0, expectedSlippageBps: 0,
        reliabilityBps: 10_000, hopCount: 1, hops: [], score: '0',
        breakdown: {
          weightedCost: '0', weightedSlippage: '0', weightedReliability: '0', hopPenalty: '0',
        },
      },
      minimumDestinationAmount: '1', quotedAtLedger: 1, validUntilLedger: 2, failures: [],
    };
    await expect(payForAPI(
      invoke, 'CCHANNEL', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015', 1n,
      { endpoint: 'x', amount: '1' }, { quote },
    )).rejects.toThrow(/requires recipientAsset/);
  });
});

describe('requestWork', () => {
  it('rejects a non-positive deadlineLedgers before invoking anything', async () => {
    const invoke = invokeReturning(1n);
    const getLatestLedger = vi.fn(async () => 100);
    const error = await requestWork(
      invoke, getLatestLedger, 'CESCROW', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015',
      { workerAgent: 'GWORKER', task: 't', escrowAmount: '1', deadlineLedgers: 0 },
    ).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe('INVALID_ARGUMENT');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('derives the deadline ledger from the current one plus the offset', async () => {
    const invoke = invokeReturning(1n);
    const getLatestLedger = vi.fn(async () => 100);
    await requestWork(
      invoke, getLatestLedger, 'CESCROW', TEST_PUBLIC, {}, 'Test SDF Network ; September 2015',
      { workerAgent: 'GWORKER', task: 't', escrowAmount: '1', deadlineLedgers: 50 },
    );
    const args = (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(scValToNative(args[4])).toBe(150);
  });
});

describe('acceptJob / submitResult / releasePayment', () => {
  it('invoke the expected escrow methods', async () => {
    const invoke = invokeReturning(undefined);
    await acceptJob(invoke, 'CESCROW', TEST_PUBLIC, 1n);
    await submitResult(invoke, 'CESCROW', TEST_PUBLIC, 1n, 'done');
    await releasePayment(invoke, 'CESCROW', TEST_PUBLIC, 1n);
    const methods = (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1]);
    expect(methods).toEqual(['accept_job', 'submit_result', 'release']);
  });
});

describe('setRateLimits', () => {
  it('invokes set_limits with the configured limits', async () => {
    const invoke = invokeReturning(undefined);
    await setRateLimits(invoke, 'CLIMITER', TEST_PUBLIC, {
      maxPerTx: '1', maxPerHour: '2', maxPerDay: '3', maxTxsPerHour: 4,
    });
    expect(invoke).toHaveBeenCalledWith('CLIMITER', 'set_limits', expect.any(Array));
  });
});
