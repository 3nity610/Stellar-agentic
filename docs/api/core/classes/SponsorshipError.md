[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SponsorshipError

# Class: SponsorshipError

Defined in: [fleet/sponsorship.ts:60](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L60)

Sponsorship lifecycle failure with the rejected transaction hash when known.

## Extends

- `Error`

## Constructors

### Constructor

> **new SponsorshipError**(`code`, `message`, `transactionHash?`): `SponsorshipError`

Defined in: [fleet/sponsorship.ts:61](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L61)

#### Parameters

##### code

`"SUBMISSION_FAILED"` \| `"TRANSACTION_FAILED"` \| `"TRANSACTION_TIMEOUT"`

##### message

`string`

##### transactionHash?

`string`

#### Returns

`SponsorshipError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `"SUBMISSION_FAILED"` \| `"TRANSACTION_FAILED"` \| `"TRANSACTION_TIMEOUT"`

Defined in: [fleet/sponsorship.ts:62](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L62)

***

### transactionHash?

> `readonly` `optional` **transactionHash?**: `string`

Defined in: [fleet/sponsorship.ts:64](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L64)
