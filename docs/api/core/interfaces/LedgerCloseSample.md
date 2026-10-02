[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / LedgerCloseSample

# Interface: LedgerCloseSample

Defined in: [ledgerTime.ts:23](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L23)

A single observed ledger close, as needed to derive an average close time.

## Properties

### sequence

> **sequence**: `number`

Defined in: [ledgerTime.ts:24](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L24)

***

### closedAt

> **closedAt**: `string`

Defined in: [ledgerTime.ts:26](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/ledgerTime.ts#L26)

ISO 8601 timestamp, as returned by Horizon's `closed_at` field.
