import { describe, expect, it } from 'vitest';
import { StellarAgentError, type StellarAgentErrorCode } from '../errors.js';

const DOCS_BASE =
  'https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/';

/**
 * The point of #374: an SDK error should tell you what to do next without
 * sending you to the source. These assert the two halves of that — the
 * remedy line, and the resolvable link under it — for every code that has
 * one, and that the codes without one stay untouched.
 */
describe('StellarAgentError remedies', () => {
  const withRemedy: Array<[StellarAgentErrorCode, string]> = [
    ['NO_ACTIVE_CHANNEL', 'openChannel()'],
    ['SPEND_LIMIT_EXCEEDED', 'getSpendReport()'],
    ['RATE_LIMIT_NOT_FOUND', 'setRateLimits()'],
    ['NOT_AUTHORIZED', 'signer'],
    ['TRANSACTION_TIMEOUT', 'fee'],
    ['NETWORK_ERROR', 'config.network'],
  ];

  it.each(withRemedy)('%s names the thing to call or check', (code, expected) => {
    const error = new StellarAgentError(code, 'original message');
    expect(error.message).toContain(expected);
  });

  it.each(withRemedy)('%s carries a resolvable docs link', (code) => {
    const error = new StellarAgentError(code, 'original message');
    const link = error.message.split('See ').at(-1)?.trim();
    expect(link).toBeDefined();
    expect(link!.startsWith(DOCS_BASE)).toBe(true);
    // An anchor, not just a file — the docs are long enough that a bare file
    // link is barely better than no link.
    expect(link).toMatch(/#[a-z-]+$/);
  });

  it.each(withRemedy)('%s keeps the original message as its first line', (code) => {
    const error = new StellarAgentError(code, 'spend limit exceeded for this period');
    expect(error.message.split('\n')[0]).toBe('spend limit exceeded for this period');
  });

  const withoutRemedy: StellarAgentErrorCode[] = [
    'INVALID_ARGUMENT',
    'CHANNEL_NOT_FOUND',
    'CHANNEL_CLOSED',
    'JOB_NOT_FOUND',
    'JOB_NOT_OPEN',
    'JOB_EXPIRED',
    'CONTRACT_ERROR',
  ];

  it.each(withoutRemedy)('%s is left exactly as thrown', (code) => {
    const error = new StellarAgentError(code, 'original message');
    expect(error.message).toBe('original message');
  });

  it('still carries code, cause and transactionHash', () => {
    const cause = new Error('underlying');
    const error = new StellarAgentError('NETWORK_ERROR', 'rpc unreachable', {
      cause,
      transactionHash: 'abc123',
    });
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.cause).toBe(cause);
    expect(error.transactionHash).toBe('abc123');
    expect(error.name).toBe('StellarAgentError');
    expect(error).toBeInstanceOf(Error);
  });
});
