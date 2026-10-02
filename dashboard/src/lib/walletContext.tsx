import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isConnected, getAddress, requestAccess } from '@stellar/freighter-api';

export interface WalletContextValue {
  isConnected: boolean;
  address: string | null;
  isLoading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if already connected on mount
  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      setIsLoading(true);
      setError(null);
      const result = await isConnected();
      if (result.error) {
        throw new Error(result.error);
      }
      if (result.isConnected) {
        const addressResult = await getAddress();
        if (addressResult.error) {
          throw new Error(addressResult.error);
        }
        setAddress(addressResult.address);
      } else {
        setAddress(null);
      }
    } catch (err) {
      console.error('Failed to check wallet connection:', err);
      setError(err instanceof Error ? err.message : 'Failed to check wallet connection');
      setAddress(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function connect() {
    try {
      setIsLoading(true);
      setError(null);

      // Request access to Freighter
      const accessResult = await requestAccess();
      
      if (accessResult.error) {
        throw new Error(accessResult.error);
      }

      // The address is returned from requestAccess
      setAddress(accessResult.address);
    } catch (err) {
      console.error('Failed to connect wallet:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      setAddress(null);
      // Don't rethrow - just set the error state
    } finally {
      setIsLoading(false);
    }
  }

  function disconnect() {
    setAddress(null);
    setError(null);
  }

  const value: WalletContextValue = {
    isConnected: address !== null,
    address,
    isLoading,
    error,
    connect,
    disconnect,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
