[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / usePolling

# Function: usePolling()

> **usePolling**\<`T`\>(`fetcher`, `__namedParameters?`): [`UsePollingResult`](../interfaces/UsePollingResult.md)\<`T`\>

Defined in: [internal/usePolling.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L42)

Polls `fetcher` on an interval, exposing `idle` -> `loading` -> `ready` |
`error` state and a manual `refetch`.

`fetcher`'s identity is the effect's dependency key: hooks built on top
of this should build it with `useCallback` over their real dependencies
(e.g. `agent`, `channelId`) so a poll cycle only restarts when those
actually change, not on every render. Passing `null` disables polling
(e.g. while the agent isn't ready yet) without unmounting the caller.

Guards against the two classic polling bugs: no `setState` after
unmount (the interval's `cancelled` flag), and no stale-response races
when `fetcher` changes mid-flight (the monotonic `requestId` ref —
only the most recently issued request's result is ever applied).

## Type Parameters

### T

`T`

## Parameters

### fetcher

(() => `Promise`\<`T`\>) \| `null`

### \_\_namedParameters?

[`UsePollingOptions`](../interfaces/UsePollingOptions.md) = `{}`

## Returns

[`UsePollingResult`](../interfaces/UsePollingResult.md)\<`T`\>
