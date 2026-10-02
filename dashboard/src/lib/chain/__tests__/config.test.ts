import { describe, expect, it } from 'vitest';
import {
  MOCK_MODE_STORAGE_KEY,
  readDashboardConfig,
  resolveMode,
  type RawEnv,
} from '../config.js';

const PUBLIC = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const CHANNEL = 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ';
const ESCROW = 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3';

function storage(value: string | null) {
  return { getItem: () => value };
}

describe('resolveMode', () => {
  it('defaults to live — the fixtures are never reached implicitly', () => {
    // The single most important assertion in this file: a dashboard that
    // quietly serves fixture data while claiming to be connected is worse than
    // one that shows nothing.
    expect(resolveMode({}, '', storage(null))).toBe('chain');
  });

  it('prefers the URL parameter over everything', () => {
    expect(resolveMode({ VITE_STELLARAGENT_MODE: 'chain' }, '?mode=mock', storage('chain')))
      .toBe('mock');
  });

  it('prefers stored choice over the build-time default', () => {
    expect(resolveMode({ VITE_STELLARAGENT_MODE: 'chain' }, '', storage('mock'))).toBe('mock');
    expect(resolveMode({}, '', storage('chain'))).toBe('chain');
  });

  it('falls back to the build-time default last', () => {
    expect(resolveMode({ VITE_STELLARAGENT_MODE: 'mock' }, '', storage(null))).toBe('mock');
    // 'live' is accepted as a synonym; the value the UI passes is 'chain'.
    expect(resolveMode({ VITE_STELLARAGENT_MODE: 'live' }, '', storage(null))).toBe('chain');
  });

  it('ignores values it does not recognise rather than guessing', () => {
    expect(resolveMode({ VITE_STELLARAGENT_MODE: 'true' }, '', storage(null))).toBe('chain');
    expect(resolveMode({ VITE_STELLARAGENT_MODE: 'mock' }, '?mode=1', storage('nope'))).toBe('mock');
  });

  it('survives storage that throws', () => {
    const hostile = {
      getItem() {
        throw new Error('SecurityError');
      },
    };
    expect(resolveMode({ VITE_STELLARAGENT_MODE: 'mock' }, '', hostile)).toBe('mock');
    expect(resolveMode({}, '', hostile)).toBe('chain');
  });

  it('uses a stable key so the UI and the config agree', () => {
    expect(MOCK_MODE_STORAGE_KEY).toBe('sa.dashboard.mode');
  });
});

