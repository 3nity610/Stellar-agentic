[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / LedgerCloseEstimate

# Interface: LedgerCloseEstimate

Defined in: [ledgerTime.ts:105](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L105)

## Properties

### currentLedger

> **currentLedger**: `number`

Defined in: [ledgerTime.ts:107](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L107)

The highest ledger sequence among the fetched samples — i.e. the current tip.

***

### avgLedgerCloseSeconds

> **avgLedgerCloseSeconds**: `number`

Defined in: [ledgerTime.ts:109](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L109)

Observed (or, absent enough samples, fallback) average seconds per ledger.

***

### observed

> **observed**: `boolean`

Defined in: [ledgerTime.ts:117](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L117)

`true` when `avgLedgerCloseSeconds` came from real observed ledger
closes; `false` when there weren't enough samples and the
[FALLBACK\_LEDGER\_CLOSE\_SECONDS](../variables/FALLBACK_LEDGER_CLOSE_SECONDS.md) constant was used instead. Surface
this alongside any "resets in ~N seconds" display so it's clear when the
estimate is a network measurement versus a rough guess.
