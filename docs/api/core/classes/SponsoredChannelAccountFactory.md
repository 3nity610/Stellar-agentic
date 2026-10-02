[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SponsoredChannelAccountFactory

# Class: SponsoredChannelAccountFactory

Defined in: [fleet/sponsorship.ts:346](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L346)

Pool lifecycle backed by zero-balance sponsored accounts.

## Implements

- [`ChannelAccountFactory`](../interfaces/ChannelAccountFactory.md)

## Constructors

### Constructor

> **new SponsoredChannelAccountFactory**(`sponsor`): `SponsoredChannelAccountFactory`

Defined in: [fleet/sponsorship.ts:347](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L347)

#### Parameters

##### sponsor

[`SponsorService`](SponsorService.md)

#### Returns

`SponsoredChannelAccountFactory`

## Properties

### sponsor

> `readonly` **sponsor**: [`SponsorService`](SponsorService.md)

Defined in: [fleet/sponsorship.ts:347](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L347)

## Methods

### create()

> **create**(): `Promise`\<[`ChannelAccount`](../interfaces/ChannelAccount.md)\>

Defined in: [fleet/sponsorship.ts:349](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L349)

#### Returns

`Promise`\<[`ChannelAccount`](../interfaces/ChannelAccount.md)\>

#### Implementation of

[`ChannelAccountFactory`](../interfaces/ChannelAccountFactory.md).[`create`](../interfaces/ChannelAccountFactory.md#create)

***

### reclaim()

> **reclaim**(`account`): `Promise`\<`void`\>

Defined in: [fleet/sponsorship.ts:359](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L359)

#### Parameters

##### account

[`ChannelAccount`](../interfaces/ChannelAccount.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`ChannelAccountFactory`](../interfaces/ChannelAccountFactory.md).[`reclaim`](../interfaces/ChannelAccountFactory.md#reclaim)
