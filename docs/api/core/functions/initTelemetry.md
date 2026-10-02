[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / initTelemetry

# Function: initTelemetry()

> **initTelemetry**(`config?`): `Promise`\<[`TelemetryContext`](../interfaces/TelemetryContext.md)\>

Defined in: [telemetry/index.ts:70](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/index.ts#L70)

Initialize global telemetry. When `enabled` is false, this is a no-op and
OpenTelemetry packages are never loaded.

## Parameters

### config?

[`TelemetryConfig`](../interfaces/TelemetryConfig.md) & `object` = `{}`

## Returns

`Promise`\<[`TelemetryContext`](../interfaces/TelemetryContext.md)\>
