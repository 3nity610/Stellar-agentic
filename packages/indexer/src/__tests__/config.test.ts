import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../config.js";

const base = {
  SOROBAN_RPC_URL: "http://localhost:8000/soroban/rpc",
  INDEXER_START_LEDGER: "1",
  PAYMENT_CHANNEL_CONTRACT: "CPAYMENT",
  ESCROW_CONTRACT: "CESCROW",
  RATE_LIMITER_CONTRACT: "CRATE",
  AGENT_WALLET_FACTORY_CONTRACT: "CFACTORY",
};

describe("indexer report configuration", () => {
  it("enables the worker with a separate durable database by default", () => {
    expect(loadEnvironment({ ...base, INDEXER_DATABASE: "events.sqlite" }))
      .toMatchObject({
        databasePath: "events.sqlite",
        reportDatabasePath: "events.sqlite.reports",
        reportWorkerEnabled: true,
        reportPollIntervalMs: 5_000,
        corsOrigin: "*",
      });
  });

  it("loads report worker, CORS, and email gateway overrides", () => {
    expect(loadEnvironment({
      ...base,
      REPORT_DATABASE: "delivery.sqlite",
      REPORT_WORKER_ENABLED: "no",
      REPORT_POLL_INTERVAL_MS: "250",
      REPORT_EMAIL_GATEWAY_URL: "https://mail.example.test/send",
      REPORT_EMAIL_GATEWAY_TOKEN: "secret-token",
      AUDIT_API_CORS_ORIGIN: "https://dashboard.example.test",
    })).toMatchObject({
      reportDatabasePath: "delivery.sqlite",
      reportWorkerEnabled: false,
      reportPollIntervalMs: 250,
      reportEmailGatewayUrl: "https://mail.example.test/send",
      reportEmailGatewayToken: "secret-token",
      corsOrigin: "https://dashboard.example.test",
    });
  });

  it("rejects ambiguous booleans and a busy loop", () => {
    expect(() => loadEnvironment({ ...base, REPORT_WORKER_ENABLED: "sometimes" }))
      .toThrow("REPORT_WORKER_ENABLED");
    expect(() => loadEnvironment({ ...base, REPORT_POLL_INTERVAL_MS: "0" }))
      .toThrow("greater than zero");
  });
});
