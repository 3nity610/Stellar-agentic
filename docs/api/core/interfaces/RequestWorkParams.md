[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RequestWorkParams

# Interface: RequestWorkParams

Defined in: [types/index.ts:295](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L295)

## Properties

### workerAgent

> **workerAgent**: `string`

Defined in: [types/index.ts:297](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L297)

Address of the worker agent

***

### task

> **task**: `string`

Defined in: [types/index.ts:299](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L299)

Task description or IPFS hash

***

### escrowAmount

> **escrowAmount**: `string`

Defined in: [types/index.ts:301](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L301)

Amount to lock in escrow

***

### asset?

> `optional` **asset?**: `string`

Defined in: [types/index.ts:303](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L303)

Asset to pay with

***

### deadlineLedgers?

> `optional` **deadlineLedgers?**: `number`

Defined in: [types/index.ts:305](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L305)

Deadline in ledgers from now

***

### arbiter?

> `optional` **arbiter?**: `string`

Defined in: [types/index.ts:307](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L307)

Optional arbiter address for disputes
