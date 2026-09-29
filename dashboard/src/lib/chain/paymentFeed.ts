/**
 * The payment feed's only source: `@stellaragent/indexer`'s query API.
 *
 * ## Why not Soroban RPC directly
 *
 * `getEvents` would work, and it would mean one fewer process to run. It would
 * also mean the dashboard re-implementing a cursor, a backfill, and a
 * reorg-guard to answer a question the indexer already answers — and getting
 * the third one wrong, which is how a payment feed starts showing payments
 * from a ledger that no longer exists.
 *
 * So: the indexer is a separate service with its own checkpoint, and the
 * dashboard is a client of it. When it is not configured, the payment panel
 * says so with the URL it needs rather than showing an empty table that looks
 * like "no payments have ever been made".
 */

import type { DashboardConfig } from './config.js';
import type { PaymentEvent } from './views.js';

/** How many events to ask for. The panel shows at most ~50. */
export const EVENT_PAGE_SIZE = 100;

export class IndexerUnavailableError extends Error {
  constructor(
    readonly endpoint: string,
    readonly cause?: unknown,
  ) {
    super(`The indexer at ${endpoint} is unreachable. Start it with 'pnpm --filter @stellaragent/indexer dev'.`);
    this.name = 'IndexerUnavailableError';
  }
}

function isPaymentEvent(value: unknown): value is PaymentEvent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.namespace === 'channel' &&
    (record.action === 'paid' || record.action === 'convpaid') &&
    typeof record.eventId === 'string' &&
    typeof record.agent === 'string'
  );
}

/**
 * Fetch recent channel payments, newest first.
 *
 * Returns `[]` — not an error — when the indexer has simply not indexed
 * anything yet. An empty index is a legitimate state; an unreachable one is
 * not, and the two must not look alike.
 */
export async function fetchPaymentEvents(
  indexerUrl: string | null,
  signal?: AbortSignal,
): Promise<PaymentEvent[]> {
  if (!indexerUrl) {
    throw new IndexerUnavailableError(
      'VITE_STELLARAGENT_INDEXER_URL (not set)',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${indexerUrl}/events?limit=${EVENT_PAGE_SIZE}`, {
      signal,
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    throw new IndexerUnavailableError(indexerUrl, error);
  }

  if (!response.ok) {
    throw new Error(`The indexer returned HTTP ${response.status} for /events.`);
  }

  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error('The indexer returned a malformed /events response (expected an array).');
  }
  return body.filter(isPaymentEvent);
}

/** Whether the dashboard has an indexer to read payments from. */
export function hasIndexer(config: DashboardConfig): boolean {
  return config.indexerUrl !== null;
}
