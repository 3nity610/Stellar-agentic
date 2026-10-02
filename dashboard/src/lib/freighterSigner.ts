/**
 * Freighter wallet integration that provides a Sep43Like interface
 * compatible with @stellaragent/core's SignerAdapter.
 */

import {
  isConnected,
  getAddress,
  signTransaction as freighterSignTransaction,
  signAuthEntry as freighterSignAuthEntry,
} from '@stellar/freighter-api';
import type { Sep43Like } from '@stellaragent/core';

/**
 * Get a Sep43Like signer backed by the connected Freighter wallet.
 * This can be wrapped in SignerAdapter from @stellaragent/core.
 *
 * @throws {Error} if Freighter is not connected
 */
export async function getFreighterSigner(): Promise<Sep43Like> {
  const connectionResult = await isConnected();
  if (connectionResult.error) {
    throw new Error(connectionResult.error);
  }
  if (!connectionResult.isConnected) {
    throw new Error('Freighter wallet is not connected');
  }

  return {
    async getAddress() {
      const result = await getAddress();
      if (result.error) {
        throw new Error(result.error);
      }
      return { address: result.address };
    },

    async signTransaction(xdr: string, opts?: { networkPassphrase?: string }) {
      const result = await freighterSignTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase,
      });
      if (result.error) {
        throw new Error(result.error);
      }
      return { signedTxXdr: result.signedTxXdr };
    },

    async signAuthEntry(entryXdr: string, opts?: { networkPassphrase?: string }) {
      const result = await freighterSignAuthEntry(entryXdr, {
        networkPassphrase: opts?.networkPassphrase,
      });
      if (result.error) {
        throw new Error(result.error);
      }
      if (!result.signedAuthEntry) {
        throw new Error('Freighter returned no signed auth entry');
      }
      return { signedAuthEntry: result.signedAuthEntry };
    },
  };
}

/**
 * Check if Freighter extension is installed in the browser.
 */
export function isFreighterInstalled(): boolean {
  return typeof window !== 'undefined' && 'freighter' in window;
}
