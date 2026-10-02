[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SOROBAN\_G1\_GENERATOR

# Variable: SOROBAN\_G1\_GENERATOR

> `const` **SOROBAN\_G1\_GENERATOR**: `string`

Defined in: agent/solvency.ts:65

The known-answer BLS12-381 G1 generator, in Soroban's encoding.

Lifted from `soroban_sdk::crypto::bls12_381`'s own rustdoc example for
`g1_add(zero, one)`. If this constant ever stops decoding to a well-formed
point, the SDK and the Rust crate have diverged and every proof the SDK
submits will be rejected on-chain for a reason that looks like a bad proof.
