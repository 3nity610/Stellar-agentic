# `packages/core` module structure

`packages/core/src/index.ts` used to hold the entire SDK: every export,
the `StellarAgent` class, contract invocation, ScVal encoding, struct
decoding, and error mapping, in one file over a thousand lines long. Two
separate merges silently dropped whole features from it, because a conflict
there was unreadable — the loss only surfaced when the package stopped
compiling much later. This document describes the structure that replaced
it, and where a change should land now.

---

## Contents

- [Module map](#module-map)
- [Where new code belongs](#where-new-code-belongs)
- [The public API surface](#the-public-api-surface)
- [Decisions recorded elsewhere](#decisions-recorded-elsewhere)

---

## Module map

`index.ts` is the package's public surface **and nothing else** — every
line in it is either a re-export or a comment pointing at where the real
thing lives. The `StellarAgent` class and its supporting logic live under
`src/agent/`, split by concern:

| Module | Responsibility |
|---|---|
| `agent/StellarAgent.ts` | The class itself: fields, the constructor, `create`/`fromSecret`, the identity getters, and one method per public operation. Each method is a few lines that gather what an operation needs from `this` and hand it to a function below — the class is an orchestration layer, not where the logic lives. |
| `agent/invocation.ts` | The shared Soroban pipeline every contract call goes through: build → simulate → sign auth entries → assemble → sign envelope → submit → poll for a terminal status, instrumented throughout with the tracing/metrics/payment-trace calls from `../telemetry/`. Also error mapping (`contractError`, `diagnosticText`) and `getLatestLedger`, since both exist to serve this pipeline. |
| `agent/encoding.ts` | TypeScript value → `xdr.ScVal`, for contract call arguments (`addressVal`, `i128Val`, `u64Val`, `u32Val`, `bytesVal`, `enumVal`), plus `resolveAssetContract` and `spendPeriodVariant`. |
| `agent/decoding.ts` | A decoded contract struct → the SDK's public `*Info` types (`toAgentInfo`, `toChannelInfo`, `toJobInfo`, `toRateLimitStatus`). The field-by-field validation of the raw shape itself — turning a `scValToNative` mismatch into a `StellarAgentError` instead of a `TypeError` three frames later — is the generated `decode*` functions' job (`../generated/contract-types.ts`, from `contracts/specs/*.json`); this module only maps their already-validated `Raw*` output onto the public shape. |
| `agent/queries.ts` | Every read-only operation: `getAgent`, `getBalance`, `getChannel`, `getJob`, `getRateLimitStatus`, `getSpendReport`, `getLedgerCloseEstimate`, `checkRateLimit`. |
| `agent/mutations.ts` | Every operation that submits a transaction: `createAgentWallet`, `openChannel`, `closeChannel`, `payForAPI`, `requestWork`, `acceptJob`, `submitResult`, `releasePayment`, `setRateLimits`. |
| `agent/config.ts` | Network client bootstrapping (`createNetworkClients`, `isLoopbackUrl`), the `UNCONFIGURED_RATE_LIMIT` sentinel, and friendbot funding. |
| `fleet/channelPool.ts` | Exclusive transaction-source leasing, demand-driven account creation, explicit resizing/reclamation, and commit/rollback accounting. |
| `fleet/feeStrategy.ts` | Fixed, multiplier, callback, and cached recent-network fee policies shared by invocation and sponsorship transactions. |
| `fleet/sponsorship.ts` | Atomic sponsored account creation, revocation/merge lifecycle, and the sponsored channel-account factory. |
| `fleet/submissionQueue.ts` | Bounded concurrency, backpressure, key-scoped ordering, retry classification, and queue telemetry. |

The modules that were already split out before this — `signer.ts`,
`contracts.ts`, `circuitBreaker.ts`, `ledgerTime.ts`, `errors.ts`,
`types/index.ts`, `math/` — are unchanged; they were never part of the
problem this restructuring addresses.

Query and mutation functions take what they need as explicit parameters
(an `invoke` function, a contract ID, the calling address, …) rather than a
`this`-shaped context object. `StellarAgent`'s private fields are only ever
read inside `StellarAgent.ts` itself — a query or mutation module has no way
to reach them except through what its caller hands it, which is what keeps
`agent/*.ts` testable as plain functions.

### Why `invokeContract` and `getLatestLedger` are still on the class

Every method in `agent/queries.ts` and `agent/mutations.ts` takes an
`invoke: InvokeFn` parameter rather than importing `invocation.ts`'s
`runInvocation` directly. `StellarAgent` passes `this.invokeContract.bind(this)` —
its own private method, which itself just calls `runInvocation` — rather
than a direct reference. This one extra hop is deliberate: it's what lets a
test do `vi.spyOn(agent, 'invokeContract')` and have every query and
mutation issued through that agent instance honor the mock, without each
module needing to know it's being tested. `getLatestLedger` is kept on the
class for the same reason. Both are the two narrowest possible seams for
that — everything else in `agent/*.ts` is a plain function with no `this`.

## Where new code belongs

- **A new contract read** → `agent/queries.ts`, decoded through a mapper in
  `agent/decoding.ts` if it returns a struct.
- **A new contract write** → `agent/mutations.ts`.
- **A new argument type to encode** → `agent/encoding.ts`.
- **A new contract struct to decode** → `agent/decoding.ts`.
- **Something about how calls are built, signed, or retried** →
  `agent/invocation.ts`.
- **Channel-account, fee, sponsorship, or submission scheduling policy** →
  the matching module under `fleet/`; orchestration into an agent stays in
  `agent/StellarAgent.ts`.
- **A new public type** (a param object, a result shape) → `types/index.ts`,
  then re-exported from `index.ts`'s "Public type surface" block.
- **Anything not about `StellarAgent` specifically** (rate limiting,
  contract address resolution, signing, ledger-time estimation, the
  deterministic math) already has its own top-level module — extend that
  one rather than routing through `agent/`.

If a change touches `index.ts` itself, it should almost always be adding or
removing one re-export line — not new logic. That file's entire job is to
stay small enough that a merge conflict in it is readable.

## The public API surface

TypeScript's declaration emitter includes every class member — `private`
ones too, as a bare signature with no body — which means a raw `.d.ts` diff
flags internal reshuffling (like this restructuring) as if it were a
public-surface change. `pnpm docs:api` (checked in CI via
`pnpm docs:api:check`) builds each package's declarations, strips what a
consumer can never actually reach, and writes the result to
`packages/core/api-report.d.ts` / `packages/react/api-report.d.ts`. Those
files are the "is this a public-API change?" review artifact for this
repo — a stand-in for a tool like `@microsoft/api-extractor`, sized for
what this repo needs today. A diff in `api-report.d.ts` in a PR review
**is** a public-surface change, by construction; a diff anywhere else in
generated output is not.

Anything not in `api-report.d.ts` — a `private` class member, an
unexported function in `agent/*.ts`, the `AgentContext`/`InvokeFn` shapes
those modules pass around — is internal. It can change in a patch release
without notice.

`pnpm docs:api` also regenerates `docs/api/`, the full TypeDoc reference
rendered as markdown from the same TSDoc comments, linked from the root
[README](../../README.md) and each package's own README.

## Decisions recorded elsewhere

A few design decisions live as comments near the code they justify, which
means they're easy to miss when they're actually the reason something looks
the way it does:

- **The signer abstraction** — why `StellarAgent` signs through a
  `Signer` rather than holding a `Keypair`, why the interface shape mirrors
  SEP-43, and why a remote signing service was chosen over a hardware
  wallet for the one required remote backend. See
  [`docs/signing.md`](../signing.md) (and `packages/core/src/signer.ts`'s
  module doc comment, which `docs/signing.md` is expanded from).
- **Fleet throughput and zero-XLM operation** — why transaction-source and
  authorization identities are separate, how fee replacement works, and how
  to size channels/backpressure from measured rates. See
  [`docs/fleet-tuning.md`](../fleet-tuning.md).
- **The `wasm32v1-none` target** — `wasm32-unknown-unknown` compiles
  cleanly under Rust ≥ 1.82 but emits the post-MVP `reference-types`
  feature, which soroban-sdk 22's VM rejects at upload time; the build
  looks fine right up until deployment fails. See
  [`docs/deployment.md` § "1. Build"](../deployment.md#1-build).
- **The 100% coverage gate on `math/` only** — `packages/core/src/math` is
  the correctness-critical core: every bid score and spend-limit check
  flows through it, and a regression there is a silent cross-platform
  determinism break (the TS/Python/Rust implementations are asserted
  byte-identical against shared fixtures — see the `determinism` job in
  `.github/workflows/ci.yml`) rather than a crash. The suite covers it
  fully today, so `packages/core/vitest.config.ts` scopes coverage
  collection to `src/math/**` and pins the threshold at 100 — a new
  uncovered branch there fails CI outright, rather than slipping through
  under a percentage averaged down by the rest of the package (`index.ts`
  and `agent/*.ts` are exercised by their own extensive `__tests__/` suites,
  just not coverage-gated).
