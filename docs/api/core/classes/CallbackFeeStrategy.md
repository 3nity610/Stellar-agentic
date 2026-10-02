[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / CallbackFeeStrategy

# Class: CallbackFeeStrategy

Defined in: [fleet/feeStrategy.ts:124](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L124)

Delegates the decision to application code while retaining validation.

## Implements

- [`FeeStrategy`](../interfaces/FeeStrategy.md)

## Constructors

### Constructor

> **new CallbackFeeStrategy**(`callback`): `CallbackFeeStrategy`

Defined in: [fleet/feeStrategy.ts:125](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L125)

#### Parameters

##### callback

[`FeeCallback`](../type-aliases/FeeCallback.md)

#### Returns

`CallbackFeeStrategy`

## Properties

### callback

> `readonly` **callback**: [`FeeCallback`](../type-aliases/FeeCallback.md)

Defined in: [fleet/feeStrategy.ts:125](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L125)

## Methods

### getFee()

> **getFee**(`context`): `Promise`\<`string`\>

Defined in: [fleet/feeStrategy.ts:128](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L128)

#### Parameters

##### context

[`FeeContext`](../interfaces/FeeContext.md)

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`FeeStrategy`](../interfaces/FeeStrategy.md).[`getFee`](../interfaces/FeeStrategy.md#getfee)
