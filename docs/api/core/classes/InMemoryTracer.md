[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / InMemoryTracer

# Class: InMemoryTracer

Defined in: [telemetry/tracer.ts:47](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/tracer.ts#L47)

## Implements

- [`Tracer`](../interfaces/Tracer.md)

## Constructors

### Constructor

> **new InMemoryTracer**(): `InMemoryTracer`

#### Returns

`InMemoryTracer`

## Properties

### spans

> `readonly` **spans**: [`RecordedSpan`](../interfaces/RecordedSpan.md)[] = `[]`

Defined in: [telemetry/tracer.ts:48](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/tracer.ts#L48)

## Methods

### startSpan()

> **startSpan**(`name`, `attributes?`): `Span`

Defined in: [telemetry/tracer.ts:50](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/tracer.ts#L50)

#### Parameters

##### name

`string`

##### attributes?

`SemanticAttributes` = `{}`

#### Returns

`Span`

#### Implementation of

[`Tracer`](../interfaces/Tracer.md).[`startSpan`](../interfaces/Tracer.md#startspan)

***

### startActiveSpan()

> **startActiveSpan**\<`T`\>(`name`, `attributes`, `fn`): `T` \| `Promise`\<`T`\>

Defined in: [telemetry/tracer.ts:72](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/tracer.ts#L72)

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

#### Implementation of

[`Tracer`](../interfaces/Tracer.md).[`startActiveSpan`](../interfaces/Tracer.md#startactivespan)
