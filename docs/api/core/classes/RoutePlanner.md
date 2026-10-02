[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RoutePlanner

# Class: RoutePlanner

Defined in: [routing/planner.ts:36](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L36)

Discovery + deterministic selection + quote freshness in one reusable service.

## Constructors

### Constructor

> **new RoutePlanner**(`options`): `RoutePlanner`

Defined in: [routing/planner.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L42)

#### Parameters

##### options

[`RoutePlannerOptions`](../interfaces/RoutePlannerOptions.md)

#### Returns

`RoutePlanner`

## Methods

### quote()

> **quote**(`request`): `Promise`\<[`PaymentQuote`](../interfaces/PaymentQuote.md)\>

Defined in: [routing/planner.ts:61](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L61)

#### Parameters

##### request

[`PaymentQuoteRequest`](../interfaces/PaymentQuoteRequest.md)

#### Returns

`Promise`\<[`PaymentQuote`](../interfaces/PaymentQuote.md)\>

***

### quoteOverride()

> **quoteOverride**(`request`, `override`): [`PaymentQuote`](../interfaces/PaymentQuote.md)

Defined in: [routing/planner.ts:83](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L83)

Validate a caller-selected route under the same safety policy.

#### Parameters

##### request

[`PaymentQuoteRequest`](../interfaces/PaymentQuoteRequest.md)

##### override

[`RouteQuote`](../interfaces/RouteQuote.md)

#### Returns

[`PaymentQuote`](../interfaces/PaymentQuote.md)

***

### assertFresh()

> **assertFresh**(`quote`, `currentLedger`): `void`

Defined in: [routing/planner.ts:115](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L115)

#### Parameters

##### quote

[`PaymentQuote`](../interfaces/PaymentQuote.md)

##### currentLedger

`number`

#### Returns

`void`
