[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / FeeContext

# Interface: FeeContext

Defined in: [fleet/feeStrategy.ts:30](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L30)

## Properties

### phase

> **phase**: [`FeePhase`](../type-aliases/FeePhase.md)

Defined in: [fleet/feeStrategy.ts:31](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L31)

***

### operationCount

> **operationCount**: `number`

Defined in: [fleet/feeStrategy.ts:32](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L32)

***

### minimumFee?

> `optional` **minimumFee?**: `string`

Defined in: [fleet/feeStrategy.ts:34](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L34)

Lower bound imposed by protocol or a previously submitted envelope.

***

### previousFee?

> `optional` **previousFee?**: `string`

Defined in: [fleet/feeStrategy.ts:36](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L36)

The fee rate on the inner transaction when building a fee bump.

***

### soroban?

> `optional` **soroban?**: `boolean`

Defined in: [fleet/feeStrategy.ts:38](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L38)

Soroban invocations use the Soroban distribution by default.

***

### getFeeStats?

> `optional` **getFeeStats?**: () => `Promise`\<[`FeeStats`](FeeStats.md)\>

Defined in: [fleet/feeStrategy.ts:39](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/feeStrategy.ts#L39)

#### Returns

`Promise`\<[`FeeStats`](FeeStats.md)\>
