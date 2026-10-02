import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import {
  collectStatementExport,
  describeStatementExport,
  type StatementExportFormat,
} from "./export.js";
import type { StatementPeriod, StatementSubject } from "./reporting.js";
import type { EventStore } from "./store.js";

export type ReportCadence = "daily" | "weekly" | "monthly" | "quarterly";

export interface WebhookDestination {
  id: string;
  kind: "webhook";
  url: string;
  headers?: Record<string, string>;
}

export interface EmailDestination {
  id: string;
  kind: "email";
  to: string[];
  from?: string;
  subject?: string;
}

export type ReportDestination = WebhookDestination | EmailDestination;

export interface ReportScheduleInput {
  scheduleId: string;
  subject: StatementSubject;
  cadence: ReportCadence;
  format: StatementExportFormat;
  destinations: ReportDestination[];
  nextRunAt: string;
  enabled?: boolean;
}

export interface ReportSchedule extends ReportScheduleInput {
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedReportArtifact {
  statementId: string;
  format: StatementExportFormat;
  contentType: string;
  filename: string;
  content: Uint8Array;
}

export interface StoredReportArtifact extends GeneratedReportArtifact {
  artifactId: string;
  scheduleId: string;
  runKey: string;
  period: StatementPeriod;
  sha256: string;
  createdAt: string;
}

export type DeliveryStatus = "pending" | "delivering" | "retry" | "delivered" | "dead_letter";

export interface ReportDelivery {
  deliveryId: string;
  artifactId: string;
  scheduleId: string;
  runKey: string;
  destination: ReportDestination;
  idempotencyKey: string;
  status: DeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string;
  leaseUntil: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimedDelivery {
  delivery: ReportDelivery;
  artifact: StoredReportArtifact;
}

export interface DeliveryTransport {
  deliver(claim: ClaimedDelivery): Promise<void>;
}

export interface ReportArtifactBuilder {
  build(schedule: ReportSchedule, period: StatementPeriod): Promise<GeneratedReportArtifact>;
}

function iso(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO-8601 timestamp`);
  return new Date(parsed).toISOString();
}

function validateDestination(destination: ReportDestination): void {
  if (!destination.id) throw new Error("destination id is required");
  if (destination.kind === "webhook") {
    const url = new URL(destination.url);
    if (!/^https?:$/.test(url.protocol)) throw new Error("webhook URL must use HTTP or HTTPS");
  } else if (!destination.to.length || destination.to.some((address) => !address.includes("@"))) {
    throw new Error("email destination requires at least one valid recipient");
  }
}

function validateSchedule(input: ReportScheduleInput): void {
  if (!input.scheduleId) throw new Error("schedule id is required");
  if (!input.subject.id) throw new Error("schedule subject id is required");
  if (!input.destinations.length) throw new Error("schedule requires a destination");
  const ids = new Set<string>();
  for (const destination of input.destinations) {
    validateDestination(destination);
    if (ids.has(destination.id)) throw new Error(`duplicate destination ${destination.id}`);
    ids.add(destination.id);
  }
  iso(input.nextRunAt, "nextRunAt");
}

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function scheduleRow(row: Record<string, unknown>): ReportSchedule {
  return {
    scheduleId: row.schedule_id as string,
    subject: JSON.parse(row.subject_json as string) as StatementSubject,
    cadence: row.cadence as ReportCadence,
    format: row.format as StatementExportFormat,
    destinations: JSON.parse(row.destinations_json as string) as ReportDestination[],
    nextRunAt: row.next_run_at as string,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function artifactRow(row: Record<string, unknown>): StoredReportArtifact {
  const content = row.content as Buffer;
  return {
    artifactId: row.artifact_id as string,
    scheduleId: row.schedule_id as string,
    runKey: row.run_key as string,
    statementId: row.statement_id as string,
    period: JSON.parse(row.period_json as string) as StatementPeriod,
    format: row.format as StatementExportFormat,
    contentType: row.content_type as string,
    filename: row.filename as string,
    content: new Uint8Array(content.buffer, content.byteOffset, content.byteLength),
    sha256: row.sha256 as string,
    createdAt: row.created_at as string,
  };
}

function deliveryRow(row: Record<string, unknown>): ReportDelivery {
  return {
    deliveryId: row.delivery_id as string,
    artifactId: row.artifact_id as string,
    scheduleId: row.schedule_id as string,
    runKey: row.run_key as string,
    destination: JSON.parse(row.destination_json as string) as ReportDestination,
    idempotencyKey: row.idempotency_key as string,
    status: row.status as DeliveryStatus,
    attemptCount: row.attempt_count as number,
    nextAttemptAt: row.next_attempt_at as string,
    leaseUntil: row.lease_until as string | null,
    lastError: row.last_error as string | null,
    deliveredAt: row.delivered_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Durable schedule, immutable artifact, retry, and dead-letter repository. */
export class ReportDeliveryStore {
  private readonly db: Database.Database;

  constructor(filename = "stellaragent-reports.sqlite") {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS report_schedules (
        schedule_id TEXT PRIMARY KEY,
        subject_json TEXT NOT NULL,
        cadence TEXT NOT NULL,
        format TEXT NOT NULL,
        destinations_json TEXT NOT NULL,
        next_run_at TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS report_schedules_due_idx
        ON report_schedules (enabled, next_run_at, schedule_id);

      CREATE TABLE IF NOT EXISTS report_artifacts (
        artifact_id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL REFERENCES report_schedules(schedule_id),
        run_key TEXT NOT NULL UNIQUE,
        statement_id TEXT NOT NULL,
        period_json TEXT NOT NULL,
        format TEXT NOT NULL,
        content_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        content BLOB NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS report_artifacts_schedule_idx
        ON report_artifacts (schedule_id, created_at);

      CREATE TABLE IF NOT EXISTS report_deliveries (
        delivery_id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL REFERENCES report_artifacts(artifact_id),
        schedule_id TEXT NOT NULL REFERENCES report_schedules(schedule_id),
        run_key TEXT NOT NULL,
        destination_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        next_attempt_at TEXT NOT NULL,
        lease_until TEXT,
        last_error TEXT,
        delivered_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS report_deliveries_due_idx
        ON report_deliveries (status, next_attempt_at, lease_until, delivery_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  saveSchedule(input: ReportScheduleInput, now = new Date().toISOString()): ReportSchedule {
    validateSchedule(input);
    const timestamp = iso(now, "now");
    const nextRunAt = iso(input.nextRunAt, "nextRunAt");
    this.db.prepare(`
      INSERT INTO report_schedules (
        schedule_id, subject_json, cadence, format, destinations_json,
        next_run_at, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(schedule_id) DO UPDATE SET
        subject_json = excluded.subject_json,
        cadence = excluded.cadence,
        format = excluded.format,
        destinations_json = excluded.destinations_json,
        next_run_at = excluded.next_run_at,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run(
      input.scheduleId,
      JSON.stringify(input.subject),
      input.cadence,
      input.format,
      JSON.stringify(input.destinations),
      nextRunAt,
      input.enabled ?? true ? 1 : 0,
      timestamp,
      timestamp,
    );
    return this.schedule(input.scheduleId)!;
  }

  schedule(scheduleId: string): ReportSchedule | undefined {
    const row = this.db.prepare("SELECT * FROM report_schedules WHERE schedule_id = ?")
      .get(scheduleId) as Record<string, unknown> | undefined;
    return row ? scheduleRow(row) : undefined;
  }

  schedules(): ReportSchedule[] {
    return (this.db.prepare("SELECT * FROM report_schedules ORDER BY schedule_id").all() as Array<Record<string, unknown>>)
      .map(scheduleRow);
  }

  dueSchedules(now: string): ReportSchedule[] {
    return (this.db.prepare(`
      SELECT * FROM report_schedules
      WHERE enabled = 1 AND next_run_at <= ?
      ORDER BY next_run_at, schedule_id
    `).all(iso(now, "now")) as Array<Record<string, unknown>>).map(scheduleRow);
  }

  advanceSchedule(scheduleId: string, expectedRunAt: string, nextRunAt: string, now: string): boolean {
    const result = this.db.prepare(`
      UPDATE report_schedules SET next_run_at = ?, updated_at = ?
      WHERE schedule_id = ? AND next_run_at = ? AND enabled = 1
    `).run(iso(nextRunAt, "nextRunAt"), iso(now, "now"), scheduleId, iso(expectedRunAt, "expectedRunAt"));
    return result.changes === 1;
  }

  enqueueArtifact(
    schedule: ReportSchedule,
    runKey: string,
    period: StatementPeriod,
    generated: GeneratedReportArtifact,
    now: string,
  ): StoredReportArtifact {
    const timestamp = iso(now, "now");
    const content = Buffer.from(generated.content);
    const sha256 = hash(content);
    const artifactId = `artifact_${hash(runKey).slice(0, 32)}`;
    const insert = this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO report_artifacts (
          artifact_id, schedule_id, run_key, statement_id, period_json, format,
          content_type, filename, content, sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId,
        schedule.scheduleId,
        runKey,
        generated.statementId,
        JSON.stringify(period),
        generated.format,
        generated.contentType,
        generated.filename,
        content,
        sha256,
        timestamp,
      );
      const existing = this.db.prepare("SELECT * FROM report_artifacts WHERE run_key = ?")
        .get(runKey) as Record<string, unknown>;
      if (existing.sha256 !== sha256) {
        throw new Error(`run ${runKey} already has a different immutable artifact`);
      }
      for (const destination of schedule.destinations) {
        const idempotencyKey = `${schedule.scheduleId}:${runKey}:${destination.id}`;
        const deliveryId = `delivery_${hash(idempotencyKey).slice(0, 32)}`;
        this.db.prepare(`
          INSERT OR IGNORE INTO report_deliveries (
            delivery_id, artifact_id, schedule_id, run_key, destination_json,
            idempotency_key, status, attempt_count, next_attempt_at, lease_until,
            last_error, delivered_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, NULL, NULL, ?, ?)
        `).run(
          deliveryId,
          existing.artifact_id,
          schedule.scheduleId,
          runKey,
          JSON.stringify(destination),
          idempotencyKey,
          timestamp,
          timestamp,
          timestamp,
        );
      }
    });
    insert();
    return this.artifactForRun(runKey)!;
  }

