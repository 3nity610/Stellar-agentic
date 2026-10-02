[**@stellaragent/core**](../../../../README.md)

***

[@stellaragent/core](../../../../README.md) / [math](../README.md) / BlockReason

# Type Alias: BlockReason

> **BlockReason** = `"invalid_amount"` \| `"channel_inactive"` \| `"channel_spend_limit"` \| `"rate_limit_per_tx"` \| `"rate_limit_hourly"` \| `"rate_limit_daily"` \| `"rate_limit_tx_count"`

Defined in: [math/predict.ts:116](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/math/predict.ts#L116)

Every distinct reason `predictPaymentOutcome` can cite for a block, each tied to one specific on-chain check.
