import { describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import { contractError, diagnosticText, errorMessage, getLatestLedger } from '../invocation.js';
import { StellarAgentError } from '../../errors.js';

describe('contractError', () => {
  const cases: Array<[string, string]> = [
    ['spend limit exceeded for this period', 'SPEND_LIMIT_EXCEEDED'],
    ['channel not found', 'CHANNEL_NOT_FOUND'],
    ['channel is closed', 'CHANNEL_CLOSED'],
    ['job not found', 'JOB_NOT_FOUND'],
    ['job is not open', 'JOB_NOT_OPEN'],
    ['job has expired', 'JOB_EXPIRED'],
    ['caller is not authorized', 'NOT_AUTHORIZED'],
    ['no rate limit for agent', 'RATE_LIMIT_NOT_FOUND'],
    ['deposit amount must be positive', 'INVALID_ARGUMENT'],
    ['deadline must be in the future', 'INVALID_ARGUMENT'],
  ];

  it.each(cases)('maps %j to %s', (message, code) => {
    const error = contractError('CONTRACT_ERROR', message);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe(code);
    // `toContain`, not `toBe`: StellarAgentError appends a remedy line to the
    // codes that have one (#374). What this case asserts is that the contract
    // panic string survives the mapping, not that nothing is added after it.
    expect(error.message).toContain(message);
  });

  it('falls back to the given code when nothing matches', () => {
    const error = contractError('SIMULATION_FAILED', 'a totally novel panic message');
    expect(error.code).toBe('SIMULATION_FAILED');
  });

  it('carries the transaction hash through when given one', () => {
    const error = contractError('TRANSACTION_FAILED', 'job not found', 'abc123');
    expect(error.transactionHash).toBe('abc123');
  });
});

describe('errorMessage', () => {
  it('extracts the message from an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error value', () => {
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage(42)).toBe('42');
  });
});

describe('diagnosticText', () => {
  it('returns an empty string for no events', () => {
    expect(diagnosticText(undefined)).toBe('');
    expect(diagnosticText([])).toBe('');
  });

  it('falls back to base64 XDR if an event cannot be decoded as JSON', () => {
    const malformed = {
      event: () => { throw new Error('not a real diagnostic event'); },
      toXDR: (encoding: string) => `xdr-${encoding}`,
    } as unknown as xdr.DiagnosticEvent;
    expect(diagnosticText([malformed])).toBe('xdr-base64');
  });
});

describe('getLatestLedger', () => {
  it('returns the RPC-reported ledger sequence', async () => {
    const rpc = { getLatestLedger: vi.fn(async () => ({ sequence: 12345 })) };
    await expect(getLatestLedger(rpc as never)).resolves.toBe(12345);
  });

  it('wraps an RPC failure as a StellarAgentError', async () => {
    const rpc = { getLatestLedger: vi.fn(async () => { throw new Error('offline'); }) };
    const error = await getLatestLedger(rpc as never).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.cause).toBeInstanceOf(Error);
  });
});
