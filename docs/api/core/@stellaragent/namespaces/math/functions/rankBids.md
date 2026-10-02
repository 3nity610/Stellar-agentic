[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / rankBids

# Function: rankBids()

> **rankBids**(`bids`, `weights?`): [`ScoredBid`](../interfaces/ScoredBid.md)[]

Defined in: [math/bid.ts:192](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L192)

Rank a set of competing agent bids deterministically.

Steps:
1. Compute `maxBid` and `maxLatency` over the full bid set (normalisation).
2. Score every bid using `scoreBid`.
3. Sort descending by score (ties broken by `agentAddress` lexicographically
   so the ordering is always reproducible).

## Parameters

### bids

[`AgentBid`](../interfaces/AgentBid.md)[]

### weights?

[`BidWeights`](../interfaces/BidWeights.md) = `DEFAULT_BID_WEIGHTS`

## Returns

[`ScoredBid`](../interfaces/ScoredBid.md)[]

Bids sorted best-first with their scores attached.
