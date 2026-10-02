[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / StellarAgentError

# Class: StellarAgentError

Defined in: [errors.ts:26](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/errors.ts#L26)

Error thrown for SDK validation, Soroban RPC, and contract failures.

## Extends

- `Error`

## Constructors

### Constructor

> **new StellarAgentError**(`code`, `message`, `options?`): `StellarAgentError`

Defined in: [errors.ts:31](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/errors.ts#L31)

#### Parameters

##### code

[`StellarAgentErrorCode`](../type-aliases/StellarAgentErrorCode.md)

##### message

`string`

##### options?

###### cause?

`unknown`

###### transactionHash?

`string`

#### Returns

`StellarAgentError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: [`StellarAgentErrorCode`](../type-aliases/StellarAgentErrorCode.md)

Defined in: [errors.ts:27](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/errors.ts#L27)

***

### cause?

> `readonly` `optional` **cause?**: `unknown`

Defined in: [errors.ts:28](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/errors.ts#L28)

***

### transactionHash?

> `readonly` `optional` **transactionHash?**: `string`

Defined in: [errors.ts:29](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/errors.ts#L29)
