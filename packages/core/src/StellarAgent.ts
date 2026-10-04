import type { ContractKind, DecodedEvent } from "@jupiter/indexer";
import {
  type EventWatcherContext,
  type SorobanEventsRpc,
  type WatchEventsHandle,
  type WatchEventsOptions,
  onPayment,
  onJobStatus,
  watchEvents,
} from "./events.js";

export interface StellarAgentConfig {
  rpc: SorobanEventsRpc;
  contractKinds?: Record<string, ContractKind>;
}

export class StellarAgent {
  private readonly context: EventWatcherContext;

  constructor(config: StellarAgentConfig) {
    this.context = {
      rpc: config.rpc,
      contractKinds: config.contractKinds ?? {},
    };
  }

  /** Subscribe to raw decoded contract events. */
  watchEvents(options: WatchEventsOptions): WatchEventsHandle {
    return watchEvents(this.context, options);
  }

  /** Subscribe to channel payment events. */
  onPayment(
    options: Omit<WatchEventsOptions, "topics" | "onEvent"> & {
      onPayment: (event: DecodedEvent) => void | Promise<void>;
    },
  ): WatchEventsHandle {
    return onPayment(this.context, options);
  }

  /** Subscribe to escrow job status events. */
  onJobStatus(
    options: Omit<WatchEventsOptions, "topics" | "onEvent"> & {
      onJobStatus: (event: DecodedEvent) => void | Promise<void>;
    },
  ): WatchEventsHandle {
    return onJobStatus(this.context, options);
  }
}
