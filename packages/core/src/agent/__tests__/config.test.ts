import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNetworkClients, fundFromFriendbot, isLoopbackUrl, UNCONFIGURED_RATE_LIMIT } from '../config.js';

describe('isLoopbackUrl', () => {
  it('treats localhost and loopback IPs over plain HTTP as loopback', () => {
    expect(isLoopbackUrl('http://localhost:8000')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1:8000')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:8000')).toBe(true);
  });

  it('treats any HTTPS URL as non-loopback, even for localhost', () => {
    expect(isLoopbackUrl('https://localhost:8000')).toBe(false);
  });

  it('treats a real hostname over plain HTTP as non-loopback', () => {
    expect(isLoopbackUrl('http://horizon-testnet.stellar.org')).toBe(false);
  });

  it('treats a malformed URL as non-loopback rather than throwing', () => {
    expect(isLoopbackUrl('not a url')).toBe(false);
  });
});

describe('createNetworkClients', () => {
  it('allows plain HTTP for a loopback network config', () => {
    const { horizon, rpc } = createNetworkClients({
      rpcUrl: 'http://localhost:8000/soroban/rpc',
      horizonUrl: 'http://localhost:8000',
      networkPassphrase: 'Standalone Network ; February 2017',
    });
    expect(horizon.serverURL.toString()).toContain('localhost');
    expect(rpc).toBeDefined();
  });

  it('does not throw for an HTTPS network config', () => {
    expect(() => createNetworkClients({
      rpcUrl: 'https://soroban-rpc.testnet.stellar.gateway.fm',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })).not.toThrow();
  });
});

describe('UNCONFIGURED_RATE_LIMIT', () => {
  it('reports configured: false with every numeric field zeroed', () => {
    expect(UNCONFIGURED_RATE_LIMIT.configured).toBe(false);
    expect(UNCONFIGURED_RATE_LIMIT.maxPerTx).toBe('0');
    expect(UNCONFIGURED_RATE_LIMIT.txsThisHour).toBe(0);
  });
});

describe('fundFromFriendbot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('warns but does not throw when friendbot responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fundFromFriendbot('GADDRESS')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Friendbot funding failed — account may already exist');
    warn.mockRestore();
  });

  it('warns but does not throw when friendbot is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fundFromFriendbot('GADDRESS')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Could not reach friendbot');
    warn.mockRestore();
  });

  it('requests funding for the given address', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);
    await fundFromFriendbot('GADDRESS');
    expect(fetchSpy).toHaveBeenCalledWith('https://friendbot.stellar.org?addr=GADDRESS');
  });
});
