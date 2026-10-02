# Audit reporting architecture

## Stack and review boundaries

Task 2 lands as six independently green branches:

1. **Normalized ledger and reconciliation.** Canonical indexed events become
   balanced, multi-asset economic entries; absolute positions are compared with
   on-chain observations and discrepancies remain visible.
2. **Reporting engine.** Period statements are pure projections over the ledger
   with opening/closing positions and deterministic categorization.
3. **Exports.** CSV, JSON Lines, and accounting journal streams retain the
   transaction hash, ledger, event ID, and posting identity on every row.
4. **Delivery.** Durable schedules enqueue immutable report artifacts;
   idempotency keys prevent duplicates across webhook/email retries and dead
   letters retain terminal failures.
5. **Dashboard.** A reports route builds, previews, exports, and schedules a
   report, then drills from totals to ledger entries and transaction evidence.
6. **Proof documentation and integration coverage.** Seeded history,
   large-range streams, delivery retries, and UI workflows run in CI.

The production `tail` command composes the phases: separate event/report
databases, preview/export/schedule/replay APIs, and a lease-aware worker with
direct webhook and JSON email-gateway delivery.

Later branches use the immediately preceding branch as their PR base. This keeps
each schema/API transition reviewable without hiding cross-phase dependencies.

## Phase 1 model

`EventStore.replaceRange` remains the canonical reorg boundary. In the same
SQLite transaction it replaces indexed events and rebuilds the derived reporting
ledger. A replay therefore cannot expose a mixture of orphaned events and new
ledger entries.

Each `LedgerEntry` is tied to an event (or confirmed transaction fee) and carries
the transaction hash, ledger, close time, entity reference, attribution, source
amount, optional destination amount, and balanced postings. Amounts remain base-
unit integer strings throughout; JavaScript floating-point arithmetic is never
used for accounting.

Postings are signed account/asset deltas. Every asset in an entry sums to zero:

- channel funding/top-ups move the settlement asset from owner to contract;
- payments move it from the channel contract to the recipient;
- conversions balance the source and destination assets independently through
  a per-event conversion clearing account;
- escrow locks, releases, refunds, and dispute resolutions move the job token;
- fees move native XLM from the confirmed envelope payer to the network-fee
  account.

Compact business events omit channel/job asset metadata. The normalizer resolves
it from the state snapshot emitted in the same transaction, falling back only to
the latest preceding canonical snapshot. Missing context is stored in
`ledger_issues`; it is never guessed or silently assigned to a default asset.

## Reconciliation invariant

For every selected account and asset:

```text
expected closing = opening on-chain position + sum(normalized postings)
difference       = observed on-chain closing - expected closing
```

The result is reconciled only when every selected position is present and every
difference is zero. This deliberately flags unrelated transfers, missing event
history, incorrect opening boundaries, and asset metadata gaps rather than
masking them.

`fromLedger` and `asOfLedger` are inclusive. Opening positions are balances
immediately before `fromLedger`, enabling an arbitrary retained period without
double-counting pre-period activity. At least one closing observation is
required so an empty comparison cannot appear exact.

## Evidence boundary

The ledger proves how committed StellarAgent events were normalized and links
each economic row to its transaction. It does not make an RPC server truthful,
prove an off-chain memo, or account for transfers performed outside the indexed
contracts. Reconciliation against an independently selected on-chain checkpoint
is what detects missing or external balance movement.
