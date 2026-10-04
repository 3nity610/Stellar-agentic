# StellarAgent Soroban event indexer

This package turns the contract events emitted by Payment Channel, Escrow, Rate
Limiter, and Agent Wallet Factory into a durable audit trail. It supports a
one-shot backfill and a continuously polling live tail.

## Run

```bash
export SOROBAN_RPC_URL=http://localhost:8000/soroban/rpc
export INDEXER_START_LEDGER=1234
export INDEXER_DEPLOYMENT_FILE=deployments/local.json
export INDEXER_DATABASE=stellaragent-events.sqlite
export REPORT_DATABASE=stellaragent-reports.sqlite

pnpm --filter @stellaragent/indexer build
pnpm --filter @stellaragent/indexer exec stellaragent-indexer catch-up
pnpm --filter @stellaragent/indexer exec stellaragent-indexer catch-up --from-ledger 1234
pnpm --filter @stellaragent/indexer exec stellaragent-indexer tail
```

Instead of `INDEXER_DEPLOYMENT_FILE`, the four addresses can be supplied as
`PAYMENT_CHANNEL_CONTRACT`, `ESCROW_CONTRACT`, `RATE_LIMITER_CONTRACT`, and
`AGENT_WALLET_FACTORY_CONTRACT`. `INDEXER_ROLLBACK_WINDOW` defaults to 12
ledgers, `INDEXER_FINALITY_LAG` to 1, `INDEXER_POLL_INTERVAL_MS` to 5000, and
the REST server's `PORT` to 3001. The report worker is enabled by default;
`REPORT_POLL_INTERVAL_MS` defaults to 5000 and `REPORT_WORKER_ENABLED=false`
creates an API-only replica. Email uses `REPORT_EMAIL_GATEWAY_URL` and optional
`REPORT_EMAIL_GATEWAY_TOKEN`; CORS uses `AUDIT_API_CORS_ORIGIN`.

Soroban RPC retains only a bounded event history. Set `INDEXER_START_LEDGER` to
the earliest deployment ledger still retained by the selected RPC provider for
the initial catch-up. `--from-ledger` deliberately replays and replaces all
stored events from an explicit checkpoint, which is useful for recovery or a
larger manual rollback.

## Query API

- `GET /agents/:address/events` — every event in which the address participates
- `GET /channels/:channelId/spend` — payment history and summed source amount
- `GET /jobs/:jobId/lifecycle` — ordered lifecycle and derived job status
- `GET /channels/:channelId/state`, `GET /jobs/:jobId/state`,
  `GET /rate-limits/:address/state`, and `GET /agent-info/:id/state` — latest
  complete on-chain record reconstructed from state snapshot events
- `GET /events?limit=100&offset=0` — ordered event feed
- `GET /ledger` and `GET /ledger/issues` — normalized entries and data issues
- `GET|POST /reports/statements/:kind/:address` — statement preview or
  statement with supplied on-chain reconciliation
- `GET /reports/statements/:kind/:address/export?format=csv|json|iif` —
  backpressure-aware verifiable export
- `GET|POST /reports/schedules`, `GET /reports/deliveries`, and
  `POST /reports/deliveries/:id/replay` — delivery administration
- `GET /health` — liveness plus the full ingest picture: lag, throughput,
  decode failures, and the last error
- `GET /metrics` — the same state as Prometheus text format

The same queries are available as typed methods on `EventStore`;
`iterateLedgerEntries` pages without a total-row ceiling. The operating and
proof-boundary guide is [`../../docs/audit-trail.md`](../../docs/audit-trail.md).

## Observability

The query server answers two operational routes. Both read the same snapshot,
so a scrape and a health check can never disagree.

### `GET /health`

JSON, for humans and for the dashboard. `ok` is a *liveness* answer — the
process is serving — and stays `true` through an RPC blip so a liveness probe
does not restart a recoverable process. `status` is the *ingest* verdict and
flips to `degraded` on the first failed run, which is what an alert should
fire on.

