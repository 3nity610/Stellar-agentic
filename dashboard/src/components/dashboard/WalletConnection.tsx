import { useWallet } from '../../lib/walletContext.js';
import { Wallet, LogOut, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

export function WalletConnection() {
  const { isConnected, address, isLoading, error, connect, disconnect } = useWallet();

  // Format address for display: show first 4 and last 4 characters
  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-sa-surface border border-sa-border rounded-lg">
        <Loader2 size={16} className="text-sa-muted animate-spin" />
        <span className="text-xs text-sa-text-dim">Checking wallet...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
        <AlertCircle size={16} className="text-red-500" />
        <span className="text-xs text-red-500">{error}</span>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-sa-accent/10 border border-sa-accent/30 rounded-lg">
          <div className="w-2 h-2 bg-sa-accent rounded-full animate-pulse" />
          <Wallet size={16} className="text-sa-accent" />
          <span className="text-xs font-mono text-sa-accent">{formatAddress(address)}</span>
        </div>
        <button
          onClick={disconnect}
          className="p-2 hover:bg-sa-surface border border-sa-border rounded-lg transition-colors"
          title="Disconnect wallet"
        >
          <LogOut size={16} className="text-sa-muted" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150',
        'bg-sa-accent/10 text-sa-accent border border-sa-accent/20',
        'hover:bg-sa-accent/20 hover:border-sa-accent/40',
      )}
    >
      <Wallet size={16} />
      <span className="text-xs font-medium">Connect Wallet</span>
    </button>
  );
}
