# Audit trail, reconciliation, reports, and delivery

This guide explains how to produce finance statements from StellarAgent
history, verify exported rows, and understand the proof boundary. Implementation
details are in [`audit-reporting-design.md`](audit-reporting-design.md).

## Evidence model

The indexer retains three layers:

1. **Raw evidence:** contract address, transaction hash, ledger, close time,
   paging token, topic XDR, and value XDR returned by Soroban RPC.
2. **Canonical events:** channel payments/conversions/top-ups/refunds, escrow
   flows, state snapshots, and confirmed fees. Replayed ledgers atomically
   replace orphaned events and derived entries.
3. **Normalized accounting entries:** balanced postings per account/asset with
   agent/owner attribution, counterparty, reference, memo, and both conversion
   legs.

Amounts remain base-unit integer strings. Unlike assets are never summed and no
accounting path uses JavaScript floating-point money.

### What it proves

Using an independently trusted Stellar source, a row's transaction hash and
ledger establish that the successful transaction and its contract event exist.
The retained IDs show exactly which event/fee and normalization entry produced
the row. A reconciliation marked `matched` proves:

```text
expected = opening immediately before fromLedger
         + normalized postings from fromLedger through asOfLedger (inclusive)
difference = observed on-chain closing - expected = 0
```

A delivered artifact's SHA-256 binds the bytes received to the bytes generated.

### What it does not prove

This evidence is not a compliance certification. It does not establish:

- truth of a memo, invoice, endpoint, or off-chain service description;
- legal identity, beneficial ownership, KYC, sanctions, tax, GAAP, or IFRS;
- fiat value without an independently governed price source;
- activity outside the indexed contracts or before the index start ledger;
- historical balance truth from a moving current-balance read;
- that an RPC provider is truthful—use a second provider/archive where needed;
- that an email recipient opened or processed the attachment.

IIF is a deterministic double-entry interchange format, not a chart of accounts
or accounting-policy opinion.

## Run the service

```bash
export SOROBAN_RPC_URL=http://localhost:8000/soroban/rpc
export INDEXER_DEPLOYMENT_FILE=deployments/local.json
export INDEXER_START_LEDGER=1234
export INDEXER_DATABASE=stellaragent-events.sqlite
export REPORT_DATABASE=stellaragent-reports.sqlite
export PORT=3001

pnpm --filter @stellaragent/indexer build
pnpm --filter @stellaragent/indexer exec stellaragent-indexer tail
```

`tail` catches up, serves the API, and runs the report worker. `catch-up` only
updates history and exits.

| Variable | Default | Purpose |
| --- | --- | --- |
| `REPORT_DATABASE` | `<INDEXER_DATABASE>.reports` | Schedules, artifacts, leases, attempts, dead letters |
| `REPORT_WORKER_ENABLED` | `true` | Set `false` for an API-only replica |
| `REPORT_POLL_INTERVAL_MS` | `5000` | Worker polling interval |
| `REPORT_EMAIL_GATEWAY_URL` | unset | JSON email-provider bridge |
| `REPORT_EMAIL_GATEWAY_TOKEN` | unset | Bridge bearer credential |
| `AUDIT_API_CORS_ORIGIN` | `*` | Allowed dashboard origin |

For a separately hosted dashboard:

```bash
VITE_INDEXER_URL=https://audit-api.example.test pnpm --filter @stellaragent/dashboard build
```

Put schedule/replay administration behind an authenticated gateway. Saved
webhook headers are omitted from API responses but remain secrets at rest.

## Statements

```bash
curl 'http://localhost:3001/reports/statements/agent/GAGENT?fromLedger=100&throughLedger=200'
```

Use `owner` instead of `agent` for an owner-wide statement. Timestamp bounds are
also supported. A statement has per-asset opening/credits/debits/closing,
running balances, counterparty/asset/payment-type groupings, conversion legs,
and transaction evidence.

Statement balance is attributable economic activity, not necessarily the
literal balance of the agent account. Owner funding is attributed to the
agent's channel; escrow cash is charged at lock, not again at release. Literal
account/contract balances are checked by reconciliation.

## Reconcile any period

Capture absolute balances immediately before the opening ledger and at the
closing ledger, then POST them to the same statement route:

```bash
curl -X POST -H 'content-type: application/json' \
  'http://localhost:3001/reports/statements/agent/GAGENT?fromLedger=100&throughLedger=200' \
  --data @- <<'JSON'
{
  "fromLedger": 100,
  "asOfLedger": 200,
  "accounts": ["CCHANNEL", "GRECIPIENT"],
  "openingPositions": [
    { "account": "CCHANNEL", "asset": "CUSDC", "amount": "50000000" },
    { "account": "GRECIPIENT", "asset": "CUSDC", "amount": "10000000" }
  ],
  "onChainPositions": [
    { "account": "CCHANNEL", "asset": "CUSDC", "amount": "42000000" },
    { "account": "GRECIPIENT", "asset": "CUSDC", "amount": "18000000" }
  ]
}
JSON
```

