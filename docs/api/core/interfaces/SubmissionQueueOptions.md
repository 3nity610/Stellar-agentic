[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SubmissionQueueOptions

# Interface: SubmissionQueueOptions

Defined in: [fleet/submissionQueue.ts:7](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L7)

## Properties

### concurrency?

> `optional` **concurrency?**: `number`

Defined in: [fleet/submissionQueue.ts:9](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L9)

Maximum tasks executing at once.

#### Default

```ts
4
```

***

### maxQueueSize?

> `optional` **maxQueueSize?**: `number`

Defined in: [fleet/submissionQueue.ts:11](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L11)

Pending-task limit; running tasks do not count.

#### Default

```ts
1000
```

***

### maxAttempts?

> `optional` **maxAttempts?**: `number`

Defined in: [fleet/submissionQueue.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L13)

Total executions including the first attempt.

#### Default

```ts
3
```

***

### retryDelayMs?

> `optional` **retryDelayMs?**: `number`

Defined in: [fleet/submissionQueue.ts:15](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L15)

Initial exponential-backoff delay.

#### Default

```ts
100
```

***

### classifyError?

> `optional` **classifyError?**: [`RetryClassifier`](../type-aliases/RetryClassifier.md)

Defined in: [fleet/submissionQueue.ts:16](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L16)

***

### metrics?

> `optional` **metrics?**: [`Metrics`](Metrics.md)

Defined in: [fleet/submissionQueue.ts:17](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L17)

***

### now?

> `optional` **now?**: () => `number`

Defined in: [fleet/submissionQueue.ts:18](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L18)

#### Returns

`number`

***

### sleep?

> `optional` **sleep?**: (`milliseconds`) => `Promise`\<`void`\>

Defined in: [fleet/submissionQueue.ts:19](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L19)

#### Parameters

##### milliseconds

`number`

#### Returns

`Promise`\<`void`\>
