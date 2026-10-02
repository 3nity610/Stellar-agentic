[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / UsePollingOptions

# Interface: UsePollingOptions

Defined in: [internal/usePolling.ts:11](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L11)

## Extended by

- [`UseRateLimitStatusOptions`](UseRateLimitStatusOptions.md)

## Properties

### intervalMs?

> `optional` **intervalMs?**: `number`

Defined in: [internal/usePolling.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L13)

Poll interval in ms. Default 5000.

***

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [internal/usePolling.ts:15](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/internal/usePolling.ts#L15)

Skip fetching entirely (e.g. a dependency isn't ready yet). Default true.
