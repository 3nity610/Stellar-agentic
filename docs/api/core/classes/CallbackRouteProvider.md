[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / CallbackRouteProvider

# Class: CallbackRouteProvider

Defined in: [routing/providers.ts:169](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L169)

Small fixture/application adapter for a custom venue implementation.

## Implements

- [`RouteProvider`](../interfaces/RouteProvider.md)

## Constructors

### Constructor

> **new CallbackRouteProvider**(`id`, `callback`): `CallbackRouteProvider`

Defined in: [routing/providers.ts:173](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L173)

#### Parameters

##### id

`string`

##### callback

(`request`, `context`) => `Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

#### Returns

`CallbackRouteProvider`

## Properties

### id

> `readonly` **id**: `string`

Defined in: [routing/providers.ts:170](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L170)

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`id`](../interfaces/RouteProvider.md#id)

## Methods

### discover()

> **discover**(`request`, `context`): `Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

Defined in: [routing/providers.ts:179](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L179)

#### Parameters

##### request

[`RouteRequest`](../interfaces/RouteRequest.md)

##### context

[`RouteProviderContext`](../interfaces/RouteProviderContext.md)

#### Returns

`Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`discover`](../interfaces/RouteProvider.md#discover)
