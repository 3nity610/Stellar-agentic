[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / pct

# Function: pct()

> **pct**(`value`, `total`, `decimalPlaces?`): `BigNumber`

Defined in: [math/fixed-point.ts:101](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/fixed-point.ts#L101)

Percentage of `value` out of `total` (0 – 100), rounded down to
`decimalPlaces` (default 4).  Safe for progress-bar rendering.

## Parameters

### value

`string` \| `BigNumber`

### total

`string` \| `BigNumber`

### decimalPlaces?

`number` = `4`

## Returns

`BigNumber`

## Example

```ts
pct('1.45', '5.00')  // → BigNumber('29.0000')
```
