# Agent fleet throughput tuning

This guide covers the transaction-source pool, recent-fee policy, fee bumps,
sponsored reserves, bounded submission queue, and the measurements used to set
their defaults. It applies to `@stellaragent/core`.

## Architecture

A Stellar transaction has two identities that do not have to be the same:

1. the **transaction source** owns the envelope sequence number; and
2. the **agent** signs Soroban authorization entries for contract operations.

`ChannelAccountPool` leases a transaction source exclusively from account load
through terminal submission. The agent signer still signs contract auth. With
eight channels, eight independent sequence streams can be in flight for one
logical agent. A lease that fails before RPC acceptance is released as
`rolled_back`; its next use reloads the on-chain account rather than consuming a
locally predicted sequence. Once RPC returns `PENDING` or `DUPLICATE`, the lease
is committed because that sequence may have entered consensus.

`SubmissionQueue` bounds simultaneous work and pending memory. An optional
`orderingKey` serializes only tasks sharing that key; unrelated keys still fill
all concurrency slots. `StellarAgent` bypasses the queue for read-only
simulation. Without a channel pool it defaults to concurrency one, preserving
the legacy account's sequence safety. With a pool it defaults to four.

## Recommended sponsored fleet

```ts
import { KeypairSigner, SponsorService, StellarAgent } from '@stellaragent/core';
import { SorobanRpc } from '@stellar/stellar-sdk';

const rpc = new SorobanRpc.Server(RPC_URL);
const sponsorSigner = KeypairSigner.fromSecret(SPONSOR_SECRET);
const sponsorService = new SponsorService({
  sponsorSigner,
  rpc,
  networkPassphrase: NETWORK_PASSPHRASE,
});

const agent = await StellarAgent.create({
  network: 'mainnet',
  signer: AGENT_SIGNER,
  contracts: CONTRACTS,
  sponsorService,
  submission: {
    concurrency: 8,
    minChannels: 2,
    maxChannels: 8,
    maxQueueSize: 2_000,
  },
});

// If the agent account does not exist, this first creates it with a sponsored
// account-entry reserve and a zero starting balance. The registration call is
// then sent from a sponsored channel in an always-on fee-bump envelope, so the
// sponsor pays the fee too.
await agent.createAgentWallet('worker-42');
```

When a sponsor is configured without an explicit pool, `StellarAgent.create`
constructs a demand-grown `ChannelAccountPool` backed by
`SponsoredChannelAccountFactory`. `minChannels` are created eagerly; queued
demand grows toward `maxChannels`. `resizeChannelPool(size)` changes the live
target, and `shutdown()` drains accepted work before reclaiming disposable
channels by account merge.

The sponsor needs enough XLM for its own reserve, all sponsored entries, and
fees. Agents and sponsored channel accounts can stay at zero XLM. Revoking an
account-entry sponsorship requires the target to hold its own minimum reserve;
for disposable channels, account merge is the normal reclamation path.

## Fee selection and congestion

The default `RecentFeeStrategy` samples the Soroban p90 inclusion fee from
`getFeeStats`, adds 10%, caches it for five seconds, and falls back to the
protocol base fee when statistics are unavailable. Alternate policies are:

```ts
feeStrategy: new FixedFeeStrategy(500)
feeStrategy: new MultiplierFeeStrategy(1.5)
feeStrategy: new CallbackFeeStrategy(async ({ phase, getFeeStats }) => {
  const stats = await getFeeStats?.();
  return phase === 'fee_bump' ? stats?.sorobanInclusionFee.p99 ?? '5000' : '500';
})
```

An ordinary transaction is bumped after three unconfirmed polls or when ten
seconds of its time bound remain, whichever happens first. Replacement bids are
clamped to at least ten times the assembled inner fee rate. Sponsored sources
use `mode: 'always'`: only the outer fee-bump envelope is submitted, so its fee
source pays and the zero-XLM inner source does not.

Tune congestion behavior explicitly when a workload has a different latency or
fee budget:

```ts
feeBump: {
  mode: 'on_expiry',
  triggerAfterAttempts: 2,
  expiryThresholdSeconds: 15,
  maxBumps: 1,
  strategy: new RecentFeeStrategy({ percentile: 'p99', multiplier: 1.5 }),
}
```

