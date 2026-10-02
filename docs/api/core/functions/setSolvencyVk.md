[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / setSolvencyVk

# Function: setSolvencyVk()

> **setSolvencyVk**(`invoke`, `paymentChannel`, `address`, `vk`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: agent/solvency.ts:210

Install (or rotate) the Groth16 verifying key used by
`PaymentChannel.verify_solvency_proof`.

Admin-only, and the **first** caller to set a key becomes the admin for
every future rotation — mirroring `set_circuit_breaker`. A key set by
someone who is not the recorded admin reverts, and so does one whose
`gamma_abc_g1` is not exactly [GAMMA\_ABC\_G1\_SIZE](../variables/GAMMA_ABC_G1_SIZE.md) long.

## Parameters

### invoke

`InvokeFn`

### paymentChannel

`string`

### address

`string`

### vk

[`SolvencyVerifyingKey`](../interfaces/SolvencyVerifyingKey.md)

## Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>
