[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / PaymentQuote

# Interface: PaymentQuote

Defined in: [routing/planner.ts:27](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L27)

Complete pre-commit artifact. Pass this object back to `payForAPI`.

## Properties

### route

> **route**: [`ScoredRoute`](../@stellaragent/namespaces/math/interfaces/ScoredRoute.md)

Defined in: [routing/planner.ts:28](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L28)

***

### minimumDestinationAmount

> **minimumDestinationAmount**: `string`

Defined in: [routing/planner.ts:29](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L29)

***

### quotedAtLedger

> **quotedAtLedger**: `number`

Defined in: [routing/planner.ts:30](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L30)

***

### validUntilLedger

> **validUntilLedger**: `number`

Defined in: [routing/planner.ts:31](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L31)

***

### failures

> **failures**: [`RouteDiscoveryFailure`](RouteDiscoveryFailure.md)[]

Defined in: [routing/planner.ts:32](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L32)
