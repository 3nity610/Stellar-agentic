[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / TelemetryConfig

# Interface: TelemetryConfig

Defined in: [telemetry/index.ts:7](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L7)

## Properties

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [telemetry/index.ts:9](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L9)

When false (default), all telemetry is no-op with zero overhead.

***

### serviceName?

> `optional` **serviceName?**: `string`

Defined in: [telemetry/index.ts:11](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L11)

Service name reported to exporters.

***

### otlpEndpoint?

> `optional` **otlpEndpoint?**: `string`

Defined in: [telemetry/index.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L13)

OTLP endpoint for traces and metrics (e.g. http://localhost:4318).

***

### logSink?

> `optional` **logSink?**: (`record`) => `void`

Defined in: [telemetry/index.ts:15](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L15)

Custom logger sink — receives redacted records only.

#### Parameters

##### record

`LogRecord`

#### Returns

`void`

***

### logLevel?

> `optional` **logLevel?**: `"debug"` \| `"info"` \| `"warn"` \| `"error"`

Defined in: [telemetry/index.ts:17](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L17)

Minimum log level when a custom sink is configured.

***

### tracer?

> `optional` **tracer?**: [`Tracer`](Tracer.md)

Defined in: [telemetry/index.ts:19](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L19)

Inject tracers/metrics for tests.

***

### metrics?

> `optional` **metrics?**: [`Metrics`](Metrics.md)

Defined in: [telemetry/index.ts:20](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L20)

***

### logger?

> `optional` **logger?**: [`Logger`](Logger.md)

Defined in: [telemetry/index.ts:21](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L21)
