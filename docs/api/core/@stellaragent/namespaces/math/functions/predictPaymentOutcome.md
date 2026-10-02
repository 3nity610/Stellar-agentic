[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / predictPaymentOutcome

# Function: predictPaymentOutcome()

> **predictPaymentOutcome**(`__namedParameters`): [`PaymentPrediction`](../interfaces/PaymentPrediction.md)

Defined in: [math/predict.ts:165](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L165)

Predict whether a proposed `amount` would be blocked by a channel's spend
limit and/or a configured rate limiter, without an RPC round trip.

Pass `channelState: null`/`undefined` and/or `rateLimitState:
null`/`undefined` to skip either check (e.g. a payment with no channel, or
an agent with no `RateLimiter` configured at all).

## Parameters

### \_\_namedParameters

[`PredictPaymentOutcomeParams`](../interfaces/PredictPaymentOutcomeParams.md)

## Returns

[`PaymentPrediction`](../interfaces/PaymentPrediction.md)
