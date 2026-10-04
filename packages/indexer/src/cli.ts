#!/usr/bin/env node
import { createQueryServer } from "./api.js";
import { loadEnvironment } from "./config.js";
import {
  EmailReportTransport,
  HttpEmailSender,
  ReportDeliveryStore,
  ScheduledReportService,
  WebhookReportTransport,
  eventStoreArtifactBuilder,
  type EmailSender,
} from "./delivery.js";
import { SorobanEventIndexer } from "./indexer.js";
import { logger } from "./logger.js";
import { EventStore } from "./store.js";

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function runReportWorker(
  service: ScheduledReportService,
  pollIntervalMs: number,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const result = await service.tick();
      if (Object.values(result).some((value) => value > 0)) {
        logger.info("Report worker completed tick", { result });
      }
    } catch (error) {
      logger.error("Report worker tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await delay(pollIntervalMs, signal);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "tail";
  if (command !== "catch-up" && command !== "tail") {
    throw new Error(
      "usage: stellaragent-indexer [catch-up|tail] [--from-ledger N]",
    );
  }
  const fromIndex = process.argv.indexOf("--from-ledger");
  const config = loadEnvironment();
  const fromLedger = fromIndex === -1 ? config.fromLedger : Number(process.argv[fromIndex + 1]);
  if (
    fromLedger !== undefined &&
    (!Number.isSafeInteger(fromLedger) || fromLedger < 1)
  ) {
    throw new Error("--from-ledger must be a positive integer");
  }
  const store = new EventStore(config.databasePath);
  const indexer = new SorobanEventIndexer({
    rpcUrl: config.rpcUrl,
    store,
    contracts: config.contracts,
    startLedger: config.startLedger,
    rollbackWindow: config.rollbackWindow,
    finalityLag: config.finalityLag,
    pollIntervalMs: config.pollIntervalMs,
  });

  const result = await indexer.catchUp(fromLedger);
  logger.info("Catch-up completed", {
    eventCount: result.eventCount,
    throughLedger: result.throughLedger,
    fromLedger: result.fromLedger,
  });
  if (command === "catch-up") {
    store.close();
    return;
  }

  const deliveryStore = new ReportDeliveryStore(config.reportDatabasePath);
  const server = createQueryServer(store, {
    deliveryStore,
    corsOrigin: config.corsOrigin,
    progress: () => indexer.progressReporter.snapshot(),
  });
  server.listen(config.port, () => {
    logger.info("Audit API server listening", {
      port: config.port,
      healthUrl: `http://localhost:${config.port}/health`,
      metricsUrl: `http://localhost:${config.port}/metrics`,
    });
  });
  const controller = new AbortController();
  const missingEmailGateway: EmailSender = {
    async send() {
      throw new Error("REPORT_EMAIL_GATEWAY_URL is required for email destinations");
    },
  };
  const emailSender = config.reportEmailGatewayUrl
    ? new HttpEmailSender(
        config.reportEmailGatewayUrl,
        config.reportEmailGatewayToken,
      )
    : missingEmailGateway;
  const reportService = new ScheduledReportService({
    store: deliveryStore,
    artifactBuilder: eventStoreArtifactBuilder(store),
    transports: {
      webhook: new WebhookReportTransport(),
      email: new EmailReportTransport(emailSender),
    },
  });

  let isShuttingDown = false;
  const shutdown = (signalName: string): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info("Graceful shutdown initiated", { signal: signalName });
    controller.abort();
    indexer.stop();
    const currentCheckpoint = store.checkpoint();
    logger.info("Checkpoint verified on shutdown", { checkpoint: currentCheckpoint });
    server.close(() => {
      deliveryStore.close();
      store.close();
      logger.info("Graceful shutdown complete, all resources closed");
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  await Promise.all([
    indexer.liveTail(controller.signal),
    ...(config.reportWorkerEnabled
      ? [runReportWorker(
          reportService,
          config.reportPollIntervalMs,
          controller.signal,
        )]
      : []),
  ]);
}

main().catch((error: unknown) => {
  logger.error("Fatal error during indexer execution", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exitCode = 1;
});
