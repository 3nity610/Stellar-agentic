export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LoggerOptions {
  level?: LogLevel;
  output?: (entry: LogEntry) => void;
}

export class Logger {
  private level: LogLevel;
  private readonly output: (entry: LogEntry) => void;

  constructor(options: LoggerOptions = {}) {
    const envLevel = (
      process.env.LOG_LEVEL ??
      process.env.INDEXER_LOG_LEVEL ??
      "info"
    ).toLowerCase() as LogLevel;
    this.level = options.level ?? (envLevel in LEVEL_PRIORITY ? envLevel : "info");
    this.output = options.output ?? this.defaultOutput;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setLevel(level: LogLevel): void {
    if (level in LEVEL_PRIORITY) {
      this.level = level;
    }
  }

  private isLevelEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private defaultOutput(entry: LogEntry): void {
    const formatted = JSON.stringify(entry);
    if (entry.level === "error" || entry.level === "warn") {
      process.stderr.write(`${formatted}\n`);
    } else {
      process.stdout.write(`${formatted}\n`);
    }
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.isLevelEnabled(level)) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };
    this.output(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}

export const logger = new Logger();
