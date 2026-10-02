[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / StellarAgentProvider

# Function: StellarAgentProvider()

> **StellarAgentProvider**(`__namedParameters`): `Element`

Defined in: [StellarAgentProvider.tsx:117](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/StellarAgentProvider.tsx#L117)

Owns a `StellarAgent` instance (built from `config` via
`StellarAgent.create`, unless `agent` is supplied directly) and exposes
it — plus its async init status — to `useStellarAgent()` and every hook
in this package. Also owns the optimistic-payment overlay shared
between `usePayForAPI` and `useSpendReport`.

## Parameters

### \_\_namedParameters

[`StellarAgentProviderProps`](../interfaces/StellarAgentProviderProps.md)

## Returns

`Element`