URL/body opening ledgers must match; `asOfLedger` must equal the statement
closing ledger. Each account/asset is `matched`, `discrepancy`, or
`missing_on_chain`. At least one closing observation is required, so an empty
comparison never appears green.

Historical token reads are provider/archive specific. The API accepts snapshots
instead of silently reading a moving latest ledger and mislabeling it as a
historical boundary. A capture job should wait for finality, enumerate every
touched account/asset, retain raw RPC responses plus provider/network/capture
time, investigate every difference, and use a second source when provider
integrity is in scope.

## Export and verify

```bash
curl -OJ 'http://localhost:3001/reports/statements/agent/GAGENT/export?fromLedger=100&throughLedger=200&format=csv'
curl -OJ 'http://localhost:3001/reports/statements/agent/GAGENT/export?fromLedger=100&throughLedger=200&format=json'
curl -OJ 'http://localhost:3001/reports/statements/agent/GAGENT/export?fromLedger=100&throughLedger=200&format=iif'
```

CSV and JSON Lines carry transaction hash, ledger, line/entry/event IDs,
subject, reference, asset, amount, and running balance per row. Every IIF
transaction, split, and terminator repeats hash, ledger, and line ID. CSV text
with spreadsheet formula prefixes is neutralized.

To verify a row:

1. Query its hash from a trusted Stellar explorer/RPC.
2. Confirm success, network, ledger, and deployed contract.
3. Locate the retained event or matching contract/reference/amount.
4. Confirm export and transaction ledgers agree.
5. Re-run normalization from raw XDR if the decoder is in question.
6. For delivery, compare SHA-256 with the webhook header, email text, or stored
   artifact.

`EventStore.iterateLedgerEntries()` uses stable pages with no total-row ceiling.
HTTP output yields one formatted row at a time and honors socket backpressure.
Statement totals/running balances are materialized, so partition extreme ranges
when process memory is the limiting resource.

## Scheduling and idempotency

POST to `/reports/schedules`:

```json
{
  "scheduleId": "monthly-agent-finance",
  "subject": { "kind": "agent", "id": "GAGENT" },
  "cadence": "monthly",
  "format": "csv",
  "destinations": [
    { "id": "finance", "kind": "webhook", "url": "https://finance.example.test/reports" },
    { "id": "compliance", "kind": "email", "to": ["compliance@example.test"] }
  ],
  "nextRunAt": "2026-09-01T00:00:00.000Z"
}
```

The worker stores one immutable artifact under a unique schedule/run key and
one stable idempotency key per destination. Attempts are leased, retry with
exponential backoff, and eventually enter `dead_letter`. Inspect
`/reports/deliveries?status=dead_letter`; after fixing the cause, POST
`/reports/deliveries/:id/replay`.

Webhooks receive `Idempotency-Key`, artifact SHA-256, statement ID, content type,
filename, and bytes. Receivers must persist the idempotency key before side
effects and return success for repeats.

### Email gateway

With `REPORT_EMAIL_GATEWAY_URL`, the worker POSTs `to`, `from`, `subject`,
`text`, stable `messageId`, and attachment `filename`, `contentType`, and
`contentBase64`. `Idempotency-Key` equals `messageId`; the optional token is a
Bearer credential. The gateway maps to its provider and deduplicates message
IDs. Non-2xx responses use the durable retry/dead-letter path. Without a
gateway, email attempts remain visibly failed for later replay.

## Operations and recovery

- Back up both SQLite databases with deployment addresses, network passphrase,
  start ledger, and snapshot evidence.
- Monitor `/health`: `ledgerIssues` and `deadLetterDeliveries` should be zero;
  `nextLedger` must advance.
- Alert on missing/discrepant positions, index lag, retries, and dead letters.
- Treat normalizer changes as accounting changes: rebuild a copy and compare.
- Restrict database/process access and keep personal data out of memos.

Recovery drill: stop the writer, copy databases, replay from a known checkpoint,
confirm zero issues, rerun reconciliations, rebuild/compare transaction evidence,
then start `tail` and replay only destination-idempotent dead letters.

## CI evidence

Ordinary CI covers balanced multi-asset history, arbitrary-period exact and
discrepant reconciliation, reorg replacement, statements, all formats, a
25,000-row stream over 10 MiB, concurrent ticks, leases/retries/dead letters,
webhook/email payloads, a complete seeded workflow, and reconciled dashboard
browser flow. The real standalone-network suite is opt-in with
`STELLAR_LOCAL_INTEGRATION=1` because it requires live deployments.
