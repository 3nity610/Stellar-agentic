import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AgentInfo } from '@stellaragent/core';
import { StellarAgentProvider } from '../StellarAgentProvider.js';
import { useAgent } from '../hooks/useAgent.js';
import { createMockAgent } from '../test/mockAgent.js';

const agent: AgentInfo = {
  id: 7n,
  address: 'GAGENTADDRESS',
  name: 'demo-agent',
  owner: 'GOWNER',
  active: true,
  createdAt: 1_700_000_000,
  totalOps: 42n,
};

// `@testing-library/react`'s `waitFor` polls via `setTimeout`, which is
// exactly what fake timers freeze — so under `vi.useFakeTimers()` we
// advance time explicitly (inside `act`) and assert directly.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAgent', () => {
  it('stays idle when agentId is undefined', () => {
    const mockAgent = createMockAgent();
    const { result } = renderHook(() => useAgent(undefined), {
      wrapper: ({ children }) => (
        <StellarAgentProvider config={{ network: 'local' }} agent={mockAgent}>
          {children}
        </StellarAgentProvider>
      ),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(mockAgent.getAgent).not.toHaveBeenCalled();
  });

  it('loads and returns agent data', async () => {
    const mockAgent = createMockAgent({ getAgent: async () => agent });

    const { result } = renderHook(() => useAgent(7n), {
      wrapper: ({ children }) => (
        <StellarAgentProvider config={{ network: 'local' }} agent={mockAgent}>
          {children}
        </StellarAgentProvider>
      ),
    });

    await flush();
    expect(result.current.status).toBe('ready');
    expect(result.current.data).toEqual(agent);
    expect(result.current.error).toBeNull();
    expect(mockAgent.getAgent).toHaveBeenCalledWith(7n);
  });

  it('surfaces errors from the agent', async () => {
    const mockAgent = createMockAgent({
      getAgent: async () => {
        throw new Error('agent not found');
      },
    });

    const { result } = renderHook(() => useAgent(404n), {
      wrapper: ({ children }) => (
        <StellarAgentProvider config={{ network: 'local' }} agent={mockAgent}>
          {children}
        </StellarAgentProvider>
      ),
    });

    await flush();
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('agent not found');
    expect(result.current.data).toBeNull();
  });

  it('starts polling once agentId becomes defined', async () => {
    const getAgent = vi.fn(async () => agent);
    const mockAgent = createMockAgent({ getAgent });

    const { result, rerender } = renderHook(
      ({ agentId }: { agentId: bigint | undefined }) => useAgent(agentId),
      {
        initialProps: { agentId: undefined as bigint | undefined },
        wrapper: ({ children }) => (
          <StellarAgentProvider config={{ network: 'local' }} agent={mockAgent}>
            {children}
          </StellarAgentProvider>
        ),
      },
    );

    await flush();
    expect(result.current.status).toBe('idle');
    expect(getAgent).not.toHaveBeenCalled();

    rerender({ agentId: 7n });
    await flush();
    expect(result.current.status).toBe('ready');
    expect(getAgent).toHaveBeenCalledWith(7n);
  });

  it('re-polls on the configured interval and stops after unmount', async () => {
    const getAgent = vi.fn(async () => agent);
    const mockAgent = createMockAgent({ getAgent });

    const { result, unmount } = renderHook(() => useAgent(7n, { intervalMs: 1000 }), {
      wrapper: ({ children }) => (
        <StellarAgentProvider config={{ network: 'local' }} agent={mockAgent}>
          {children}
        </StellarAgentProvider>
      ),
    });

    await flush();
    expect(result.current.status).toBe('ready');
    expect(getAgent).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(getAgent).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(getAgent).toHaveBeenCalledTimes(2);
  });
});
