[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / StellarAgentConfig

# Interface: StellarAgentConfig

Defined in: [types/index.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L42)

## Properties

### network

> **network**: [`Network`](../type-aliases/Network.md)

Defined in: [types/index.ts:44](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L44)

Stellar network to connect to

***

### signer?

> `optional` **signer?**: `object`

Defined in: [types/index.ts:56](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L56)

Where signing happens.

Prefer this over `secretKey` for anything holding real funds: with a
`RemoteSigner` (or a hardware/wallet-backed one) the key never enters
this process, so a heap dump or a compromised transitive dependency
cannot yield it. Mutually exclusive with `secretKey`.

Typed structurally rather than imported to keep `types/` free of runtime
imports; see `signer.ts` for the interface and its implementations.

#### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

##### Returns

`Promise`\<`string`\>

#### signTransaction()

> **signTransaction**(`xdr`, `options`): `Promise`\<`string`\>

##### Parameters

###### xdr

`string`

###### options

###### networkPassphrase

`string`

##### Returns

`Promise`\<`string`\>

#### signAuthEntry()

> **signAuthEntry**(`authEntryXdr`, `options`): `Promise`\<`string`\>

##### Parameters

###### authEntryXdr

`string`

###### options

###### networkPassphrase

`string`

###### validUntilLedgerSeq

`number`

##### Returns

`Promise`\<`string`\>

***

### secretKey?

> `optional` **secretKey?**: `string`

Defined in: [types/index.ts:71](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L71)

Private key for the agent wallet (keep secret!).

Holding a raw secret in a long-lived process is a real risk for an agent
with funds — use `signer` instead where that matters. Mutually exclusive
with `signer`.

***

### spendLimit?

> `optional` **spendLimit?**: [`SpendLimit`](SpendLimit.md)

Defined in: [types/index.ts:73](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L73)

Spend limit enforced on-chain

***

### contracts?

> `optional` **contracts?**: `Partial`\<[`ContractAddresses`](ContractAddresses.md)\>

Defined in: [types/index.ts:79](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L79)

Contract addresses. Anything omitted falls back to the
`STELLARAGENT_<NETWORK>_<CONTRACT>` / `STELLARAGENT_<CONTRACT>`
environment variables, then to the network's unconfigured sentinel.

***

### assetContracts?

> `optional` **assetContracts?**: `Record`\<`string`, `string`\>

Defined in: [types/index.ts:84](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L84)

Token contract IDs keyed by friendly asset code (for example `USDC`).
`XLM` resolves automatically, and a `C...` ID may be passed directly.

***

### allowUnconfiguredContracts?

> `optional` **allowUnconfiguredContracts?**: `boolean`

Defined in: [types/index.ts:97](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L97)

Skip the deployed-contracts check in `StellarAgent.create()`.

By default an agent refuses to be created against contract addresses
that are not real deployed contract IDs, so the failure names the actual
problem instead of surfacing as an opaque RPC error mid-payment. Set
this when you only need calls that touch no contract at all — currently
`getBalance()` — or in tests. Any contract call made on such an agent
will still fail.

#### Default

```ts
false
```

***

### telemetry?

> `optional` **telemetry?**: `object`

Defined in: [types/index.ts:102](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L102)

OpenTelemetry tracing, metrics, and logging. When omitted or
`{ enabled: false }`, telemetry is a no-op with zero overhead.

#### enabled?

> `optional` **enabled?**: `boolean`

#### serviceName?

> `optional` **serviceName?**: `string`

#### otlpEndpoint?

> `optional` **otlpEndpoint?**: `string`

#### logLevel?

> `optional` **logLevel?**: `"debug"` \| `"info"` \| `"warn"` \| `"error"`

#### tracer?

> `optional` **tracer?**: [`Tracer`](Tracer.md)

Test-only injection — not for production use.

#### metrics?

> `optional` **metrics?**: [`Metrics`](Metrics.md)

***

### channelPool?

> `optional` **channelPool?**: [`ChannelAccountPool`](../classes/ChannelAccountPool.md)

Defined in: [types/index.ts:116](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L116)

Fleet transaction source accounts. Each mutation exclusively leases one,
removing sequence-number contention from the agent authorization account.
`channelAccountPool` is retained as a descriptive alias.

***

### channelAccountPool?

> `optional` **channelAccountPool?**: [`ChannelAccountPool`](../classes/ChannelAccountPool.md)

Defined in: [types/index.ts:117](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L117)

***

### feeStrategy?

> `optional` **feeStrategy?**: `string` \| `number` \| `bigint` \| [`FeeStrategy`](FeeStrategy.md) \| [`FeeCallback`](../type-aliases/FeeCallback.md)

Defined in: [types/index.ts:119](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L119)

Dynamic transaction fee policy. Recent p90 network fees are used by default.

***

### feeBump?

> `optional` **feeBump?**: [`FeeBumpConfig`](FeeBumpConfig.md)

Defined in: [types/index.ts:126](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L126)

Fee-bump behavior for congestion and zero-XLM transaction sources.

***

### sponsorService?

> `optional` **sponsorService?**: [`SponsorService`](../classes/SponsorService.md)

Defined in: [types/index.ts:128](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L128)

Creates the agent's account with a sponsored reserve in `createAgentWallet()`.

***

### submissionQueue?

> `optional` **submissionQueue?**: [`SubmissionQueue`](../classes/SubmissionQueue.md)

Defined in: [types/index.ts:130](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L130)

An existing queue, useful when several agents share one fleet-wide bound.

***

### submission?

> `optional` **submission?**: [`SubmissionPipelineConfig`](SubmissionPipelineConfig.md)

Defined in: [types/index.ts:132](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L132)

Build a queue owned by this agent. Omitted fields use fleet-safe defaults.

***

### routing?

> `optional` **routing?**: [`RoutePlannerOptions`](RoutePlannerOptions.md)

Defined in: [types/index.ts:134](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/types/index.ts#L134)

Multi-venue discovery and deterministic route-selection configuration.
