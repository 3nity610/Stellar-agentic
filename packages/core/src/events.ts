import { scValToNative, xdr } from "@stellar/stellar-sdk";
import type { ContractKind, DecodedEvent, RawContractEvent } from "@jupiter/indexer";
import { decodeEvent } from "@jupiter/indexer";

export interface SorobanEventFilter {
  type?: "contract";
  contractIds?: string[];
  topics?: string[][];
}

export interface SorobanGetEventsRequest {
  startLedger?: number;
  endLedger?: number;
  filters?: SorobanEventFilter[];
  cursor?: string;
  limit?: number;
}

export interface SorobanEventResponse {
  events: RawContractEvent[];
  cursor?: string;
}

export interface SorobanEventsRpc {
  getEvents(request: SorobanGetEventsRequest): Promise<SorobanEventResponse>;
}

export interface WatchEventsOptions {
  /** Contract addresses to subscribe to. Defaults to all known contracts. */
  contractIds?: string[];
  /** Map of contract address -> kind. Used to decode events. */
  contractKinds?: Record<string, ContractKind>;
  /** Optional starting ledger. */
  startLedger?: number;
  /** Optional ending ledger. */
  endLedger?: number;
  /** Optional topic filters (XDR strings). */
  topics?: string[][];
  /** Resume from a previous cursor. */
  cursor?: string;
  /** Page size for each getEvents call. Defaults to 100. */
  limit?: number;
  /** Polling interval in ms. Defaults to 5000. */
  pollIntervalMs?: number;
  /** Callback invoked for each decoded event. */
  onEvent: (event: DecodedEvent) => void | Promise<void>;
  /** Callback invoked when an error occurs during polling. */
  onError?: (error: unknown) => void | Promise<void>;
}

export interface WatchEventsHandle {
  /** Stop polling and unsubscribe. */
  unsubscribe(): void;
  /** Returns the latest cursor seen. */
  cursor(): string | undefined;
  /** Resolves when the watcher has stopped. */
  done: Promise<void>;
}

export interface EventWatcherContext {
  rpc: SorobanEventsRpc;
  contractKinds: Record<string, ContractKind>;
}

function contractKindFor(
  context: EventWatcherContext,
  address: string,
): ContractKind {
  const kind = context.contractKinds[address];
  if (!kind) throw new Error(`unknown contract kind for ${address}`);
  return kind;
}

function toRawEvent(event: any): RawContractEvent {
  return {
    id: event.id,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    txHash: event.txHash,
    pangingToken: event.pagingToken,
    topic: event.topic.map((t: string) => xdr.ScValFromXDR(t)),
    value: xdr.ScValFromXDR(event.value),
  };
}

export function watchEvents(
  context: EventWatcherContext,
  options: WatchEventsOptions,
  contractIds?: string[],
): WatchEventsHandle {
  const limit = options.limit ?? 100;
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const ids = options.contractIds ?? contractIds ?? Object.keys(context.contractKinds);
  let cursor = options.cursor;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    resolveDone();
  };

  const poll = async () => {
    if (stopped) return;
    try {
      const response = await context.rpc.getEvents({
        startLedger: cursor ? undefined : options.startLedger,
        endLedger: options.endLedger,
        filters: [
          {
            type: "contract",
            contractIds: ids,
            topics: options.topics,
          },
        ],
        cursor,
        limit,
      });

      for (const raw of response.events) {
        if (stopped) break;
        const contractAddress = raw.contractId ?? (raw as any).contractAddress;
        if (!contractAddress) continue;
        const kind = contractKindFor(context, contractAddress);
        const decoded = decodeEvent(toRawEvent(raw), kind, contractAddress);
        await options.onEvent(decoded);
      }

      if (response.cursor) cursor = response.cursor;
    } catch (error) {
      if (options.onError) await options.onError(error);
    } finally {
      if (!stopped) timer = setTimeout(poll, pollIntervalMs);
    }
  };

  void poll();

  return {
    unsubscribe: stop,
    cursor: () => cursor,
    done,
  };
}

export function onPayment(
  context: EventWatcherContext,
  options: Omit<WatchEventsOptions, "topics" | "onEvent"> & {
    onPayment: (event: DecodedEvent) => void | Promise<void>;
  },
): WatchEventsHandle {
  const topics = [
    [xdr.ScValToXDR(xdr.nativeToScVal("channel")).toString(), xdr.ScValToXDR(xdr.nativeToScVal("paid")).toString()],
    [xdr.ScValToXDR(xdr.nativeToScVal("channel")).toString(), xdr.ScValToXDR(xdr.nativeToScVal("convpaid")).toString()],
  ];
  return watchEvents(context, { ...options, topics, onEvent: options.onPayment });
}

export function onJobStatus(
  context: EventWatcherContext,
  options: Omit<WatchEventsOptions, "topics" | "onEvent"> & {
    onJobStatus: (event: DecodedEvent) => void | Promise<void>;
  },
): WatchEventsHandle {
  const topics = [
    [xdr.ScValToXDR(xdr.nativeToScVal("escrow")).toString()],
  ];
  return watchEvents(context, { ...options, topics, onEvent: options.onJobStatus });
}
