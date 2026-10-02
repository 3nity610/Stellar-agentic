import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import {
  type DeliveryStatus,
  type ReportDelivery,
  type ReportDeliveryStore,
  type ReportDestination,
  type ReportSchedule,
  type ReportScheduleInput,
} from "./delivery.js";
import {
  describeStatementExport,
  streamStatementExport,
  type StatementExportFormat,
} from "./export.js";
import type { ReconciliationRequest } from "./ledger.js";
import {
  METRICS_CONTENT_TYPE,
  renderPrometheusMetrics,
  type IndexerProgress,
} from "./progress.js";
import type { StatementPeriod } from "./reporting.js";
import type { EventStore } from "./store.js";

const DELIVERY_STATUSES = new Set<DeliveryStatus>([
  "pending",
  "delivering",
  "retry",
  "delivered",
  "dead_letter",
]);

export interface QueryServerOptions {
  /** Durable report scheduling repository. Scheduling routes return 503 when omitted. */
  deliveryStore?: ReportDeliveryStore;
  /** Access-Control-Allow-Origin value. Defaults to `*` for a separately hosted dashboard. */
  corsOrigin?: string;
  /** Maximum accepted JSON request size. Defaults to 1 MiB. */
  maxRequestBytes?: number;
  /**
   * Live ingest progress, normally the running indexer's own reporter. It is
   * the only source of lag, throughput, and last-error state; without it
   * `/health` and `/metrics` still answer from the store's checkpoint, but
   * report lag as `null` rather than guessing zero.
   */
  progress?: () => IndexerProgress;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendText(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.statusCode = status;
  response.setHeader("content-type", contentType);
  response.end(body);
}

function numericParameter(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new HttpError(400, `${name} must be a non-negative integer`);
  }
  return parsed;
}

function statementPeriod(url: URL): StatementPeriod {
  const fromLedger = numericParameter(url, "fromLedger");
  const throughLedger = numericParameter(url, "throughLedger");
  return {
    ...(fromLedger === undefined ? {} : { fromLedger }),
    ...(throughLedger === undefined ? {} : { throughLedger }),
    ...(url.searchParams.has("fromTimestamp")
      ? { fromTimestamp: url.searchParams.get("fromTimestamp")! }
      : {}),
    ...(url.searchParams.has("throughTimestamp")
      ? { throughTimestamp: url.searchParams.get("throughTimestamp")! }
      : {}),
  };
}

async function readJson(
  request: IncomingMessage,
  maxRequestBytes: number,
): Promise<unknown> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0];
  if (contentType !== "application/json") {
    throw new HttpError(415, "content-type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxRequestBytes) throw new HttpError(413, "request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "request body must contain valid JSON");
  }
}

function publicDestination(destination: ReportDestination): ReportDestination {
  if (destination.kind !== "webhook") return destination;
  return {
    id: destination.id,
    kind: destination.kind,
    url: destination.url,
  };
}

function publicSchedule(schedule: ReportSchedule): ReportSchedule {
  return {
    ...schedule,
    destinations: schedule.destinations.map(publicDestination),
  };
}

function publicDelivery(delivery: ReportDelivery): ReportDelivery {
  return {
    ...delivery,
    destination: publicDestination(delivery.destination),
  };
}

function schedulingStore(options: QueryServerOptions): ReportDeliveryStore {
  if (!options.deliveryStore) {
    throw new HttpError(503, "report scheduling is not configured");
  }
  return options.deliveryStore;
}

/**
 * Progress for a query server that was not handed a reporter.
 *
 * Every count is a real zero, but lag stays `null` rather than `0`: "no
 * progress recorded" and "caught up" are different facts and collapsing them
 * would make a replica with no reporter look perfectly healthy.
 */
function unknownProgress(): IndexerProgress {
  return {
    started: false,
    uptimeSeconds: 0,
    healthy: true,
    consecutiveFailures: 0,
    runs: 0,
    successfulRuns: 0,
    latestLedger: null,
    indexedThroughLedger: null,
    lagLedgers: null,
    eventsProcessed: 0,
    decodeFailures: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    lastRunDurationMs: null,
    lastError: null,
    lastErrorAt: null,
    rollbackWindow: 0,
    finalityLag: 0,
  };
}

