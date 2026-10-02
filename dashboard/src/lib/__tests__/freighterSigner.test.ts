import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFreighterSigner, isFreighterInstalled } from '../freighterSigner.js';
import * as freighterApi from '@stellar/freighter-api';

// Mock Freighter API
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  signTransaction: vi.fn(),
  signAuthEntry: vi.fn(),
}));

describe('freighterSigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFreighterSigner', () => {
    it('throws error when wallet is not connected', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: false });

      await expect(getFreighterSigner()).rejects.toThrow('Freighter wallet is not connected');
    });

    it('throws error when connection check fails', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ 
        isConnected: false,
        error: 'Extension not found' 
      });

      await expect(getFreighterSigner()).rejects.toThrow('Extension not found');
    });

    it('returns Sep43Like signer when wallet is connected', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });

      const signer = await getFreighterSigner();

      expect(signer).toBeDefined();
      expect(signer.getAddress).toBeDefined();
      expect(signer.signTransaction).toBeDefined();
      expect(signer.signAuthEntry).toBeDefined();
    });

    it('getAddress returns correct format', async () => {
      const mockAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.getAddress).mockResolvedValue({ address: mockAddress });

      const signer = await getFreighterSigner();
      const result = await signer.getAddress();

      expect(result).toEqual({ address: mockAddress });
    });

    it('signTransaction returns correct format', async () => {
      const mockSignedXdr = 'signed_xdr_string';
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.signTransaction).mockResolvedValue({ 
        signedTxXdr: mockSignedXdr,
        signerAddress: 'GXXX' 
      });

      const signer = await getFreighterSigner();
      const result = await signer.signTransaction('unsigned_xdr', {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(result).toEqual({ signedTxXdr: mockSignedXdr });
      expect(freighterApi.signTransaction).toHaveBeenCalledWith('unsigned_xdr', {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    it('signAuthEntry returns correct format', async () => {
      const mockSignedEntry = 'signed_entry_string';
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.signAuthEntry).mockResolvedValue({
        signedAuthEntry: mockSignedEntry,
        signerAddress: 'GXXX'
      });

      const signer = await getFreighterSigner();
      const result = await signer.signAuthEntry('entry_xdr', {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });

      expect(result).toEqual({ signedAuthEntry: mockSignedEntry });
    });

    it('throws when signAuthEntry returns null', async () => {
      vi.mocked(freighterApi.isConnected).mockResolvedValue({ isConnected: true });
      vi.mocked(freighterApi.signAuthEntry).mockResolvedValue({
        signedAuthEntry: null,
        signerAddress: 'GXXX'
      });

      const signer = await getFreighterSigner();
      
      await expect(signer.signAuthEntry('entry_xdr', {})).rejects.toThrow(
        'Freighter returned no signed auth entry'
      );
    });
  });

  describe('isFreighterInstalled', () => {
    it('returns false in Node.js environment', () => {
      expect(isFreighterInstalled()).toBe(false);
    });

    it('returns true when freighter exists in window', () => {
      const originalWindow = global.window;
      // @ts-expect-error - mocking window object
      global.window = { freighter: {} };

      expect(isFreighterInstalled()).toBe(true);

      global.window = originalWindow;
    });
  });
});
