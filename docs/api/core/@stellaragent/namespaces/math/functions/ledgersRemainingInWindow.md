[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / ledgersRemainingInWindow

# Function: ledgersRemainingInWindow()

> **ledgersRemainingInWindow**(`windowStartLedger`, `ledgersPerWindow`, `currentLedger`): `number`

Defined in: [math/predict.ts:147](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L147)

Ledgers remaining until a rolling window resets, floored at 0 (an expired
window has 0 remaining, not a negative count).

## Parameters

### windowStartLedger

`number`

### ledgersPerWindow

`number`

### currentLedger

`number`

## Returns

`number`
