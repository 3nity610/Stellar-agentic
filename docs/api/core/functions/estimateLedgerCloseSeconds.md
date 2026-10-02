[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / estimateLedgerCloseSeconds

# Function: estimateLedgerCloseSeconds()

> **estimateLedgerCloseSeconds**(`samples`): `number`

Defined in: [ledgerTime.ts:52](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L52)

Derive the observed average seconds-per-ledger from a set of recent ledger
close samples, by summing the wall-clock gaps between consecutive
sequences and dividing by the total number of ledgers those gaps span
(rather than simply averaging per-pair ratios, so a single irregular gap
doesn't get equal weight against many one-ledger gaps).

Samples need not be pre-sorted or contiguous. Any pair with a
non-positive ledger delta or a negative/invalid time delta is skipped —
defensive against a misbehaving RPC provider returning out-of-order or
duplicate records — and falls back to [FALLBACK\_LEDGER\_CLOSE\_SECONDS](../variables/FALLBACK_LEDGER_CLOSE_SECONDS.md)
if fewer than two usable samples remain after that filtering.

## Parameters

### samples

readonly [`LedgerCloseSample`](../interfaces/LedgerCloseSample.md)[]

## Returns

`number`
