[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / FALLBACK\_LEDGER\_CLOSE\_SECONDS

# Variable: FALLBACK\_LEDGER\_CLOSE\_SECONDS

> `const` **FALLBACK\_LEDGER\_CLOSE\_SECONDS**: `5` = `5`

Defined in: [ledgerTime.ts:37](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L37)

Fallback average ledger close time, in seconds, used only when fewer than
two samples are available to derive a real observed average from (e.g. a
brand new standalone network with a single ledger closed so far). This is
the commonly cited Stellar figure, but it is a fallback, not a
measurement — prefer [estimateLedgerCloseSeconds](../functions/estimateLedgerCloseSeconds.md) against real
samples whenever they're available.
