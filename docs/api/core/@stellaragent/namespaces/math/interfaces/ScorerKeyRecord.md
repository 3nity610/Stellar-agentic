[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / ScorerKeyRecord

# Interface: ScorerKeyRecord

Defined in: [math/attestation.ts:98](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L98)

One scorer key a verifier is willing to trust, and for how long.

## Properties

### epoch

> **epoch**: `number`

Defined in: [math/attestation.ts:100](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L100)

Matches [BidAttestation.keyEpoch](BidAttestation.md#keyepoch).

***

### publicKey

> **publicKey**: `string`

Defined in: [math/attestation.ts:102](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L102)

The Stellar public address this epoch is allowed to sign with.

***

### validFrom?

> `optional` **validFrom?**: `number`

Defined in: [math/attestation.ts:104](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L104)

Unix seconds before which this epoch's key was not yet in use, if bounded.

***

### validUntil?

> `optional` **validUntil?**: `number`

Defined in: [math/attestation.ts:106](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L106)

Unix seconds after which this epoch's key was retired, if bounded.
