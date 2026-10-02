/**
 * Live ingest progress.
 *
 * The indexer is a polling process with no external push channel: nothing it
 * does is visible until you ask it. `IndexerProgressReporter` is the single
 * place the ingest loop records what it last saw, and `IndexerProgress` is the
 * read-only snapshot the query API serves from `/health` (JSON) and `/metrics`
 * (Prometheus text format). Nothing here touches the database, so scraping a
 * lagging replica can never block ingest.
 */

export interface IndexerProgress {
  /** `true` until the first run finishes — "process is up" is not "indexing". */
  started: boolean;
  /** How long this process has been alive, in seconds. */
  uptimeSeconds: number;
  /**
   * `true` when the most recent run succeeded. A run that has never happened
   * counts as healthy; a run that threw does not, until a later one succeeds.
   */
  healthy: boolean;
  /** Consecutive failed runs, reset by the first success. */
  consecutiveFailures: number;
  /** Total runs attempted since process start, successful or not. */
  runs: number;
  /** Total runs that completed and committed. */
  successfulRuns: number;
  /**
   * Highest ledger the RPC reported as closed on the last run that reached
   * `getEvents` — the head this process is chasing.
   */
  latestLedger: number | null;
  /**
   * Highest ledger committed to the store. Events above this are either not
   * fetched yet or held back by the finality lag.
   */
  indexedThroughLedger: number | null;
  /**
   * Ledgers between the RPC head and what is committed. This is the number
   * that answers "how far behind is it", and it is `null` before the first
   * successful run, because zero lag and unknown lag are not the same claim.
   */
  lagLedgers: number | null;
  /**
   * Events decoded and committed, summed over every run. Rollback replays
   * re-commit events that are already stored, so this counts ingest work
   * rather than distinct events — compare against `eventsStored` for size.
   */
  eventsProcessed: number;
  /**
   * Events that failed to decode, summed over every run. A single malformed
   * event is re-attempted (and re-fails) on each rollback replay, so this
   * grows with replays too.
   */
  decodeFailures: number;
  /** ISO timestamp of the last run attempt, successful or not. */
  lastRunAt: string | null;
  /** ISO timestamp of the last run that committed. */
  lastSuccessAt: string | null;
  /** Duration of the last run, in milliseconds. */
  lastRunDurationMs: number | null;
  /** Message from the last failure, cleared by the next success. */
  lastError: string | null;
  /** ISO timestamp of the last failure. */
  lastErrorAt: string | null;
  /** Rollback window this process was configured with, in ledgers. */
  rollbackWindow: number;
  /** Finality lag this process was configured with, in ledgers. */
  finalityLag: number;
}

export interface IndexerProgressReporterOptions {
  /** Reorg window the indexer is configured with. Reported, not enforced here. */
  rollbackWindow?: number;
  /** Finality lag the indexer is configured with. Reported, not enforced here. */
  finalityLag?: number;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
}

export interface IndexerRunReport {
  fromLedger: number;
  throughLedger: number;
  eventCount: number;
  decodeFailures: number;
  latestLedger: number;
}

/** Mutable progress the ingest loop writes to. One instance per indexer. */
export class IndexerProgressReporter {
  private readonly startedAtMs: number;
  private readonly rollbackWindow: number;
  private readonly finalityLag: number;
  private readonly now: () => number;

  private latestLedger: number | null = null;
  private indexedThroughLedger: number | null = null;
  private runs = 0;
  private successfulRuns = 0;
  private consecutiveFailures = 0;
  private eventsProcessed = 0;
  private decodeFailures = 0;
  private lastRunAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastRunDurationMs: number | null = null;
  private lastError: string | null = null;
  private lastErrorAt: string | null = null;

  constructor(options: IndexerProgressReporterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.startedAtMs = this.now();
    this.rollbackWindow = options.rollbackWindow ?? 12;
    this.finalityLag = options.finalityLag ?? 1;
  }

  /** Record a run that fetched, decoded, and committed. */
  recordRun(report: IndexerRunReport, durationMs?: number): void {
    this.runs += 1;
    this.successfulRuns += 1;
    this.consecutiveFailures = 0;
    this.eventsProcessed += report.eventCount;
    this.decodeFailures += report.decodeFailures;
    this.latestLedger = report.latestLedger;
    this.indexedThroughLedger = report.throughLedger;
    this.lastRunAt = new Date(this.now()).toISOString();
    this.lastSuccessAt = this.lastRunAt;
    this.lastRunDurationMs = durationMs ?? null;
    this.lastError = null;
  }

