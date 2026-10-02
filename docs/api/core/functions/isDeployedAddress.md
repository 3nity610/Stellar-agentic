[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / isDeployedAddress

# Function: isDeployedAddress()

> **isDeployedAddress**(`address`): `boolean`

Defined in: [contracts.ts:94](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/contracts.ts#L94)

Whether a string is a real, deployable Stellar contract ID.

Uses strkey validation rather than a pattern match against the known
placeholders: that also catches truncated addresses, addresses pasted from
the wrong network's output, and single-character typos — all of which
otherwise surface as the same opaque RPC failure.

## Parameters

### address

`string` \| `undefined`

## Returns

`boolean`
