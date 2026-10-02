[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RouteProvider

# Interface: RouteProvider

Defined in: [routing/types.ts:69](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L69)

Venue adapter. Provider failures are isolated by the discovery engine.

## Properties

### id

> `readonly` **id**: `string`

Defined in: [routing/types.ts:70](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L70)

## Methods

### discover()

> **discover**(`request`, `context`): `Promise`\<[`RouteHop`](RouteHop.md)[][]\>

Defined in: [routing/types.ts:71](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L71)

#### Parameters

##### request

[`RouteRequest`](RouteRequest.md)

##### context

[`RouteProviderContext`](RouteProviderContext.md)

#### Returns

`Promise`\<[`RouteHop`](RouteHop.md)[][]\>
