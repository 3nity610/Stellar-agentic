[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / scoreBid

# Function: scoreBid()

> **scoreBid**(`bid`, `maxBid`, `maxLatency`, `weights?`): [`ScoredBid`](../interfaces/ScoredBid.md)

Defined in: [math/bid.ts:115](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L115)

Compute a deterministic composite score for a single bid.

All intermediate values are `BigNumber` — no native JS floats are used.
The result is identical on x86, ARM, WASM, and any other platform where
`bignumber.js` runs.

## Parameters

### bid

[`AgentBid`](../interfaces/AgentBid.md)

The agent's bid to score

### maxBid

`string`

The highest price among all competing bids (normaliser)

### maxLatency

`string`

The highest latency among all competing bids (normaliser)

### weights?

[`BidWeights`](../interfaces/BidWeights.md) = `DEFAULT_BID_WEIGHTS`

Dimension weights (must sum to 1)

## Returns

[`ScoredBid`](../interfaces/ScoredBid.md)
