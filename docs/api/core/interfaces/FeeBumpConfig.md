[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / FeeBumpConfig

# Interface: FeeBumpConfig

Defined in: [types/index.ts:147](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L147)

## Properties

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [types/index.ts:149](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L149)

#### Default

```ts
true
```

***

### mode?

> `optional` **mode?**: `"on_expiry"` \| `"always"`

Defined in: [types/index.ts:151](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L151)

`always` is required when the inner source has zero XLM.

#### Default

```ts
on_expiry
```

***

### signer?

> `optional` **signer?**: [`Signer`](Signer.md)

Defined in: [types/index.ts:153](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L153)

Outer fee source. Defaults to the sponsor, channel, or agent signer in that order.

***

### strategy?

> `optional` **strategy?**: `string` \| `number` \| `bigint` \| [`FeeStrategy`](FeeStrategy.md) \| [`FeeCallback`](../type-aliases/FeeCallback.md)

Defined in: [types/index.ts:155](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L155)

A distinct policy for bumps. Defaults to 10x the initial fee or recent fees, whichever is higher.

***

### triggerAfterAttempts?

> `optional` **triggerAfterAttempts?**: `number`

Defined in: [types/index.ts:162](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L162)

Poll attempts before a pending inner transaction is bumped.

#### Default

```ts
3
```

***

### expiryThresholdSeconds?

> `optional` **expiryThresholdSeconds?**: `number`

Defined in: [types/index.ts:164](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L164)

Remaining transaction lifetime that triggers a bump.

#### Default

```ts
10
```

***

### maxBumps?

> `optional` **maxBumps?**: `number`

Defined in: [types/index.ts:166](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L166)

Maximum replacement envelopes for one invocation.

#### Default

```ts
1
```
