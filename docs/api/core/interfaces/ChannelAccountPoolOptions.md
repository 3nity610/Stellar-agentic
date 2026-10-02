[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / ChannelAccountPoolOptions

# Interface: ChannelAccountPoolOptions

Defined in: [fleet/channelPool.ts:21](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L21)

## Properties

### accounts?

> `optional` **accounts?**: readonly [`ChannelAccount`](ChannelAccount.md)[]

Defined in: [fleet/channelPool.ts:23](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L23)

Accounts available immediately.

***

### factory?

> `optional` **factory?**: [`ChannelAccountFactory`](ChannelAccountFactory.md)

Defined in: [fleet/channelPool.ts:25](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L25)

Lifecycle used when demand changes the pool size.

***

### minSize?

> `optional` **minSize?**: `number`

Defined in: [fleet/channelPool.ts:27](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L27)

Lowest size retained by idle reclamation.

#### Default

```ts
accounts.length
```

***

### maxSize?

> `optional` **maxSize?**: `number`

Defined in: [fleet/channelPool.ts:29](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L29)

Hard upper bound, including accounts being created.

#### Default

```ts
max(minSize, accounts.length)
```

***

### leaseTimeoutMs?

> `optional` **leaseTimeoutMs?**: `number`

Defined in: [fleet/channelPool.ts:31](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L31)

Maximum time to wait for a lease. Zero disables the timeout.

#### Default

```ts
30000
```

***

### now?

> `optional` **now?**: () => `number`

Defined in: [fleet/channelPool.ts:33](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L33)

Injectable clock for deterministic tests.

#### Returns

`number`
