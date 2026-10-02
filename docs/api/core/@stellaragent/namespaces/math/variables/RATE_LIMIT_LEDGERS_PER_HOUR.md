[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / RATE\_LIMIT\_LEDGERS\_PER\_HOUR

# Variable: RATE\_LIMIT\_LEDGERS\_PER\_HOUR

> `const` **RATE\_LIMIT\_LEDGERS\_PER\_HOUR**: `720` = `720`

Defined in: [math/predict.ts:73](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L73)

`RateLimiter`'s hourly/daily windows are fixed cadences, independent of any
channel's own configurable period — mirroring the constants inside
`RateLimiter::reset_windows_if_needed` in
`contracts/rate_limiter/src/lib.rs`.
