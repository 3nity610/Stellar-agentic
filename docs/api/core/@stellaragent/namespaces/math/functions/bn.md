[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / bn

# Function: bn()

> **bn**(`value`): `BigNumber`

Defined in: [math/fixed-point.ts:58](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/fixed-point.ts#L58)

Wrap any string/number into a BigNumber, throwing immediately if the value
is not a valid finite decimal.  Using this at every entry point prevents
`NaN` / `Infinity` from silently propagating through calculations.

## Parameters

### value

`string` \| `number` \| `bigint` \| `BigNumber`

## Returns

`BigNumber`
