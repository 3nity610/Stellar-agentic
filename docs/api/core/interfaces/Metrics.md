[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / Metrics

# Interface: Metrics

Defined in: [telemetry/metrics.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L13)

## Methods

### recordHistogram()

> **recordHistogram**(`name`, `value`, `attributes?`): `void`

Defined in: [telemetry/metrics.ts:14](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L14)

#### Parameters

##### name

`string`

##### value

`number`

##### attributes?

`Record`\<`string`, `string` \| `number` \| `boolean`\>

#### Returns

`void`

***

### incrementCounter()

> **incrementCounter**(`name`, `delta?`, `attributes?`): `void`

Defined in: [telemetry/metrics.ts:15](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/metrics.ts#L15)

#### Parameters

##### name

`string`

##### delta?

`number`

##### attributes?

`Record`\<`string`, `string` \| `number` \| `boolean`\>

#### Returns

`void`
