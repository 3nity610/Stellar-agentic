[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / CircuitBreakerOptions

# Interface: CircuitBreakerOptions

Defined in: [circuitBreaker.ts:66](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L66)

## Properties

### rpcUrl

> **rpcUrl**: `string`

Defined in: [circuitBreaker.ts:71](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L71)

Soroban RPC endpoint (e.g., https://soroban-testnet.stellar.org).
Ignored when `rpc` is provided.

***

### contractId

> **contractId**: `string`

Defined in: [circuitBreaker.ts:73](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L73)

The contract ID (address) of the deployed CircuitBreaker contract.

***

### networkPassphrase?

> `optional` **networkPassphrase?**: `string`

Defined in: [circuitBreaker.ts:75](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L75)

Network passphrase to sign transactions for. Defaults to testnet.

***

### signer?

> `optional` **signer?**: [`Signer`](Signer.md)

Defined in: [circuitBreaker.ts:81](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L81)

Default signer for write methods. When set, callers can omit passing a
signer/secret on each call. Prefer [Signer](Signer.md) (remote/HSM) over raw
secret keys in production.

***

### rpc?

> `optional` **rpc?**: `Server`

Defined in: [circuitBreaker.ts:83](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/circuitBreaker.ts#L83)

Inject a Soroban RPC client (used by unit tests).
