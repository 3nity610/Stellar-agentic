[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SubmissionPipelineConfig

# Interface: SubmissionPipelineConfig

Defined in: [types/index.ts:169](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L169)

## Properties

### concurrency?

> `optional` **concurrency?**: `number`

Defined in: [types/index.ts:170](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L170)

***

### maxQueueSize?

> `optional` **maxQueueSize?**: `number`

Defined in: [types/index.ts:171](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L171)

***

### maxAttempts?

> `optional` **maxAttempts?**: `number`

Defined in: [types/index.ts:172](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L172)

***

### retryDelayMs?

> `optional` **retryDelayMs?**: `number`

Defined in: [types/index.ts:173](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L173)

***

### classifyError?

> `optional` **classifyError?**: [`RetryClassifier`](../type-aliases/RetryClassifier.md)

Defined in: [types/index.ts:174](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L174)

***

### minChannels?

> `optional` **minChannels?**: `number`

Defined in: [types/index.ts:176](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L176)

Eager sponsored channel count when `sponsorService` creates the pool.

#### Default

```ts
1
```

***

### maxChannels?

> `optional` **maxChannels?**: `number`

Defined in: [types/index.ts:178](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L178)

Demand-driven sponsored channel limit.

#### Default

```ts
concurrency
```
