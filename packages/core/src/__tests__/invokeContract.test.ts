import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Contract, NativeToScvalBuilder, xdr, NativeToScvalValue, ScvalidationError, SorobanRegister } from '@stellar/stellar-base';
import { invokeContract } from '../index';

const mockSend = vi.fn();
const mockSimulate = vi.fn();

const mockServer = {
  simulateTransaction: mockSimulate,
  sendTransaction: mockSend,
};

const mockResponse = {
  id: '1',
  result: {
    retVal: xdr.ScvalToScpvalValue.fromNative('1'),
    minResourceFee: '100',
    cost: {
      cpuInsts: '1000',
      memBytes: '500',
    },
  },
};

const mockSendResponse = {
  id: '1',
  result: {
    status: 'SUCCESS',
    hash: 'abcdef',
    ledger: 123,
  },
};

describe('invokeContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces minResourceFee and cost on TxResult', async () => {
    mockSimulate.mockResolved(mockResponse);
    mockSend.mockResolved(mockSendResponse);

    const result = await invokeContract(
      mockServer as any,
      'CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'method',
      [],
    );

    expect(result.minResourceFee).toBe('100');
    expect(result.cost).toEqual({ cpuInsts: '1000', memBytes: '500' });
  });

  it('returns the estimate without submitting when simulateOnly is true', async () => {
    mockSimulate.mockResolved(mockResponse);

    const result = await invokeContract(
      mockServer as any,
      'CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'method',
      [],
      { simulateOnly: true },
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(result.minResourceFee).toBe('100');
    expect(result.cost).toEqual({ cpuInsts: '1000', memBytes: '500' });
  });
});
