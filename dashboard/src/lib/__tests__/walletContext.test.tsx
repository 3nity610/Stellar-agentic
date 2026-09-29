import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { WalletProvider, useWallet } from '../walletContext.js';
import * as freighterApi from '@stellar/freighter-api';

// Mock Freighter API
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  requestAccess: vi.fn(),
}));

function TestComponent() {
  const { isConnected, address, isLoading, error, connect, disconnect } = useWallet();

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'Loading' : 'Ready'}</div>
      <div data-testid="connected">{isConnected ? 'Connected' : 'Disconnected'}</div>
      <div data-testid="address">{address || 'No address'}</div>
      <div data-testid="error">{error || 'No error'}</div>
      <button onClick={connect}>Connect</button>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}

describe('WalletContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with disconnected state when wallet is not connected', async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Ready');
    });

    expect(screen.getByTestId('connected')).toHaveTextContent('Disconnected');
    expect(screen.getByTestId('address')).toHaveTextContent('No address');
  });

  it('initializes with connected state when wallet is already connected', async () => {
    const mockAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: mockAddress });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('connected')).toHaveTextContent('Connected');
    });

    expect(screen.getByTestId('address')).toHaveTextContent(mockAddress);
  });

  it('connects wallet on user action', async () => {
    const mockAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });
    vi.mocked(freighterApi.requestAccess).mockResolvedValue({ address: mockAddress });

    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Ready');
    });

    const connectButton = screen.getByText('Connect');
    await user.click(connectButton);

    await waitFor(() => {
      expect(screen.getByTestId('connected')).toHaveTextContent('Connected');
    });

    expect(screen.getByTestId('address')).toHaveTextContent(mockAddress);
  });

  it('handles connection errors', async () => {
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });
    vi.mocked(freighterApi.requestAccess).mockResolvedValue({ error: 'User denied access', address: '' });

    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Ready');
    });

    const connectButton = screen.getByText('Connect');
    await user.click(connectButton);

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('User denied access');
    });

    expect(screen.getByTestId('connected')).toHaveTextContent('Disconnected');
  });

  it('disconnects wallet', async () => {
    const mockAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: mockAddress });

    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('connected')).toHaveTextContent('Connected');
    });

    const disconnectButton = screen.getByText('Disconnect');
    await user.click(disconnectButton);

    expect(screen.getByTestId('connected')).toHaveTextContent('Disconnected');
    expect(screen.getByTestId('address')).toHaveTextContent('No address');
  });

  it('throws error when useWallet is used outside WalletProvider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useWallet must be used within a WalletProvider');

    spy.mockRestore();
  });
});
