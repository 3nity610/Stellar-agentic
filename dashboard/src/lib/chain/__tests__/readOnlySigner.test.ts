import { describe, expect, it, vi } from 'vitest';
import { SigningError } from '@stellaragent/core';
import { createReadOnlySigner } from '../readOnlySigner.js';

const PUBLIC = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

describe('createReadOnlySigner', () => {
  it('reports the account it simulates from', async () => {
    const signer = createReadOnlySigner(PUBLIC);
    await expect(signer.getPublicKey()).resolves.toBe(PUBLIC);
    expect(signer.address).toBe(PUBLIC);
  });

  it('never claims to hold a key', () => {
    // A dashboard's whole safety argument is "no secret in the browser". A
    // signer that reported otherwise would be a lie the rest of the code
    // reasons about.
    expect(createReadOnlySigner(PUBLIC).holdsSecretKey).toBe(false);
  });

  it('refuses to sign a transaction, and says why', async () => {
    const error = await createReadOnlySigner(PUBLIC)
      .signTransaction('AAAA', { networkPassphrase: 'Test SDF Network ; September 2015' })
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(SigningError);
    expect((error as Error).message).toMatch(/holds no key material/);
  });

  it('refuses to sign an auth entry too', async () => {
    // Soroban signs the two halves separately, so refusing only
    // `signTransaction` would leave a contract call able to authorize itself.
    const error = await createReadOnlySigner(PUBLIC)
      .signAuthEntry('AAAA', { networkPassphrase: 'Test SDF Network ; September 2015', validUntilLedgerSeq: 1 })
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(SigningError);
  });

  it('rejects a value that is not a public key', () => {
    for (const bad of ['', 'not-an-address', 'S' + PUBLIC.slice(1), PUBLIC + 'X']) {
      expect(() => createReadOnlySigner(bad)).toThrow(SigningError);
    }
  });

  it('rejects a contract id — a contract cannot be a transaction source', () => {
    const error = (() => {
      try {
        return createReadOnlySigner('CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ');
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(SigningError);
    expect((error as Error).message).toMatch(/not a Stellar public key/);
  });

  it('never reaches for a signing API, even when the platform offers one', () => {
    // A read-only signer that quietly fell back to `crypto.subtle` would be a
    // signer that stopped being read-only the moment someone wired a key in.
    const spy = vi.fn();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: { sign: spy } },
      configurable: true,
    });
    try {
      const signer = createReadOnlySigner(PUBLIC);
      expect(signer.holdsSecretKey).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});
