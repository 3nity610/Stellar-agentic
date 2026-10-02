[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / TxResult

# Interface: TxResult

Defined in: [types/index.ts:386](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L386)

## Properties

### hash

> **hash**: `string`

Defined in: [types/index.ts:388](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L388)

Transaction hash

***

### success

> **success**: `boolean`

Defined in: [types/index.ts:390](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L390)

Whether the transaction succeeded

***

### ledger?

> `optional` **ledger?**: `number`

Defined in: [types/index.ts:392](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L392)

Ledger number it was confirmed in

***

### feePaid?

> `optional` **feePaid?**: `string`

Defined in: [types/index.ts:394](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L394)

Fee charged by the confirmed transaction result, in stroops.

***

### feeBumped?

> `optional` **feeBumped?**: `boolean`

Defined in: [types/index.ts:396](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L396)

Whether confirmation came through a fee-bump envelope.

***

### sourceAccount?

> `optional` **sourceAccount?**: `string`

Defined in: [types/index.ts:398](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L398)

Inner transaction source (the leased channel account when pooling is enabled).

***

### feeSource?

> `optional` **feeSource?**: `string`

Defined in: [types/index.ts:400](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L400)

Outer fee source when different from `sourceAccount`.

***

### submissionAttempts?

> `optional` **submissionAttempts?**: `number`

Defined in: [types/index.ts:402](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L402)

Number of envelopes accepted for this operation, including a replacement.

***

### route?

> `optional` **route?**: [`RouteQuote`](RouteQuote.md)

Defined in: [types/index.ts:404](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L404)

Deterministic route executed for a converted payment.

***

### expectedDestinationAmount?

> `optional` **expectedDestinationAmount?**: `string`

Defined in: [types/index.ts:406](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L406)

Quoted destination amount in integer base units.

***

### minimumDestinationAmount?

> `optional` **minimumDestinationAmount?**: `string`

Defined in: [types/index.ts:408](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L408)

End-to-end contract floor in destination base units.
