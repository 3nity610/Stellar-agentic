[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / ChannelAccountPool

# Class: ChannelAccountPool

Defined in: [fleet/channelPool.ts:103](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L103)

Exclusive channel-account leasing with demand-driven growth.

A lease owns an account from sequence load through terminal submission. The
pool deliberately does not cache or pre-allocate sequence numbers: the
invocation pipeline reloads the account after every release. Consequently a
failed build/sign/send rolls back without burning a local sequence or leaving
a gap, while accepted transactions are never raced by another caller.

## Constructors

### Constructor

> **new ChannelAccountPool**(`options?`): `ChannelAccountPool`

Defined in: [fleet/channelPool.ts:116](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L116)

#### Parameters

##### options?

[`ChannelAccountPoolOptions`](../interfaces/ChannelAccountPoolOptions.md) = `{}`

#### Returns

`ChannelAccountPool`

## Accessors

### stats

#### Get Signature

> **get** **stats**(): [`ChannelPoolStats`](../interfaces/ChannelPoolStats.md)

Defined in: [fleet/channelPool.ts:155](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L155)

##### Returns

[`ChannelPoolStats`](../interfaces/ChannelPoolStats.md)

## Methods

### create()

> `static` **create**(`options?`): `Promise`\<`ChannelAccountPool`\>

Defined in: [fleet/channelPool.ts:144](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L144)

Build a pool and eagerly satisfy `minSize`.

#### Parameters

##### options?

[`ChannelAccountPoolOptions`](../interfaces/ChannelAccountPoolOptions.md) = `{}`

#### Returns

`Promise`\<`ChannelAccountPool`\>

***

### lease()

> **lease**(`options?`): `Promise`\<[`ChannelAccountLease`](../interfaces/ChannelAccountLease.md)\>

Defined in: [fleet/channelPool.ts:172](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L172)

Lease one account, growing by one when every existing account is busy.

#### Parameters

##### options?

[`LeaseOptions`](../interfaces/LeaseOptions.md) = `{}`

#### Returns

`Promise`\<[`ChannelAccountLease`](../interfaces/ChannelAccountLease.md)\>

***

### use()

> **use**\<`T`\>(`work`, `options?`): `Promise`\<`T`\>

Defined in: [fleet/channelPool.ts:211](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L211)

Convenience wrapper around `lease` + `ChannelAccountLease.use`.

#### Type Parameters

##### T

`T`

#### Parameters

##### work

(`account`) => `Promise`\<`T`\>

##### options?

[`LeaseOptions`](../interfaces/LeaseOptions.md)

#### Returns

`Promise`\<`T`\>

***

### resize()

> **resize**(`size`): `Promise`\<`void`\>

Defined in: [fleet/channelPool.ts:219](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L219)

Change the desired fleet size. Growth is awaited; shrink reclaims idle
accounts immediately and marks busy accounts for reclamation on release.

#### Parameters

##### size

`number`

#### Returns

`Promise`\<`void`\>

***

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [fleet/channelPool.ts:248](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/channelPool.ts#L248)

Reject waiters and reclaim all idle accounts; leased accounts retire on release.

#### Returns

`Promise`\<`void`\>
