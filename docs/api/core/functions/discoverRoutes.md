[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / discoverRoutes

# Function: discoverRoutes()

> **discoverRoutes**(`request`, `options`): `Promise`\<[`RouteDiscoveryResult`](../interfaces/RouteDiscoveryResult.md)\>

Defined in: [routing/discovery.ts:31](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/discovery.ts#L31)

Enumerate and normalize every provider independently. A broken or illiquid
venue becomes a diagnostic entry while valid candidates remain selectable.

## Parameters

### request

[`RouteRequest`](../interfaces/RouteRequest.md)

### options

[`RouteDiscoveryOptions`](../interfaces/RouteDiscoveryOptions.md)

## Returns

`Promise`\<[`RouteDiscoveryResult`](../interfaces/RouteDiscoveryResult.md)\>
