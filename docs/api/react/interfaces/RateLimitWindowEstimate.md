[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / RateLimitWindowEstimate

# Interface: RateLimitWindowEstimate

Defined in: [hooks/useRateLimitStatus.ts:30](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L30)

A ledger-count window, plus a wall-clock estimate derived from recently observed ledger close times.

## Properties

### ledgersRemaining

> **ledgersRemaining**: `number`

Defined in: [hooks/useRateLimitStatus.ts:32](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L32)

Ledgers remaining until this window resets (0 once it has).

***

### estimatedSecondsRemaining

> **estimatedSecondsRemaining**: `number`

Defined in: [hooks/useRateLimitStatus.ts:39](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useRateLimitStatus.ts#L39)

**Estimated** wall-clock seconds remaining — `ledgersRemaining *`
an average ledger close time measured from recent Horizon ledgers, not
a hard-coded "5 seconds". Ledger close times drift with network
conditions, so treat this as an approximation, not a countdown timer.
