[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / selectBestBid

# Function: selectBestBid()

> **selectBestBid**(`bids`, `weights?`): [`ScoredBid`](../interfaces/ScoredBid.md) \| `null`

Defined in: [math/bid.ts:228](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L228)

Select the single best bid from a pool.
Returns `null` when the pool is empty.

## Parameters

### bids

[`AgentBid`](../interfaces/AgentBid.md)[]

### weights?

[`BidWeights`](../interfaces/BidWeights.md) = `DEFAULT_BID_WEIGHTS`

## Returns

[`ScoredBid`](../interfaces/ScoredBid.md) \| `null`
