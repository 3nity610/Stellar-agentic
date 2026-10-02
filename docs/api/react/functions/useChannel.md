[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / useChannel

# Function: useChannel()

> **useChannel**(`channelId`, `options?`): [`UsePollingResult`](../interfaces/UsePollingResult.md)\<`ChannelInfo`\>

Defined in: [hooks/useChannel.ts:13](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useChannel.ts#L13)

Polls `PaymentChannel.get_channel` for `channelId` via the current
`StellarAgent`. Disabled (stays `idle`) until both the agent is `ready`
and `channelId` is defined, so it's safe to call before a channel has
been opened yet — e.g. `useChannel(channelId)` where `channelId` starts
`undefined`.

## Parameters

### channelId

`bigint` \| `undefined`

### options?

[`UsePollingOptions`](../interfaces/UsePollingOptions.md)

## Returns

[`UsePollingResult`](../interfaces/UsePollingResult.md)\<`ChannelInfo`\>
