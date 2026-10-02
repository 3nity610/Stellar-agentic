[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / OpenChannelParams

# Interface: OpenChannelParams

Defined in: [types/index.ts:193](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L193)

## Properties

### token?

> `optional` **token?**: `string`

Defined in: [types/index.ts:202](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L202)

Token to use for payments (defaults to XLM). This remains the
channel's single funding/settlement asset — `limitPerPeriod` is always
denominated in it, even for cross-asset payments made via
`payForAPI`'s `destAsset` (see `PayForAPIParams`). Cross-asset support
lets one channel pay recipients in other assets; it does not make the
channel itself multi-asset.

***

### deposit

> **deposit**: `string`

Defined in: [types/index.ts:204](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L204)

Initial deposit amount (as string to avoid precision issues)

***

### limitPerPeriod

> **limitPerPeriod**: `string`

Defined in: [types/index.ts:206](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L206)

Max spend per period, denominated in `token`

***

### period

> **period**: [`SpendPeriod`](../type-aliases/SpendPeriod.md)

Defined in: [types/index.ts:207](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L207)
