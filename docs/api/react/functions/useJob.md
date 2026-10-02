[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / useJob

# Function: useJob()

> **useJob**(`jobId`, `options?`): [`UsePollingResult`](../interfaces/UsePollingResult.md)\<`JobInfo`\>

Defined in: [hooks/useJob.ts:10](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useJob.ts#L10)

Polls `Escrow.get_job` for `jobId` via the current `StellarAgent`.
Disabled until both the agent is `ready` and `jobId` is defined.

## Parameters

### jobId

`bigint` \| `undefined`

### options?

[`UsePollingOptions`](../interfaces/UsePollingOptions.md)

## Returns

[`UsePollingResult`](../interfaces/UsePollingResult.md)\<`JobInfo`\>