describe('readDashboardConfig', () => {
  const complete: RawEnv = {
    VITE_STELLARAGENT_NETWORK: 'testnet',
    VITE_STELLARAGENT_VIEWER_KEY: PUBLIC,
    VITE_STELLARAGENT_TESTNET_PAYMENT_CHANNEL: CHANNEL,
    VITE_STELLARAGENT_TESTNET_ESCROW: ESCROW,
    VITE_STELLARAGENT_INDEXER_URL: 'http://localhost:8787/',
    VITE_STELLARAGENT_AGENTS: JSON.stringify([
      { id: 'inference', name: 'Inference Agent', address: PUBLIC, channelId: '1', asset: 'USDC' },
    ]),
    VITE_STELLARAGENT_JOBS: JSON.stringify([{ id: '7', workerName: 'Worker' }, '9']),
  };

  it('reads a fully configured live deployment with no problems', () => {
    const config = readDashboardConfig(complete, '', storage(null));
    expect(config.problems).toEqual([]);
    expect(config.mode).toBe('chain');
    expect(config.network).toBe('testnet');
    expect(config.contracts.paymentChannel).toBe(CHANNEL);
    expect(config.contracts.escrow).toBe(ESCROW);
    expect(config.indexerUrl).toBe('http://localhost:8787');
    expect(config.viewerKey).toBe(PUBLIC);
    expect(config.agents).toEqual([
      { id: 'inference', name: 'Inference Agent', address: PUBLIC, channelId: '1', asset: 'USDC' },
    ]);
    expect(config.jobs).toEqual([{ id: '7', workerName: 'Worker' }, { id: '9', workerName: undefined }]);
  });

  it('lists everything live mode is missing, and stays quiet about the rest', () => {
    const config = readDashboardConfig({}, '', storage(null));
    expect(config.problems).toHaveLength(3);
    expect(config.problems.join('\n')).toMatch(/No contract address for paymentChannel, escrow/);
    expect(config.problems.join('\n')).toMatch(/VITE_STELLARAGENT_VIEWER_KEY/);
    expect(config.problems.join('\n')).toMatch(/VITE_STELLARAGENT_AGENTS/);
    // Neither of these is required: a dashboard can watch channel state
    // without an indexer, and no panel calls the circuit breaker or the agent
    // wallet factory. A checklist padded with things nobody asked for is a
    // checklist people stop reading.
    expect(config.problems.join('\n')).not.toMatch(/INDEXER/);
    expect(config.problems.join('\n')).not.toMatch(/circuitBreaker/);
    expect(config.problems.join('\n')).not.toMatch(/agentWalletFactory/);
  });

  it('reports no problems in mock mode, which needs no configuration', () => {
    const config = readDashboardConfig({}, '?mode=mock', storage(null));
    expect(config.mode).toBe('mock');
    expect(config.problems).toEqual([]);
  });

  it('rejects an agent address that is not a G... key', () => {
    const config = readDashboardConfig(
      { ...complete, VITE_STELLARAGENT_AGENTS: JSON.stringify([{ address: 'not-an-address' }]) },
      '?mode=mock',
      storage(null),
    );
    expect(config.agents).toEqual([]);
    // The complaint still surfaces: a bad roster in mock mode is a bug worth
    // seeing, and mock mode is where people copy roster snippets from.
    expect(config.problems.join('\n')).toMatch(/not a Stellar G\.\.\. address/);
  });

  it('rejects a channel id that is not a u64', () => {
    const config = readDashboardConfig(
      { ...complete, VITE_STELLARAGENT_AGENTS: JSON.stringify([{ address: PUBLIC, channelId: '1.5' }]) },
      '?mode=mock',
      storage(null),
    );
    expect(config.agents).toEqual([]);
    expect(config.problems.join('\n')).toMatch(/channelId must be a u64/);
  });

  it('turns malformed JSON into a message rather than a crash', () => {
    const config = readDashboardConfig({ VITE_STELLARAGENT_AGENTS: '[{' }, '?mode=mock', storage(null));
    expect(config.agents).toEqual([]);
    expect(config.problems.join('\n')).toMatch(/not valid JSON/);
  });

  it('falls back to testnet and says so for an unknown network', () => {
    const config = readDashboardConfig(
      { ...complete, VITE_STELLARAGENT_NETWORK: 'devnet' },
      '?mode=mock',
      storage(null),
    );
    expect(config.network).toBe('testnet');
    expect(config.problems.join('\n')).toMatch(/not one of/);
  });

  it('ignores a contract value that is not a contract id', () => {
    const config = readDashboardConfig(
      { ...complete, VITE_STELLARAGENT_TESTNET_PAYMENT_CHANNEL: 'GBORNOTACONTRACT' },
      '',
      storage(null),
    );
    // Treated as absent, which puts it in the "no contract address" problem
    // rather than being passed through to fail deep inside an RPC call.
    expect(config.contracts.paymentChannel).toBeUndefined();
    expect(config.problems.join('\n')).toMatch(/No contract address for paymentChannel/);
    // The escrow address is still fine, so it is not re-reported.
    expect(config.contracts.escrow).toBe(ESCROW);
  });

  it('defaults the poll interval and rejects an absurd one', () => {
    expect(readDashboardConfig({}, '?mode=mock', storage(null)).pollIntervalMs).toBe(15_000);
    expect(readDashboardConfig({ VITE_STELLARAGENT_POLL_MS: '5000' }, '?mode=mock', storage(null))
      .pollIntervalMs).toBe(5_000);
    expect(readDashboardConfig({ VITE_STELLARAGENT_POLL_MS: '10' }, '?mode=mock', storage(null))
      .pollIntervalMs).toBe(15_000);
  });
});
