[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / ContractsNotDeployedError

# Class: ContractsNotDeployedError

Defined in: [contracts.ts:159](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/contracts.ts#L159)

Thrown when an agent is created against contracts that are not deployed.

## Extends

- `Error`

## Constructors

### Constructor

> **new ContractsNotDeployedError**(`network`, `missing`): `ContractsNotDeployedError`

Defined in: [contracts.ts:164](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/contracts.ts#L164)

#### Parameters

##### network

[`Network`](../type-aliases/Network.md)

##### missing

(`"agentWalletFactory"` \| `"paymentChannel"` \| `"escrow"` \| `"rateLimiter"` \| `"circuitBreaker"`)[]

#### Returns

`ContractsNotDeployedError`

#### Overrides

`Error.constructor`

## Properties

### network

> `readonly` **network**: [`Network`](../type-aliases/Network.md)

Defined in: [contracts.ts:160](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/contracts.ts#L160)

***

### missing

> `readonly` **missing**: (`"agentWalletFactory"` \| `"paymentChannel"` \| `"escrow"` \| `"rateLimiter"` \| `"circuitBreaker"`)[]

Defined in: [contracts.ts:162](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/contracts.ts#L162)

The contract keys that failed validation, in `CONTRACT_KEYS` order.
