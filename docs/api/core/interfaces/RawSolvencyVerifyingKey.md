[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RawSolvencyVerifyingKey

# Interface: RawSolvencyVerifyingKey

Defined in: [generated/contract-types.ts:137](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/generated/contract-types.ts#L137)

A Groth16 verifying key for the solvency circuit (see
`zk/solvency_proof`), encoded as native BLS12-381 points so it can be
checked on-chain via `env.crypto().bls12_381().pairing_check`.
`gamma_abc_g1` must have exactly 3 entries: the constant term followed
by one entry per public input (`limit_per_period`, `total_spent`, in
that order), per the circuit's declared public inputs.

## Properties

### alpha\_g1

> **alpha\_g1**: `Uint8Array`

Defined in: [generated/contract-types.ts:138](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/generated/contract-types.ts#L138)

***

### beta\_g2

> **beta\_g2**: `Uint8Array`

Defined in: [generated/contract-types.ts:139](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/generated/contract-types.ts#L139)

***

### delta\_g2

> **delta\_g2**: `Uint8Array`

Defined in: [generated/contract-types.ts:140](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/generated/contract-types.ts#L140)

***

### gamma\_abc\_g1

> **gamma\_abc\_g1**: `Uint8Array`\<`ArrayBufferLike`\>[]

Defined in: [generated/contract-types.ts:141](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/generated/contract-types.ts#L141)

***

### gamma\_g2

> **gamma\_g2**: `Uint8Array`

Defined in: [generated/contract-types.ts:142](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/generated/contract-types.ts#L142)
