import { describe, expect, it } from "vitest";
import { Logger, createLogger, type LogEntry } from "../logger.js";

describe("Logger", () => {
  it("formats log entries with timestamp, level, and message", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger({
      level: "info",
      output: (entry) => entries.push(entry),
    });

    logger.info("Test message", { key: "value" });

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("Test message");
    expect(entries[0].context).toEqual({ key: "value" });
    expect(typeof entries[0].timestamp).toBe("string");
    expect(Date.parse(entries[0].timestamp)).toBeGreaterThan(0);
  });

  it("filters messages below the active log level", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger({
      level: "warn",
      output: (entry) => entries.push(entry),
    });

    logger.debug("Debug message");
    logger.info("Info message");
    logger.warn("Warn message");
    logger.error("Error message");

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.level)).toEqual(["warn", "error"]);
  });

  it("updates log level dynamically with setLevel", () => {
    const entries: LogEntry[] = [];
    const logger = new Logger({
      level: "error",
      output: (entry) => entries.push(entry),
    });

    logger.info("Should not appear");
    expect(entries).toHaveLength(0);

    logger.setLevel("debug");
    expect(logger.getLevel()).toBe("debug");

    logger.debug("Debug now appears");
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("Debug now appears");
  });

  it("createLogger creates independent logger instances", () => {
    const entries1: LogEntry[] = [];
    const entries2: LogEntry[] = [];

    const logger1 = createLogger({
      level: "debug",
      output: (e) => entries1.push(e),
    });
    const logger2 = createLogger({
      level: "error",
      output: (e) => entries2.push(e),
    });

    logger1.info("Info for 1");
    logger2.info("Info for 2");

    expect(entries1).toHaveLength(1);
    expect(entries2).toHaveLength(0);
  });
});
