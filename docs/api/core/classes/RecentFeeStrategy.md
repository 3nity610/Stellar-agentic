[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RecentFeeStrategy

# Class: RecentFeeStrategy

Defined in: [fleet/feeStrategy.ts:137](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L137)

Uses recent RPC fee statistics and falls back to the protocol base fee when
the endpoint is unavailable or has not observed relevant transactions.

## Implements

- [`FeeStrategy`](../interfaces/FeeStrategy.md)

## Constructors

### Constructor

> **new RecentFeeStrategy**(`options?`): `RecentFeeStrategy`

Defined in: [fleet/feeStrategy.ts:148](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L148)

#### Parameters

##### options?

[`RecentFeeStrategyOptions`](../interfaces/RecentFeeStrategyOptions.md) = `{}`

#### Returns

`RecentFeeStrategy`

## Methods

### getFee()

> **getFee**(`context`): `Promise`\<`string`\>

Defined in: [fleet/feeStrategy.ts:172](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L172)

#### Parameters

##### context

[`FeeContext`](../interfaces/FeeContext.md)

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`FeeStrategy`](../interfaces/FeeStrategy.md).[`getFee`](../interfaces/FeeStrategy.md#getfee)
