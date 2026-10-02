[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RouteRequest

# Interface: RouteRequest

Defined in: [routing/types.ts:53](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L53)

## Extended by

- [`PaymentQuoteRequest`](PaymentQuoteRequest.md)

## Properties

### sourceAsset

> **sourceAsset**: `string`

Defined in: [routing/types.ts:54](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L54)

***

### destinationAsset

> **destinationAsset**: `string`

Defined in: [routing/types.ts:55](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L55)

***

### sourceAmount

> **sourceAmount**: `string`

Defined in: [routing/types.ts:57](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L57)

Integer base units, not a decimal display amount.

***

### currentLedger?

> `optional` **currentLedger?**: `number`

Defined in: [routing/types.ts:58](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L58)

***

### allowedIntermediates?

> `optional` **allowedIntermediates?**: `string`[]

Defined in: [routing/types.ts:60](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L60)

Assets that bounded multi-hop discovery may traverse.
