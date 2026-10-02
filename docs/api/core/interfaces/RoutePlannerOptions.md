[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RoutePlannerOptions

# Interface: RoutePlannerOptions

Defined in: [routing/planner.ts:14](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L14)

## Extends

- [`RouteDiscoveryOptions`](RouteDiscoveryOptions.md)

## Properties

### policy?

> `optional` **policy?**: [`RoutingPolicy`](../@stellaragent/namespaces/math/interfaces/RoutingPolicy.md)

Defined in: [routing/planner.ts:15](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L15)

***

### quoteValidityLedgers?

> `optional` **quoteValidityLedgers?**: `number`

Defined in: [routing/planner.ts:17](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L17)

Maximum quote lifetime when venues provide no earlier expiry.

#### Default

```ts
20
```

***

### defaultSlippageToleranceBps?

> `optional` **defaultSlippageToleranceBps?**: `number`

Defined in: [routing/planner.ts:19](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/planner.ts#L19)

Caller slippage used to derive the final minimum.

#### Default

```ts
100 (1%)
```

***

### providers

> **providers**: [`RouteProvider`](RouteProvider.md)[]

Defined in: [routing/types.ts:87](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L87)

#### Inherited from

[`RouteDiscoveryOptions`](RouteDiscoveryOptions.md).[`providers`](RouteDiscoveryOptions.md#providers)

***

### oracle?

> `optional` **oracle?**: [`RoutePriceOracle`](RoutePriceOracle.md)

Defined in: [routing/types.ts:88](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L88)

#### Inherited from

[`RouteDiscoveryOptions`](RouteDiscoveryOptions.md).[`oracle`](RouteDiscoveryOptions.md#oracle)

***

### maxHops?

> `optional` **maxHops?**: `number`

Defined in: [routing/types.ts:90](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L90)

#### Default

```ts
3
```

#### Inherited from

[`RouteDiscoveryOptions`](RouteDiscoveryOptions.md).[`maxHops`](RouteDiscoveryOptions.md#maxhops)

***

### maxCandidates?

> `optional` **maxCandidates?**: `number`

Defined in: [routing/types.ts:92](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L92)

#### Default

```ts
32
```

#### Inherited from

[`RouteDiscoveryOptions`](RouteDiscoveryOptions.md).[`maxCandidates`](RouteDiscoveryOptions.md#maxcandidates)