```console
$ curl -s localhost:3001/health | jq
{
  "ok": true,
  "status": "ok",
  "nextLedger": 100,
  "lagLedgers": 1,
  "latestLedger": 100,
  "indexedThroughLedger": 99,
  "eventsProcessed": 412,
  "eventsStored": 389,
  "decodeFailures": 0,
  "lastRunAt": "2026-09-29T13:40:02.114Z",
  "lastSuccessAt": "2026-09-29T13:40:02.114Z",
  "lastRunDurationMs": 41,
  "lastError": null,
  "lastErrorAt": null,
  "runs": 12,
  "successfulRuns": 12,
  "consecutiveFailures": 0,
  "rollbackWindowLedgers": 12,
  "finalityLagLedgers": 1,
  "ledgerIssues": 0
}
```

`lagLedgers` is `latestLedger - indexedThroughLedger`: how many ledgers behind
the head this replica is. It is `null`, not `0`, before the first successful
run or when the query server was not given a progress reporter — "not
measured yet" and "caught up" are different facts.

`eventsProcessed` counts ingest *work* summed over every run; `eventsStored` is
the row count. They diverge after a rollback replay, which re-commits events
already in the table. Use the second for "how much data do I have" and the
first for `rate()` throughput.

### `GET /metrics`

Prometheus text exposition format (`text/plain; version=0.0.4`), no
authentication, no dependencies.

```yaml
# observability/prometheus.yml
scrape_configs:
  - job_name: stellaragent-indexer
    static_configs:
      - targets: ["host.docker.internal:3001"]
```

| Metric | Type | Meaning |
| --- | --- | --- |
| `stellaragent_indexer_lag_ledgers` | gauge | Ledgers between the RPC head and the last committed ledger |
| `stellaragent_indexer_latest_ledger` | gauge | Latest closed ledger the RPC reported |
| `stellaragent_indexer_indexed_through_ledger` | gauge | Highest ledger committed to the store |
| `stellaragent_indexer_events_processed_total` | counter | Events committed, summed over runs |
| `stellaragent_indexer_decode_failures_total` | counter | Events that failed to decode |
| `stellaragent_indexer_events_stored` | gauge | Rows in the `events` table |
| `stellaragent_indexer_runs_total` / `_successful_runs_total` | counter | Runs attempted / committed |
| `stellaragent_indexer_consecutive_failures` | gauge | Runs that threw in a row |
| `stellaragent_indexer_up` | gauge | `0` while the last failure is unresolved |
| `stellaragent_indexer_last_error` | gauge | `1` while the last failure is unresolved |
| `stellaragent_indexer_last_error_info` | gauge | `{message="…"}` for the unresolved failure |
| `stellaragent_indexer_last_error_timestamp_seconds` | gauge | Unix time of the last failure, kept after recovery |
| `stellaragent_indexer_ledger_issues` | gauge | Retained data-quality issues |
| `stellaragent_indexer_report_schedules` / `_report_dead_letters` | gauge | Only when scheduling is attached |
| `stellaragent_indexer_rollback_window_ledgers` / `_finality_lag_ledgers` | gauge | Configured reorg depth and finality hold-back |
| `stellaragent_indexer_uptime_seconds` | gauge | Process uptime |

`stellaragent_indexer_lag_ledgers` and
`stellaragent_indexer_decode_failures_total` are the two the pre-provisioned
Grafana dashboard and `observability/alerts.yml` already select on; this
endpoint is what makes them real. Alerts worth adding on top:

```yaml
- alert: IndexerDown
  expr: up{job="stellaragent-indexer"} == 0
  for: 2m
- alert: IndexerStalled
  expr: rate(stellaragent_indexer_runs_total[15m]) == 0
  for: 15m
- alert: IndexerDecodeFailures
  expr: rate(stellaragent_indexer_decode_failures_total[15m]) > 0
```

When embedding `createQueryServer` yourself, hand it the running indexer's
reporter or `/health` and `/metrics` will report `lagLedgers: null`:

```typescript
const indexer = new SorobanEventIndexer({ store, contracts, startLedger });
const server = createQueryServer(store, {
  progress: () => indexer.progressReporter.snapshot(),
});
```

## SQLite schema

