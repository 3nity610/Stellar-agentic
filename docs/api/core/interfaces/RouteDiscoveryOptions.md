[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RouteDiscoveryOptions

# Interface: RouteDiscoveryOptions

Defined in: [routing/types.ts:86](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L86)

## Extended by

- [`RoutePlannerOptions`](RoutePlannerOptions.md)

## Properties

### providers

> **providers**: [`RouteProvider`](RouteProvider.md)[]

Defined in: [routing/types.ts:87](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L87)

***

### oracle?

> `optional` **oracle?**: [`RoutePriceOracle`](RoutePriceOracle.md)

Defined in: [routing/types.ts:88](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L88)

***

### maxHops?

> `optional` **maxHops?**: `number`

Defined in: [routing/types.ts:90](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L90)

#### Default

```ts
3
```

***

### maxCandidates?

> `optional` **maxCandidates?**: `number`

Defined in: [routing/types.ts:92](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L92)

#### Default

```ts
32
```
