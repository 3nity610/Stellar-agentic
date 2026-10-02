[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / Tracer

# Interface: Tracer

Defined in: [telemetry/tracer.ts:10](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/tracer.ts#L10)

## Methods

### startSpan()

> **startSpan**(`name`, `attributes?`): `Span`

Defined in: [telemetry/tracer.ts:11](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/tracer.ts#L11)

#### Parameters

##### name

`string`

##### attributes?

`SemanticAttributes`

#### Returns

`Span`

***

### startActiveSpan()

> **startActiveSpan**\<`T`\>(`name`, `attributes`, `fn`): `T` \| `Promise`\<`T`\>

Defined in: [telemetry/tracer.ts:12](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/tracer.ts#L12)

#### Type Parameters

##### T

`T`

#### Parameters

##### name

`string`

##### attributes

`SemanticAttributes` \| `undefined`

##### fn

(`span`) => `T` \| `Promise`\<`T`\>

#### Returns

`T` \| `Promise`\<`T`\>
