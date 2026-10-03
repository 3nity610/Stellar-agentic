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

/**
 * Base for documentation links embedded in error messages.
 *
 * Pinned to `main` on the canonical repository — the same base
 * `typedoc.json`'s `sourceLinkTemplate` uses — so a message pasted into an
 * issue, a log aggregator, or a support thread still resolves for whoever
 * reads it, rather than depending on the reader having a checkout.
 */
const DOCS_BASE =
  'https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/';

/** What a caller should do next about a given error code. */
interface Remedy {
  /** Imperative next step, rendered on its own line under the message. */
  readonly hint: string;
  /** Repo-relative doc path, with anchor, appended to {@link DOCS_BASE}. */
  readonly doc: string;
}

/**
 * The codes whose fix is knowable from the code alone.
 *
 * The rest are deliberately absent. `INVALID_ARGUMENT`, `CHANNEL_CLOSED`,
 * `JOB_NOT_FOUND`, `JOB_NOT_OPEN`, `JOB_EXPIRED`, `CHANNEL_NOT_FOUND` and
 * `CONTRACT_ERROR` report a fact about the request or about chain state, and
 * what to do about it depends on what the caller was trying to do. A generic
 * "see the docs" line under those is noise, and noise is what stops people
 * reading the lines that do carry a fix.
 */
const REMEDIES: Partial<Record<StellarAgentErrorCode, Remedy>> = {
  NO_ACTIVE_CHANNEL: {
    hint: 'Open one with openChannel(), or pass an explicit channelId to this call.',
    doc: 'docs/api/core/classes/StellarAgent.md#openchannel',
  },
  SPEND_LIMIT_EXCEEDED: {
    hint:
      'Check the remaining budget with getSpendReport(), then either wait for the ' +
      'window to reset or raise the ceiling with setRateLimits().',
    doc: 'docs/api/core/classes/StellarAgent.md#getspendreport',
  },
  RATE_LIMIT_NOT_FOUND: {
    hint: 'No limits are configured for this agent yet — call setRateLimits() once first.',
    doc: 'docs/api/core/classes/StellarAgent.md#setratelimits',
  },
  NOT_AUTHORIZED: {
    hint:
      'The signer did not match the address the contract expects. Confirm which ' +
      'signer backend is in use and which key it holds.',
    doc: 'docs/signing.md#choosing-a-backend',
  },
  TRANSACTION_TIMEOUT: {
    hint:
      'The transaction expired before inclusion — usually the fee under congestion. ' +
      'Review the fee strategy and queue sizing.',
    doc: 'docs/fleet-tuning.md#fee-selection-and-congestion',
  },
  NETWORK_ERROR: {
    hint:
      'Soroban RPC was unreachable or returned an error. Confirm config.network names ' +
      'the network the contracts are deployed on, and that its rpcUrl is reachable.',
    doc: 'docs/deployment.md#wiring-the-sdk-to-a-deployment',
  },
};

/**
 * Append the remedy for `code` to `message`, when there is one.
 *
 * Composed here rather than at each throw site: there are 30-odd of those
 * across `agent/`, `circuitBreaker.ts` and `decode.ts`, several of which build
 * the message from a contract panic string, and a remedy attached per-site
 * would drift out of step with the code it belongs to.
 */
function withRemedy(code: StellarAgentErrorCode, message: string): string {
  const remedy = REMEDIES[code];
  if (!remedy) return message;
  return `${message}\n\n${remedy.hint}\nSee ${DOCS_BASE}${remedy.doc}`;
}

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
    super(withRemedy(code, message));
    this.name = 'StellarAgentError';
    this.code = code;
    this.cause = options.cause;
    this.transactionHash = options.transactionHash;
    this.attempts = options.attempts;
  }
}
