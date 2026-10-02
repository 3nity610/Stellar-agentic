[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / verifySolvencyProof

# Function: verifySolvencyProof()

> **verifySolvencyProof**(`invoke`, `paymentChannel`, `channelId`, `proof`): `Promise`\<`boolean`\>

Defined in: agent/solvency.ts:231

Verify a Groth16 solvency proof against a channel's own
`limit_per_period` and `total_spent`.

Read-only, and returns `false` rather than throwing for a proof that does
not verify — an invalid proof is the expected answer, not an error. It still
*throws* when no verifying key has been configured, because that is a
deployment gap rather than a statement about the proof.

## Parameters

### invoke

`InvokeFn`

### paymentChannel

`string`

### channelId

`bigint`

### proof

[`SolvencyProof`](../interfaces/SolvencyProof.md)

## Returns

`Promise`\<`boolean`\>
