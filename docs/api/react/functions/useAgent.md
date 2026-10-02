[**@stellaragent/react**](../README.md)

***

[@stellaragent/react](../README.md) / useAgent

# Function: useAgent()

> **useAgent**(`agentId`, `options?`): [`UsePollingResult`](../interfaces/UsePollingResult.md)\<`AgentInfo`\>

Defined in: [hooks/useAgent.ts:14](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/react/src/hooks/useAgent.ts#L14)

Polls `AgentWalletFactory.get_agent` for `agentId` via the current
`StellarAgent`, exposing the agent's identity (name, address, owner) and
its `active` status. Disabled (stays `idle`) until both the agent is
`ready` and `agentId` is defined, so it's safe to call before an agent
has been registered yet — e.g. `useAgent(agentId)` where `agentId` starts
`undefined`.

## Parameters

### agentId

`bigint` \| `undefined`

### options?

[`UsePollingOptions`](../interfaces/UsePollingOptions.md)

## Returns

[`UsePollingResult`](../interfaces/UsePollingResult.md)\<`AgentInfo`\>