  /** Record a run that threw. The message is what `/metrics` and `/health` surface. */
  recordFailure(error: unknown): void {
    this.runs += 1;
    this.consecutiveFailures += 1;
    this.lastRunAt = new Date(this.now()).toISOString();
    this.lastRunDurationMs = null;
    this.lastError = error instanceof Error ? error.message : String(error);
    this.lastErrorAt = this.lastRunAt;
  }

  /** Note the RPC head without committing anything (used when a run fails mid-fetch). */
  recordLatestLedger(latestLedger: number): void {
    this.latestLedger = latestLedger;
  }

  /** Immutable view for the query API to serve. */
  snapshot(): IndexerProgress {
    const lagLedgers =
      this.latestLedger === null || this.indexedThroughLedger === null
        ? null
        : Math.max(0, this.latestLedger - this.indexedThroughLedger);
    return {
      started: this.successfulRuns > 0,
      uptimeSeconds: Math.max(0, Math.round((this.now() - this.startedAtMs) / 1000)),
      healthy: this.consecutiveFailures === 0,
      consecutiveFailures: this.consecutiveFailures,
      runs: this.runs,
      successfulRuns: this.successfulRuns,
      latestLedger: this.latestLedger,
      indexedThroughLedger: this.indexedThroughLedger,
      lagLedgers,
      eventsProcessed: this.eventsProcessed,
      decodeFailures: this.decodeFailures,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastRunDurationMs: this.lastRunDurationMs,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
      rollbackWindow: this.rollbackWindow,
      finalityLag: this.finalityLag,
    };
  }
}

const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export const METRICS_CONTENT_TYPE = PROMETHEUS_CONTENT_TYPE;

function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function help(name: string, type: string, text: string): string {
  return [`# HELP ${name} ${text}`, `# TYPE ${name} ${type}`].join("\n");
}

/** Optional store-backed gauges, so `/metrics` also reports durable state. */
export interface MetricsStoreCounts {
  /** Rows currently in the `events` table. */
  eventsStored: number;
  /** Rows currently in `ledger_issues`. */
  ledgerIssues: number;
}

export interface PrometheusMetricsOptions {
  progress: IndexerProgress;
  store?: MetricsStoreCounts;
  /** Only rendered when a delivery store is attached to the query server. */
  delivery?: { schedules: number; deadLetters: number };
}

function secondsOf(iso: string | null): number {
  if (iso === null) return 0;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed / 1000;
}

/**
 * Render the Prometheus text exposition format (version 0.0.4).
 *
 * Counters keep the `_total` suffix and are monotonic for the life of the
 * process; gauges describe the current state and may move either way. A
 * counter is emitted as `0` rather than omitted when nothing has happened yet,
 * so a dashboard query does not have to special-case a fresh process — the
 * only values that stay unrendered are the ones that would be a lie
 * (lag before the first successful run, last error before the first failure).
 */
