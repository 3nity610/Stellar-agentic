[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RateLimitStatus

# Interface: RateLimitStatus

Defined in: [types/index.ts:334](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L334)

Current rate-limit usage alongside the configured limits, for `RateLimiter`.

## Extends

- [`RateLimitConfig`](RateLimitConfig.md)

## Properties

### maxPerTx

> **maxPerTx**: `string`

Defined in: [types/index.ts:327](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L327)

#### Inherited from

[`RateLimitConfig`](RateLimitConfig.md).[`maxPerTx`](RateLimitConfig.md#maxpertx)

***

### maxPerHour

> **maxPerHour**: `string`

Defined in: [types/index.ts:328](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L328)

#### Inherited from

[`RateLimitConfig`](RateLimitConfig.md).[`maxPerHour`](RateLimitConfig.md#maxperhour)

***

### maxPerDay

> **maxPerDay**: `string`

Defined in: [types/index.ts:329](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L329)

#### Inherited from

[`RateLimitConfig`](RateLimitConfig.md).[`maxPerDay`](RateLimitConfig.md#maxperday)

***

### maxTxsPerHour

> **maxTxsPerHour**: `number`

Defined in: [types/index.ts:330](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L330)

#### Inherited from

[`RateLimitConfig`](RateLimitConfig.md).[`maxTxsPerHour`](RateLimitConfig.md#maxtxsperhour)

***

### spentThisHour

> **spentThisHour**: `string`

Defined in: [types/index.ts:336](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L336)

Amount spent in the current rolling hour

***

### spentToday

> **spentToday**: `string`

Defined in: [types/index.ts:338](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L338)

Amount spent in the current rolling day

***

### txsThisHour

> **txsThisHour**: `number`

Defined in: [types/index.ts:340](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L340)

Transaction count in the current rolling hour

***

### configured

> **configured**: `boolean`

Defined in: [types/index.ts:350](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L350)

Whether `RateLimiter.set_limits` has ever been called for this agent
(mirrors the contract's internal `has_limit` check). When `false`,
every other field on this object is meaningless — `RateLimiter.check`
returns `true` unconditionally for an unconfigured agent, so payments
are unrestricted by the rate limiter (though still subject to a
payment channel's own spend limit, if any). Distinct from `active`:
an agent can be `configured: true, active: false` (killed).

***

### active

> **active**: `boolean`

Defined in: [types/index.ts:358](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L358)

Mirrors the contract's `RateLimit.active` flag (set by `kill_agent`).
Note this does **not** by itself change what `RateLimiter.check`
returns on-chain today — see `predictPaymentOutcome`'s doc comment —
so treat this as informational (e.g. "killed" badge), not as a
blocking signal on its own.

***

### hourWindowStartLedger

> **hourWindowStartLedger**: `number`

Defined in: [types/index.ts:360](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L360)

Ledger sequence at which the current hourly window started.

***

### dayWindowStartLedger

> **dayWindowStartLedger**: `number`

Defined in: [types/index.ts:362](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L362)

Ledger sequence at which the current daily window started.
