[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / attestRankBids

# Function: attestRankBids()

> **attestRankBids**(`bids`, `weights?`, `scorerKeypair`, `options`): [`AttestedRanking`](../interfaces/AttestedRanking.md)

Defined in: [math/attestation.ts:216](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/attestation.ts#L216)

Run `rankBids` and sign an attestation over the (bids, weights, result)
triple with `scorerKeypair`.

`scorerKeypair` must hold a secret key — this is meant to run inside the
scoring service, not on a verifier. See [verifyBidAttestation](verifyBidAttestation.md) for
the side that only needs the public key.

## Parameters

### bids

[`AgentBid`](../interfaces/AgentBid.md)[]

### weights?

[`BidWeights`](../interfaces/BidWeights.md) = `DEFAULT_BID_WEIGHTS`

### scorerKeypair

`Keypair`

### options

[`AttestRankBidsOptions`](../interfaces/AttestRankBidsOptions.md)

## Returns

[`AttestedRanking`](../interfaces/AttestedRanking.md)

## Throws

if `scorerKeypair` has no secret, `keyEpoch` isn't a
  non-negative integer, or `ttlSeconds` isn't positive. Propagates
  `rankBids`'s own `RangeError` for invalid weights or bid fields.
