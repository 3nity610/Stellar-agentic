[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / AttestRankBidsOptions

# Interface: AttestRankBidsOptions

Defined in: [math/attestation.ts:82](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L82)

## Properties

### keyEpoch

> **keyEpoch**: `number`

Defined in: [math/attestation.ts:84](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L84)

Which epoch `scorerKeypair` belongs to. Bump this when rotating keys.

***

### ttlSeconds?

> `optional` **ttlSeconds?**: `number`

Defined in: [math/attestation.ts:86](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L86)

How long the attestation remains valid for, in seconds.

#### Default

```ts
300
```

***

### now?

> `optional` **now?**: () => `number`

Defined in: [math/attestation.ts:88](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L88)

Injectable clock, for tests.

#### Returns

`number`

#### Default

```ts
Date.now
```
