[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RoutePriceOracle

# Interface: RoutePriceOracle

Defined in: [routing/types.ts:75](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L75)

Optional independent fair-value source; never treated as executable liquidity.

## Properties

### id

> `readonly` **id**: `string`

Defined in: [routing/types.ts:76](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L76)

## Methods

### quote()

> **quote**(`request`): `Promise`\<[`OracleReference`](OracleReference.md) \| `null`\>

Defined in: [routing/types.ts:77](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/routing/types.ts#L77)

#### Parameters

##### request

[`RouteRequest`](RouteRequest.md)

#### Returns

`Promise`\<[`OracleReference`](OracleReference.md) \| `null`\>
