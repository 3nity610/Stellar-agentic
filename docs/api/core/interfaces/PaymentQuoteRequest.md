[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / PaymentQuoteRequest

# Interface: PaymentQuoteRequest

Defined in: [routing/planner.ts:22](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L22)

## Extends

- [`RouteRequest`](RouteRequest.md)

## Properties

### slippageToleranceBps?

> `optional` **slippageToleranceBps?**: `number`

Defined in: [routing/planner.ts:23](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L23)

***

### sourceAsset

> **sourceAsset**: `string`

Defined in: [routing/types.ts:54](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L54)

#### Inherited from

[`RouteRequest`](RouteRequest.md).[`sourceAsset`](RouteRequest.md#sourceasset)

***

### destinationAsset

> **destinationAsset**: `string`

Defined in: [routing/types.ts:55](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L55)

#### Inherited from

[`RouteRequest`](RouteRequest.md).[`destinationAsset`](RouteRequest.md#destinationasset)

***

### sourceAmount

> **sourceAmount**: `string`

Defined in: [routing/types.ts:57](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L57)

Integer base units, not a decimal display amount.

#### Inherited from

[`RouteRequest`](RouteRequest.md).[`sourceAmount`](RouteRequest.md#sourceamount)

***

### currentLedger?

> `optional` **currentLedger?**: `number`

Defined in: [routing/types.ts:58](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L58)

#### Inherited from

[`RouteRequest`](RouteRequest.md).[`currentLedger`](RouteRequest.md#currentledger)

***

### allowedIntermediates?

> `optional` **allowedIntermediates?**: `string`[]

Defined in: [routing/types.ts:60](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L60)

Assets that bounded multi-hop discovery may traverse.

#### Inherited from

[`RouteRequest`](RouteRequest.md).[`allowedIntermediates`](RouteRequest.md#allowedintermediates)