  artifactForRun(runKey: string): StoredReportArtifact | undefined {
    const row = this.db.prepare("SELECT * FROM report_artifacts WHERE run_key = ?")
      .get(runKey) as Record<string, unknown> | undefined;
    return row ? artifactRow(row) : undefined;
  }

  claimDue(now: string, leaseMs: number): ClaimedDelivery | undefined {
    const timestamp = iso(now, "now");
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new Error("leaseMs must be positive");
    const leaseUntil = new Date(Date.parse(timestamp) + leaseMs).toISOString();
    const claim = this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT * FROM report_deliveries
        WHERE (
          status IN ('pending', 'retry') AND next_attempt_at <= ?
        ) OR (
          status = 'delivering' AND lease_until <= ?
        )
        ORDER BY next_attempt_at, delivery_id
        LIMIT 1
      `).get(timestamp, timestamp) as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const updated = this.db.prepare(`
        UPDATE report_deliveries SET
          status = 'delivering',
          attempt_count = attempt_count + 1,
          lease_until = ?,
          updated_at = ?
        WHERE delivery_id = ? AND status = ? AND attempt_count = ?
      `).run(
        leaseUntil,
        timestamp,
        row.delivery_id,
        row.status,
        row.attempt_count,
      );
      if (updated.changes !== 1) return undefined;
      const delivery = this.db.prepare("SELECT * FROM report_deliveries WHERE delivery_id = ?")
        .get(row.delivery_id) as Record<string, unknown>;
      const artifact = this.db.prepare("SELECT * FROM report_artifacts WHERE artifact_id = ?")
        .get(row.artifact_id) as Record<string, unknown>;
      return { delivery: deliveryRow(delivery), artifact: artifactRow(artifact) };
    });
    return claim();
  }

  markDelivered(deliveryId: string, now: string): void {
    const result = this.db.prepare(`
      UPDATE report_deliveries SET
        status = 'delivered', delivered_at = ?, lease_until = NULL,
        last_error = NULL, updated_at = ?
      WHERE delivery_id = ? AND status = 'delivering'
    `).run(iso(now, "now"), iso(now, "now"), deliveryId);
    if (result.changes !== 1) throw new Error(`delivery ${deliveryId} is not claimed`);
  }

  markFailed(
    deliveryId: string,
    error: string,
    nextAttemptAt: string,
    maxAttempts: number,
    now: string,
  ): DeliveryStatus {
    const current = this.db.prepare("SELECT attempt_count FROM report_deliveries WHERE delivery_id = ? AND status = 'delivering'")
      .get(deliveryId) as { attempt_count: number } | undefined;
    if (!current) throw new Error(`delivery ${deliveryId} is not claimed`);
    const status: DeliveryStatus = current.attempt_count >= maxAttempts ? "dead_letter" : "retry";
    this.db.prepare(`
      UPDATE report_deliveries SET
        status = ?, next_attempt_at = ?, lease_until = NULL,
        last_error = ?, updated_at = ?
      WHERE delivery_id = ?
    `).run(status, iso(nextAttemptAt, "nextAttemptAt"), error.slice(0, 4_000), iso(now, "now"), deliveryId);
    return status;
  }

  replayDeadLetter(deliveryId: string, now: string): void {
    const result = this.db.prepare(`
      UPDATE report_deliveries SET
        status = 'retry', attempt_count = 0, next_attempt_at = ?,
        lease_until = NULL, last_error = NULL, updated_at = ?
      WHERE delivery_id = ? AND status = 'dead_letter'
    `).run(iso(now, "now"), iso(now, "now"), deliveryId);
    if (result.changes !== 1) throw new Error(`delivery ${deliveryId} is not dead-lettered`);
  }

  deliveries(status?: DeliveryStatus): ReportDelivery[] {
    const rows = status
      ? this.db.prepare("SELECT * FROM report_deliveries WHERE status = ? ORDER BY created_at, delivery_id").all(status)
      : this.db.prepare("SELECT * FROM report_deliveries ORDER BY created_at, delivery_id").all();
    return (rows as Array<Record<string, unknown>>).map(deliveryRow);
  }
}

export interface WebhookFetch {
  (url: string, init: {
    method: "POST";
    headers: Record<string, string>;
    body: Uint8Array;
  }): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

/** Binary webhook delivery with stable idempotency/evidence headers. */
export class WebhookReportTransport implements DeliveryTransport {
  constructor(private readonly request: WebhookFetch = fetch as WebhookFetch) {}

  async deliver(claim: ClaimedDelivery): Promise<void> {
    const destination = claim.delivery.destination;
    if (destination.kind !== "webhook") throw new Error("webhook transport received an email destination");
    const response = await this.request(destination.url, {
      method: "POST",
      headers: {
        ...(destination.headers ?? {}),
        "content-type": claim.artifact.contentType,
        "content-disposition": `attachment; filename="${claim.artifact.filename}"`,
        "idempotency-key": claim.delivery.idempotencyKey,
        "x-stellaragent-artifact-sha256": claim.artifact.sha256,
        "x-stellaragent-statement-id": claim.artifact.statementId,
      },
      body: claim.artifact.content,
    });
    if (!response.ok) {
      throw new Error(`webhook returned ${response.status}: ${(await response.text()).slice(0, 1_000)}`);
    }
  }
}

export interface EmailMessage {
  to: string[];
  from?: string;
  subject: string;
  text: string;
  messageId: string;
  attachment: {
    filename: string;
    contentType: string;
    content: Uint8Array;
  };
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailGatewayFetch {
  (url: string, init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

/**
 * Email-provider bridge using a small JSON gateway protocol. The stable
 * messageId lets the gateway suppress duplicate provider sends.
 */
export class HttpEmailSender implements EmailSender {
  private readonly url: string;

  constructor(
    url: string,
    private readonly bearerToken?: string,
    private readonly request: EmailGatewayFetch = fetch as EmailGatewayFetch,
  ) {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error("email gateway URL must use HTTP or HTTPS");
    }
    this.url = parsed.toString();
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await this.request(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.bearerToken
          ? { authorization: `Bearer ${this.bearerToken}` }
          : {}),
        "idempotency-key": message.messageId,
      },
      body: JSON.stringify({
        ...message,
        attachment: {
          ...message.attachment,
          contentBase64: Buffer.from(message.attachment.content).toString("base64"),
          content: undefined,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `email gateway returned ${response.status}: ${(await response.text()).slice(0, 1_000)}`,
      );
    }
  }
}

/** Provider-neutral email attachment transport with a stable message ID. */
export class EmailReportTransport implements DeliveryTransport {
  constructor(private readonly sender: EmailSender) {}

  async deliver(claim: ClaimedDelivery): Promise<void> {
    const destination = claim.delivery.destination;
    if (destination.kind !== "email") throw new Error("email transport received a webhook destination");
    await this.sender.send({
      to: destination.to,
      ...(destination.from ? { from: destination.from } : {}),
      subject: destination.subject ?? `StellarAgent statement ${claim.artifact.statementId}`,
      text: [
        `Statement: ${claim.artifact.statementId}`,
        `Period: ${JSON.stringify(claim.artifact.period)}`,
        `SHA-256: ${claim.artifact.sha256}`,
        `Delivery key: ${claim.delivery.idempotencyKey}`,
      ].join("\n"),
      messageId: claim.delivery.idempotencyKey,
      attachment: {
        filename: claim.artifact.filename,
        contentType: claim.artifact.contentType,
        content: claim.artifact.content,
      },
    });
  }
}

function addCadence(value: string, cadence: ReportCadence, amount: 1 | -1): string {
  const date = new Date(iso(value, "schedule boundary"));
  if (cadence === "daily") date.setUTCDate(date.getUTCDate() + amount);
  else if (cadence === "weekly") date.setUTCDate(date.getUTCDate() + 7 * amount);
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + (cadence === "monthly" ? amount : 3 * amount));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString();
}

/** Closed reporting period immediately preceding a schedule boundary. */
export function periodForRun(runAt: string, cadence: ReportCadence): StatementPeriod {
  const through = new Date(Date.parse(iso(runAt, "runAt")) - 1);
  return {
    fromTimestamp: addCadence(runAt, cadence, -1),
    throughTimestamp: through.toISOString(),
  };
}

/** Build scheduled artifacts from the normalized EventStore reporting engine. */
export function eventStoreArtifactBuilder(store: EventStore): ReportArtifactBuilder {
  return {
    async build(schedule, period) {
      const statement = store.statement({ subject: schedule.subject, period });
      const descriptor = describeStatementExport(statement, schedule.format);
      const content = await collectStatementExport(statement, { format: schedule.format });
      return {
        statementId: statement.statementId,
        format: schedule.format,
        contentType: descriptor.contentType,
        filename: descriptor.filename,
        content: Buffer.from(content, "utf8"),
      };
    },
  };
}

export interface ScheduledReportServiceOptions {
  store: ReportDeliveryStore;
  artifactBuilder: ReportArtifactBuilder;
  transports: {
    webhook: DeliveryTransport;
    email: DeliveryTransport;
  };
  clock?: () => Date;
  maxAttempts?: number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  leaseMs?: number;
  maxCatchUpRuns?: number;
}

export interface ScheduledReportTickResult {
  generated: number;
  delivered: number;
  retried: number;
  deadLettered: number;
}

/** Scheduler/worker service with idempotent generation and delivery. */
export class ScheduledReportService {
  private readonly clock: () => Date;
  private readonly maxAttempts: number;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly leaseMs: number;
  private readonly maxCatchUpRuns: number;

  constructor(private readonly options: ScheduledReportServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseRetryMs = options.baseRetryMs ?? 30_000;
    this.maxRetryMs = options.maxRetryMs ?? 30 * 60_000;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.maxCatchUpRuns = options.maxCatchUpRuns ?? 100;
    if (this.maxAttempts < 1) throw new Error("maxAttempts must be positive");
  }

  async generateDue(now = this.clock()): Promise<number> {
    const nowIso = now.toISOString();
    let generated = 0;
    for (const initial of this.options.store.dueSchedules(nowIso)) {
      let schedule = initial;
      let caughtUp = 0;
      while (Date.parse(schedule.nextRunAt) <= now.getTime()) {
        if (caughtUp >= this.maxCatchUpRuns) break;
        const runAt = schedule.nextRunAt;
        const runKey = `${schedule.scheduleId}:${runAt}`;
        const period = periodForRun(runAt, schedule.cadence);
        const artifact = await this.options.artifactBuilder.build(schedule, period);
        this.options.store.enqueueArtifact(schedule, runKey, period, artifact, nowIso);
        const next = addCadence(runAt, schedule.cadence, 1);
        if (!this.options.store.advanceSchedule(schedule.scheduleId, runAt, next, nowIso)) break;
        generated += 1;
        caughtUp += 1;
        schedule = { ...schedule, nextRunAt: next };
      }
    }
    return generated;
  }

  async deliverDue(
    now = this.clock(),
    limit = 100,
  ): Promise<Omit<ScheduledReportTickResult, "generated">> {
    const result = { delivered: 0, retried: 0, deadLettered: 0 };
    for (let index = 0; index < limit; index += 1) {
      const claim = this.options.store.claimDue(now.toISOString(), this.leaseMs);
      if (!claim) break;
      try {
        await this.options.transports[claim.delivery.destination.kind].deliver(claim);
        this.options.store.markDelivered(claim.delivery.deliveryId, now.toISOString());
        result.delivered += 1;
      } catch (error) {
        const delay = Math.min(
          this.maxRetryMs,
          this.baseRetryMs * 2 ** Math.max(0, claim.delivery.attemptCount - 1),
        );
        const status = this.options.store.markFailed(
          claim.delivery.deliveryId,
          error instanceof Error ? error.message : String(error),
          new Date(now.getTime() + delay).toISOString(),
          this.maxAttempts,
          now.toISOString(),
        );
        if (status === "dead_letter") result.deadLettered += 1;
        else result.retried += 1;
      }
    }
    return result;
  }

  async tick(now = this.clock()): Promise<ScheduledReportTickResult> {
    const generated = await this.generateDue(now);
    return { generated, ...(await this.deliverDue(now)) };
  }
}
