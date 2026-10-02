# Reconciled audit reporting, exports, delivery, and dashboard

## Summary

This PR delivers the complete audit-reporting project as one reviewable change
against `main`. It turns indexed Stellar activity into reconciled statements,
independently verifiable exports, durable scheduled delivery, and a dashboard
workflow for finance and compliance teams.

The implementation covers all six planned phases:

1. normalized ledger and reconciliation;
2. agent/owner statement generation;
3. streaming CSV, JSON, and IIF exports;
4. idempotent scheduled delivery;
5. report building, preview, export, scheduling, and drill-down UI;
6. end-to-end tests and audit-proof documentation.

## What changed

### Normalized ledger and reconciliation

- Normalizes payments, escrow flows, fees, conversions, and related indexed
  events into stable ledger entries.
- Preserves agent, owner, account, asset, transaction-hash, and ledger
  provenance on every entry.
- Models multi-asset conversions as coherent debit/credit movements rather
  than flattening them into an ambiguous amount.
- Reconciles calculated positions against on-chain checkpoints per
  account/asset and reports matched, discrepant, and missing lines.
- Supports arbitrary inclusive periods by deriving opening positions from
  absolute balances immediately before the requested opening ledger.
- Provides stable pagination and iteration for ranges larger than the former
  internal report limit.

### Reporting engine

- Builds statements by agent or owner and by ledger/time period.
- Categorizes activity by counterparty, asset, and payment type.
- Calculates opening, running, and closing positions for each asset.
- Attaches reconciliation results to API statements while validating that
  checkpoint and statement boundaries match.
- Allows summary lines to resolve back to their underlying ledger entries.

### Verifiable exports

- Streams CSV, JSON, and IIF output without loading the entire requested range
  into memory.
- Includes the source transaction hash and ledger sequence on every exported
  row so each row can be independently checked against Stellar history.
- Uses deterministic ordering and escaping across formats.
- Exposes exports through the indexer API and CLI-oriented workflow.

### Scheduled delivery

- Stores schedules, immutable generated artifacts, delivery attempts, retry
  state, and dead-letter state durably.
- Uses deterministic idempotency keys so concurrent scheduler ticks do not
  generate or deliver duplicates.
- Retries transient failures with bounded backoff and moves exhausted work to
  a dead-letter path.
- Supports signed webhook delivery and a provider-neutral JSON email gateway.
- Runs the reporting worker alongside `stellaragent-indexer tail`.

### Dashboard

- Adds a Reports route and navigation entry.
- Builds and previews agent or owner reports over a selected period.
- Accepts on-chain checkpoints and presents matched, discrepant, and missing
  reconciliation lines.
- Exports CSV, JSON, and IIF reports.
- Creates schedules for webhook or email delivery.
- Drills from statement summaries to source transactions.

### Documentation

- Adds the architecture and phase design in
  `docs/audit-reporting-design.md`.
- Adds the operator and proof guide in `docs/audit-trail.md`, including
  checkpoint capture, row verification, scheduling, monitoring, recovery, and
  explicit limits on what the audit trail proves.
- Updates the indexer and root README documentation.

## Verification evidence

A seeded payment/conversion/top-up/refund/fee workflow verifies that:

- a per-agent statement reconciles exactly for its requested period;
- changing one observed balance by one unit produces a discrepancy;
- every CSV, JSON, and IIF row resolves to its transaction hash and ledger;
- concurrent scheduler ticks create and deliver one immutable SHA-256 artifact;
- repeated delivery attempts preserve idempotency and never duplicate delivery.

Additional coverage includes ledger normalization, multi-asset reporting,
stable pagination, boundary mismatch rejection, empty reconciliation checks,
streaming large ranges, webhook/email retry behavior, dead-letter handling,
environment configuration, API behavior, and the browser reporting workflow.

Verified locally with:

```sh
pnpm turbo run lint typecheck test build
pnpm docs:api:check
pnpm contract-types:check
```

Result: all 34 Turbo tasks passed; indexer tests passed (88 passed, one optional
local-network test skipped), dashboard unit tests passed (21), and dashboard
Playwright tests passed (27).

## Review guide

Suggested review order:

1. `packages/indexer/src/ledger.ts` and `store.ts`
2. `packages/indexer/src/reporting.ts`
3. `packages/indexer/src/export.ts`
4. `packages/indexer/src/delivery.ts`
5. `packages/indexer/src/api.ts`, `cli.ts`, and `config.ts`
6. `dashboard/src/pages/ReportsPage.tsx` and `reportsApi.ts`
7. tests and `docs/audit-trail.md`

## Size

- 44 files changed
- approximately 6,290 additions and 87 deletions
- complete implementation and tests for all planned phases
