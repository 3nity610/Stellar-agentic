[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / PathPaymentCandidate

# Interface: PathPaymentCandidate

Defined in: [routing/types.ts:126](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L126)

## Properties

### venueId

> **venueId**: `string`

Defined in: [routing/types.ts:128](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L128)

Stable liquidity-source identifier, or an execution-adapter contract ID.

***

### path

> **path**: `string`[]

Defined in: [routing/types.ts:130](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L130)

Assets between source and destination, excluding both endpoints.

***

### expectedDestinationAmount

> **expectedDestinationAmount**: `string`

Defined in: [routing/types.ts:131](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L131)

***

### feeAmount?

> `optional` **feeAmount?**: `string`

Defined in: [routing/types.ts:132](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L132)

***

### feeBps?

> `optional` **feeBps?**: `number`

Defined in: [routing/types.ts:133](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L133)

***

### slippageBps?

> `optional` **slippageBps?**: `number`

Defined in: [routing/types.ts:134](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L134)

***

### reliabilityBps?

> `optional` **reliabilityBps?**: `number`

Defined in: [routing/types.ts:135](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L135)

***

### minDestinationAmount?

> `optional` **minDestinationAmount?**: `string`

Defined in: [routing/types.ts:136](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L136)
