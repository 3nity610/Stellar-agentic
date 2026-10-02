# @stellaragent/core

The TypeScript SDK for AI Agent Payment Rails on Stellar. See the
[root README](../../README.md#sdk-typescript) for installation and a quick
start.

- **API reference** (generated from this package's TSDoc comments):
  [`docs/api/core`](../../docs/api/core/README.md)
- **Module structure and where new code belongs**:
  [`docs/architecture/core-modules.md`](../../docs/architecture/core-modules.md)
- **Signing and key custody**: [`docs/signing.md`](../../docs/signing.md)
- **Fleet throughput, sponsorship, fees, and queue tuning**:
  [`docs/fleet-tuning.md`](../../docs/fleet-tuning.md)
- **Multi-asset discovery, deterministic selection, and atomic routes**:
  [`docs/payment-routing.md`](../../docs/payment-routing.md)
- **Groth16 solvency proofs (submit + verify)**:
  [`docs/zk-solvency-design.md`](../../docs/zk-solvency-design.md)

## Solvency proofs

`PaymentChannel` can prove that *some* ordering of undisclosed payments into
spend-limit periods never exceeded `limit_per_period` and summed to exactly
`total_spent` — without disclosing the payments themselves. The feature was
on-chain only until this SDK learned to encode the points for it.

```typescript
import { StellarAgent, g1Generator } from '@stellaragent/core';

const agent = await StellarAgent.create({ network: 'testnet', signer });

// 1. Install the circuit's verifying key. The FIRST caller to do so becomes
//    the admin for every future rotation — treat it as a one-way door.
await agent.setSolvencyVk({
  alphaG1: vk.alphaG1,        // 96 bytes
  betaG2: vk.betaG2,          // 192 bytes
  gammaG2: vk.gammaG2,        // 192 bytes
  deltaG2: vk.deltaG2,        // 192 bytes
  gammaAbcG1: vk.gammaAbcG1,  // exactly 3 x 96 bytes
});

// 2. Verify a proof against a channel's own public totals.
const ok = await agent.verifySolvencyProof(channelId, {
  a: proof.a, // 96 bytes
  b: proof.b, // 192 bytes
  c: proof.c, // 96 bytes
});
```

### The encoding is not negotiable

Soroban and arkworks share the curve (BLS12-381) and nothing else. arkworks'
`CanonicalSerialize` emits little-endian Montgomery-form bytes; Soroban wants
**uncompressed, big-endian** coordinates with three flag bits in the top byte
(`src/agent/solvency.ts`, mirrored in
`zk/solvency_proof/src/soroban_encoding.rs`). Hand the contract arkworks' own
bytes and `pairing_check` returns `false` for a proof that is in fact valid —
indistinguishable, from the outside, from a fraudulent one.

`g1Generator()` returns `soroban_sdk`'s own known-answer G1 vector, so you can
assert against it before trusting a submission. The same constants are
exported as `G1_POINT_SIZE` (96), `G2_POINT_SIZE` (192), `GAMMA_ABC_G1_SIZE`
(3) and `SOROBAN_G1_GENERATOR`.

### Reading `false`

`verifySolvencyProof` returns `false` for a proof that does not verify — that
is the expected answer, not an error, and callers should not wrap it in a
`try`/`catch`. It *throws* only when no verifying key has been installed yet,
which is a deployment gap rather than a statement about the proof.

### What a proof does and does not say

It says a consistent history **exists**. It does not say who was paid, when, or
in how many transactions. Full circuit description and the threat model:
[`docs/zk-solvency-design.md`](../../docs/zk-solvency-design.md).

## Development

```bash
pnpm --filter @stellaragent/core build       # tsup, emits dist/ + .d.ts
pnpm --filter @stellaragent/core test        # vitest
pnpm --filter @stellaragent/core typecheck
pnpm --filter @stellaragent/core lint
```

### Local-network integration tests

`src/__tests__/integration.local.test.ts` runs against a Soroban standalone network and is **skipped by default**. To run it:

```bash
# 1. Start the local Stellar network
stellar network start local

# 2. Deploy all contracts to the local network
pnpm deploy:contracts --network local --source alice

# 3. Export the environment variables printed by the deploy command
#    (e.g., export STELLARAGENT_LOCAL_AGENT_WALLET_FACTORY=...)
#    These are also written to deployments/local.json

# 4. Run the integration suite
STELLAR_LOCAL_INTEGRATION=1 pnpm --filter @stellaragent/core test
```

The suite funds isolated owner/worker accounts through the local friendbot and exercises:
- Agent registration
- Complete payment-channel lifecycle (open, pay, rate-limit checks, close)
- Solvency proof installation and verification
- Parallel escrow lifecycle (create, accept, submit, release)
- Circuit breaker status checks
- Fuzz testing of `predictPaymentOutcome` vs on-chain `RateLimiter.check`

This is the only test suite that runs against a real network rather than mocks, so it catches decoding mismatches between SDK and contract that would otherwise pass CI.

After changing a public type or a `StellarAgent` method's signature or doc
comment, regenerate the API report and reference docs from the repo root:

```bash
pnpm docs:api
```

CI runs `pnpm docs:api:check` and fails if the committed output is stale.
