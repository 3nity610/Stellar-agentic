[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / ScoredBid

# Interface: ScoredBid

Defined in: [math/bid.ts:88](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L88)

A scored bid ready for ranking

## Properties

### agentAddress

> **agentAddress**: `string`

Defined in: [math/bid.ts:89](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L89)

***

### score

> **score**: `string`

Defined in: [math/bid.ts:91](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L91)

Final composite score 0–100, rounded down to 4 decimal places

***

### breakdown

> **breakdown**: `object`

Defined in: [math/bid.ts:93](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L93)

Individual sub-scores for transparency

#### priceScore

> **priceScore**: `string`

#### reputationScore

> **reputationScore**: `string`

#### latencyScore

> **latencyScore**: `string`

#### reliabilityScore

> **reliabilityScore**: `string`
