[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SolvencyVerifyingKey

# Interface: SolvencyVerifyingKey

Defined in: agent/solvency.ts:89

A Groth16 verifying key for the solvency circuit, in the same shape
`PaymentChannel.SolvencyVerifyingKey` decodes to.

`gammaAbcG1` must hold exactly [GAMMA\_ABC\_G1\_SIZE](../variables/GAMMA_ABC_G1_SIZE.md) points: the constant
term, then one per public input in circuit order (`limitPerPeriod`, then
`totalSpent`). The contract rejects any other length, so this is checked
here too — a bad key is otherwise only discoverable by spending a
transaction on a revert.

## Properties

### alphaG1

> **alphaG1**: [`SolvencyG1Point`](../type-aliases/SolvencyG1Point.md)

Defined in: agent/solvency.ts:90

***

### betaG2

> **betaG2**: [`SolvencyG2Point`](../type-aliases/SolvencyG2Point.md)

Defined in: agent/solvency.ts:91

***

### gammaG2

> **gammaG2**: [`SolvencyG2Point`](../type-aliases/SolvencyG2Point.md)

Defined in: agent/solvency.ts:92

***

### deltaG2

> **deltaG2**: [`SolvencyG2Point`](../type-aliases/SolvencyG2Point.md)

Defined in: agent/solvency.ts:93

***

### gammaAbcG1

> **gammaAbcG1**: [`SolvencyG1Point`](../type-aliases/SolvencyG1Point.md)[]

Defined in: agent/solvency.ts:94
