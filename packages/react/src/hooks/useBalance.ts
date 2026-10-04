import { useCallback } from 'react';
import { useStellarAgent } from '../StellarAgentProvider.js';
import { usePolling, type UsePollingOptions, type UsePollingResult } from '../internal/usePolling.js';

export interface UseBalanceOptions extends UsePollingOptions {}

/** Balance string, polling status, and a manual refresh. */
export interface UseBalanceData {
  /** Current XLM balance as a string (e.g. `'42.0000000'`), or `'0'` if the account doesn't exist. */
  balance: string;
}

export type UseBalanceResult = UsePollingResult<UseBalanceData>;

/**
 * Polls `StellarAgent.getBalance` for the connected agent and exposes the
 * XLM balance string plus a manual `refetch`. Needs no contracts and no
 * signing — the simplest query in the SDK.
 *
 * Disabled (stays `idle`) until the agent is `ready`.
 */
export function useBalance(options?: UseBalanceOptions): UseBalanceResult {
  const { agent, status } = useStellarAgent();

  const fetcher = useCallback(async (): Promise<UseBalanceData> => {
    if (!agent) {
      throw new Error('useBalance: agent not ready');
    }
    const balance = await agent.getBalance();
    return { balance };
  }, [agent]);

  const enabled = Boolean(agent) && status === 'ready';

  return usePolling(enabled ? fetcher : null, options);
}
