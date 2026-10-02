[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / DirectRouteProvider

# Class: DirectRouteProvider

Defined in: [routing/providers.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L13)

Same-asset candidate. It performs no conversion and charges no fee.

## Implements

- [`RouteProvider`](../interfaces/RouteProvider.md)

## Constructors

### Constructor

> **new DirectRouteProvider**(): `DirectRouteProvider`

#### Returns

`DirectRouteProvider`

## Properties

### id

> `readonly` **id**: `"direct"` = `'direct'`

Defined in: [routing/providers.ts:14](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L14)

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`id`](../interfaces/RouteProvider.md#id)

## Methods

### discover()

> **discover**(`request`): `Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

Defined in: [routing/providers.ts:16](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L16)

#### Parameters

##### request

[`RouteRequest`](../interfaces/RouteRequest.md)

#### Returns

`Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`discover`](../interfaces/RouteProvider.md#discover)