`events` stores one row per RPC event. Its primary key is the RPC event ID; it
also stores contract identity, ledger/transaction ordering data, normalized
namespace/action/entity columns, decoded JSON, and the original topic/value XDR.
`event_participants` is a many-to-many address/role index used by agent audit
queries. `checkpoints` stores the next ledger for each stream.

Balanced `ledger_entries`/`ledger_postings`, confirmed `transaction_fees`, and
retained `ledger_issues` form the reporting layer. The separate report database
stores schedules, immutable artifacts, SHA-256 digests, idempotency keys,
leases, attempts, and dead letters.

Each poll deliberately re-fetches `INDEXER_ROLLBACK_WINDOW` ledgers. In one
SQLite transaction it deletes that ledger range, inserts the canonical response,
and advances the checkpoint. This makes restarts idempotent and removes events
from a replaced ledger, including the case where its replacement has no matching
events. `INDEXER_FINALITY_LAG` avoids committing the RPC head itself.

## Reorg depth guarantee

"Reorg-safe" is a bounded claim, and this is the bound.

Each poll re-reads ledgers
`(head - INDEXER_FINALITY_LAG + 1 - INDEXER_ROLLBACK_WINDOW)` through
`head - INDEXER_FINALITY_LAG` and replaces that range wholesale. With the
defaults (`ROLLBACK_WINDOW=12`, `FINALITY_LAG=1`) that is ledgers
`head - 12 .. head - 1`, so:

| Fork depth | Outcome |
| --- | --- |
| Within the re-read range | Repaired on the next poll. Orphaned events are **deleted** — event rows, their participant index rows, and the normalized ledger entries rebuilt from them. A replacement ledger with no events clears the range too. |
| Deeper than the re-read range | **Not** detected. The orphaned rows stay until an explicit replay. |

A fork is "deeper than the re-read range" when it happened at or below
`head - FINALITY_LAG - ROLLBACK_WINDOW - 1`. At the defaults that is anything
older than 12 ledgers. Raising `INDEXER_ROLLBACK_WINDOW` raises the depth at
which you get automatic repair, at the cost of re-fetching and re-decoding that
many ledgers on every poll.

Recovery from a deeper fork is an explicit replay from the fork point:

```bash
stellaragent-indexer catch-up --from-ledger 812345
```

That deletes and re-inserts every ledger from `812345` to the head, after which
the store is consistent with the winning chain. Run it before serving statements
for the affected range, and note that Soroban RPC retains only a bounded event
history — if the fork is older than the provider's retention, the events for it
can no longer be fetched and the only options are a different RPC provider or a
rebuild from `INDEXER_START_LEDGER`.

The behavior is pinned by tests in
[`src/__tests__/indexer.test.ts`](src/__tests__/indexer.test.ts), including the
exact ledger at which automatic repair stops working.

The raw XDR columns are intentional: normalized schemas can evolve without
discarding the exact on-chain record.

## Local standalone integration test

The normal test suite uses real ScVal XDR and a deterministic RPC double. A
gated integration suite invokes the deployed factory three times on Soroban
standalone, catches up through RPC, checks the decoded lifecycle, and compares
its final active state with `get_agent`:

```bash
stellar network start local
pnpm deploy:contracts --network local --source alice
STELLAR_LOCAL_INTEGRATION=1 \
  pnpm --filter @stellaragent/indexer test
```

Set `STELLAR_LOCAL_SOURCE`, `SOROBAN_RPC_URL`, or
`INDEXER_DEPLOYMENT_FILE` when using non-default local settings.

## State reconstruction and legacy deployments

The contracts keep their existing action event tuples unchanged and now also
publish an additive `state/channel`, `state/job`, `state/limit`, or `state/agent`
snapshot after every state mutation. The latest snapshot is the exact complete
contract record; replaying snapshots reconstructs the record at every mutation.

Deployments built before this change do not contain those snapshot events.
Their action audit trail remains fully queryable, but fields that were never in
the old payloads (channel token/period, job deadline/task/result, rate-limit
configuration, and agent name) cannot be recovered historically.

## Backfilling from a historical ledger

