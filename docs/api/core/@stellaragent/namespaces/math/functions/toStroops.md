[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / toStroops

# Function: toStroops()

> **toStroops**(`amount`): `bigint`

Defined in: [math/fixed-point.ts:134](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/fixed-point.ts#L134)

Convert a human-readable decimal amount (e.g. "1.50") to Stellar stroops
as a `bigint` (i128-compatible).  Truncates sub-stroop fractions.

## Parameters

### amount

`string`

## Returns

`bigint`

## Example

```ts
toStroops('1.5000001')  // → 15000001n
```
