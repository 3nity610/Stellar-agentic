[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / StellarPathPaymentProvider

# Class: StellarPathPaymentProvider

Defined in: [routing/providers.ts:131](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L131)

Adapter around Horizon strict-send path discovery or a compatible service.

## Implements

- [`RouteProvider`](../interfaces/RouteProvider.md)

## Constructors

### Constructor

> **new StellarPathPaymentProvider**(`options`): `StellarPathPaymentProvider`

Defined in: [routing/providers.ts:135](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L135)

#### Parameters

##### options

`StellarPathPaymentProviderOptions`

#### Returns

`StellarPathPaymentProvider`

## Properties

### id

> `readonly` **id**: `string`

Defined in: [routing/providers.ts:132](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L132)

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`id`](../interfaces/RouteProvider.md#id)

## Methods

### discover()

> **discover**(`request`, `context`): `Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

Defined in: [routing/providers.ts:140](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/providers.ts#L140)

#### Parameters

##### request

[`RouteRequest`](../interfaces/RouteRequest.md)

##### context

[`RouteProviderContext`](../interfaces/RouteProviderContext.md)

#### Returns

`Promise`\<[`RouteHop`](../interfaces/RouteHop.md)[][]\>

#### Implementation of

[`RouteProvider`](../interfaces/RouteProvider.md).[`discover`](../interfaces/RouteProvider.md#discover)
