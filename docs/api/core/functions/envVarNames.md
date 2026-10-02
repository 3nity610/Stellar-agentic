[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / envVarNames

# Function: envVarNames()

> **envVarNames**(`network`, `key`): \[`string`, `string`\]

Defined in: [contracts.ts:113](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/contracts.ts#L113)

Environment variable names consulted for a contract, most specific first:
`STELLARAGENT_TESTNET_PAYMENT_CHANNEL` then `STELLARAGENT_PAYMENT_CHANNEL`.
The network-scoped form lets one process talk to more than one network.

## Parameters

### network

[`Network`](../type-aliases/Network.md)

### key

`"agentWalletFactory"` \| `"paymentChannel"` \| `"escrow"` \| `"rateLimiter"` \| `"circuitBreaker"`

## Returns

\[`string`, `string`\]
