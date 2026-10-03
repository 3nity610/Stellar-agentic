import { describe, it, expect, vi } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import type { ContractKind } from "@jupiter/indexer";
import {
  type SorobanEventResponse,
  type SorobanEventsRpc,
  type SorobanGetEventsRequest,
  watchEvents,
  onPayment,
  onJobStatus,
} from "../src/events.js";
import { StellarAgent } from "../src/StellarAgent.js";

const CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function scString(value: string): string {
  return xdr.ScValToXDR(xdr.nativeToScVal(value)).toString();
}

function makePaidEvent(id: string, pagingToken: string) {
  return {
    id,
    ledger: 123,
    ledgerClosedAt: "2024-01-01T00:00:00Z",
    txHash: "deadbeef",
    pagingToken: pagingToken,
    contractId: CONTRACT,
    topic: [scString("channel"), scString("paid")],
    value: xdr.ScValToXDR(
      xdr.nativeToScVal([
        xdr.nativeToScVal("channel-1"),
        xdr.nativeToScVal("agent-1"),
        xdr.nativeToScVal("recipient-1"),
        xdr.nativeToScVal(1000n.legacyToScVal()[0]),
        xdr.nativeToScVal("memo"),
      ]),
    ).toString(),
  };
}

function makeJobEvent(id: string, pagingToken: string) {
  return {
    id,
    ledger: 124,
    ledgerClosedAt: "2024-01-01T00:00:01Z",
    txHash: "cafefeed",
    pangingToken: pagingToken,
    contractId: CONTRACT,
    topic: [scString("escrow"), scString("released")],
    value: xdr.ScValToXDR(
      xdr.nativeToScVal([
        xdr.nativeToScVal("job-1"),
        xdr.nativeToScVal("worker-1"),
        xdr.nativeToScVal(500n.legacyToScVal()[0]),
      ]),
    ).toString(),
  };
}

function makeRpc(responses: SorobanEventResponse[]): SorobanEventsRpc {
  const queue = [...responses];
  return {
    getEvents: vi.fn().async impl() => {
      const next = queue.shift();
      if (!next) return { events: [] };
      return next;
    }),
  } as unknown as SorobanEventsRpc;
}

const contractKinds: Record<string, ContractKind> = {
  [CONTRACT]: "channel",
};

describe("watchEvents", () => {
  it("decodes events and advances the cursor", async () => {
    const rpc = makeRpc([{
      { events: [makePaidEvent("evt-1", "p1")], cursor: "p1" },
      { events: [], cursor: "p1" },
    ]);
    const seen = [] as any[];
    const handle = watchEvents(
      { rpc, contractKinds },
      {
        contractIds: [CONTRACT],
        pollIntervalMs: 1,
        onEvent: (ev) => {
          seen.push(ev);
        },
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    handle.unsubscribe();
    await handle.done;
    expect(seen.length).beGreaterOrEqual(1);
    expect(seen[0].action).eq("paid");
    expect(handle.cursor()).eq("p1");
  });

  it("resumes from a caller-supplied cursor", async () => {
    const rpc = makeRpc([{ events: [], cursor: "p2" }]);
    const getEvents = rpc.getEvents as unknown as any;
    const handle = watchEvents(
      { rpc, contractKinds },
      {
        contractIds: [CONTRACT],
        cursor: "p1",
        pollIntervalMs: 1,
        onEvent: () => {},
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    handle.unsubscribe();
    await handle.done;
    expect(getEvents.mockCalls[0][0].cursor).eq("p1");
  });

  it("unsubscribe stops further polling", async () => {
    const rpc = makeRpc([
      { events: [makePaidEvent("evt-1", "p1")], cursor: "p1" },
      { events: [makePaidEvent("evt-2", "p2")], cursor: "p2" },
    ]);
    const getEvents = rpc.getEvents as unknown as any;
    const handle = watchEvents(
      { rpc, contractKinds },
      {
        contractIds: [CONTRACT],
        pollIntervalMs: 1,
        onEvent: () => {},
      },
    );
    await new Promise((r) => setTimeout(r, 10));
    handle.unsubscribe();
    const callsAtStop = getEvents.mockCalls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(getEvents.mockCalls.length).eq(callsAtStop);
  });
});

describe("onPayment", () => {
  it("filters to channel payment topics", async () => {
    const rpc = makeRpc([{ events: [makePaidEvent("evt-1", "p1")], cursor: "p1" }]);
    const getEvents = rpc.getEvents as unknown as any;
    const seen = [] as any[];
    const handle = onPayment(
      { rpc, contractKinds },
      {
        contractIds: [CONTRACT],
        pollIntervalMs: 1,
        onPayment: (ev) => {
          seen.push(ev);
        },
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    handle.unsubscribe();
    await handle.done;
    expect(seen.length).beGreaterOrEqual(1);
    const filters = getEvents.mockCalls[0][0].filters;
    expect(filters[0].topics.length).eq(2);
  });
});

describe("onJobStatus", () => {
  it("filters to escrow topics", async () => {
    const rpc = makeRpc([{ events: [makeJobEvent("evt-1", "p1")], cursor: "p1" }]);
    const getEvents = rpc.getEvents as unknown as any;
    const seen = [] as any[];
    const handle = onJobStatus(
      { rpc, contractKinds },
      {
        contractIds: [CONTRACT],
        pollIntervalMs: 1,
        onJobStatus: (ev) => {
          seen.push(ev);
        },
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    handle.unsubscribe();
    await handle.done;
    expect(seen.length).beGreaterOrEqual(1);
    const filters = getEvents.mockCalls[0][0].filters;
    expect(filters[0].topics.length).eq(1);
  });
});

describe("StellarAgent", () => {
  it("exposes watchEvents/onPayment/onJobStatus", () => {
    const rpc = makeRpc([]);
    const agent = new StellarAgent({ rpc, contractKinds });
    expect(typeof agent.watchEvents).eq("function");
    expect(typeof agent.onPayment).eq("function");
    expect(typeof agent.onJobStatus).eq("function");
  });
});
