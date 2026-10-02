[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RedactingLogger

# Class: RedactingLogger

Defined in: [telemetry/logger.ts:70](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/logger.ts#L70)

## Implements

- [`Logger`](../interfaces/Logger.md)

## Constructors

### Constructor

> **new RedactingLogger**(`options?`): `RedactingLogger`

Defined in: [telemetry/logger.ts:74](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/logger.ts#L74)

#### Parameters

##### options?

`LoggerOptions` = `{}`

#### Returns

`RedactingLogger`

## Methods

### debug()

> **debug**(`message`, `attributes?`): `void`

Defined in: [telemetry/logger.ts:79](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/logger.ts#L79)

#### Parameters

##### message

`string`

##### attributes?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`debug`](../interfaces/Logger.md#debug)

***

### info()

> **info**(`message`, `attributes?`): `void`

Defined in: [telemetry/logger.ts:83](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/logger.ts#L83)

#### Parameters

##### message

`string`

##### attributes?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`info`](../interfaces/Logger.md#info)

***

### warn()

> **warn**(`message`, `attributes?`): `void`

Defined in: [telemetry/logger.ts:87](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/logger.ts#L87)

#### Parameters

##### message

`string`

##### attributes?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`warn`](../interfaces/Logger.md#warn)

***

### error()

> **error**(`message`, `attributes?`): `void`

Defined in: [telemetry/logger.ts:91](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/telemetry/logger.ts#L91)

#### Parameters

##### message

`string`

##### attributes?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`error`](../interfaces/Logger.md#error)
