/**
 * Deterministic test keypairs and identities for local devnet testing.
 *
 * Uses SHA-256 seed expansion so every run against the devnet uses
 * identical, reproducible public keys and secret keys.
 */
import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

/** Standard identities used throughout devnet scenarios */
export const DEVNET_IDENTITIES = [
  'admin',
  'alice',
  'bob',
  'charlie',
  'oracle',
  'signer',
  'auditor',
] as const;

export type DevnetIdentityName = (typeof DEVNET_IDENTITIES)[number];

/**
 * Deterministically derives a Stellar Keypair from a seed name.
 * e.g., deterministicKeypair('alice') will always return the exact same keypair.
 */
export function deterministicKeypair(seedName: string): Keypair {
  const seed = createHash('sha256')
    .update(`stellaragent:devnet:seed:v1:${seedName}`)
    .digest();
  return Keypair.fromRawEd25519Seed(seed);
}

/** Pre-computed keypairs for standard devnet test identities */
export const DEVNET_KEYPAIRS: Record<DevnetIdentityName, Keypair> = {
  admin: deterministicKeypair('admin'),
  alice: deterministicKeypair('alice'),
  bob: deterministicKeypair('bob'),
  charlie: deterministicKeypair('charlie'),
  oracle: deterministicKeypair('oracle'),
  signer: deterministicKeypair('signer'),
  auditor: deterministicKeypair('auditor'),
};

/** Pre-computed public addresses for standard devnet test identities */
export const DEVNET_ADDRESSES: Record<DevnetIdentityName, string> = {
  admin: DEVNET_KEYPAIRS.admin.publicKey(),
  alice: DEVNET_KEYPAIRS.alice.publicKey(),
  bob: DEVNET_KEYPAIRS.bob.publicKey(),
  charlie: DEVNET_KEYPAIRS.charlie.publicKey(),
  oracle: DEVNET_KEYPAIRS.oracle.publicKey(),
  signer: DEVNET_KEYPAIRS.signer.publicKey(),
  auditor: DEVNET_KEYPAIRS.auditor.publicKey(),
};
