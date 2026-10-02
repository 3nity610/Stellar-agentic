import { describe, expect, it } from 'vitest';
import { Keypair, scValToNative, StrKey } from '@stellar/stellar-sdk';
import {
  addressVal,
  bytesVal,
  enumVal,
  i128Val,
  i128BaseUnitsVal,
  paymentRouteVal,
  resolveAssetContract,
  spendPeriodVariant,
  u32Val,
  u64Val,
} from '../encoding.js';
import { StellarAgentError } from '../../errors.js';

const TEST_ADDRESS = Keypair.random().publicKey();
const TEST_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));
const TEST_CONTRACT_2 = StrKey.encodeContract(Buffer.alloc(32, 8));
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

describe('addressVal', () => {
  it('encodes a valid Stellar address as an ScAddress', () => {
    const val = addressVal(TEST_ADDRESS);
    expect(scValToNative(val)).toBe(TEST_ADDRESS);
  });

  it('throws a StellarAgentError for a malformed address', () => {
    expect(() => addressVal('not-an-address')).toThrow(StellarAgentError);
    try {
      addressVal('not-an-address');
    } catch (error) {
      expect(error).toBeInstanceOf(StellarAgentError);
      expect((error as StellarAgentError).code).toBe('INVALID_ARGUMENT');
    }
  });
});

describe('i128Val', () => {
  it('encodes a decimal amount as stroops', () => {
    expect(scValToNative(i128Val('10'))).toBe(100_000_000n);
  });

  it('throws a StellarAgentError for an unparseable amount', () => {
    expect(() => i128Val('not-a-number')).toThrow(StellarAgentError);
  });
});

describe('i128BaseUnitsVal', () => {
  it('does not apply a second stroop conversion', () => {
    expect(scValToNative(i128BaseUnitsVal('123456789'))).toBe(123_456_789n);
  });

  it('rejects non-canonical and overflowing integers', () => {
    expect(() => i128BaseUnitsVal('01')).toThrow(StellarAgentError);
    expect(() => i128BaseUnitsVal((1n << 127n).toString())).toThrow(StellarAgentError);
  });
});

describe('u64Val', () => {
  it('encodes an in-range value', () => {
    expect(scValToNative(u64Val(7n))).toBe(7n);
  });

  it('rejects a negative value', () => {
    expect(() => u64Val(-1n)).toThrow(StellarAgentError);
  });

  it('rejects a value above the u64 range', () => {
    expect(() => u64Val(0x1_0000_0000_0000_0000n)).toThrow(StellarAgentError);
  });
});

describe('u32Val', () => {
  it('encodes an in-range value', () => {
    expect(scValToNative(u32Val(42))).toBe(42);
  });

  it('rejects a non-integer', () => {
    expect(() => u32Val(1.5)).toThrow(StellarAgentError);
  });

  it('rejects a negative value', () => {
    expect(() => u32Val(-1)).toThrow(StellarAgentError);
  });

  it('rejects a value above the u32 range', () => {
    expect(() => u32Val(0x1_0000_0000)).toThrow(StellarAgentError);
  });
});

describe('bytesVal', () => {
  it('round-trips a UTF-8 string through bytes', () => {
    expect(scValToNative(bytesVal('hello'))).toEqual(Buffer.from('hello', 'utf8'));
  });
});

describe('enumVal', () => {
  it('encodes a unit-variant enum as a one-element symbol vector', () => {
    const val = enumVal('Hourly');
    expect(val.switch().name).toBe('scvVec');
    expect(scValToNative(val)).toEqual(['Hourly']);
  });
});

describe('spendPeriodVariant', () => {
  it('maps every SpendPeriod to its contract-side PascalCase variant', () => {
    expect(spendPeriodVariant('per_ledger')).toBe('PerLedger');
    expect(spendPeriodVariant('hourly')).toBe('Hourly');
    expect(spendPeriodVariant('daily')).toBe('Daily');
  });
});

describe('resolveAssetContract', () => {
  it('resolves XLM to the native asset contract for the network', () => {
    const resolved = resolveAssetContract('XLM', {}, NETWORK_PASSPHRASE);
    expect(resolved.startsWith('C')).toBe(true);
  });

  it('resolves a friendly asset code through assetContracts', () => {
    expect(resolveAssetContract('USDC', { USDC: TEST_CONTRACT }, NETWORK_PASSPHRASE))
      .toBe(TEST_CONTRACT);
  });

  it('passes a raw contract ID through directly', () => {
    expect(resolveAssetContract(TEST_CONTRACT, {}, NETWORK_PASSPHRASE)).toBe(TEST_CONTRACT);
  });

  it('throws a StellarAgentError for an asset it cannot resolve', () => {
    expect(() => resolveAssetContract('UNKNOWN', {}, NETWORK_PASSPHRASE)).toThrow(StellarAgentError);
  });
});

describe('paymentRouteVal', () => {
  it('encodes contract-backed hops with raw per-hop floors', () => {
    const encoded = paymentRouteVal({
      id: 'route',
      sourceAsset: 'XLM',
      destinationAsset: 'USDC',
      sourceAmount: '10000000',
      expectedDestinationAmount: '20000000',
      totalFeeBps: 30,
      expectedSlippageBps: 20,
      reliabilityBps: 9_500,
      hopCount: 1,
      hops: [{
        venue: 'amm',
        venueId: TEST_CONTRACT_2,
        sourceAsset: 'XLM',
        destinationAsset: 'USDC',
        sourceAmount: '10000000',
        expectedOutput: '20000000',
        feeAmount: '3000',
        feeBps: 30,
        slippageBps: 20,
        reliabilityBps: 9_500,
        minOutput: '19000000',
      }],
    }, { USDC: TEST_CONTRACT }, NETWORK_PASSPHRASE);
    expect(scValToNative(encoded)).toEqual([{
      from_token: resolveAssetContract('XLM', {}, NETWORK_PASSPHRASE),
      min_out: 19_000_000n,
      to_token: TEST_CONTRACT,
      venue: TEST_CONTRACT_2,
    }]);
  });

  it('encodes a same-asset direct route as an empty contract route', () => {
    const encoded = paymentRouteVal({
      id: 'direct',
      sourceAsset: 'XLM',
      destinationAsset: 'XLM',
      sourceAmount: '1',
      expectedDestinationAmount: '1',
      totalFeeBps: 0,
      expectedSlippageBps: 0,
      reliabilityBps: 10_000,
      hopCount: 1,
      hops: [{
        venue: 'direct', venueId: 'direct', sourceAsset: 'XLM', destinationAsset: 'XLM',
        sourceAmount: '1', expectedOutput: '1', feeAmount: '0', feeBps: 0,
        slippageBps: 0, reliabilityBps: 10_000,
      }],
    }, {}, NETWORK_PASSPHRASE);
    expect(scValToNative(encoded)).toEqual([]);
  });

  it('rejects a cross-asset direct hop', () => {
    expect(() => paymentRouteVal({
      id: 'bad', sourceAsset: 'XLM', destinationAsset: 'USDC', sourceAmount: '1',
      expectedDestinationAmount: '1', totalFeeBps: 0, expectedSlippageBps: 0,
      reliabilityBps: 10_000, hopCount: 1,
      hops: [{
        venue: 'direct', venueId: 'direct', sourceAsset: 'XLM', destinationAsset: 'USDC',
        sourceAmount: '1', expectedOutput: '1', feeAmount: '0', feeBps: 0,
        slippageBps: 0, reliabilityBps: 10_000,
      }],
    }, { USDC: TEST_CONTRACT }, NETWORK_PASSPHRASE)).toThrow(/Direct route hops/);
  });
});
