import { describe, expect, it, vi } from 'vitest';
import { scValToNative } from '@stellar/stellar-sdk';
import type { InvokeFn } from '../invocation.js';
import {
  FP_SIZE,
  FP2_SIZE,
  FR_SIZE,
  GAMMA_ABC_G1_SIZE,
  G1_POINT_SIZE,
  G2_POINT_SIZE,
  SOROBAN_G1_GENERATOR,
  g1Generator,
  g1Infinity,
  setSolvencyVk,
  solvencyProofVal,
  solvencyVerifyingKeyVal,
  toSolvencyG1,
  toSolvencyG2,
  verifySolvencyProof,
  type SolvencyProof,
  type SolvencyVerifyingKey,
} from '../solvency.js';
import { StellarAgentError } from '../../errors.js';
import { TEST_PUBLIC } from '../../__tests__/fixtures.js';

function invokeReturning(value: unknown): InvokeFn {
  return vi.fn(async () => ({ value, tx: { hash: 'tx', success: true } }));
}

/**
 * Structurally valid points that are not on the curve.
 *
 * The SDK's job is to get the *bytes* onto the wire in Soroban's layout; the
 * host is what rejects an off-curve point, and only when the transaction is
 * simulated. Fabricating bytes keeps these tests about encoding — the curve
 * arithmetic is `zk/solvency_proof`'s, and it has its own vectors.
 */
const g1 = (seed: number): Uint8Array => {
  const bytes = new Uint8Array(G1_POINT_SIZE);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (seed + i) & 0x3f; // top bits are flags
  return bytes;
};

const g2 = (seed: number): Uint8Array => {
  const bytes = new Uint8Array(G2_POINT_SIZE);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (seed + i) & 0x3f;
  return bytes;
};

const verifyingKey = (): SolvencyVerifyingKey => ({
  alphaG1: g1(1),
  betaG2: g2(2),
  gammaG2: g2(3),
  deltaG2: g2(4),
  gammaAbcG1: [g1(5), g1(6), g1(7)],
});

const proof = (): SolvencyProof => ({ a: g1(8), b: g2(9), c: g1(10) });

