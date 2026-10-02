# feat(core): remove agent-fleet transaction throughput ceilings

## Summary

This PR removes the two main throughput constraints for an on-demand agent fleet:

1. transactions no longer have to serialize on one account sequence; and
2. agent accounts no longer need their own XLM balance for reserves or fees.

It adds channel-account pooling, adaptive fee selection and fee-bump submission,
sponsored reserves, a bounded submission pipeline, fleet metrics, concurrency and
congestion coverage, a reproducible load benchmark, and an operator tuning guide.

## Why

Previously, every transaction used one source account and the hard-coded
`BASE_FEE`. Concurrent agents therefore contended for the same sequence number,
and transactions approaching their time bound expired rather than increasing
their fee. New agents also had to receive XLM before they could create a wallet
or submit work.

The new pipeline separates the transaction source from the agent authorization
signer. Independent channel accounts supply parallel sequence streams, while the
agent continues to sign Soroban authorization entries. A sponsor can own account
reserves and submit an outer fee-bump envelope, allowing the agent and disposable
channels to remain at zero XLM.

## What changed

### Channel-account pool

- Added `ChannelAccountPool` with exclusive lease, commit/rollback, release,
  resize, drain, and shutdown semantics.
- Added demand-based channel creation between configurable minimum and maximum
  pool sizes.
- Reloads the on-chain sequence after a pre-acceptance failure so local sequence
  prediction never introduces a gap.
- Commits a sequence after `PENDING` or `DUPLICATE`, where the transaction may
  already have entered consensus.
- Added explicit pool state and statistics for operational inspection.

### Fee strategy and fee bumps

- Added fixed, multiplier, callback, and recent-network-fee strategies.
- Made `RecentFeeStrategy` the default: Soroban p90 inclusion fee plus 10%, with
  a five-second cache and protocol-base-fee fallback.
- Added configurable fee-bump behavior for transactions nearing expiry or
  remaining unconfirmed after the configured poll count.
- Sponsored sources use an always-on outer fee-bump envelope so the sponsor pays
  the transaction fee.
- Extended `TxResult` with the confirmed `feePaid`, fee-bump state, transaction
  and fee sources, and submission-attempt count.

### Sponsored reserves

- Added `SponsorService` to create accounts under sponsored reserves, revoke
  sponsorship, merge disposable channels, and track sponsorship state.
- Added `SponsoredChannelAccountFactory` for demand-grown channel pools.
- Integrated sponsored account creation into `createAgentWallet`.
- Allows a newly created agent account to operate with a zero-XLM balance.

### Submission pipeline

- Added `SubmissionQueue` with bounded concurrency and a finite pending limit.
- Added backpressure through the typed `QUEUE_FULL` error.
- Added retry classification and exponential delay for transient failures.
- Added optional ordering keys: operations sharing a key remain ordered while
  unrelated keys continue concurrently.
- Preserved concurrency one when no channel pool is configured, maintaining
  legacy source-account sequence safety.

### Metrics and documentation

- Added queue depth, submission latency, expiry, retry, payment-fee, and
  payment-latency instruments.
- Added generated API reports and TypeDoc pages for the new public surface.
- Added `docs/fleet-tuning.md` with sizing, fee, backpressure, lifecycle, and
  production measurement guidance.
- Added `benchmark:fleet` for reproducible scheduler/sequence measurements.

## Public API highlights

- `ChannelAccountPool`
- `SubmissionQueue`
- `SponsorService`
- `SponsoredChannelAccountFactory`
- `FixedFeeStrategy`
- `MultiplierFeeStrategy`
- `CallbackFeeStrategy`
- `RecentFeeStrategy`
- `StellarAgentConfig.sponsorService`
- `StellarAgentConfig.submission`
- `StellarAgentConfig.feeStrategy`
- `StellarAgentConfig.feeBump`
- `TxResult.feePaid`, `feeBumped`, `sourceAccount`, `feeSource`, and
  `submissionAttempts`

