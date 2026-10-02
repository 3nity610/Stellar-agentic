[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / selectRoute

# Function: selectRoute()

> **selectRoute**(`routes`, `policy?`): [`ScoredRoute`](../interfaces/ScoredRoute.md) \| `null`

Defined in: [math/routing.ts:107](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L107)

Select the deterministic winner, or null when no route is admissible.

## Parameters

### routes

readonly [`RouteQuote`](../../../../interfaces/RouteQuote.md)[]

### policy?

[`RoutingPolicy`](../interfaces/RoutingPolicy.md) = `DEFAULT_ROUTING_POLICY`

## Returns

[`ScoredRoute`](../interfaces/ScoredRoute.md) \| `null`
