import Database from "better-sqlite3";
import {
  normalizeLedger,
  reconcileLedger,
  type LedgerEntry,
  type LedgerEntryKind,
  type LedgerIssue,
  type ReconciliationRequest,
  type ReconciliationResult,
  type TransactionFee,
} from "./ledger.js";
import {
  buildStatement,
  type Statement,
  type StatementRequest,
} from "./reporting.js";
import type { DecodedEvent, StoredEvent } from "./types.js";

export interface ChannelSpend {
  channelId: string;
  totalSpent: string;
  payments: StoredEvent[];
}

export interface JobLifecycle {
  jobId: string;
  status: "Open" | "InProgress" | "PendingRelease" | "Completed" | "Refunded" | "Disputed" | "Unknown";
  events: StoredEvent[];
}

/** Filters applied by the normalized ledger query. */
export interface LedgerQuery {
  fromLedger?: number;
  throughLedger?: number;
  agent?: string;
  owner?: string;
  account?: string;
  asset?: string;
  kinds?: LedgerEntryKind[];
  limit?: number;
  offset?: number;
}

function entity(event: DecodedEvent): {
  type: StoredEvent["entityType"];
  id: string | null;
} {
  if ("channelId" in event) return { type: "channel", id: event.channelId };
  if ("jobId" in event) return { type: "job", id: event.jobId };
  if ("agentId" in event) return { type: "agent", id: event.agentId };
  if ("agent" in event) return { type: "agent", id: event.agent };
  return { type: null, id: null };
}

function participants(event: DecodedEvent): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const fields = event as unknown as Record<string, unknown>;
  for (const role of ["agent", "owner", "recipient", "requester", "worker"] as const) {
    if (typeof fields[role] === "string") {
      result.push([fields[role], role]);
    }
  }
  if ("state" in event && event.state && !Array.isArray(event.state) && typeof event.state === "object") {
    for (const role of ["agent", "address", "owner", "recipient", "requester", "worker", "arbiter"]) {
      const value = event.state[role];
      if (typeof value === "string") result.push([value, role]);
    }
  }
  return result;
}

export class EventStore {
  private readonly db: Database.Database;

