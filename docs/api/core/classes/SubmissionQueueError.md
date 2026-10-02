[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SubmissionQueueError

# Class: SubmissionQueueError

Defined in: [fleet/submissionQueue.ts:47](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L47)

Machine-readable queue/backpressure failure.

## Extends

- `Error`

## Constructors

### Constructor

> **new SubmissionQueueError**(`code`, `message`): `SubmissionQueueError`

Defined in: [fleet/submissionQueue.ts:48](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L48)

#### Parameters

##### code

`"QUEUE_FULL"` \| `"QUEUE_CLOSED"` \| `"ABORTED"`

##### message

`string`

#### Returns

`SubmissionQueueError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `"QUEUE_FULL"` \| `"QUEUE_CLOSED"` \| `"ABORTED"`

Defined in: [fleet/submissionQueue.ts:49](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/submissionQueue.ts#L49)
