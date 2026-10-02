[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / BidWeights

# Interface: BidWeights

Defined in: [math/bid.ts:68](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L68)

Weights controlling the relative importance of each dimension

## Properties

### price

> **price**: `string`

Defined in: [math/bid.ts:70](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L70)

Weight for price competitiveness (0–1, decimal string)

***

### reputation

> **reputation**: `string`

Defined in: [math/bid.ts:72](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L72)

Weight for reputation (0–1, decimal string)

***

### latency

> **latency**: `string`

Defined in: [math/bid.ts:74](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L74)

Weight for latency (0–1, decimal string)

***

### reliability

> **reliability**: `string`

Defined in: [math/bid.ts:76](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L76)

Weight for reliability / success rate (0–1, decimal string)
