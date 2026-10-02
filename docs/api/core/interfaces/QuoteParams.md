[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / QuoteParams

# Interface: QuoteParams

Defined in: [types/index.ts:137](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L137)

## Properties

### sourceAsset

> **sourceAsset**: `string`

Defined in: [types/index.ts:138](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L138)

***

### destinationAsset

> **destinationAsset**: `string`

Defined in: [types/index.ts:139](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L139)

***

### amount

> **amount**: `string`

Defined in: [types/index.ts:141](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L141)

Decimal display amount; converted to 7-decimal base units before discovery.

***

### allowedIntermediates?

> `optional` **allowedIntermediates?**: `string`[]

Defined in: [types/index.ts:142](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L142)

***

### slippageToleranceBps?

> `optional` **slippageToleranceBps?**: `number`

Defined in: [types/index.ts:144](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L144)

0..500 basis points.

#### Default

```ts
100
```
