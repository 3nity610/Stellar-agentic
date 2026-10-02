[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / ScoredRoute

# Interface: ScoredRoute

Defined in: [math/routing.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L42)

A normalized executable quote consumed by the deterministic selector.

## Extends

- [`RouteQuote`](../../../../interfaces/RouteQuote.md)

## Properties

### score

> **score**: `string`

Defined in: [math/routing.ts:44](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L44)

Lower is better. Integer score for byte-identical TS/Python output.

***

### breakdown

> **breakdown**: [`RouteScoreBreakdown`](RouteScoreBreakdown.md)

Defined in: [math/routing.ts:45](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L45)

***

### id

> **id**: `string`

Defined in: [routing/types.ts:38](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L38)

Canonical identifier derived from assets, venues, and path.

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`id`](../../../../interfaces/RouteQuote.md#id)

***

### sourceAsset

> **sourceAsset**: `string`

Defined in: [routing/types.ts:39](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L39)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`sourceAsset`](../../../../interfaces/RouteQuote.md#sourceasset)

***

### destinationAsset

> **destinationAsset**: `string`

Defined in: [routing/types.ts:40](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L40)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`destinationAsset`](../../../../interfaces/RouteQuote.md#destinationasset)

***

### sourceAmount

> **sourceAmount**: `string`

Defined in: [routing/types.ts:41](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L41)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`sourceAmount`](../../../../interfaces/RouteQuote.md#sourceamount)

***

### expectedDestinationAmount

> **expectedDestinationAmount**: `string`

Defined in: [routing/types.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L42)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`expectedDestinationAmount`](../../../../interfaces/RouteQuote.md#expecteddestinationamount)

***

### totalFeeBps

> **totalFeeBps**: `number`

Defined in: [routing/types.ts:43](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L43)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`totalFeeBps`](../../../../interfaces/RouteQuote.md#totalfeebps)

***

### expectedSlippageBps

> **expectedSlippageBps**: `number`

Defined in: [routing/types.ts:44](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L44)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`expectedSlippageBps`](../../../../interfaces/RouteQuote.md#expectedslippagebps)

***

### reliabilityBps

> **reliabilityBps**: `number`

Defined in: [routing/types.ts:45](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L45)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`reliabilityBps`](../../../../interfaces/RouteQuote.md#reliabilitybps)

***

### hopCount

> **hopCount**: `number`

Defined in: [routing/types.ts:47](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L47)

Economic depth, including assets embedded in path-payment operations.

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`hopCount`](../../../../interfaces/RouteQuote.md#hopcount)

***

### hops

> **hops**: [`RouteHop`](../../../../interfaces/RouteHop.md)[]

Defined in: [routing/types.ts:48](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L48)

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`hops`](../../../../interfaces/RouteQuote.md#hops)

***

### expiresAtLedger?

> `optional` **expiresAtLedger?**: `number`

Defined in: [routing/types.ts:50](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L50)

Last ledger in which every component quote is valid.

#### Inherited from

[`RouteQuote`](../../../../interfaces/RouteQuote.md).[`expiresAtLedger`](../../../../interfaces/RouteQuote.md#expiresatledger)
