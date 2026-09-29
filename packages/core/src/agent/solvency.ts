/**
 * Groth16 solvency proofs: point encoding, and the two `PaymentChannel`
 * entrypoints that install a verifying key and check a proof against it.
 *
 * ## The wire format problem this module exists to solve
 *
 * Soroban and arkworks agree on the curve (BLS12-381) and disagree about
 * almost everything else. arkworks' `CanonicalSerialize` emits
 * little-endian, Montgomery-form bytes; Soroban follows the ZCash/IETF
 * convention — **uncompressed**, **big-endian** coordinates, with three flag
 * bits packed into the top of the first byte. Feeding arkworks' own bytes
 * straight to `env.crypto().bls12_381()` would produce a different (or
 * outright invalid) point, and the failure shows up as a `pairing_check` that
 * returns `false` for a proof that is in fact valid — the worst kind of
 * failure, because it is indistinguishable from a fraudulent proof.
 *
 * `zk/solvency_proof/src/soroban_encoding.rs` is the Rust side of this same
 * conversion, and its tests assert against the known-answer G1 generator
 * vector published in `soroban_sdk`'s own rustdoc. {@link SOROBAN_G1_GENERATOR}
 * below is that same vector, and {@link G1_POINT_SIZE} /
 * {@link G2_POINT_SIZE} are the same constants — keep the two in step.
 *
 * ## What the on-chain check actually asserts
 *
 * `PaymentChannel.verify_solvency_proof` folds the channel's **own** public
 * `limit_per_period` and `total_spent` into the Groth16 public-input term
 * and runs the pairing check. A valid proof therefore says: *some* ordering of
 * undisclosed payments into spend-limit periods never exceeded the limit, and
 * those payments sum to exactly the channel's recorded total. It says nothing
 * about who was paid, when, or in how many transactions — see
 * `docs/zk-solvency-design.md`.
 *
 * @module solvency
 */

import { xdr } from '@stellar/stellar-sdk';
import { StellarAgentError } from '../errors.js';
import type { TxResult } from '../types/index.js';
import { addressVal, u64Val } from './encoding.js';
import type { InvokeFn } from './invocation.js';

/** Size of a BLS12-381 base-field element, in bytes. */
export const FP_SIZE = 48;
/** Size of a compressed-free (uncompressed) G1 point: `be(X) || be(Y)`. */
export const G1_POINT_SIZE = FP_SIZE * 2;
/** Size of an Fp2 element: two base-field elements. */
export const FP2_SIZE = FP_SIZE * 2;
/** Size of an uncompressed G2 point: `be(X_c1) || be(X_c0) || be(Y_c1) || be(Y_c0)`. */
export const G2_POINT_SIZE = FP2_SIZE * 2;
/** Size of a scalar field element, in bytes. */
export const FR_SIZE = 32;

/** The `SolvencyVerifyingKey.gamma_abc_g1` length the contract enforces. */
export const SOLVENCY_PUBLIC_INPUTS = 2;
export const GAMMA_ABC_G1_SIZE = SOLVENCY_PUBLIC_INPUTS + 1;

/**
 * The known-answer BLS12-381 G1 generator, in Soroban's encoding.
 *
 * Lifted from `soroban_sdk::crypto::bls12_381`'s own rustdoc example for
 * `g1_add(zero, one)`. If this constant ever stops decoding to a well-formed
 * point, the SDK and the Rust crate have diverged and every proof the SDK
 * submits will be rejected on-chain for a reason that looks like a bad proof.
 */
export const SOROBAN_G1_GENERATOR =
  '17f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb' +
  '08b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1';

/** The point at infinity, in Soroban's encoding: the flag byte alone. */
const G1_INFINITY = '40';

// ─── Types ────────────────────────────────────────────────────────────────────

/** An uncompressed BLS12-381 G1 point, 96 bytes, as `BytesN<96>` reaches the wire. */
export type SolvencyG1Point = Uint8Array;
/** An uncompressed BLS12-381 G2 point, 192 bytes. */
export type SolvencyG2Point = Uint8Array;

/**
 * A Groth16 verifying key for the solvency circuit, in the same shape
 * `PaymentChannel.SolvencyVerifyingKey` decodes to.
 *
 * `gammaAbcG1` must hold exactly {@link GAMMA_ABC_G1_SIZE} points: the constant
 * term, then one per public input in circuit order (`limitPerPeriod`, then
 * `totalSpent`). The contract rejects any other length, so this is checked
 * here too — a bad key is otherwise only discoverable by spending a
 * transaction on a revert.
 */
export interface SolvencyVerifyingKey {
  alphaG1: SolvencyG1Point;
  betaG2: SolvencyG2Point;
  gammaG2: SolvencyG2Point;
  deltaG2: SolvencyG2Point;
  gammaAbcG1: SolvencyG1Point[];
}

/** A Groth16 proof for the solvency circuit. */
export interface SolvencyProof {
  a: SolvencyG1Point;
  b: SolvencyG2Point;
  c: SolvencyG1Point;
}

// ─── Point helpers ────────────────────────────────────────────────────────────

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/** Bytes of a point, given its expected size. */
function pointBytes(value: Uint8Array | string, size: number, name: string): Uint8Array {
  const bytes = typeof value === 'string' ? fromHex(value) : value;
  if (!(bytes instanceof Uint8Array)) {
    throw new StellarAgentError('INVALID_ARGUMENT', `${name} must be a Uint8Array or a hex string`);
  }
  if (bytes.length !== size) {
    throw new StellarAgentError(
      'INVALID_ARGUMENT',
      `${name} must be exactly ${size} bytes (a BLS12-381 ` +
        `${size === G1_POINT_SIZE ? 'G1' : 'G2'} point in Soroban's uncompressed ` +
        `big-endian encoding), got ${bytes.length}`,
    );
  }
  return bytes;
}

