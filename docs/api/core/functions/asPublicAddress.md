[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / asPublicAddress

# Function: asPublicAddress()

> **asPublicAddress**(`value`): [`PublicAddress`](../type-aliases/PublicAddress.md)

Defined in: [circuitBreaker.ts:50](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L50)

Parse and validate a Stellar public address. Rejects secret keys so a
trusted-node list can never accidentally hold signing material.

## Parameters

### value

`string`

## Returns

[`PublicAddress`](../type-aliases/PublicAddress.md)
