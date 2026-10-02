[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / InMemoryMetrics

# Class: InMemoryMetrics

Defined in: [telemetry/metrics.ts:24](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L24)

In-memory metrics recorder for tests.

## Implements

- [`Metrics`](../interfaces/Metrics.md)

## Constructors

### Constructor

> **new InMemoryMetrics**(): `InMemoryMetrics`

#### Returns

`InMemoryMetrics`

## Properties

### histograms

> `readonly` **histograms**: `HistogramRecord`[] = `[]`

Defined in: [telemetry/metrics.ts:25](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L25)

***

### counters

> `readonly` **counters**: `CounterRecord`[] = `[]`

Defined in: [telemetry/metrics.ts:26](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L26)

## Methods

### recordHistogram()

> **recordHistogram**(`name`, `value`, `attributes?`): `void`

Defined in: [telemetry/metrics.ts:28](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L28)

#### Parameters

##### name

`string`

##### value

`number`

##### attributes?

`Record`\<`string`, `string` \| `number` \| `boolean`\>

#### Returns

`void`

#### Implementation of

[`Metrics`](../interfaces/Metrics.md).[`recordHistogram`](../interfaces/Metrics.md#recordhistogram)

***

### incrementCounter()

> **incrementCounter**(`name`, `delta?`, `attributes?`): `void`

Defined in: [telemetry/metrics.ts:36](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L36)

#### Parameters

##### name

`string`

##### delta?

`number` = `1`

##### attributes?

`Record`\<`string`, `string` \| `number` \| `boolean`\>

#### Returns

`void`

#### Implementation of

[`Metrics`](../interfaces/Metrics.md).[`incrementCounter`](../interfaces/Metrics.md#incrementcounter)
