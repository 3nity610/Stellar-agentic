[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SpendLimit

# Interface: SpendLimit

Defined in: [types/index.ts:33](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L33)

## Properties

### amount

> **amount**: `string`

Defined in: [types/index.ts:35](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L35)

Maximum amount per period

***

### asset

> **asset**: `string`

Defined in: [types/index.ts:37](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L37)

Asset to limit (e.g. 'USDC')

***

### period

> **period**: [`SpendPeriod`](../type-aliases/SpendPeriod.md)

Defined in: [types/index.ts:39](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L39)

How often the limit resets
