[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SubmitOptions

# Interface: SubmitOptions

Defined in: [fleet/submissionQueue.ts:22](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L22)

## Properties

### orderingKey?

> `optional` **orderingKey?**: `string`

Defined in: [fleet/submissionQueue.ts:24](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L24)

Tasks with the same key never overlap; unrelated keys stay concurrent.

***

### signal?

> `optional` **signal?**: `AbortSignal`

Defined in: [fleet/submissionQueue.ts:25](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L25)
