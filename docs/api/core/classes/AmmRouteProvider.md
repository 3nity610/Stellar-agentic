[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / AmmRouteProvider

# Class: AmmRouteProvider

Defined in: [routing/providers.ts:43](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L43)

Bounded graph discovery over one AMM/aggregator adapter.

## Implements

- [`RouteProvider`](../interfaces/RouteProvider.md)

## Constructors

### Constructor

> **new AmmRouteProvider**(`options`): `AmmRouteProvider`

Defined in: [routing/providers.ts:49](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L49)

#### Parameters

##### options

`AmmRouteProviderOptions`

#### Returns

`AmmRouteProvider`

## Properties

### id

> `readonly` **id**: `string`

Defined in: [routing/providers.ts:44](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L44)

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`id`](../interfaces/RouteProvider.md#id)

## Methods

### discover()

> **discover**(`request`, `context`): `Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

Defined in: [routing/providers.ts:57](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L57)

#### Parameters

##### request

[`RouteRequest`](../interfaces/RouteRequest.md)

##### context

[`RouteProviderContext`](../interfaces/RouteProviderContext.md)

#### Returns

`Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`discover`](../interfaces/RouteProvider.md#discover)
