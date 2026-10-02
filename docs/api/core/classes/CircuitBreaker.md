[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / CircuitBreaker

# Class: CircuitBreaker

Defined in: [circuitBreaker.ts:128](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L128)

## Constructors

### Constructor

> **new CircuitBreaker**(`options`): `CircuitBreaker`

Defined in: [circuitBreaker.ts:135](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L135)

#### Parameters

##### options

[`CircuitBreakerOptions`](../interfaces/CircuitBreakerOptions.md)

#### Returns

`CircuitBreaker`

## Properties

### contractId

> `readonly` **contractId**: `string`

Defined in: [circuitBreaker.ts:129](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L129)

## Methods

### isPaused()

> **isPaused**(`sourcePublicKey?`): `Promise`\<`boolean`\>

Defined in: [circuitBreaker.ts:151](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L151)

Whether the system is currently paused.

#### Parameters

##### sourcePublicKey?

`string`

#### Returns

`Promise`\<`boolean`\>

***

### pauseQuorumCount()

> **pauseQuorumCount**(`sourcePublicKey?`): `Promise`\<`number`\>

Defined in: [circuitBreaker.ts:157](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L157)

Distinct trusted-node pause proposals still within the validity window.

#### Parameters

##### sourcePublicKey?

`string`

#### Returns

`Promise`\<`number`\>

***

### unpauseQuorumCount()

> **unpauseQuorumCount**(`sourcePublicKey?`): `Promise`\<`number`\>

Defined in: [circuitBreaker.ts:163](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L163)

Distinct trusted-node unpause proposals still within the validity window.

#### Parameters

##### sourcePublicKey?

`string`

#### Returns

`Promise`\<`number`\>

***

### proposePause()

> **proposePause**(`signer?`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [circuitBreaker.ts:169](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L169)

A trusted node records its approval to pause the system.

#### Parameters

##### signer?

`string` \| [`Signer`](../interfaces/Signer.md)

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### executePause()

> **executePause**(`signer?`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [circuitBreaker.ts:176](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L176)

Execute the pause once enough on-chain proposals have been recorded.

#### Parameters

##### signer?

`string` \| [`Signer`](../interfaces/Signer.md)

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### proposeUnpause()

> **proposeUnpause**(`signer?`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [circuitBreaker.ts:181](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L181)

A trusted node records its approval to unpause the system.

#### Parameters

##### signer?

`string` \| [`Signer`](../interfaces/Signer.md)

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### unpause()

> **unpause**(`signer?`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [circuitBreaker.ts:188](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L188)

Lift the pause once enough on-chain unpause proposals have been recorded.

#### Parameters

##### signer?

`string` \| [`Signer`](../interfaces/Signer.md)

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>