`stellaragent-indexer catch-up --from-ledger 1200000` pages through history from
that ledger (resumable via the persisted checkpoint), then `--tail` composes with
it: catch up first, then follow the head. `INDEXER_FROM_LEDGER` sets the same
starting point from the environment.

## Environment Variables Reference

The following environment variables configure the indexer runtime, database paths, RPC connection, polling cadence, and API endpoints:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SOROBAN_RPC_URL` | **Yes** | — | RPC endpoint of the Soroban network (e.g. `http://localhost:8000/soroban/rpc` or Testnet RPC) |
| `INDEXER_START_LEDGER` | **Yes** | — | Starting ledger sequence number for initial historical catch-up |
| `INDEXER_FROM_LEDGER` | Optional | — | Historical ledger sequence number to backfill from (replaces events from checkpoint) |
| `INDEXER_DEPLOYMENT_FILE` | Optional | — | Path to JSON deployment manifest specifying contract addresses |
| `PAYMENT_CHANNEL_CONTRACT` | Conditional | — | Address of Payment Channel contract (required if not in deployment file) |
| `ESCROW_CONTRACT` | Conditional | — | Address of Escrow contract (required if not in deployment file) |
| `RATE_LIMITER_CONTRACT` | Conditional | — | Address of Rate Limiter contract (required if not in deployment file) |
| `AGENT_WALLET_FACTORY_CONTRACT` | Conditional | — | Address of Agent Wallet Factory contract (required if not in deployment file) |
| `INDEXER_DATABASE` | Optional | `stellaragent-events.sqlite` | Filepath or connection string for the SQLite audit database |
| `REPORT_DATABASE` | Optional | `${INDEXER_DATABASE}.reports` | Filepath for the SQLite report delivery and scheduling database |
| `INDEXER_ROLLBACK_WINDOW` | Optional | `12` | Reorg window depth (number of ledgers re-verified and replaced per poll) |
| `INDEXER_FINALITY_LAG` | Optional | `1` | Number of ledgers to hold back from the chain head to ensure finality |
| `INDEXER_POLL_INTERVAL_MS` | Optional | `5000` | Polling frequency for live tailing in milliseconds |
| `PORT` | Optional | `3001` | HTTP port on which the query and metrics API server listens |
| `AUDIT_API_CORS_ORIGIN` | Optional | `*` | `Access-Control-Allow-Origin` header for browser and dashboard access |
| `REPORT_WORKER_ENABLED` | Optional | `true` | Enables background worker processing scheduled audit reports |
| `REPORT_POLL_INTERVAL_MS` | Optional | `5000` | Polling frequency for scheduled report deliveries |
| `REPORT_EMAIL_GATEWAY_URL` | Optional | — | HTTPS webhook or gateway URL used to dispatch statement emails |
| `REPORT_EMAIL_GATEWAY_TOKEN` | Optional | — | Bearer authentication token for the email dispatch gateway |
| `LOG_LEVEL` / `INDEXER_LOG_LEVEL` | Optional | `info` | Logging verbosity: `debug`, `info`, `warn`, or `error` |

## Docker and Operations

A multi-stage Dockerfile and Docker Compose configuration are provided in `packages/indexer` to run the indexer as an isolated container service:

### Building and Running with Docker

```bash
# Build the image from monorepo root
docker build -t stellaragent-indexer -f packages/indexer/Dockerfile .

# Run container with volume mounted for persistent SQLite storage
docker run -d \
  --name stellaragent-indexer \
  -p 3001:3001 \
  -v indexer-data:/data \
  -e SOROBAN_RPC_URL=http://host.docker.internal:8000/soroban/rpc \
  -e INDEXER_START_LEDGER=100 \
  -e PAYMENT_CHANNEL_CONTRACT=CA... \
  -e ESCROW_CONTRACT=CB... \
  -e RATE_LIMITER_CONTRACT=CC... \
  -e AGENT_WALLET_FACTORY_CONTRACT=CD... \
  stellaragent-indexer
```

### Running with Docker Compose

```bash
cd packages/indexer
docker compose up -d
```