/** Validate a G1 point and return its bytes. */
export function toSolvencyG1(value: Uint8Array | string, name = 'G1 point'): SolvencyG1Point {
  return pointBytes(value, G1_POINT_SIZE, name);
}

/** Validate a G2 point and return its bytes. */
export function toSolvencyG2(value: Uint8Array | string, name = 'G2 point'): SolvencyG2Point {
  return pointBytes(value, G2_POINT_SIZE, name);
}

/** The BLS12-381 G1 generator, as the SDK encodes it. Useful as a test vector. */
export function g1Generator(): SolvencyG1Point {
  return fromHex(SOROBAN_G1_GENERATOR);
}

/** The G1 point at infinity, as the SDK encodes it. */
export function g1Infinity(): SolvencyG1Point {
  return fromHex(G1_INFINITY.padEnd(G1_POINT_SIZE * 2, '0'));
}

// ─── ScVal encoding ───────────────────────────────────────────────────────────

function bytesVal(value: Uint8Array): xdr.ScVal {
  // `BytesN<N>` and `Bytes` share the `scvBytes` wire type; the length is what
  // distinguishes them, and the host rejects a `BytesN<96>` that is not 96
  // bytes long when it reaches `pairing_check`. Length is checked above, at
  // the point where the mistake is still attributable.
  return xdr.ScVal.scvBytes(Buffer.from(value));
}

function mapEntry(key: string, value: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: value });
}

/** `#[contracttype]` structs are ScVal maps keyed by field-name symbols. */
function structVal(entries: Array<[string, xdr.ScVal]>): xdr.ScVal {
  // Soroban requires map keys in ascending order. `alpha_g1 < beta_g2 <
  // delta_g2 < gamma_abc_g1 < gamma_g2` and `a < b < c` are already sorted
  // alphabetically, and ScVal's own comparison is what defines "ascending" for
  // symbols, so the declaration order is also the wire order.
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return xdr.ScVal.scvMap(sorted.map(([key, value]) => mapEntry(key, value)));
}

/** Encode a verifying key as the `SolvencyVerifyingKey` contract struct. */
export function solvencyVerifyingKeyVal(vk: SolvencyVerifyingKey): xdr.ScVal {
  if (vk.gammaAbcG1.length !== GAMMA_ABC_G1_SIZE) {
    throw new StellarAgentError(
      'INVALID_ARGUMENT',
      `gammaAbcG1 must have exactly ${GAMMA_ABC_G1_SIZE} entries ` +
        `(${SOLVENCY_PUBLIC_INPUTS} public inputs: limitPerPeriod, totalSpent, plus the constant term), ` +
        `got ${vk.gammaAbcG1.length}`,
    );
  }
  return structVal([
    ['alpha_g1', bytesVal(toSolvencyG1(vk.alphaG1, 'alphaG1'))],
    ['beta_g2', bytesVal(toSolvencyG2(vk.betaG2, 'betaG2'))],
    ['gamma_g2', bytesVal(toSolvencyG2(vk.gammaG2, 'gammaG2'))],
    ['delta_g2', bytesVal(toSolvencyG2(vk.deltaG2, 'deltaG2'))],
    ['gamma_abc_g1', xdr.ScVal.scvVec(vk.gammaAbcG1.map((point) => bytesVal(toSolvencyG1(point, 'gammaAbcG1 entry'))))],
  ]);
}

/** Encode a proof as the `SolvencyProof` contract struct. */
export function solvencyProofVal(proof: SolvencyProof): xdr.ScVal {
  return structVal([
    ['a', bytesVal(toSolvencyG1(proof.a, 'a'))],
    ['b', bytesVal(toSolvencyG2(proof.b, 'b'))],
    ['c', bytesVal(toSolvencyG1(proof.c, 'c'))],
  ]);
}

// ─── Contract calls ───────────────────────────────────────────────────────────

/**
 * Install (or rotate) the Groth16 verifying key used by
 * `PaymentChannel.verify_solvency_proof`.
 *
 * Admin-only, and the **first** caller to set a key becomes the admin for
 * every future rotation — mirroring `set_circuit_breaker`. A key set by
 * someone who is not the recorded admin reverts, and so does one whose
 * `gamma_abc_g1` is not exactly {@link GAMMA_ABC_G1_SIZE} long.
 */
export async function setSolvencyVk(
  invoke: InvokeFn,
  paymentChannel: string,
  address: string,
  vk: SolvencyVerifyingKey,
): Promise<TxResult> {
  return (await invoke(paymentChannel, 'set_solvency_vk', [
    addressVal(address),
    solvencyVerifyingKeyVal(vk),
  ])).tx;
}

/**
 * Verify a Groth16 solvency proof against a channel's own
 * `limit_per_period` and `total_spent`.
 *
 * Read-only, and returns `false` rather than throwing for a proof that does
 * not verify — an invalid proof is the expected answer, not an error. It still
 * *throws* when no verifying key has been configured, because that is a
 * deployment gap rather than a statement about the proof.
 */
export async function verifySolvencyProof(
  invoke: InvokeFn,
  paymentChannel: string,
  channelId: bigint,
  proof: SolvencyProof,
): Promise<boolean> {
  const result = await invoke(
    paymentChannel,
    'verify_solvency_proof',
    [u64Val(channelId), solvencyProofVal(proof)],
    true,
  );
  if (typeof result.value !== 'boolean') {
    throw new StellarAgentError(
      'CONTRACT_ERROR',
      'verify_solvency_proof returned a malformed result (expected a bool)',
    );
  }
  return result.value;
}