describe('BLS12-381 point encoding', () => {
  it('uses the sizes soroban_sdk documents', () => {
    expect(G1_POINT_SIZE).toBe(96);
    expect(G2_POINT_SIZE).toBe(192);
  });

  it("round-trips soroban_sdk's own known-answer G1 generator", () => {
    // The same vector soroban_sdk's rustdoc uses for `g1_add(zero, one)`, and
    // the same one zk/solvency_proof/src/soroban_encoding.rs asserts against.
    // If these ever disagree, every proof the SDK submits is rejected
    // on-chain for a reason that looks like a fraudulent proof.
    const decoded = g1Generator();
    expect(decoded).toHaveLength(G1_POINT_SIZE);
    expect(Buffer.from(decoded).toString('hex')).toBe(SOROBAN_G1_GENERATOR);
    expect(toSolvencyG1(SOROBAN_G1_GENERATOR)).toEqual(decoded);
  });

  it('encodes the point at infinity as the flag byte alone', () => {
    const infinity = g1Infinity();
    expect(infinity).toHaveLength(G1_POINT_SIZE);
    expect(infinity[0]).toBe(0x40);
    expect(infinity.slice(1).every((b) => b === 0)).toBe(true);
  });

  it('accepts hex strings as well as bytes', () => {
    const hex = Buffer.from(g1(1)).toString('hex');
    expect(toSolvencyG1(hex)).toEqual(g1(1));
    expect(toSolvencyG2(Buffer.from(g2(2)).toString('hex'))).toEqual(g2(2));
  });

  it('rejects a point of the wrong size, naming both lengths', () => {
    for (const [value, size, label] of [
      [new Uint8Array(G1_POINT_SIZE - 1), G1_POINT_SIZE, 'G1 point'],
      [new Uint8Array(G2_POINT_SIZE + 1), G2_POINT_SIZE, 'G2 point'],
    ] as const) {
      const error = (() => {
        try {
          return size === G1_POINT_SIZE ? toSolvencyG1(value, label) : toSolvencyG2(value, label);
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(StellarAgentError);
      expect((error as StellarAgentError).code).toBe('INVALID_ARGUMENT');
      expect((error as Error).message).toContain(`exactly ${size} bytes`);
      expect((error as Error).message).toContain(String(value.length));
    }
  });

  it('rejects a value that is not bytes at all', () => {
    const error = (() => {
      try {
        return toSolvencyG1(42 as unknown as Uint8Array);
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(StellarAgentError);
    expect((error as StellarAgentError).code).toBe('INVALID_ARGUMENT');
  });
});

describe('solvencyVerifyingKeyVal', () => {
  it('encodes the struct as a symbol-keyed ScVal map with sorted keys', () => {
    const native = scValToNative(solvencyVerifyingKeyVal(verifyingKey()));
    expect(Object.keys(native as Record<string, unknown>)).toEqual([
      'alpha_g1',
      'beta_g2',
      'delta_g2',
      'gamma_abc_g1',
      'gamma_g2',
    ]);
  });

  it('carries each point through byte-for-byte', () => {
    const vk = verifyingKey();
    const native = scValToNative(solvencyVerifyingKeyVal(vk)) as {
      alpha_g1: Uint8Array;
      beta_g2: Uint8Array;
      gamma_g2: Uint8Array;
      delta_g2: Uint8Array;
      gamma_abc_g1: Uint8Array[];
    };
    expect(new Uint8Array(native.alpha_g1)).toEqual(vk.alphaG1);
    expect(new Uint8Array(native.beta_g2)).toEqual(vk.betaG2);
    expect(new Uint8Array(native.gamma_g2)).toEqual(vk.gammaG2);
    expect(new Uint8Array(native.delta_g2)).toEqual(vk.deltaG2);
    // `scValToNative` decodes a ScVal vec to an array of Buffers under Node,
    // so each element is normalised before comparison.
    expect(native.gamma_abc_g1.map((point) => new Uint8Array(point))).toEqual(vk.gammaAbcG1);
  });

  it('encodes gamma_abc_g1 as a ScVal vec of three points', () => {
    const val = solvencyVerifyingKeyVal(verifyingKey());
    const native = scValToNative(val) as { gamma_abc_g1: Uint8Array[] };
    expect(native.gamma_abc_g1).toHaveLength(GAMMA_ABC_G1_SIZE);
    expect(native.gamma_abc_g1[0]).toHaveLength(G1_POINT_SIZE);
  });

  it('rejects a gamma_abc_g1 of the wrong length before spending a transaction', () => {
    // The contract panics on this; catching it here turns a revert with a
    // simulation error into a local message naming the actual constraint.
    for (const length of [0, 2, 4]) {
      const error = (() => {
        try {
          return solvencyVerifyingKeyVal({
            ...verifyingKey(),
            gammaAbcG1: Array.from({ length }, (_unused, i) => g1(i + 20)),
          });
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(StellarAgentError);
      expect((error as StellarAgentError).code).toBe('INVALID_ARGUMENT');
      expect((error as Error).message).toContain(`exactly ${GAMMA_ABC_G1_SIZE} entries`);
    }
  });
});

describe('solvencyProofVal', () => {
  it('encodes a, b and c as a sorted symbol-keyed map', () => {
    const native = scValToNative(solvencyProofVal(proof())) as Record<string, Uint8Array>;
    expect(Object.keys(native)).toEqual(['a', 'b', 'c']);
    const p = proof();
    expect(new Uint8Array(native.a)).toEqual(p.a);
    expect(new Uint8Array(native.b)).toEqual(p.b);
    expect(new Uint8Array(native.c)).toEqual(p.c);
  });
});

describe('setSolvencyVk', () => {
  it('invokes set_solvency_vk with the admin address and the encoded key', async () => {
    const invoke = invokeReturning(undefined);
    const result = await setSolvencyVk(invoke, 'CCHANNEL', TEST_PUBLIC, verifyingKey());
    expect(invoke).toHaveBeenCalledWith('CCHANNEL', 'set_solvency_vk', expect.any(Array));
    const args = (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(scValToNative(args[0])).toBe(TEST_PUBLIC);
    expect(Object.keys(scValToNative(args[1]) as object)).toContain('gamma_abc_g1');
    expect(result).toEqual({ hash: 'tx', success: true });
  });

  it('validates before invoking anything', async () => {
    const invoke = invokeReturning(undefined);
    await expect(
      setSolvencyVk(invoke, 'CCHANNEL', TEST_PUBLIC, {
        ...verifyingKey(),
        alphaG1: new Uint8Array(10),
      }),
    ).rejects.toThrow(/exactly 96 bytes/);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('verifySolvencyProof', () => {
  it('invokes verify_solvency_proof read-only and returns the boolean', async () => {
    const invoke = invokeReturning(true);
    await expect(verifySolvencyProof(invoke, 'CCHANNEL', 7n, proof())).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      'CCHANNEL',
      'verify_solvency_proof',
      expect.any(Array),
      true,
    );
    const args = (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(scValToNative(args[0])).toBe(7n);
    expect(Object.keys(scValToNative(args[1]) as object)).toEqual(['a', 'b', 'c']);
  });

  it('reports a rejected proof as false rather than throwing', async () => {
    // A false pairing check is the expected answer for a bad proof, not an
    // error — throwing here would make every caller wrap it in a try/catch and
    // lose the distinction between "invalid" and "unreachable".
    const invoke = invokeReturning(false);
    await expect(verifySolvencyProof(invoke, 'CCHANNEL', 1n, proof())).resolves.toBe(false);
  });

  it('rejects a non-boolean contract result instead of coercing it', async () => {
    const invoke = invokeReturning('true');
    const error = await verifySolvencyProof(invoke, 'CCHANNEL', 1n, proof()).catch((caught) => caught);
    expect(error).toBeInstanceOf(StellarAgentError);
    expect((error as StellarAgentError).code).toBe('CONTRACT_ERROR');
  });

  it('validates the proof encoding before invoking anything', async () => {
    const invoke = invokeReturning(true);
    await expect(
      verifySolvencyProof(invoke, 'CCHANNEL', 1n, { ...proof(), b: new Uint8Array(4) }),
    ).rejects.toThrow(/exactly 192 bytes/);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('module surface', () => {
  it('keeps the field sizes in step with the curve', () => {
    // G1 is 2 × Fp, G2 is 4 × Fp, and the scalar field is a third of an Fp
    // element's width. These mirror zk/solvency_proof/src/soroban_encoding.rs.
    expect(FP_SIZE).toBe(48);
    expect(FP2_SIZE).toBe(96);
    expect(FR_SIZE).toBe(32);
    expect(G1_POINT_SIZE).toBe(FP_SIZE * 2);
    expect(G2_POINT_SIZE).toBe(FP2_SIZE * 2);
  });

  it('keeps the public-input count in step with the generated contract types', () => {
    // `SolvencyVerifyingKey.gamma_abc_g1` is `Vec<BytesN<96>>` on-chain, and
    // the contract requires exactly one constant term plus one entry per
    // public input (`limit_per_period`, `total_spent`).
    expect(GAMMA_ABC_G1_SIZE - 1).toBe(2);
  });
});