export function renderPrometheusMetrics(options: PrometheusMetricsOptions): string {
  const { progress, store, delivery } = options;
  const lines: string[] = [];

  lines.push(
    help("stellaragent_indexer_up", "gauge",
      "1 when the indexer process is serving and has no unresolved failure."),
    `stellaragent_indexer_up ${progress.healthy ? 1 : 0}`,
    help("stellaragent_indexer_started", "gauge",
      "1 once at least one run has committed events to the store."),
    `stellaragent_indexer_started ${progress.started ? 1 : 0}`,
    help("stellaragent_indexer_uptime_seconds", "gauge",
      "Seconds since this indexer process started."),
    `stellaragent_indexer_uptime_seconds ${progress.uptimeSeconds}`,
  );

  if (progress.lagLedgers !== null) {
    lines.push(
      help("stellaragent_indexer_lag_ledgers", "gauge",
        "Ledgers between the latest closed ledger reported by RPC and the highest ledger committed to the store."),
      `stellaragent_indexer_lag_ledgers ${progress.lagLedgers}`,
    );
  }
  lines.push(
    help("stellaragent_indexer_latest_ledger", "gauge",
      "Latest closed ledger reported by RPC on the last run."),
    `stellaragent_indexer_latest_ledger ${progress.latestLedger ?? 0}`,
    help("stellaragent_indexer_indexed_through_ledger", "gauge",
      "Highest ledger committed to the store; 0 before the first successful run."),
    `stellaragent_indexer_indexed_through_ledger ${progress.indexedThroughLedger ?? 0}`,
    help("stellaragent_indexer_rollback_window_ledgers", "gauge",
      "Configured reorg window: how deep a fork this process rewinds and repairs."),
    `stellaragent_indexer_rollback_window_ledgers ${progress.rollbackWindow}`,
    help("stellaragent_indexer_finality_lag_ledgers", "gauge",
      "Configured ledgers held back below the RPC head before committing."),
    `stellaragent_indexer_finality_lag_ledgers ${progress.finalityLag}`,
  );

  lines.push(
    help("stellaragent_indexer_events_processed_total", "counter",
      "Events decoded and committed, summed over all runs including rollback replays."),
    `stellaragent_indexer_events_processed_total ${progress.eventsProcessed}`,
    help("stellaragent_indexer_decode_failures_total", "counter",
      "Events that failed to decode, summed over all runs including rollback replays."),
    `stellaragent_indexer_decode_failures_total ${progress.decodeFailures}`,
    help("stellaragent_indexer_runs_total", "counter", "Indexing runs attempted since process start."),
    `stellaragent_indexer_runs_total ${progress.runs}`,
    help("stellaragent_indexer_successful_runs_total", "counter",
      "Indexing runs that reached the store and advanced the checkpoint."),
    `stellaragent_indexer_successful_runs_total ${progress.successfulRuns}`,
    help("stellaragent_indexer_consecutive_failures", "gauge",
      "Runs that have thrown in a row; reset to 0 by the first success."),
    `stellaragent_indexer_consecutive_failures ${progress.consecutiveFailures}`,
    help("stellaragent_indexer_last_run_timestamp_seconds", "gauge",
      "Unix time of the last run attempt, successful or not; 0 if none yet."),
    `stellaragent_indexer_last_run_timestamp_seconds ${secondsOf(progress.lastRunAt).toFixed(3)}`,
    help("stellaragent_indexer_last_success_timestamp_seconds", "gauge",
      "Unix time of the last run that committed; 0 if none yet."),
    `stellaragent_indexer_last_success_timestamp_seconds ${secondsOf(progress.lastSuccessAt).toFixed(3)}`,
    help("stellaragent_indexer_last_run_duration_milliseconds", "gauge",
      "Wall-clock duration of the last run; 0 if none yet."),
    `stellaragent_indexer_last_run_duration_milliseconds ${progress.lastRunDurationMs ?? 0}`,
  );

  if (progress.lastError === null) {
    lines.push(
      help("stellaragent_indexer_last_error", "gauge",
        "1 while the last failure is unresolved, 0 otherwise."),
      "stellaragent_indexer_last_error 0",
    );
  } else {
    const message = escapeLabel(progress.lastError);
    lines.push(
      help("stellaragent_indexer_last_error", "gauge",
        "1 while the last failure is unresolved, 0 otherwise."),
      "stellaragent_indexer_last_error 1",
      help("stellaragent_indexer_last_error_info", "gauge",
        "Message of the unresolved failure; absent when the last run succeeded."),
      `stellaragent_indexer_last_error_info{message="${message}"} 1`,
    );
  }
  // Emitted unconditionally: the timestamp outlives a success so an alert that
  // fired and then resolved can still be correlated with what went wrong.
  lines.push(
    help("stellaragent_indexer_last_error_timestamp_seconds", "gauge",
      "Unix time of the last failure, retained after a success for post-mortems; 0 if none yet."),
    `stellaragent_indexer_last_error_timestamp_seconds ${secondsOf(progress.lastErrorAt).toFixed(3)}`,
  );

  if (store) {
    lines.push(
      help("stellaragent_indexer_events_stored", "gauge",
        "Rows currently stored in the events table."),
      `stellaragent_indexer_events_stored ${store.eventsStored}`,
      help("stellaragent_indexer_ledger_issues", "gauge",
        "Retained data-quality issues in the normalized ledger."),
      `stellaragent_indexer_ledger_issues ${store.ledgerIssues}`,
    );
  }

  if (delivery) {
    lines.push(
      help("stellaragent_indexer_report_schedules", "gauge",
        "Durable report schedules configured on this replica."),
      `stellaragent_indexer_report_schedules ${delivery.schedules}`,
      help("stellaragent_indexer_report_dead_letters", "gauge",
        "Report deliveries parked in the dead-letter queue."),
      `stellaragent_indexer_report_dead_letters ${delivery.deadLetters}`,
    );
  }

  return `${lines.join("\n")}\n`;
}
