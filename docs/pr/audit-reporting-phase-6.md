# [audit reporting 6/6] Reconciled workflow, report worker, and proof guide

Stacked on **Phase 5** (`feat/audit-dashboard-phase-5`). This is the final audit
reporting branch.

## Summary

- Arbitrary periods reconcile only their inclusive range, using absolute
  positions immediately before the opening ledger.
- `POST /reports/statements/:kind/:id` attaches reconciliation and enforces
  matching statement/checkpoint boundaries.
- The dashboard accepts checkpoints and displays matched, discrepant, and
  missing account/asset lines.
- Stable ledger iteration removes the former 100,000-row internal report cap.
- `stellaragent-indexer tail` runs the durable worker, webhook delivery, and a
  provider-neutral idempotent JSON email gateway.
- [`docs/audit-trail.md`](../audit-trail.md) documents verification, proof
  limits, checkpoint capture, scheduling, monitoring, and recovery.

## End-to-end evidence

A seeded channel payment/conversion/top-up/refund/fee workflow proves exact
period reconciliation, detects a one-unit changed observation, resolves every
CSV/JSON/IIF row to its hash and ledger, and confirms concurrent scheduler
ticks generate/deliver one immutable SHA-256 artifact without duplication.

Tests also cover stable pagination, boundary mismatches, empty checks, gateway
idempotency/base64/failures, environment configuration, and the reconciled
browser workflow.

## Verification

```sh
pnpm turbo run lint typecheck test build
pnpm docs:api:check
pnpm contract-types:check
```
