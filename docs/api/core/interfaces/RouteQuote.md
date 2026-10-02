[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RouteQuote

# Interface: RouteQuote

Defined in: [routing/types.ts:36](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L36)

A normalized executable quote consumed by the deterministic selector.

## Extended by

- [`ScoredRoute`](../@stellaragent/namespaces/math/interfaces/ScoredRoute.md)

## Properties

### id

> **id**: `string`

Defined in: [routing/types.ts:38](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L38)

Canonical identifier derived from assets, venues, and path.

***

### sourceAsset

> **sourceAsset**: `string`

Defined in: [routing/types.ts:39](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L39)

***

### destinationAsset

> **destinationAsset**: `string`

Defined in: [routing/types.ts:40](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L40)

***

### sourceAmount

> **sourceAmount**: `string`

Defined in: [routing/types.ts:41](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L41)

***

### expectedDestinationAmount

> **expectedDestinationAmount**: `string`

Defined in: [routing/types.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L42)

***

### totalFeeBps

> **totalFeeBps**: `number`

Defined in: [routing/types.ts:43](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L43)

***

### expectedSlippageBps

> **expectedSlippageBps**: `number`

Defined in: [routing/types.ts:44](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L44)

***

### reliabilityBps

> **reliabilityBps**: `number`

Defined in: [routing/types.ts:45](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L45)

***

### hopCount

> **hopCount**: `number`

Defined in: [routing/types.ts:47](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L47)

Economic depth, including assets embedded in path-payment operations.

***

### hops

> **hops**: [`RouteHop`](RouteHop.md)[]

Defined in: [routing/types.ts:48](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L48)

***

### expiresAtLedger?

> `optional` **expiresAtLedger?**: `number`

Defined in: [routing/types.ts:50](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L50)

Last ledger in which every component quote is valid.
