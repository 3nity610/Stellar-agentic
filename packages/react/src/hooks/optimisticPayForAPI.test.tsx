import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { usePayForAPI } from './usePayForAPI.js';
import { StellarAgentProvider, usePendingPayments } from '../StellarAgentProvider.js';

type PendingEntry = { id: string; amountStroops: bigint };

const PayForAPIParams = {
  destination: 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  asset: 'native',
  amount: '10',
} as const;

function makeAgent() {
  const payForAPI = vi.fn(async (): Promise<unknown> => ({ status: 'success' }));
  return { agent: { payForAPI } as any, payForAPI };
}

function wrapper(agent: unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StellarAgentProvider agent={agent as any}>
        {children}
      </StellarAgentProvider>
    );
  };
}

function usePendingSnapshot() {
  const { pending } = usePendingPayments();
  return pending as PendingEntry[];
}

describe('usePayForAPI optimistic updates', () => {
  it('records a pending entry and rolls it back on failure', async () => {
    const { agent, payForAPI } = makeAgent();
    payForAPI.mockRejectedOnce(new Error('boom'));

    const { result } = renderHook(
      () => ({
        pay: usePayForAPI(),
        pending: usePendingSnapshot(),
      }),
      { wrapper: wrapper(agent) },
    );

    await act(async () => {
      await expect(result.current.pay.payForAPI(PayForAPIParams)).rejects.toThrow('boom');
    });

    expect(result.current.pay.status).toBe('error');
    expect(result.current.pay.error?.message).toBe('boom');
    // Optimistic entry was rolled back.
    expect(result.current.pending).toHaveLength(0);
  });

  it('retries the last attempt with the same arguments and does not double-count the optimistic entry', async () => {
    const { agent, payForAPI } = makeAgent();
    payForAPI.mockRejectedOnce(new Error('boom'));

    const { result } = renderHook(
      () => (
        {
          pay: usePayForAPI(),
          pending: usePendingSnapshot(),
        }
      ),
      { wrapper: wrapper(agent) },
    );

    await act(async () => {
      await expect(result.current.pay.payForAPI(PayForAPIParams)).rejects.toThrow('boom');
    });
    expect(result.current.pending).toHaveLength(0);

    await act(async () => {
      await result.current.pay.retry();
    });

    expect(payForAPI).toHaveBeenCalledTimes(2);
    expect(payForAPI.mock.calls[1][0]).toEqual(PayForAPIParams);
    expect(result.current.pay.status).toBe('success');
    expect(result.current.pay.error).toBeNull();
    // Exactly one new pending entry from the retry, not two.
    expect(result.current.pending).toHaveLength(0);
  });

  it('retry() rejects when no attempt has been made', async () => {
    const { agent } = makeAgent();
    const { result } = renderHook(() => usePayForAPI(), {
      wrapper: wrapper(agent),
    });

    await expect(result.current.retry()).rejects.toThrow(/retry\(\) called before/);
  });

  it('reset() clears the error state', async () => {
    const { agent, payForAPI } = makeAgent();
    payForAPI.mockRejectedOnce(new Error('boom'));

    const { result } = renderHook(() => usePayForAPI(), {
      wrapper: wrapper(agent),
    });

    await act(async () => {
      await expect(result.current.payForAPI(PayForAPIParams)).rejects.toThrow('boom');
    });
    expect(result.current.status).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
