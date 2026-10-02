[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / StellarAgentProviderProps

# Interface: StellarAgentProviderProps

Defined in: [StellarAgentProvider.tsx:96](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/StellarAgentProvider.tsx#L96)

## Properties

### config

> **config**: `StellarAgentConfig`

Defined in: [StellarAgentProvider.tsx:98](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/StellarAgentProvider.tsx#L98)

Same config shape accepted by `StellarAgent.create`.

***

### children

> **children**: `ReactNode`

Defined in: [StellarAgentProvider.tsx:99](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/StellarAgentProvider.tsx#L99)

***

### agent?

> `optional` **agent?**: `StellarAgent`

Defined in: [StellarAgentProvider.tsx:107](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/StellarAgentProvider.tsx#L107)

Provide an already-constructed agent (real or mocked) instead of
having the provider call `StellarAgent.create(config)` itself. When
set, `config` is ignored for construction and the agent is considered
`ready` immediately. Intended for tests and for demos that don't want
to hit a real network — see `packages/react/example`.
