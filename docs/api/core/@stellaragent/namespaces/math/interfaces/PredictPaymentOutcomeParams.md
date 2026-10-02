[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / PredictPaymentOutcomeParams

# Interface: PredictPaymentOutcomeParams

Defined in: [math/predict.ts:104](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L104)

## Properties

### channelState?

> `optional` **channelState?**: [`ChannelSpendState`](ChannelSpendState.md) \| `null`

Defined in: [math/predict.ts:106](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L106)

Omit (or pass `null`) if the payment isn't going through a channel at all.

***

### rateLimitState?

> `optional` **rateLimitState?**: [`RateLimitSpendState`](RateLimitSpendState.md) \| `null`

Defined in: [math/predict.ts:108](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L108)

Omit (or pass `null`) if no `RateLimiter` applies to this agent/path.

***

### amount

> **amount**: `string`

Defined in: [math/predict.ts:110](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L110)

Proposed payment amount, same unit as the channel/rate-limit state (stroops as a decimal string).

***

### currentLedger

> **currentLedger**: `number`

Defined in: [math/predict.ts:112](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L112)

Current ledger sequence — used to replicate the contracts' reset-before-check window semantics.
