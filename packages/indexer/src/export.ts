import type { Statement, StatementLine } from "./reporting.js";

/** Supported streaming statement representations. */
export type StatementExportFormat = "csv" | "json" | "iif";

export interface StatementExportOptions {
  format: StatementExportFormat;
  /** Defaults to LF. */
  newline?: "\n" | "\r\n";
  /** CSV only; defaults to true. */
  includeHeader?: boolean;
  /** CSV only; useful for spreadsheet consumers. */
  includeBom?: boolean;
}

export interface StatementExportDescriptor {
  format: StatementExportFormat;
  contentType: string;
  extension: string;
  filename: string;
}

export interface VerifiableExportRow {
  schemaVersion: "stellaragent.audit.v1";
  statementId: string;
  subjectType: Statement["subject"]["kind"];
  subjectId: string;
  lineId: string;
  entryId: string;
  eventId: string | null;
  transactionHash: string;
  ledger: number;
  ledgerClosedAt: string;
  paymentType: StatementLine["kind"];
  category: StatementLine["category"];
  direction: StatementLine["direction"];
  counterparty: string | null;
  memo: string | null;
  referenceType: StatementLine["referenceType"];
  referenceId: string;
  asset: string;
  amount: string;
  signedAmount: string;
  destinationAsset: string | null;
  destinationAmount: string | null;
  runningBalance: string;
}

const CSV_COLUMNS: ReadonlyArray<keyof VerifiableExportRow> = [
  "schemaVersion",
  "statementId",
  "subjectType",
  "subjectId",
  "lineId",
  "entryId",
  "eventId",
  "transactionHash",
  "ledger",
  "ledgerClosedAt",
  "paymentType",
  "category",
  "direction",
  "counterparty",
  "memo",
  "referenceType",
  "referenceId",
  "asset",
  "amount",
  "signedAmount",
  "destinationAsset",
  "destinationAmount",
  "runningBalance",
];

function textCell(value: string): string {
  // Quoting does not stop spreadsheet formula evaluation. Preserve the value
  // visibly while making text fields inert when a CSV is opened directly.
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null, textual = true): string {
  const raw = value === null ? "" : String(value);
  const safe = textual ? textCell(raw) : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function row(statement: Statement, line: StatementLine): VerifiableExportRow {
  return {
    schemaVersion: "stellaragent.audit.v1",
    statementId: statement.statementId,
    subjectType: statement.subject.kind,
    subjectId: statement.subject.id,
    lineId: line.lineId,
    entryId: line.entryId,
    eventId: line.eventId,
    transactionHash: line.txHash,
    ledger: line.ledger,
    ledgerClosedAt: line.ledgerClosedAt,
    paymentType: line.kind,
    category: line.category,
    direction: line.direction,
    counterparty: line.counterparty,
    memo: line.memo,
    referenceType: line.referenceType,
    referenceId: line.referenceId,
    asset: line.asset,
    amount: line.amount,
    signedAmount: line.signedAmount,
    destinationAsset: line.destinationAsset,
    destinationAmount: line.destinationAmount,
    runningBalance: line.runningBalance,
  };
}

function csvRow(value: VerifiableExportRow): string {
  return CSV_COLUMNS.map((column) =>
    csvCell(value[column], !["ledger", "amount", "signedAmount", "destinationAmount", "runningBalance"].includes(column)),
  ).join(",");
}

function iifCell(value: string | number | null): string {
  return value === null ? "" : String(value).replace(/[\t\r\n]+/g, " ");
}

const IIF_COLUMNS = [
  "ROWTYPE",
  "TRNSTYPE",
  "DATE",
  "ACCNT",
  "AMOUNT",
  "DOCNUM",
  "MEMO",
  "TXHASH",
  "LEDGER",
  "LINEID",
];

function iifDate(value: string): string {
  const date = new Date(value);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

function iifAccount(statement: Statement, line: StatementLine): string {
  return `${statement.subject.kind}:${statement.subject.id}:${line.asset}`;
}

function iifOffset(line: StatementLine): string {
  return `StellarAgent:${line.category}:${line.counterparty ?? "uncategorized"}:${line.asset}`;
}

function iifDataRow(
  type: "TRNS" | "SPL" | "ENDTRNS",
  statement: Statement,
  line: StatementLine,
): string {
  const amount = BigInt(line.signedAmount);
  const values: Array<string | number | null> = type === "ENDTRNS"
    ? [type, "GENERAL", iifDate(line.ledgerClosedAt), "", "0", line.referenceId, "end transaction", line.txHash, line.ledger, line.lineId]
    : [
        type,
        "GENERAL",
        iifDate(line.ledgerClosedAt),
        type === "TRNS" ? iifAccount(statement, line) : iifOffset(line),
        (type === "TRNS" ? amount : -amount).toString(),
        line.referenceId,
        line.memo ?? `${line.kind} ${line.entryId}`,
        line.txHash,
        line.ledger,
        line.lineId,
      ];
  return values.map(iifCell).join("\t");
}

/** File metadata for HTTP responses and scheduled-delivery attachments. */
export function describeStatementExport(
  statement: Statement,
  format: StatementExportFormat,
): StatementExportDescriptor {
  const safeId = statement.statementId.replace(/[^A-Za-z0-9_.-]+/g, "_");
  switch (format) {
    case "csv":
      return { format, contentType: "text/csv; charset=utf-8", extension: "csv", filename: `${safeId}.csv` };
    case "json":
      return { format, contentType: "application/x-ndjson; charset=utf-8", extension: "jsonl", filename: `${safeId}.jsonl` };
    case "iif":
      return { format, contentType: "text/tab-separated-values; charset=utf-8", extension: "iif", filename: `${safeId}.iif` };
  }
}

/**
 * Stream an export one row at a time. No whole-file buffer is constructed;
 * consumers can pipe chunks directly to disk, HTTP, object storage, or mail.
 */
export async function* streamStatementExport(
  statement: Statement,
  options: StatementExportOptions,
): AsyncGenerator<string> {
  const newline = options.newline ?? "\n";
  if (options.format === "csv") {
    if (options.includeBom) yield "\uFEFF";
    if (options.includeHeader ?? true) {
      yield `${CSV_COLUMNS.map((column) => csvCell(column)).join(",")}${newline}`;
    }
    for (const line of statement.lines) yield `${csvRow(row(statement, line))}${newline}`;
    return;
  }
  if (options.format === "json") {
    for (const line of statement.lines) {
      yield `${JSON.stringify(row(statement, line))}${newline}`;
    }
    return;
  }

  yield `${IIF_COLUMNS.map((column) => `!${column}`).join("\t")}${newline}`;
  for (const line of statement.lines) {
    // All three IIF data rows repeat hash, ledger, and line ID. A split or
    // terminator copied out of context therefore remains independently linked.
    yield `${iifDataRow("TRNS", statement, line)}${newline}`;
    yield `${iifDataRow("SPL", statement, line)}${newline}`;
    yield `${iifDataRow("ENDTRNS", statement, line)}${newline}`;
  }
}

/** Convenience collector for small interactive previews and tests. */
export async function collectStatementExport(
  statement: Statement,
  options: StatementExportOptions,
): Promise<string> {
  let result = "";
  for await (const chunk of streamStatementExport(statement, options)) result += chunk;
  return result;
}
