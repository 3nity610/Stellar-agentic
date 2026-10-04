import { useCallback, useEffect, useRef, useState } from 'react';
import { toStroops, type PayForAPIParams, type TxResult } from '@stellaragent/core';
import { useStellarAgent, usePendingPayments } from '../StellarAgentProvider.js';

export type PayForAPIStatus = 'idle' | 'pending' | 'success' | 'error';

export interface UsePayForAPIResult {
  /** Invoke a payment. Resolves/rejects the same as `StellarAgent.payForAPI`. */
  payForAPI: (params: PayForAPIParams) => Promise<TxResult>;
  /** Re-runs the last attempt with the same arguments. Rejects if no attempt has been made. */
  retry: () => Promise<TxResult>;
  status: PayForAPIStatus;
  error: Error | null;
  /** Back to `idle` and clears the last attempt — does not affect any in-flight call. */
  reset: () => void;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function nextPendingId(): string {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Mutation hook for `StellarAgent.payForAPI`, with optimistic-update
 * support: as soon as `payForAPI(params)` is called, `params.amount` is
 * recorded in the provider's shared pending-payments state, so any
 * `useSpendReport()` mounted under the same `<StellarAgentProvider>`
 * immediately reflects the pending spend — before the transaction has
 * even been submitted, let alone confirmed.
 *
 * On settle (success *or_* failure) the pending entry is removed and the
 * provider's spend-report version counter is bumped to force an
 * immediate refetch:
 * - On success, the next `getSpendReport()` call already reflects the
 *   confirmed payment server-side, so removing the optimistic entry and
 *   refetching hands off from "optimistic" to "confirmed" with no gap.
 * - On failure, nothing was ever applied server-side, so removing the
 *   optimistic entry *is* the rollback — the spend report reverts to
 *   whatever the last real poll said.
 *
 * Failed attempts can be re-run via `retry()`, which replays the last
 * attempt's arguments. The optimistic entry from the failed attempt is
 * already rolled back by the time `retry()` runs, so each retry adds exactly
 * one new pending entry — never double-counting.
 */
export function usePayForAPI(): UsePayForAPIResult {
  const { agent } = useStellarAgent();
  const { addPending, removePending, bump } = usePendingPayments();
  const [status, setStatus] = useState<PayForAPIStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const lastParamsRef = useRef<PayForAPIParams | null>(null);
  const mountedRef = useRef((true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const payForAPI = useCallback(
    async (params: PayForAPIParams): Promise<TxResult> => {
      lastParamsRef.current = params;

      if (!agent) {
        const err = new Error('usePayForAPI: agent is not ready yet');
        setStatus('error');
        setError(err);
        throw err;
      }

      setStatus('pending');
      setError(null);

      const pendingId = nextPendingId();
      addPending({ id: pendingId, amountStroops: toStroops(params.amount) });

      try {
        const result = await agent.payForAPI(params);
        if (mountedRef.current) setStatus('success');
        return result;
      } catch (err) {
        const e = toError(err);
        if (mountedRef.current) {
          setStatus('error');
          setError(e);
        }
        throw e;
      } finally {
        removePending(pendingId);
        bump();
      }
    },
    [agent, addPending, removePending, bump],
  );

  const retry = useCallback((): Promise<TxResult> => {
    const params = lastParamsRef.current;
    if (!params) {
      return Promise.reject(
        new Error('usePayForAPI: retry() called before any payForAPI() attempt'),
      );
    }
    return payForAPI(params);
  }, [payForAPI]);

  const reset = useCallback(() => {
    lastParamsRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  return { payForAPI, retry, status, error, reset };
}
