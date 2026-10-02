[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / BidAttestation

# Interface: BidAttestation

Defined in: [math/attestation.ts:63](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L63)

A signed claim that `rankBids(bids, weights)` produced `result` at
`issuedAt`, under the key identified by `keyEpoch` / `scorerPublicKey`.

## Properties

### version

> **version**: `1`

Defined in: [math/attestation.ts:65](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L65)

Attestation schema version.

***

### keyEpoch

> **keyEpoch**: `number`

Defined in: [math/attestation.ts:67](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L67)

Identifies which scorer keypair signed this — see key-rotation notes above.

***

### scorerPublicKey

> **scorerPublicKey**: `string`

Defined in: [math/attestation.ts:69](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L69)

The scorer's Stellar public address (`G...`) for this epoch.

***

### weights

> **weights**: [`BidWeights`](BidWeights.md)

Defined in: [math/attestation.ts:71](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L71)

The weights the scorer ran `rankBids` with.

***

### issuedAt

> **issuedAt**: `number`

Defined in: [math/attestation.ts:73](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L73)

Unix seconds when this attestation was produced.

***

### expiresAt

> **expiresAt**: `number`

Defined in: [math/attestation.ts:75](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L75)

Unix seconds after which this attestation must no longer be trusted.

***

### digest

> **digest**: `string`

Defined in: [math/attestation.ts:77](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L77)

Hex sha256 over the canonicalized (bids, weights, result) triple.

***

### signature

> **signature**: `string`

Defined in: [math/attestation.ts:79](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L79)

Base64 ed25519 signature, produced by the scorer keypair, over the rest of this object.
