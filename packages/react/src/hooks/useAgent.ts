import { useCallback } from 'react';
import type { AgentInfo } from '@stellaragent/core';
import { useStellarAgent } from '../StellarAgentProvider.js';
import { usePolling, type UsePollingOptions, type UsePollingResult } from '../internal/usePolling.js';

/**
 * Polls `AgentWalletFactory.get_agent` for `agentId` via the current
 * `StellarAgent`, exposing the agent's identity (name, address, owner) and
 * its `active` status. Disabled (stays `idle`) until both the agent is
 * `ready` and `agentId` is defined, so it's safe to call before an agent
 * has been registered yet — e.g. `useAgent(agentId)` where `agentId` starts
 * `undefined`.
 */
export function useAgent(
  agentId: bigint | undefined,
  options?: UsePollingOptions,
): UsePollingResult<AgentInfo> {
  const { agent, status } = useStellarAgent();

  const fetcher = useCallback(() => {
    if (!agent || agentId === undefined) {
      return Promise.reject(new Error('useAgent: agent not ready or agentId not set'));
    }
    return agent.getAgent(agentId);
  }, [agent, agentId]);

  const enabled = Boolean(agent) && status === 'ready' && agentId !== undefined;

  return usePolling(enabled ? fetcher : null, options);
}
