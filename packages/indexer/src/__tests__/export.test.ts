import { describe, expect, it } from "vitest";
import {
  collectStatementExport,
  describeStatementExport,
  streamStatementExport,
} from "../export.js";
import type { LedgerEntry } from "../ledger.js";
import { buildStatement, type Statement } from "../reporting.js";

const AGENT = "GAGENT";
const USDC = "CUSDC";

function entry(index: number, memo = "invoice"): LedgerEntry {
  return {
    entryId: `entry-${index}`,
    eventId: `event-${index}`,
    txHash: `abcdef${String(index).padStart(58, "0")}`,
    ledger: 100 + index,
    ledgerClosedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    kind: index % 2 === 0 ? "channel_payment" : "channel_conversion",
    referenceType: "channel",
    referenceId: "channel-7",
    agent: AGENT,
    owner: "GOWNER",
    counterparty: "GRECIPIENT",
    memo,
    sourceAsset: USDC,
    sourceAmount: String(index + 1),
    destinationAsset: index % 2 === 0 ? null : "CEURC",
    destinationAmount: index % 2 === 0 ? null : String((index + 1) * 5),
    postings: [],
    metadata: {},
  };
}

function statement(count = 2, memo?: string): Statement {
  return buildStatement(
    Array.from({ length: count }, (_, index) => entry(index, memo)),
    {
      subject: { kind: "agent", id: AGENT },
      period: { fromLedger: 100, throughLedger: 100 + count },
      openingPositions: [{ asset: USDC, amount: "1000000" }],
    },
  );
}

describe("statement exports", () => {
  it("writes RFC 4180 CSV with evidence on every data row", async () => {
    const report = statement(2, 'invoice, "quoted"');
    const output = await collectStatementExport(report, { format: "csv" });
    const rows = output.trimEnd().split("\n");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('"transactionHash","ledger"');
    report.lines.forEach((line, index) => {
      expect(rows[index + 1]).toContain(`"${line.txHash}","${line.ledger}"`);
      expect(rows[index + 1]).toContain('"invoice, ""quoted""');
    });
  });

  it("neutralizes spreadsheet formulas in textual CSV cells", async () => {
    const report = statement(1, "=HYPERLINK(\"https://example.invalid\")");
    report.subject.id = "+SUM(A1:A2)";
    const output = await collectStatementExport(report, { format: "csv" });

    expect(output).toContain('"\'+SUM(A1:A2)"');
    expect(output).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    // Numeric signed values retain their accounting sign.
    expect(output).toContain('"-1"');
  });

  it("writes one independently verifiable JSON object per line", async () => {
    const report = statement();
    const output = await collectStatementExport(report, { format: "json" });
    const values = output.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({
      schemaVersion: "stellaragent.audit.v1",
      statementId: report.statementId,
      transactionHash: report.lines[0].txHash,
      ledger: report.lines[0].ledger,
      entryId: report.lines[0].entryId,
      eventId: report.lines[0].eventId,
    });
    expect(values[1]).toMatchObject({
      destinationAsset: "CEURC",
      destinationAmount: "10",
    });
  });

  it("writes balanced IIF transaction/split rows with evidence repeated", async () => {
    const report = statement(1);
    const output = await collectStatementExport(report, { format: "iif" });
    const rows = output.trimEnd().split("\n");

    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("!TXHASH\t!LEDGER\t!LINEID");
    const data = rows.slice(1).map((value) => value.split("\t"));
    expect(data.map((value) => value[0])).toEqual(["TRNS", "SPL", "ENDTRNS"]);
    for (const value of data) {
      expect(value[7]).toBe(report.lines[0].txHash);
      expect(value[8]).toBe(String(report.lines[0].ledger));
      expect(value[9]).toBe(report.lines[0].lineId);
    }
    expect(BigInt(data[0][4]) + BigInt(data[1][4])).toBe(0n);
  });

  it("describes safe attachment metadata", () => {
    const report = statement(1);
    report.statementId = "statement:agent:G/unsafe";

    expect(describeStatementExport(report, "csv")).toEqual({
      format: "csv",
      contentType: "text/csv; charset=utf-8",
      extension: "csv",
      filename: "statement_agent_G_unsafe.csv",
    });
    expect(describeStatementExport(report, "json").extension).toBe("jsonl");
    expect(describeStatementExport(report, "iif").extension).toBe("iif");
  });

  it("supports BOM, CRLF, and header-free CSV previews", async () => {
    const report = statement(1);
    const output = await collectStatementExport(report, {
      format: "csv",
      includeBom: true,
      includeHeader: false,
      newline: "\r\n",
    });

    expect(output.startsWith("\uFEFF")).toBe(true);
    expect(output.endsWith("\r\n")).toBe(true);
    expect(output).not.toContain('"schemaVersion","statementId"');
  });

  it("streams large ranges in bounded row chunks", async () => {
    const report = statement(25_000);
    let chunks = 0;
    let bytes = 0;
    let largest = 0;
    for await (const chunk of streamStatementExport(report, { format: "json" })) {
      chunks += 1;
      bytes += Buffer.byteLength(chunk);
      largest = Math.max(largest, Buffer.byteLength(chunk));
    }

    expect(chunks).toBe(25_000);
    expect(bytes).toBeGreaterThan(10_000_000);
    expect(largest).toBeLessThan(2_000);
  });

  it("is deterministic for identical statement inputs", async () => {
    const report = statement(10);
    await expect(collectStatementExport(report, { format: "csv" })).resolves.toBe(
      await collectStatementExport(report, { format: "csv" }),
    );
    await expect(collectStatementExport(report, { format: "json" })).resolves.toBe(
      await collectStatementExport(report, { format: "json" }),
    );
    await expect(collectStatementExport(report, { format: "iif" })).resolves.toBe(
      await collectStatementExport(report, { format: "iif" }),
    );
  });
});
