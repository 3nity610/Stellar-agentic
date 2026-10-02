[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / ChannelInfo

# Interface: ChannelInfo

Defined in: [types/index.ts:258](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L258)

## Properties

### id

> **id**: `bigint`

Defined in: [types/index.ts:259](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L259)

***

### agent

> **agent**: `string`

Defined in: [types/index.ts:260](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L260)

***

### owner

> **owner**: `string`

Defined in: [types/index.ts:261](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L261)

***

### token

> **token**: `string`

Defined in: [types/index.ts:262](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L262)

***

### limitPerPeriod

> **limitPerPeriod**: `bigint`

Defined in: [types/index.ts:263](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L263)

***

### spentThisPeriod

> **spentThisPeriod**: `bigint`

Defined in: [types/index.ts:264](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L264)

***

### totalSpent

> **totalSpent**: `bigint`

Defined in: [types/index.ts:265](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L265)

***

### active

> **active**: `boolean`

Defined in: [types/index.ts:266](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L266)

***

### period

> **period**: [`SpendPeriod`](../type-aliases/SpendPeriod.md)

Defined in: [types/index.ts:268](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L268)

Reset cadence for `spentThisPeriod`, mirroring `Channel.period` on-chain.

***

### periodStartLedger

> **periodStartLedger**: `number`

Defined in: [types/index.ts:276](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L276)

Ledger sequence at which the current period started, mirroring
`Channel.period_start_ledger`. `PaymentChannel.pay` resets
`spentThisPeriod` to 0 once `currentLedger >= periodStartLedger +
<ledgers for period>` — needed to predict spend-limit outcomes without
a stale `spentThisPeriod` (see `math/predict.ts`).
