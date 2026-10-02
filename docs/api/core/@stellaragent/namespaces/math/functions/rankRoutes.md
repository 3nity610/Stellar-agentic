[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / rankRoutes

# Function: rankRoutes()

> **rankRoutes**(`routes`, `policy?`): [`ScoredRoute`](../interfaces/ScoredRoute.md)[]

Defined in: [math/routing.ts:91](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/routing.ts#L91)

Rank routes with a total, input-order-independent comparison:
score, output (descending), slippage, hop count, then canonical route ID.

## Parameters

### routes

readonly [`RouteQuote`](../../../../interfaces/RouteQuote.md)[]

### policy?

[`RoutingPolicy`](../interfaces/RoutingPolicy.md) = `DEFAULT_ROUTING_POLICY`

## Returns

[`ScoredRoute`](../interfaces/ScoredRoute.md)[]
