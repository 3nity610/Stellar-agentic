[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / UseSpendReportResult

# Interface: UseSpendReportResult

Defined in: [hooks/useSpendReport.ts:37](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useSpendReport.ts#L37)

## Extends

- [`UsePollingResult`](UsePollingResult.md)\<`SpendReport`\>

## Properties

### hasPendingPayments

> **hasPendingPayments**: `boolean`

Defined in: [hooks/useSpendReport.ts:39](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useSpendReport.ts#L39)

Whether `data` currently includes unconfirmed optimistic payments.

***

### data

> **data**: `SpendReport` \| `null`

Defined in: [internal/usePolling.ts:6](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L6)

#### Inherited from

[`UsePollingResult`](UsePollingResult.md).[`data`](UsePollingResult.md#data)

***

### status

> **status**: [`AsyncStatus`](../type-aliases/AsyncStatus.md)

Defined in: [internal/usePolling.ts:7](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L7)

#### Inherited from

[`UsePollingResult`](UsePollingResult.md).[`status`](UsePollingResult.md#status)

***

### error

> **error**: `Error` \| `null`

Defined in: [internal/usePolling.ts:8](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L8)

#### Inherited from

[`UsePollingResult`](UsePollingResult.md).[`error`](UsePollingResult.md#error)

***

### refetch

> **refetch**: () => `void`

Defined in: [internal/usePolling.ts:20](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L20)

Fetch immediately, outside the regular interval.

#### Returns

`void`

#### Inherited from

[`UsePollingResult`](UsePollingResult.md).[`refetch`](UsePollingResult.md#refetch)