`TxResult.feePaid` is read from the confirmed transaction result's
`feeCharged`, `feeBumped` identifies replacement/outer-envelope confirmation,
and `sourceAccount`, `feeSource`, and `submissionAttempts` make cost and routing
auditable.

## Queue sizing and backpressure

Start with queue concurrency equal to the channel count. Higher queue
concurrency cannot increase the number of usable sequence streams; it only makes
more callers wait for leases. Set `maxQueueSize` from the maximum acceptable
memory and latency rather than leaving producers unbounded.

For a target rate `R`, transient burst duration `B`, and steady service rate
`S`, a starting pending bound is:

```text
maxQueueSize >= max(0, (R - S) * B)
```

When the pending bound is reached, new work rejects with
`SubmissionQueueError.code === "QUEUE_FULL"`. This is intentional backpressure:
the caller can shed load or return a retry hint instead of allowing transactions
to expire while sitting in memory.

The generic queue supports exponential retries and classifies transient RPC,
rate-limit, connection, and bad-sequence errors. Full contract invocation retry
defaults to one attempt because replay after ambiguous acceptance could duplicate
side effects. Increase `submission.maxAttempts` only with a domain classifier
that distinguishes pre-acceptance failures, or use the generic queue around an
idempotent task.

## Metrics

The SDK records:

| Metric | Kind | Meaning |
| --- | --- | --- |
| `stellaragent.submission.queue_depth` | histogram | pending depth on every transition |
| `stellaragent.submission.latency_ms` | histogram | enqueue through successful completion |
| `stellaragent.submission.expiries` | counter | expired/time-bound submissions |
| `stellaragent.submission.retries` | counter | classified retries |
| `stellaragent.payment.fees_stroops` | histogram | minimum resource estimate and confirmed charge |
| `stellaragent.payment.latency_ms` | histogram | contract build through confirmation |

Alert on sustained queue growth rather than a single depth sample. A rising
queue plus flat channel utilization usually means RPC/ledger capacity is the
limit; a rising queue with every channel leased suggests increasing the pool up
to the sponsor/reserve budget.

## Reproducible measurements

Run:

```sh
pnpm --filter @stellaragent/core benchmark:fleet
pnpm --filter @stellaragent/core exec vitest run src/__tests__/fleet-invocation.test.ts
```

The first command measures only the SDK scheduling/sequence ceiling using 400
submissions and a deterministic 5 ms simulated confirmation delay. The second
exercises full transaction construction, signing, simulation assembly, queueing,
and confirmation fakes; it asserts 128 payments have unique, gap-free sequences.

Measurement on 2026-08-28, Node 20.20.2, this CI container:

| Configuration | Payments | Simulated confirmation | Sustained rate | Collisions |
| --- | ---: | ---: | ---: | ---: |
| one source / concurrency 1 | 400 | 5 ms | 187 payments/s | 0 |
| eight sources / concurrency 8 | 400 | 5 ms | 1,473 payments/s | 0 |
| full XDR load test / eight sources | 128 | 2 ms plus build/sign | >10 payments/s gate | 0 |

These are SDK/harness throughput measurements, not claims about public-network
ledger TPS. Public-network results depend on ledger capacity, RPC latency,
Soroban resource limits, contract hot-state contention, and bid level. Re-run
both commands in the deployment region and publish those numbers before setting
production concurrency.

## Operational checklist

1. Keep `minChannels` large enough for normal traffic and `maxChannels` bounded
   by sponsor reserve and signing-service capacity.
2. Use recent p90 for ordinary traffic; use p95/p99 plus an explicit maximum
   during known bursts.
3. Keep one automatic replacement unless transaction semantics and budget make
   repeated replacement desirable.
4. Set a finite pending bound and propagate `QUEUE_FULL` to admission control.
5. Watch confirmed `feePaid`, not only the simulated minimum resource fee.
6. Drain with `shutdown()` before process termination or pool reclamation.
7. Fund the sponsor, not each ephemeral agent; test revocation only after moving
   reserve responsibility or closing the account.
