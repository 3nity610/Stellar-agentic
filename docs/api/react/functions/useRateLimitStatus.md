[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / useRateLimitStatus

# Function: useRateLimitStatus()

> **useRateLimitStatus**(`agentAddress`, `options?`): [`UseRateLimitStatusResult`](../type-aliases/UseRateLimitStatusResult.md)

Defined in: [hooks/useRateLimitStatus.ts:175](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L175)

Pre-flight rate-limit + spend-limit status for `agentAddress`, polling
`RateLimiter.get_limits` and (when `channelId` is given)
`PaymentChannel.get_channel`/`remaining_this_period`, plus a Horizon-derived
ledger-close estimate to translate ledger-count windows into wall-clock
time. Exposes `wouldBlock(amount)` / `predict(amount)`, built on
`@stellaragent/core`'s `predictPaymentOutcome`, so a caller can check
"would my next payment be blocked?" without a network round trip or a
transaction fee.

Disabled (stays `idle`) until the agent is `ready`.

## Parameters

### agentAddress

`string`

### options?

[`UseRateLimitStatusOptions`](../interfaces/UseRateLimitStatusOptions.md)

## Returns

[`UseRateLimitStatusResult`](../type-aliases/UseRateLimitStatusResult.md)
