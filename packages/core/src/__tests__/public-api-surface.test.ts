import { describe, expect, it } from 'vitest';
import * as pkg from '../index.js';

/**
 * A snapshot of every name `@stellaragent/core` exports at runtime (classes,
 * functions, constants — not types, which leave no runtime trace to
 * snapshot). This is deliberately coarse: it exists to catch an
 * accidentally added or removed export falling out of the `index.ts`
 * module split, not to police type-level signature changes — that's what
 * `packages/core/api-report.d.ts` (see `pnpm docs:api:check`) is for.
 *
 * A failure here means the public surface changed. If that was intentional,
 * update the snapshot *and* run `pnpm docs:api` to keep the API report and
 * generated reference in step with it.
 */
it('exports the same set of names as before the module split', () => {
  expect(Object.keys(pkg).sort()).toMatchSnapshot();
});

describe('StellarAgent', () => {
  it('is exported as a class with the expected static factories', () => {
    expect(typeof pkg.StellarAgent).toBe('function');
    expect(typeof pkg.StellarAgent.create).toBe('function');
    expect(typeof pkg.StellarAgent.fromSecret).toBe('function');
  });

  // TypeScript's `private` is compile-time only — the class's actual JS
  // prototype also carries `invokeContract` and `getLatestLedger` (kept as
  // real methods so tests elsewhere can `vi.spyOn` them; see
  // docs/architecture/core-modules.md). A runtime check therefore can't
  // distinguish public from private the way `packages/core/api-report.d.ts`
  // does — this just smoke-tests that every documented operation is still
  // there as a callable method after the split.
  it('still has every documented operation as a callable method', () => {
    const documentedMethods = [
      'createAgentWallet', 'getAgent', 'openChannel', 'closeChannel', 'payForAPI',
      'requestWork', 'acceptJob', 'submitResult', 'releasePayment', 'setRateLimits',
      'checkRateLimit', 'getBalance', 'getSpendReport', 'getChannel', 'getJob',
      'getRateLimitStatus', 'getLedgerCloseEstimate',
      'setSolvencyVk', 'verifySolvencyProof',
      'getFleetStats', 'resizeChannelPool', 'shutdown',
      'predictPayment',
    ] as const;
    for (const name of documentedMethods) {
      expect(typeof pkg.StellarAgent.prototype[name], name).toBe('function');
    }
  });
});
