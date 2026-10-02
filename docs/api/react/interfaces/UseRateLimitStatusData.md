[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / UseRateLimitStatusData

# Interface: UseRateLimitStatusData

Defined in: [hooks/useRateLimitStatus.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L42)

## Properties

### rateLimit

> **rateLimit**: `RateLimitStatus`

Defined in: [hooks/useRateLimitStatus.ts:44](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L44)

Raw `RateLimiter.get_limits` result for the queried agent.

***

### channel

> **channel**: `ChannelInfo` \| `null`

Defined in: [hooks/useRateLimitStatus.ts:46](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L46)

Raw `PaymentChannel.get_channel` result, or `null` if no `channelId` was given.

***

### rateLimitConfigured

> **rateLimitConfigured**: `boolean`

Defined in: [hooks/useRateLimitStatus.ts:54](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L54)

`false` only when `RateLimiter.set_limits` has never been called for
this agent — payments are then unrestricted by the rate limiter
(`RateLimiter.check` always returns `true`), though a configured
channel's own spend limit can still apply. Distinct from
`rateLimitKilled`.

***

### rateLimitKilled

> **rateLimitKilled**: `boolean`

Defined in: [hooks/useRateLimitStatus.ts:63](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L63)

`true` when a rate limit *is* configured but has been disabled via
`RateLimiter.kill_agent`. Informational only: today's on-chain
`RateLimiter.check` does not itself gate on this flag (only
`is_active()`, a separate query, does) — see `predictPaymentOutcome`'s
doc comment in `@stellaragent/core` for the full explanation. Surface
this as a "killed" badge, not as something that changes `wouldBlock`.

***

### hourWindow

> **hourWindow**: [`RateLimitWindowEstimate`](RateLimitWindowEstimate.md)

Defined in: [hooks/useRateLimitStatus.ts:65](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L65)

Time until the rate limiter's rolling hourly window resets.

***

### dayWindow

> **dayWindow**: [`RateLimitWindowEstimate`](RateLimitWindowEstimate.md)

Defined in: [hooks/useRateLimitStatus.ts:67](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L67)

Time until the rate limiter's rolling daily window resets.

***

### channelPeriodWindow

> **channelPeriodWindow**: [`RateLimitWindowEstimate`](RateLimitWindowEstimate.md) \| `null`

Defined in: [hooks/useRateLimitStatus.ts:69](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L69)

Time until the channel's own spend-limit period resets, or `null` when no `channelId` was given.

***

### wouldBlock

> **wouldBlock**: (`amount`) => `boolean`

Defined in: [hooks/useRateLimitStatus.ts:71](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L71)

Whether `amount` would be blocked by the channel's spend limit and/or the configured rate limiter.

#### Parameters

##### amount

`string`

#### Returns

`boolean`

***

### predict

> **predict**: (`amount`) => `PaymentPrediction`

Defined in: [hooks/useRateLimitStatus.ts:73](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L73)

Same check as `wouldBlock`, with the specific reasons attached.

#### Parameters

##### amount

`string`

#### Returns

`PaymentPrediction`
