[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / estimateSecondsRemaining

# Function: estimateSecondsRemaining()

> **estimateSecondsRemaining**(`ledgersRemaining`, `avgLedgerCloseSeconds`): `number`

Defined in: [ledgerTime.ts:86](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L86)

Convert a ledger count into an estimated number of wall-clock seconds
using an already-derived average close time. Purely `ledgers *
avgLedgerCloseSeconds` — split out from [estimateLedgerCloseSeconds](estimateLedgerCloseSeconds.md)
so callers (e.g. `useRateLimitStatus`) can recompute this on every render
as `ledgersRemaining` ticks down without re-deriving the average each time.

## Parameters

### ledgersRemaining

`number`

### avgLedgerCloseSeconds

`number`

## Returns

`number`
