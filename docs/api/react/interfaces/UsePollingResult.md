[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / UsePollingResult

# Interface: UsePollingResult\<T\>

Defined in: [internal/usePolling.ts:18](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L18)

## Extends

- [`AsyncState`](AsyncState.md)\<`T`\>

## Extended by

- [`UseSpendReportResult`](UseSpendReportResult.md)

## Type Parameters

### T

`T`

## Properties

### data

> **data**: `T` \| `null`

Defined in: [internal/usePolling.ts:6](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L6)

#### Inherited from

[`AsyncState`](AsyncState.md).[`data`](AsyncState.md#data)

***

### status

> **status**: [`AsyncStatus`](../type-aliases/AsyncStatus.md)

Defined in: [internal/usePolling.ts:7](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L7)

#### Inherited from

[`AsyncState`](AsyncState.md).[`status`](AsyncState.md#status)

***

### error

> **error**: `Error` \| `null`

Defined in: [internal/usePolling.ts:8](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L8)

#### Inherited from

[`AsyncState`](AsyncState.md).[`error`](AsyncState.md#error)

***

### refetch

> **refetch**: () => `void`

Defined in: [internal/usePolling.ts:20](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L20)

Fetch immediately, outside the regular interval.

#### Returns

`void`
