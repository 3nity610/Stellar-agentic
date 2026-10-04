import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { StellarAgent } from '@stellaragent/core';
import { StellarAgentProvider } from '../StellarAgentProvider.js';
import { useBalance } from '../hooks/useBalance.js';
import { createMockAgent } from '../test/mockAgent.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderBalance(overrides: Parameters<typeof createMockAgent>[0]) {
  const mockAgent = createMockAgent(overrides);
  return renderHook(() => useBalance(), {
    wrapper: ({ children }) => (
      <StellarAgentProvider config={{ network: 'local' }} agent={mockAgent}>
        {children}
      </StellarAgentProvider>
    ),
  });
}

describe('useBalance', () => {
  it('is disabled until the agent is ready', () => {
    vi.spyOn(StellarAgent, 'create').mockReturnValue(new Promise(() => {}));
    const getBalance = vi.fn(async () => '42.0000000');
    const { result } = renderBalance({ getBalance });

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('returns the balance string once the agent is ready', async () => {
    const getBalance = vi.fn(async () => '42.0000000');
    const { result } = renderBalance({ getBalance });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.balance).toBe('42.0000000');
    expect(result.current.error).toBeNull();
    expect(getBalance).toHaveBeenCalled();
  });

  it('exposes a manual refetch that re-calls getBalance', async () => {
    const getBalance = vi
      .fn()
      .mockResolvedValueOnce('1.0000000')
      .mockResolvedValueOnce('9.0000000');
    const { result } = renderBalance({ getBalance });

    await waitFor(() => expect(result.current.data?.balance).toBe('1.0000000'));
    result.current.refetch();
    await waitFor(() => expect(result.current.data?.balance).toBe('9.0000000'));
    expect(getBalance).toHaveBeenCalledTimes(2);
  });

  it('surfaces getBalance failures as an error status', async () => {
    const getBalance = vi.fn(async () => {
      throw new Error('horizon down');
    });
    const { result } = renderBalance({ getBalance });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('horizon down');
    expect(result.current.data).toBeNull();
  });

  it('renders a live XLM balance through the provider', async () => {
    const getBalance = vi.fn(async () => '7.5000000');
    const { result } = renderBalance({ getBalance });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toEqual({ balance: '7.5000000' });
  });
});
