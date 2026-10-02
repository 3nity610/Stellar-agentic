[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / verifyBidAttestation

# Function: verifyBidAttestation()

> **verifyBidAttestation**(`bids`, `result`, `attestation`, `trustedKeys`, `options?`): [`BidAttestationVerification`](../type-aliases/BidAttestationVerification.md)

Defined in: [math/attestation.ts:278](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L278)

Independently confirm that a scoring service didn't cheat.

Given only `bids`, the `result` it claims to have produced, its
`attestation`, and a directory of which scorer keys are trusted, this:

1. Looks up `attestation.keyEpoch` in `trustedKeys` and rejects an unknown
   epoch, a public-key mismatch for a known epoch, or an epoch used outside
   its trusted validity window.
2. Rejects an expired attestation.
3. Verifies the ed25519 signature over the attestation header — this
   authenticates every field on the attestation, including `digest` and
   `weights`.
4. Recomputes the digest from `bids`/`result` and checks it matches
   `attestation.digest` — this catches tampering with either in transit.
5. Recomputes `rankBids(bids, attestation.weights)` from scratch using the
   exported `bid.ts` functions and checks it structurally matches `result`
   — this is what catches a scorer that computed one ranking but reported
   a different "winner".

All five must pass for `valid: true`.

## Parameters

### bids

[`AgentBid`](../interfaces/AgentBid.md)[]

### result

[`ScoredBid`](../interfaces/ScoredBid.md)[]

### attestation

[`BidAttestation`](../interfaces/BidAttestation.md)

### trustedKeys

[`ScorerKeyDirectory`](../type-aliases/ScorerKeyDirectory.md)

### options?

[`VerifyBidAttestationOptions`](../interfaces/VerifyBidAttestationOptions.md) = `{}`

## Returns

[`BidAttestationVerification`](../type-aliases/BidAttestationVerification.md)
