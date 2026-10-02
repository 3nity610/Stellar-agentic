[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / usePayForAPI

# Function: usePayForAPI()

> **usePayForAPI**(): [`UsePayForAPIResult`](../interfaces/UsePayForAPIResult.md)

Defined in: [hooks/usePayForAPI.ts:40](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/usePayForAPI.ts#L40)

Mutation hook for `StellarAgent.payForAPI`, with optimistic-update
support: as soon as `payForAPI(params)` is called, `params.amount` is
recorded in the provider's shared pending-payments state, so any
`useSpendReport()` mounted under the same `<StellarAgentProvider>`
immediately reflects the pending spend — before the transaction has
even been submitted, let alone confirmed.

On settle (success *or* failure) the pending entry is removed and the
provider's spend-report version counter is bumped to force an
immediate refetch:
- On success, the next `getSpendReport()` call already reflects the
  confirmed payment server-side, so removing the optimistic entry and
  refetching hands off from "optimistic" to "confirmed" with no gap.
- On failure, nothing was ever applied server-side, so removing the
  optimistic entry *is* the rollback — the spend report reverts to
  whatever the last real poll said.

## Returns

[`UsePayForAPIResult`](../interfaces/UsePayForAPIResult.md)
