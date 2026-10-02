[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / RateLimitSpendState

# Interface: RateLimitSpendState

Defined in: [math/predict.ts:88](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L88)

The subset of `RateLimit` (contracts/rate_limiter/src/lib.rs) needed to predict `check`.

## Properties

### configured

> **configured**: `boolean`

Defined in: [math/predict.ts:90](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L90)

`has_limit(agent)` on-chain — `false` means `check()` always returns `true`.

***

### active

> **active**: `boolean`

Defined in: [math/predict.ts:92](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L92)

`RateLimit.active` — see the module doc for why this does not gate `wouldBlock`.

***

### maxPerTx

> **maxPerTx**: `string`

Defined in: [math/predict.ts:93](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L93)

***

### maxPerHour

> **maxPerHour**: `string`

Defined in: [math/predict.ts:94](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L94)

***

### maxPerDay

> **maxPerDay**: `string`

Defined in: [math/predict.ts:95](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L95)

***

### maxTxsPerHour

> **maxTxsPerHour**: `number`

Defined in: [math/predict.ts:96](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L96)

***

### hourlySpend

> **hourlySpend**: `string`

Defined in: [math/predict.ts:97](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L97)

***

### dailySpend

> **dailySpend**: `string`

Defined in: [math/predict.ts:98](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L98)

***

### hourlyTxCount

> **hourlyTxCount**: `number`

Defined in: [math/predict.ts:99](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L99)

***

### hourWindowStartLedger

> **hourWindowStartLedger**: `number`

Defined in: [math/predict.ts:100](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L100)

***

### dayWindowStartLedger

> **dayWindowStartLedger**: `number`

Defined in: [math/predict.ts:101](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L101)