Existing callers do not need to configure a pool or sponsor. Without those
options, the SDK retains the single-source execution model while using the new
sequence-safe submission path.

## Sequence and retry invariants

- One live lease owns one channel and one sequence stream.
- A pre-acceptance failure rolls the lease back and forces the next lease to
  reload network state.
- `PENDING` and `DUPLICATE` commit the sequence because acceptance is ambiguous
  or confirmed.
- Retries are conservative for contract invocations to avoid replaying
  non-idempotent side effects.
- Strict ordering applies only to matching ordering keys.

## Validation

The following checks pass on this branch:

- TypeScript build, lint, typecheck, and test Turbo pipeline: **28/28 tasks**.
- Core test suite: **1,250 passed, 5 skipped** across **26 passed and 1 skipped
  test files**.
- Public API report and generated documentation freshness check.
- Generated TypeScript/Python contract-type freshness check.
- Contract Rust formatting, Clippy, tests, deployable `wasm32v1-none` release
  build, and generated spec check.
- Rust SDK formatting, Clippy, tests, documentation, and package dry run.
- Patch whitespace validation with `git diff --check`.

Key commands:

```sh
pnpm turbo run build lint typecheck test \
  --filter=@stellaragent/core \
  --filter=@stellaragent/cli \
  --filter=@stellaragent/react \
  --filter=@stellaragent/indexer \
  --filter=@stellaragent/integration-shared \
  --filter=@stellaragent/mcp-server \
  --filter=@stellaragent/langchain
pnpm docs:api:check
pnpm contract-types:check
pnpm --filter @stellaragent/core benchmark:fleet
pnpm --filter @stellaragent/core exec vitest run \
  src/__tests__/fleet-invocation.test.ts
```

## Benchmark results

Measured on 2026-08-28 with Node 20.20.2 and deterministic simulated
confirmation latency:

| Configuration | Payments | Simulated confirmation | Sustained rate | Sequence collisions |
| --- | ---: | ---: | ---: | ---: |
| One source / concurrency 1 | 400 | 5 ms | 187 payments/s | 0 |
| Eight sources / concurrency 8 | 400 | 5 ms | 1,473 payments/s | 0 |
| Full XDR pipeline / eight sources | 128 | 2 ms plus build/sign | >10 payments/s gate | 0 |

The scheduler benchmark shows a **7.88x** increase from one source to eight
channels with no sequence collisions. These figures measure SDK/harness
throughput rather than public-network ledger capacity; the tuning guide documents
the network-dependent factors and the production measurement process.

## Definition of done

- [x] Concurrent payments complete without sequence collisions or gaps.
- [x] An agent with zero XLM can transact through sponsored reserves and fees.
- [x] Approaching expiry triggers a fee bump rather than immediate expiry.
- [x] The confirmed fee is exposed on `TxResult`.
- [x] Backpressure, retry classification, and scoped ordering are covered.
- [x] Queue depth, latency, retry, expiry, and fee metrics are emitted.
- [x] Reproducible throughput measurements and tuning guidance are published.

## Review guide

Suggested review order:

1. `packages/core/src/fleet/channelPool.ts`
2. `packages/core/src/fleet/feeStrategy.ts`
3. `packages/core/src/fleet/sponsorship.ts`
4. `packages/core/src/fleet/submissionQueue.ts`
5. `packages/core/src/agent/invocation.ts`
6. `packages/core/src/agent/StellarAgent.ts`
7. `packages/core/src/__tests__/fleet-components.test.ts`
8. `packages/core/src/__tests__/fleet-invocation.test.ts`
9. `docs/fleet-tuning.md`

## Operational considerations

- Sponsor reserve and signer capacity bound the maximum useful channel count.
- A finite queue rejects excess work intentionally instead of letting queued
  transactions expire in memory.
- Account-entry sponsorship can be revoked only after the target assumes its
  reserve; account merge is the normal reclamation path for disposable channels.
- Production deployments should rerun the included benchmark in their RPC region
  and select fee percentiles and pool limits from observed traffic.
