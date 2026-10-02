[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / ChannelAccountFactory

# Interface: ChannelAccountFactory

Defined in: [fleet/channelPool.ts:14](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L14)

Creates and reclaims accounts as a pool grows and shrinks.

## Methods

### create()

> **create**(): `Promise`\<[`ChannelAccount`](ChannelAccount.md)\>

Defined in: [fleet/channelPool.ts:15](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L15)

#### Returns

`Promise`\<[`ChannelAccount`](ChannelAccount.md)\>

***

### reclaim()?

> `optional` **reclaim**(`account`): `Promise`\<`void`\>

Defined in: [fleet/channelPool.ts:16](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L16)

#### Parameters

##### account

[`ChannelAccount`](ChannelAccount.md)

#### Returns

`Promise`\<`void`\>
