# [audit reporting 5/6] Reports dashboard and scheduling administration API

Stacked on **Phase 4** (`feat/audit-delivery-phase-4`). Review this PR after
Phases 1–4; its backend routes expose the statement, export, and delivery
primitives introduced by those branches.

## Problem

The normalized ledger, statement engine, streaming exporters, and durable
delivery worker had no operator workflow. Finance users still needed to write
API calls to select a period, inspect balances, verify a row, create a
schedule, or recover a dead-letter delivery.

## What this phase adds

- A first-class `/reports` dashboard route and persistent sidebar entry.
- Statement construction for an agent or owner over inclusive ledger bounds.
- Opening, credit, debit, and closing positions per asset.
- Categorization by payment type, counterparty, or asset.
- Streaming CSV, JSON-lines, and IIF download links.
- Drill-down from a statement line to its exact transaction hash, ledger,
  reference ID, and Stellar Expert verification link.
- Schedule creation for daily, weekly, monthly, and quarterly delivery over
  webhook or email.
- Schedule/delivery visibility and explicit dead-letter replay.

## API surface

`createQueryServer(store, options)` remains backward compatible and gains an
optional durable `ReportDeliveryStore`:

- `GET /reports/schedules`
- `POST /reports/schedules`
- `GET /reports/deliveries?status=...`
- `POST /reports/deliveries/:deliveryId/replay`

The CLI opens a separate reports SQLite database (`REPORT_DATABASE`, defaulting
to `<INDEXER_DATABASE>.reports`) so delivery writes do not contend with indexed
event writes. CORS is configurable with `AUDIT_API_CORS_ORIGIN`. Saved webhook
headers are used by the worker but redacted from every administration response.
JSON bodies are bounded to 1 MiB by default.

## Tests

- API integration tests bind a real ephemeral HTTP server and cover statement
  preview/export, health, CORS, schedule creation/listing, secret redaction,
  delivery filtering, replay, invalid statuses, disabled scheduling, and body
  limits.
- Dashboard client unit tests cover URL encoding, period boundaries, exports,
  JSON schedule creation, and server errors.
- Playwright covers the real workflow: build a statement, switch export format,
  drill to transaction evidence, save a schedule, observe a dead letter, and
  replay it. The route remains part of the all-page console-error smoke suite.

## Review notes

- The UI displays integer asset units exactly as indexed. It deliberately does
  not apply a guessed decimal scale or add unlike assets.
- A reconciliation badge says `Not attached` when the caller built a statement
  without an on-chain closing snapshot; it does not imply a match.
- Scheduling administration should sit behind the deployment's existing access
  control boundary. Webhook authorization headers are write-only through this
  API.

## Verification

```sh
pnpm --filter @stellaragent/indexer lint
pnpm --filter @stellaragent/indexer typecheck
pnpm --filter @stellaragent/indexer test
pnpm --filter @stellaragent/dashboard lint
pnpm --filter @stellaragent/dashboard typecheck
pnpm --filter @stellaragent/dashboard test:unit
pnpm --filter @stellaragent/dashboard test
pnpm --filter @stellaragent/dashboard build
```
