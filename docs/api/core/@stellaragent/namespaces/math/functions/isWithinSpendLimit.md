[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / isWithinSpendLimit

# Function: isWithinSpendLimit()

> **isWithinSpendLimit**(`spentThisPeriod`, `limitPerPeriod`, `proposedAmount`): `boolean`

Defined in: [math/bid.ts:249](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/bid.ts#L249)

Determine whether a proposed payment is within an agent's spend limit.

Replicates the on-chain `PaymentChannel.pay` guard in TypeScript so the SDK
can pre-validate without a network round-trip.  Uses the same integer-safe
arithmetic as the contract (amounts in stroops).

## Parameters

### spentThisPeriod

`string`

Already spent in current period (stroop string)

### limitPerPeriod

`string`

Configured period limit (stroop string)

### proposedAmount

`string`

Amount about to be spent (stroop string)

## Returns

`boolean`
