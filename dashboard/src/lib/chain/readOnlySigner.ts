/**
 * A `Signer` that holds no key and refuses to sign.
 *
 * ## Why the dashboard has one of these
 *
 * `StellarAgent` is built for spending, so it takes a `Signer` and uses it for
 * two different things: signing transaction envelopes, and *building* them.
 * Soroban simulation needs a source account — `rpc.getAccount(address)` — so
 * even a read-only dashboard has to name an account, and the only way to name
 * one through the existing API is to hand the agent something that can sign.
 *
 * The obvious answer, a `KeypairSigner` built from a secret pasted into a
 * `VITE_` variable, is wrong: `VITE_*` values are inlined into the JavaScript
 * bundle, which is served to every visitor of a monitoring dashboard. A
 * read-only view does not need authority, so it does not get any.
 *
 * Queries never reach `signTransaction` or `signAuthEntry` — `runInvocation`
 * returns immediately after `simulateTransaction` when `readOnly` is set — so
 * those two throw rather than pretending. If a mutation is ever wired into
 * this dashboard, it fails loudly at the first signature instead of silently
 * needing a key nobody should have.
 */

import { SigningError, type Signer } from '@stellaragent/core';

/** The subset of a `Signer` that actually works without key material. */
export interface ReadOnlySigner extends Signer {
  /** Always `false` — there is nothing to hold. */
  readonly holdsSecretKey: false;
  /** The account transactions are built from. */
  readonly address: string;
}

const REFUSAL =
  'ReadOnlySigner holds no key material. The dashboard is a reader: it simulates ' +
  'read-only calls and never submits one. A mutation here needs a real Signer ' +
  '(see docs/signing.md), which a browser dashboard must not have.';

export function createReadOnlySigner(address: string): ReadOnlySigner {
  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    throw new SigningError(
      `createReadOnlySigner: not a Stellar public key: ${address}. ` +
        'The dashboard never holds a secret — it needs an account to simulate from, not a key.',
    );
  }

  return {
    address,
    holdsSecretKey: false as const,
    async getPublicKey() {
      return address;
    },
    async signTransaction() {
      throw new SigningError(REFUSAL);
    },
    async signAuthEntry() {
      throw new SigningError(REFUSAL);
    },
  };
}
