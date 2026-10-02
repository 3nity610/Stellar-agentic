[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / div

# Function: div()

> **div**(`a`, `b`): `BigNumber`

Defined in: [math/fixed-point.ts:88](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/fixed-point.ts#L88)

Deterministic division:  a ÷ b
Uses ROUND_DOWN (truncation) so the result can never exceed the true value,
which is the safe direction for spend-limit comparisons.

## Parameters

### a

`string` \| `BigNumber`

### b

`string` \| `BigNumber`

## Returns

`BigNumber`