  constructor(filename = "stellaragent-events.sqlite") {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        contract_kind TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        ledger INTEGER NOT NULL,
        ledger_closed_at TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        paging_token TEXT NOT NULL,
        namespace TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        payload_json TEXT NOT NULL,
        topic_xdr_json TEXT NOT NULL,
        value_xdr TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_ledger_idx
        ON events (ledger, paging_token);
      CREATE INDEX IF NOT EXISTS events_entity_idx
        ON events (entity_type, entity_id, ledger, paging_token);

      CREATE TABLE IF NOT EXISTS event_participants (
        event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
        address TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (event_id, address, role)
      );
      CREATE INDEX IF NOT EXISTS event_participants_address_idx
        ON event_participants (address, event_id);

      CREATE TABLE IF NOT EXISTS checkpoints (
        stream TEXT PRIMARY KEY,
        next_ledger INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transaction_fees (
        tx_hash TEXT PRIMARY KEY,
        ledger INTEGER NOT NULL,
        ledger_closed_at TEXT NOT NULL,
        payer TEXT NOT NULL,
        charged TEXT NOT NULL,
        asset TEXT,
        agent TEXT,
        owner TEXT
      );
      CREATE INDEX IF NOT EXISTS transaction_fees_ledger_idx
        ON transaction_fees (ledger, tx_hash);

      CREATE TABLE IF NOT EXISTS ledger_entries (
        entry_id TEXT PRIMARY KEY,
        event_id TEXT,
        tx_hash TEXT NOT NULL,
        ledger INTEGER NOT NULL,
        ledger_closed_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        reference_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        agent TEXT,
        owner TEXT,
        counterparty TEXT,
        memo TEXT,
        source_asset TEXT NOT NULL,
        source_amount TEXT NOT NULL,
        destination_asset TEXT,
        destination_amount TEXT,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ledger_entries_period_idx
        ON ledger_entries (ledger, entry_id);
      CREATE INDEX IF NOT EXISTS ledger_entries_agent_idx
        ON ledger_entries (agent, ledger, entry_id);
      CREATE INDEX IF NOT EXISTS ledger_entries_owner_idx
        ON ledger_entries (owner, ledger, entry_id);
      CREATE INDEX IF NOT EXISTS ledger_entries_tx_idx
        ON ledger_entries (tx_hash, entry_id);

      CREATE TABLE IF NOT EXISTS ledger_postings (
        posting_id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES ledger_entries(entry_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        account TEXT NOT NULL,
        role TEXT NOT NULL,
        asset TEXT NOT NULL,
        amount TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ledger_postings_account_idx
        ON ledger_postings (account, asset, entry_id);

      CREATE TABLE IF NOT EXISTS ledger_issues (
        issue_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        ledger INTEGER NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ledger_issues_ledger_idx
        ON ledger_issues (ledger, issue_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  checkpoint(stream = "stellaragent"): number | undefined {
    const row = this.db
      .prepare("SELECT next_ledger AS nextLedger FROM checkpoints WHERE stream = ?")
      .get(stream) as { nextLedger: number } | undefined;
    return row?.nextLedger;
  }

  replaceRange(
    fromLedger: number,
    throughLedger: number,
    events: DecodedEvent[],
    stream = "stellaragent",
  ): void {
    if (throughLedger < fromLedger) return;

    const insertEvent = this.db.prepare(`
      INSERT INTO events (
        event_id, contract_kind, contract_address, ledger, ledger_closed_at,
        tx_hash, paging_token, namespace, action, entity_type, entity_id,
        payload_json, topic_xdr_json, value_xdr
      ) VALUES (
        @eventId, @contractKind, @contractAddress, @ledger, @ledgerClosedAt,
        @txHash, @pagingToken, @namespace, @action, @entityType, @entityId,
        @payloadJson, @topicXdrJson, @valueXdr
      )
      ON CONFLICT(event_id) DO UPDATE SET
        contract_kind = excluded.contract_kind,
        contract_address = excluded.contract_address,
        ledger = excluded.ledger,
        ledger_closed_at = excluded.ledger_closed_at,
        tx_hash = excluded.tx_hash,
        paging_token = excluded.paging_token,
        namespace = excluded.namespace,
        action = excluded.action,
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        payload_json = excluded.payload_json,
        topic_xdr_json = excluded.topic_xdr_json,
        value_xdr = excluded.value_xdr
    `);
    const insertParticipant = this.db.prepare(`
      INSERT OR IGNORE INTO event_participants (event_id, address, role)
      VALUES (?, ?, ?)
    `);
    const update = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM events WHERE ledger BETWEEN ? AND ?")
        .run(fromLedger, throughLedger);
      this.db
        .prepare("DELETE FROM transaction_fees WHERE ledger BETWEEN ? AND ?")
        .run(fromLedger, throughLedger);
      for (const event of events) {
        if (event.ledger < fromLedger || event.ledger > throughLedger) continue;
        const target = entity(event);
        insertEvent.run({
          ...event,
          entityType: target.type,
          entityId: target.id,
          payloadJson: JSON.stringify(event),
          topicXdrJson: JSON.stringify(event.rawTopicXdr),
          valueXdr: event.rawValueXdr,
        });
        for (const [address, role] of participants(event)) {
          insertParticipant.run(event.eventId, address, role);
        }
      }
      this.db
        .prepare(`
          INSERT INTO checkpoints (stream, next_ledger, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(stream) DO UPDATE SET
            next_ledger = excluded.next_ledger,
            updated_at = excluded.updated_at
        `)
        .run(stream, throughLedger + 1, new Date().toISOString());
      this.rebuildLedger();
    });
    update();
  }

  /**
   * Upsert confirmed transaction fees and rebuild their balanced network-fee
   * entries. One record per hash makes replay idempotent.
   */
  recordTransactionFees(fees: TransactionFee[]): void {
    const insert = this.db.prepare(`
      INSERT INTO transaction_fees (
        tx_hash, ledger, ledger_closed_at, payer, charged, asset, agent, owner
      ) VALUES (
        @txHash, @ledger, @ledgerClosedAt, @payer, @charged, @asset, @agent, @owner
      )
      ON CONFLICT(tx_hash) DO UPDATE SET
        ledger = excluded.ledger,
        ledger_closed_at = excluded.ledger_closed_at,
        payer = excluded.payer,
        charged = excluded.charged,
        asset = excluded.asset,
        agent = excluded.agent,
        owner = excluded.owner
    `);
    const update = this.db.transaction(() => {
      for (const fee of fees) {
        const charged = BigInt(fee.charged);
        if (charged < 0n) throw new Error(`fee ${fee.txHash} must not be negative`);
        if (!Number.isSafeInteger(fee.ledger) || fee.ledger < 0) {
          throw new Error(`fee ${fee.txHash} has an invalid ledger`);
        }
        insert.run({
          ...fee,
          asset: fee.asset ?? null,
          agent: fee.agent ?? null,
          owner: fee.owner ?? null,
        });
      }
      this.rebuildLedger();
    });
    update();
  }

  /** Query balanced entries in canonical ledger order. */
  ledgerEntries(query: LedgerQuery = {}): LedgerEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (query.fromLedger !== undefined) {
      conditions.push("e.ledger >= ?");
      params.push(query.fromLedger);
    }
    if (query.throughLedger !== undefined) {
      conditions.push("e.ledger <= ?");
      params.push(query.throughLedger);
    }
    if (query.agent !== undefined) {
      conditions.push("e.agent = ?");
      params.push(query.agent);
    }
    if (query.owner !== undefined) {
      conditions.push("e.owner = ?");
      params.push(query.owner);
    }
    if (query.account !== undefined) {
      conditions.push("EXISTS (SELECT 1 FROM ledger_postings p WHERE p.entry_id = e.entry_id AND p.account = ?)");
      params.push(query.account);
    }
    if (query.asset !== undefined) {
      conditions.push("EXISTS (SELECT 1 FROM ledger_postings p WHERE p.entry_id = e.entry_id AND p.asset = ?)");
      params.push(query.asset);
    }
    if (query.kinds?.length) {
      conditions.push(`e.kind IN (${query.kinds.map(() => "?").join(", ")})`);
      params.push(...query.kinds);
    }
    const limit = query.limit ?? 10_000;
    const offset = query.offset ?? 0;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 100_000) {
      throw new Error("ledger query limit must be between 0 and 100000");
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("ledger query offset must be a non-negative integer");
    }

    const rows = this.db.prepare(`
      SELECT e.* FROM ledger_entries e
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY e.ledger, e.entry_id
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<Record<string, unknown>>;
    const postings = this.db.prepare(`
      SELECT * FROM ledger_postings WHERE entry_id = ? ORDER BY ordinal
    `);
    return rows.map((row) => ({
      entryId: row.entry_id as string,
      eventId: row.event_id as string | null,
      txHash: row.tx_hash as string,
      ledger: row.ledger as number,
      ledgerClosedAt: row.ledger_closed_at as string,
      kind: row.kind as LedgerEntryKind,
      referenceType: row.reference_type as LedgerEntry["referenceType"],
      referenceId: row.reference_id as string,
      agent: row.agent as string | null,
      owner: row.owner as string | null,
      counterparty: row.counterparty as string | null,
      memo: row.memo as string | null,
      sourceAsset: row.source_asset as string,
      sourceAmount: row.source_amount as string,
      destinationAsset: row.destination_asset as string | null,
      destinationAmount: row.destination_amount as string | null,
      metadata: JSON.parse(row.metadata_json as string) as LedgerEntry["metadata"],
      postings: (postings.all(row.entry_id) as Array<Record<string, unknown>>).map((item) => ({
        postingId: item.posting_id as string,
        account: item.account as string,
        role: item.role as LedgerEntry["postings"][number]["role"],
        asset: item.asset as string,
        amount: item.amount as string,
      })),
    }));
  }

  /**
   * Iterate an arbitrarily large ledger query in stable pages. Unlike
   * `ledgerEntries`, this has no total-row ceiling.
   */
  *iterateLedgerEntries(
    query: Omit<LedgerQuery, "limit" | "offset"> = {},
    batchSize = 10_000,
  ): Generator<LedgerEntry> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100_000) {
      throw new Error("ledger iteration batchSize must be between 1 and 100000");
    }
    let offset = 0;
    while (true) {
      const batch = this.ledgerEntries({ ...query, limit: batchSize, offset });
      yield* batch;
      if (batch.length < batchSize) return;
      offset += batch.length;
    }
  }

  /** Return retained data-quality findings in canonical order. */
  ledgerIssues(): LedgerIssue[] {
    return (this.db.prepare("SELECT * FROM ledger_issues ORDER BY ledger, issue_id").all() as Array<Record<string, unknown>>)
      .map((row) => ({
        issueId: row.issue_id as string,
        eventId: row.event_id as string,
        txHash: row.tx_hash as string,
        ledger: row.ledger as number,
        code: row.code as LedgerIssue["code"],
        message: row.message as string,
      }));
  }

  /** Reconcile stored activity to caller-supplied on-chain positions. */
  reconcile(request: ReconciliationRequest): ReconciliationResult {
    return reconcileLedger(
      [...this.iterateLedgerEntries({
        ...(request.fromLedger === undefined ? {} : { fromLedger: request.fromLedger }),
        throughLedger: request.asOfLedger,
      })],
      request,
    );
  }

  /** Build an agent/owner statement from the complete normalized history. */
  statement(request: StatementRequest): Statement {
    return buildStatement([...this.iterateLedgerEntries()], request);
  }

  eventsForAgent(address: string): StoredEvent[] {
    return this.rows(`
      SELECT DISTINCT e.* FROM events e
      LEFT JOIN event_participants p ON p.event_id = e.event_id
      WHERE p.address = ?
        OR (
          e.entity_type = 'agent'
          AND e.entity_id IN (
            SELECT created.entity_id
            FROM events created
            JOIN event_participants creator
              ON creator.event_id = created.event_id
            WHERE created.namespace = 'factory'
              AND created.action = 'created'
              AND creator.role = 'agent'
              AND creator.address = ?
          )
        )
      ORDER BY e.ledger, e.paging_token
    `, address, address);
  }

  spendHistory(channelId: string): ChannelSpend {
    const payments = this.rows(`
      SELECT * FROM events
      WHERE entity_type = 'channel' AND entity_id = ?
        AND action IN ('paid', 'convpaid')
      ORDER BY ledger, paging_token
    `, channelId);
    const total = payments.reduce(
      (sum, event) => sum + BigInt((event.payload as { amount: string }).amount),
      0n,
    );
    return { channelId, totalSpent: total.toString(), payments };
  }

  jobLifecycle(jobId: string): JobLifecycle {
    const events = this.rows(`
      SELECT * FROM events
      WHERE entity_type = 'job' AND entity_id = ? AND namespace = 'escrow'
      ORDER BY ledger, paging_token
    `, jobId);
    let status: JobLifecycle["status"] = "Unknown";
    for (const event of events) {
      if (event.action === "created") status = "Open";
      else if (event.action === "accepted") status = "InProgress";
      else if (event.action === "result") status = "PendingRelease";
      else if (event.action === "released") status = "Completed";
      else if (event.action === "refunded") status = "Refunded";
      else if (event.action === "disputed") status = "Disputed";
    }
    return { jobId, status, events };
  }

  allEvents(limit = 100, offset = 0): StoredEvent[] {
    return this.rows(
      "SELECT * FROM events ORDER BY ledger, paging_token LIMIT ? OFFSET ?",
      limit,
      offset,
    );
  }

  /**
   * Row count of the `events` table.
   *
   * Distinct from an indexer's cumulative "events processed" counter: replaying
   * a rollback window re-commits events already stored, so that counter is a
   * measure of ingest work while this is a measure of durable state.
   */
  eventCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS total FROM events").get() as {
      total: number;
    };
    return row.total;
  }

  channelState(channelId: string): unknown | undefined {
    return this.latestSnapshot("channel", "channel", channelId);
  }

  jobState(jobId: string): unknown | undefined {
    return this.latestSnapshot("job", "job", jobId);
  }

  rateLimitState(agent: string): unknown | undefined {
    return this.latestSnapshot("limit", "agent", agent);
  }

  agentInfoState(agentId: string): unknown | undefined {
    return this.latestSnapshot("agent", "agent", agentId);
  }

  private latestSnapshot(
    action: string,
    entityType: string,
    entityId: string,
  ): unknown | undefined {
    const event = this.rows(`
      SELECT * FROM events
      WHERE namespace = 'state' AND action = ?
        AND entity_type = ? AND entity_id = ?
      ORDER BY ledger DESC, paging_token DESC
      LIMIT 1
    `, action, entityType, entityId)[0];
    return event && "state" in event.payload ? event.payload.state : undefined;
  }

  private rebuildLedger(): void {
    const fees = this.db.prepare(`
      SELECT
        tx_hash AS txHash,
        ledger,
        ledger_closed_at AS ledgerClosedAt,
        payer,
        charged,
        asset,
        agent,
        owner
      FROM transaction_fees
      ORDER BY ledger, tx_hash
    `).all() as Array<TransactionFee & { asset: string | null }>;
    const normalized = normalizeLedger(
      this.rows("SELECT * FROM events ORDER BY ledger, paging_token"),
      fees.map((fee) => ({ ...fee, asset: fee.asset ?? undefined })),
    );
    this.db.prepare("DELETE FROM ledger_issues").run();
    this.db.prepare("DELETE FROM ledger_entries").run();
    const insertEntry = this.db.prepare(`
      INSERT INTO ledger_entries (
        entry_id, event_id, tx_hash, ledger, ledger_closed_at, kind,
        reference_type, reference_id, agent, owner, counterparty, memo,
        source_asset, source_amount, destination_asset, destination_amount,
        metadata_json
      ) VALUES (
        @entryId, @eventId, @txHash, @ledger, @ledgerClosedAt, @kind,
        @referenceType, @referenceId, @agent, @owner, @counterparty, @memo,
        @sourceAsset, @sourceAmount, @destinationAsset, @destinationAmount,
        @metadataJson
      )
    `);
    const insertPosting = this.db.prepare(`
      INSERT INTO ledger_postings (
        posting_id, entry_id, ordinal, account, role, asset, amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ledgerEntry of normalized.entries) {
      insertEntry.run({
        ...ledgerEntry,
        metadataJson: JSON.stringify(ledgerEntry.metadata),
      });
      ledgerEntry.postings.forEach((ledgerPosting, ordinal) => {
        insertPosting.run(
          ledgerPosting.postingId,
          ledgerEntry.entryId,
          ordinal,
          ledgerPosting.account,
          ledgerPosting.role,
          ledgerPosting.asset,
          ledgerPosting.amount,
        );
      });
    }
    const insertIssue = this.db.prepare(`
      INSERT INTO ledger_issues (issue_id, event_id, tx_hash, ledger, code, message)
      VALUES (@issueId, @eventId, @txHash, @ledger, @code, @message)
    `);
    for (const ledgerIssue of normalized.issues) insertIssue.run(ledgerIssue);
  }

  private rows(sql: string, ...params: unknown[]): StoredEvent[] {
    const rows = this.db.prepare(sql).all(...params) as Array<
      Record<string, unknown> & { payload_json: string }
    >;
    return rows.map((row) => ({
      eventId: row.event_id as string,
      contractKind: row.contract_kind as StoredEvent["contractKind"],
      contractAddress: row.contract_address as string,
      ledger: row.ledger as number,
      ledgerClosedAt: row.ledger_closed_at as string,
      txHash: row.tx_hash as string,
      pagingToken: row.paging_token as string,
      namespace: row.namespace as StoredEvent["namespace"],
      action: row.action as string,
      entityType: row.entity_type as StoredEvent["entityType"],
      entityId: row.entity_id as string | null,
      payload: JSON.parse(row.payload_json) as DecodedEvent,
    }));
  }
}
