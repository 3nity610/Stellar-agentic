/** Stable machine-readable codes for StellarAgent failures. */
export type StellarAgentErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NO_ACTIVE_CHANNEL'
  | 'NO_ROUTE'
  | 'QUOTE_EXPIRED'
  | 'INVALID_ROUTE_OVERRIDE'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'VENUE_UNAVAILABLE'
  | 'SPEND_LIMIT_EXCEEDED'
  | 'CHANNEL_NOT_FOUND'
  | 'CHANNEL_CLOSED'
  | 'JOB_NOT_FOUND'
  | 'JOB_NOT_OPEN'
  | 'JOB_EXPIRED'
  | 'NOT_AUTHORIZED'
  | 'RATE_LIMIT_NOT_FOUND'
  | 'CONTRACT_ERROR'
  | 'SIMULATION_FAILED'
  | 'SUBMISSION_FAILED'
  | 'TRANSACTION_FAILED'
  | 'TRANSACTION_TIMEOUT'
  | 'NETWORK_ERROR';

/** Error thrown for SDK validation, Soroban RPC, and contract failures. */
export class StellarAgentError extends Error {
  readonly code: StellarAgentErrorCode;
  readonly cause?: unknown;
  readonly transactionHash?: string;
  /** Number of attempts made before this error was surfaced. */
  readonly attempts?: number;

  constructor(
    code: StellarAgentErrorCode,
    message: string,
    options: { cause?: unknown; transactionHash?: string; attempts?: number } = {},
  ) {
    super(message);
    this.name = 'StellarAgentError';
    this.code = code;
    this.cause = options.cause;
    this.transactionHash = options.transactionHash;
    this.attempts = options.attempts;
  }
}
