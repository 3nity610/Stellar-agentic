[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / ChannelAccount

# Interface: ChannelAccount

Defined in: [fleet/channelPool.ts:4](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L4)

An account whose sequence number may be used as a transaction channel.

## Properties

### address

> **address**: `string`

Defined in: [fleet/channelPool.ts:6](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L6)

Public Stellar address used as the transaction source.

***

### signer

> **signer**: [`Signer`](Signer.md)

Defined in: [fleet/channelPool.ts:8](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L8)

Signs the transaction envelope. Contract authorization stays with the agent signer.

***

### metadata?

> `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [fleet/channelPool.ts:10](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L10)

Caller-owned data retained for the lifetime of the pool entry.