function inputResult<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : String(error));
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: EventStore,
  options: QueryServerOptions,
): Promise<void> {
  response.setHeader("access-control-allow-origin", options.corsOrigin ?? "*");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("vary", "Origin");
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/metrics") {
    sendText(response, 200, METRICS_CONTENT_TYPE, renderPrometheusMetrics({
      progress: options.progress?.() ?? unknownProgress(),
      store: {
        eventsStored: store.eventCount(),
        ledgerIssues: store.ledgerIssues().length,
      },
      ...(options.deliveryStore
        ? {
            delivery: {
              schedules: options.deliveryStore.schedules().length,
              deadLetters: options.deliveryStore.deliveries("dead_letter").length,
            },
          }
        : {}),
    }));
    return;
  }

  let match = url.pathname.match(
    /^\/reports\/statements\/(agent|owner)\/([^/]+)\/export$/,
  );
  if (request.method === "GET" && match) {
    const requestedFormat = url.searchParams.get("format") ?? "csv";
    if (!(["csv", "json", "iif"] as const).includes(requestedFormat as StatementExportFormat)) {
      throw new HttpError(400, "format must be csv, json, or iif");
    }
    const statement = store.statement({
      subject: {
        kind: match[1] as "agent" | "owner",
        id: decodeURIComponent(match[2]),
      },
      period: statementPeriod(url),
    });
    const format = requestedFormat as StatementExportFormat;
    const descriptor = describeStatementExport(statement, format);
    response.statusCode = 200;
    response.setHeader("content-type", descriptor.contentType);
    response.setHeader(
      "content-disposition",
      `attachment; filename="${descriptor.filename}"`,
    );
    for await (const chunk of streamStatementExport(statement, { format })) {
      if (!response.write(chunk)) {
        await new Promise<void>((resolve) => response.once("drain", resolve));
      }
    }
    response.end();
    return;
  }

  match = url.pathname.match(/^\/reports\/statements\/(agent|owner)\/([^/]+)$/);
  if (request.method === "POST" && match) {
    const input = await readJson(
      request,
      options.maxRequestBytes ?? 1024 * 1024,
    ) as ReconciliationRequest;
    const requestedPeriod = statementPeriod(url);
    if (
      requestedPeriod.fromLedger !== undefined &&
      input.fromLedger !== undefined &&
      requestedPeriod.fromLedger !== input.fromLedger
    ) {
      throw new HttpError(400, "statement and reconciliation opening ledgers must match");
    }
    if (
      requestedPeriod.throughLedger !== undefined &&
      requestedPeriod.throughLedger !== input.asOfLedger
    ) {
      throw new HttpError(400, "statement closing ledger must equal reconciliation asOfLedger");
    }
    const period: StatementPeriod = {
      ...requestedPeriod,
      ...(requestedPeriod.fromLedger === undefined && input.fromLedger !== undefined
        ? { fromLedger: input.fromLedger }
        : {}),
      ...(requestedPeriod.throughLedger === undefined
        ? { throughLedger: input.asOfLedger }
        : {}),
    };
    const reconciliation = inputResult(() => store.reconcile({
      ...input,
      ...(input.fromLedger === undefined && period.fromLedger !== undefined
        ? { fromLedger: period.fromLedger }
        : {}),
    }));
    const result = store.statement({
      subject: {
        kind: match[1] as "agent" | "owner",
        id: decodeURIComponent(match[2]),
      },
      period,
      reconciliation,
    });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/reports/schedules") {
    sendJson(response, 200, schedulingStore(options).schedules().map(publicSchedule));
    return;
  }
  if (request.method === "POST" && url.pathname === "/reports/schedules") {
    const input = await readJson(request, options.maxRequestBytes ?? 1024 * 1024);
    const schedule = inputResult(() =>
      schedulingStore(options).saveSchedule(input as ReportScheduleInput));
    sendJson(response, 201, publicSchedule(schedule));
    return;
  }
  if (request.method === "GET" && url.pathname === "/reports/deliveries") {
    const requestedStatus = url.searchParams.get("status");
    if (requestedStatus !== null && !DELIVERY_STATUSES.has(requestedStatus as DeliveryStatus)) {
      throw new HttpError(400, "invalid delivery status");
    }
    const deliveries = schedulingStore(options)
      .deliveries(requestedStatus as DeliveryStatus | undefined)
      .map(publicDelivery);
    sendJson(response, 200, deliveries);
    return;
  }
  match = url.pathname.match(/^\/reports\/deliveries\/([^/]+)\/replay$/);
  if (request.method === "POST" && match) {
    const deliveryStore = schedulingStore(options);
    const deliveryId = decodeURIComponent(match[1]);
    deliveryStore.replayDeadLetter(deliveryId, new Date().toISOString());
    const delivery = deliveryStore.deliveries().find((item) => item.deliveryId === deliveryId);
    sendJson(response, 202, delivery ? publicDelivery(delivery) : { deliveryId });
    return;
  }

  let result: unknown;
  match = url.pathname.match(/^\/agents\/([^/]+)\/events$/);
  if (request.method === "GET" && match) {
    result = store.eventsForAgent(decodeURIComponent(match[1]));
  } else if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/channels\/([^/]+)\/spend$/))
  ) {
    result = store.spendHistory(decodeURIComponent(match[1]));
  } else if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/jobs\/([^/]+)\/lifecycle$/))
  ) {
    result = store.jobLifecycle(decodeURIComponent(match[1]));
  } else if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/channels\/([^/]+)\/state$/))
  ) {
    result = store.channelState(decodeURIComponent(match[1])) ?? null;
  } else if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/jobs\/([^/]+)\/state$/))
  ) {
    result = store.jobState(decodeURIComponent(match[1])) ?? null;
  } else if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/rate-limits\/([^/]+)\/state$/))
  ) {
    result = store.rateLimitState(decodeURIComponent(match[1])) ?? null;
  } else if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/agent-info\/([^/]+)\/state$/))
  ) {
    result = store.agentInfoState(decodeURIComponent(match[1])) ?? null;
  } else if (request.method === "GET" && url.pathname === "/events") {
    const limit = Math.min(numericParameter(url, "limit") ?? 100, 1_000);
    const offset = numericParameter(url, "offset") ?? 0;
    result = store.allEvents(limit, offset);
  } else if (request.method === "GET" && url.pathname === "/ledger") {
    const fromLedger = numericParameter(url, "fromLedger");
    const throughLedger = numericParameter(url, "throughLedger");
    result = store.ledgerEntries({
      ...(fromLedger === undefined ? {} : { fromLedger }),
      ...(throughLedger === undefined ? {} : { throughLedger }),
      ...(url.searchParams.has("agent") ? { agent: url.searchParams.get("agent")! } : {}),
      ...(url.searchParams.has("owner") ? { owner: url.searchParams.get("owner")! } : {}),
      ...(url.searchParams.has("account") ? { account: url.searchParams.get("account")! } : {}),
      ...(url.searchParams.has("asset") ? { asset: url.searchParams.get("asset")! } : {}),
      limit: Math.min(numericParameter(url, "limit") ?? 1_000, 100_000),
      offset: numericParameter(url, "offset") ?? 0,
    });
  } else if (request.method === "GET" && url.pathname === "/ledger/issues") {
    result = store.ledgerIssues();
  } else if (
    request.method === "GET" &&
    (match = url.pathname.match(/^\/reports\/statements\/(agent|owner)\/([^/]+)$/))
  ) {
    result = store.statement({
      subject: {
        kind: match[1] as "agent" | "owner",
        id: decodeURIComponent(match[2]),
      },
      period: statementPeriod(url),
    });
  } else if (request.method === "GET" && url.pathname === "/health") {
    const progress = options.progress?.() ?? unknownProgress();
    result = {
      // `ok` stays a process-level answer so a liveness probe never flaps on a
      // transient RPC blip; `progress.healthy` carries the ingest-loop verdict
      // and is what an alert should fire on.
      ok: true,
      status: progress.healthy ? "ok" : "degraded",
      nextLedger: store.checkpoint() ?? null,
      lagLedgers: progress.lagLedgers,
      latestLedger: progress.latestLedger,
      indexedThroughLedger: progress.indexedThroughLedger,
      eventsProcessed: progress.eventsProcessed,
      eventsStored: store.eventCount(),
      decodeFailures: progress.decodeFailures,
      lastRunAt: progress.lastRunAt,
      lastSuccessAt: progress.lastSuccessAt,
      lastRunDurationMs: progress.lastRunDurationMs,
      lastError: progress.lastError,
      lastErrorAt: progress.lastErrorAt,
      runs: progress.runs,
      successfulRuns: progress.successfulRuns,
      consecutiveFailures: progress.consecutiveFailures,
      rollbackWindowLedgers: progress.rollbackWindow,
      finalityLagLedgers: progress.finalityLag,
      ledgerIssues: store.ledgerIssues().length,
      ...(options.deliveryStore
        ? {
            reportSchedules: options.deliveryStore.schedules().length,
            deadLetterDeliveries: options.deliveryStore.deliveries("dead_letter").length,
          }
        : {}),
    };
  } else {
    throw new HttpError(404, "not found");
  }
  sendJson(response, 200, result);
}

/** Read-only audit API plus optional durable scheduling administration routes. */
export function createQueryServer(
  store: EventStore,
  options: QueryServerOptions = {},
): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, store, options).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      sendJson(
        response,
        error instanceof HttpError ? error.status : 500,
        { error: error instanceof Error ? error.message : String(error) },
      );
    });
  });
}
