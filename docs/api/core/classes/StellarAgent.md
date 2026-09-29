[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / StellarAgent

# Class: StellarAgent

Defined in: [agent/StellarAgent.ts:66](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L66)

Main SDK class for AI Agent payment operations on Stellar.

## Example

```typescript
const agent = await StellarAgent.create({
  network: 'testnet',
  spendLimit: { amount: '10', asset: 'USDC', period: 'hourly' },
});

await agent.payForAPI({
  endpoint: 'https://api.example.com/inference',
  amount: '0.001',
  asset: 'USDC',
});
```

## Accessors

### address

#### Get Signature

> **get** **address**(): `string`

Defined in: [agent/StellarAgent.ts:297](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L297)

The agent's Stellar public address.

Resolved through the [Signer](../interfaces/Signer.md) at `create()` time, so this works
identically for a remote signer that never exposes its secret.

##### Returns

`string`

***

### secretKey

#### Get Signature

> **get** **secretKey**(): `string`

Defined in: [agent/StellarAgent.ts:315](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L315)

The agent's secret key.

Only available when the agent was built from an in-memory keypair. With
any other [Signer](../interfaces/Signer.md) there is no secret in this process to return —
which is the point — so this throws rather than returning something
misleading.

##### Deprecated

Reading key material off a live agent is the pattern the
[Signer](../interfaces/Signer.md) abstraction exists to remove. Hold the secret yourself if
you need it, or use a [RemoteSigner](RemoteSigner.md) and stop having one.

##### Throws

when signing is not backed by a local keypair

##### Returns

`string`

***

### holdsSecretKey

#### Get Signature

> **get** **holdsSecretKey**(): `boolean`

Defined in: [agent/StellarAgent.ts:332](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L332)

Whether this agent holds key material in-process.

`false` for a remote or hardware signer. Useful for asserting a
production deployment is not running with an in-memory secret.

##### Returns

`boolean`

## Methods

### create()

> `static` **create**(`config`): `Promise`\<`StellarAgent`\>

Defined in: [agent/StellarAgent.ts:154](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L154)

Create a new StellarAgent instance.

Supply exactly one of:
- `signer` — any [Signer](../interfaces/Signer.md). The secret never enters this process.
- `secretKey` — an in-memory keypair, wrapped in a [KeypairSigner](KeypairSigner.md).
- neither — a fresh random keypair is generated.

Contract addresses resolve from `config.contracts`, then from
`STELLARAGENT_*` environment variables, then from the per-network
unconfigured sentinels. If the result is not a set of real deployed
contract IDs this throws [ContractsNotDeployedError](ContractsNotDeployedError.md) immediately,
rather than letting an opaque RPC error surface later from the middle of
a payment. Pass `allowUnconfiguredContracts: true` to skip that check
when you only need read-only, contract-free calls such as
[StellarAgent.getBalance](#getbalance).

#### Parameters

##### config

[`StellarAgentConfig`](../interfaces/StellarAgentConfig.md)

#### Returns

`Promise`\<`StellarAgent`\>

#### Example

**Remote signer — no key material in this process**

```typescript
const agent = await StellarAgent.create({
  network: 'testnet',
  signer: new RemoteSigner({ url: 'https://signer.internal', token: TOKEN }),
});
```

#### Throws

when contracts are not deployed

***

### fromSecret()

> `static` **fromSecret**(`secretKey`, `network?`, `options?`): `Promise`\<`StellarAgent`\>

Defined in: [agent/StellarAgent.ts:281](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L281)

Restore an agent from an existing secret key.

`options` forwards the rest of [StellarAgentConfig](../interfaces/StellarAgentConfig.md) — notably
`contracts` and `allowUnconfiguredContracts`, without which a restored
agent could only ever target contracts resolved from the environment.

#### Parameters

##### secretKey

`string`

##### network?

[`Network`](../type-aliases/Network.md) = `'testnet'`

##### options?

`Omit`\<[`StellarAgentConfig`](../interfaces/StellarAgentConfig.md), `"network"` \| `"secretKey"`\> = `{}`

#### Returns

`Promise`\<`StellarAgent`\>

***

### getFleetStats()

> **getFleetStats**(): `object`

Defined in: [agent/StellarAgent.ts:337](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L337)

Current channel utilization and queue/backpressure counters.

#### Returns

`object`

##### channels?

> `optional` **channels?**: [`ChannelPoolStats`](../interfaces/ChannelPoolStats.md)

##### submissions

> **submissions**: [`SubmissionQueueStats`](../interfaces/SubmissionQueueStats.md)

***

### resizeChannelPool()

> **resizeChannelPool**(`size`): `Promise`\<`void`\>

Defined in: [agent/StellarAgent.ts:348](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L348)

Grow or reclaim the configured channel-account fleet.

#### Parameters

##### size

`number`

#### Returns

`Promise`\<`void`\>

***

### shutdown()

> **shutdown**(): `Promise`\<`void`\>

Defined in: [agent/StellarAgent.ts:359](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L359)

Drain accepted submissions and reclaim agent-owned channel accounts.

#### Returns

`Promise`\<`void`\>

***

### createAgentWallet()

> **createAgentWallet**(`name?`): `Promise`\<`bigint`\>

Defined in: [agent/StellarAgent.ts:366](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L366)

Register this wallet in the configured AgentWalletFactory contract.

#### Parameters

##### name?

`string` = `'StellarAgent'`

#### Returns

`Promise`\<`bigint`\>

***

### getAgent()

> **getAgent**(`agentId`): `Promise`\<[`AgentInfo`](../interfaces/AgentInfo.md)\>

Defined in: [agent/StellarAgent.ts:379](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L379)

Read and decode an agent registered in AgentWalletFactory.

#### Parameters

##### agentId

`bigint`

#### Returns

`Promise`\<[`AgentInfo`](../interfaces/AgentInfo.md)\>

***

### openChannel()

> **openChannel**(`params`): `Promise`\<`bigint`\>

Defined in: [agent/StellarAgent.ts:395](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L395)

Open a payment channel for this agent.
Deposits tokens and sets a per-period spend limit.

#### Parameters

##### params

[`OpenChannelParams`](../interfaces/OpenChannelParams.md)

#### Returns

`Promise`\<`bigint`\>

The channel ID

***

### closeChannel()

> **closeChannel**(`channelId?`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [agent/StellarAgent.ts:409](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L409)

Close a payment channel and return its remaining token balance.

#### Parameters

##### channelId?

`bigint` \| `undefined`

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### payForAPI()

> **payForAPI**(`params`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [agent/StellarAgent.ts:461](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L461)

Pay for an API call. Deducts from the active payment channel.
Respects on-chain spend limits automatically.

If `recipientAsset` differs from the channel's settlement asset and
routing providers are configured, this discovers, scores, and executes
one direct, AMM, path-payment-adapter, or bounded multi-hop route through
`PaymentChannel.pay_with_route`. A quote returned by [quote](#quote) may be
supplied as `route` so the reviewed route is exactly the one submitted.
Spend limits remain denominated in the channel's settlement asset.

#### Parameters

##### params

[`PayForAPIParams`](../interfaces/PayForAPIParams.md)

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

#### Example

```typescript
await agent.payForAPI({
  endpoint: 'https://api.openai.com/v1/chat',
  amount: '0.001',
  asset: 'USDC',
});

// Channel funded in XLM, provider only accepts USDC. The configured
// routing providers choose the route and derive the output floor:
const quote = await agent.quote({
  sourceAsset: 'XLM',
  destinationAsset: 'USDC',
  amount: '0.001',
});
await agent.payForAPI({
  endpoint: 'https://api.example.com/inference',
  amount: '0.001',
  sourceAsset: 'XLM',
  recipientAsset: 'USDC',
  route: quote,
});
```

***

### quote()

> **quote**(`params`): `Promise`\<[`PaymentQuote`](../interfaces/PaymentQuote.md)\>

Defined in: [agent/StellarAgent.ts:537](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L537)

Discover, score, and return the exact payment route before committing.

#### Parameters

##### params

[`QuoteParams`](../interfaces/QuoteParams.md)

#### Returns

`Promise`\<[`PaymentQuote`](../interfaces/PaymentQuote.md)\>

***

### requestWork()

> **requestWork**(`params`): `Promise`\<`bigint`\>

Defined in: [agent/StellarAgent.ts:575](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L575)

Create an escrow job delegating work to another agent.
Locks payment until the work is delivered and released.

#### Parameters

##### params

[`RequestWorkParams`](../interfaces/RequestWorkParams.md)

#### Returns

`Promise`\<`bigint`\>

#### Example

```typescript
const job = await agent.requestWork({
  workerAgent: 'G...WORKER_ADDRESS',
  task: 'Summarize this document: ipfs://Qm...',
  escrowAmount: '0.05',
  asset: 'USDC',
});
```

***

### acceptJob()

> **acceptJob**(`jobId`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [agent/StellarAgent.ts:590](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L590)

Accept an open escrow job as a worker agent

#### Parameters

##### jobId

`bigint`

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### submitResult()

> **submitResult**(`jobId`, `result`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [agent/StellarAgent.ts:597](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L597)

Submit work result for an escrow job

#### Parameters

##### jobId

`bigint`

##### result

`string`

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### releasePayment()

> **releasePayment**(`jobId`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [agent/StellarAgent.ts:610](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L610)

Release escrow payment to the worker after work is complete

#### Parameters

##### jobId

`bigint`

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### setRateLimits()

> **setRateLimits**(`config`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [agent/StellarAgent.ts:620](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L620)

Configure rate limits for this agent on-chain.
Protects against runaway spending.

#### Parameters

##### config

[`RateLimitConfig`](../interfaces/RateLimitConfig.md)

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### checkRateLimit()

> **checkRateLimit**(`amount`): `Promise`\<`boolean`\>

Defined in: [agent/StellarAgent.ts:627](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L627)

Check if a payment would be blocked by rate limits (read-only)

#### Parameters

##### amount

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getBalance()

> **getBalance**(): `Promise`\<`string`\>

Defined in: [agent/StellarAgent.ts:636](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L636)

Get current XLM balance

#### Returns

`Promise`\<`string`\>

***

### getSpendReport()

> **getSpendReport**(): `Promise`\<[`SpendReport`](../interfaces/SpendReport.md)\>

Defined in: [agent/StellarAgent.ts:643](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L643)

Get spend report for the current period

#### Returns

`Promise`\<[`SpendReport`](../interfaces/SpendReport.md)\>

***

### getChannel()

> **getChannel**(`channelId`): `Promise`\<[`ChannelInfo`](../interfaces/ChannelInfo.md)\>

Defined in: [agent/StellarAgent.ts:650](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L650)

Get info about a payment channel

#### Parameters

##### channelId

`bigint`

#### Returns

`Promise`\<[`ChannelInfo`](../interfaces/ChannelInfo.md)\>

***

### getJob()

> **getJob**(`jobId`): `Promise`\<[`JobInfo`](../interfaces/JobInfo.md)\>

Defined in: [agent/StellarAgent.ts:657](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L657)

Get info about a job

#### Parameters

##### jobId

`bigint`

#### Returns

`Promise`\<[`JobInfo`](../interfaces/JobInfo.md)\>

***

### getRateLimitStatus()

> **getRateLimitStatus**(`agentAddress?`): `Promise`\<[`RateLimitStatus`](../interfaces/RateLimitStatus.md)\>

Defined in: [agent/StellarAgent.ts:670](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L670)

Get current rate-limit usage alongside the configured limits.

`RateLimiter.get_limits` is keyed by an arbitrary agent address, not
necessarily this agent's own — an owner monitoring several agents can
query any of them read-only through one signed-in `StellarAgent`.
Defaults to [StellarAgent.address](#address) (checking this agent's own
limits) when omitted.

#### Parameters

##### agentAddress?

`string` = `...`

#### Returns

`Promise`\<[`RateLimitStatus`](../interfaces/RateLimitStatus.md)\>

***

### getLedgerCloseEstimate()

> **getLedgerCloseEstimate**(): `Promise`\<[`LedgerCloseEstimate`](../interfaces/LedgerCloseEstimate.md)\>

Defined in: [agent/StellarAgent.ts:685](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L685)

Derive the current ledger sequence and an *estimated* average ledger
close time from a handful of recently observed ledgers via Horizon.

Ledgers close roughly every 5 seconds, but that figure drifts with
network conditions rather than being contractually fixed — so this
measures it from real recent closes instead of assuming a constant. Used
to convert a `RateLimiter`/`PaymentChannel` ledger-count window (e.g.
"720 ledgers until the hourly window resets") into a human wall-clock
estimate. See `ledgerTime.ts` for the derivation and its caveats.

#### Returns

`Promise`\<[`LedgerCloseEstimate`](../interfaces/LedgerCloseEstimate.md)\>

***

### setSolvencyVk()

> **setSolvencyVk**(`vk`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [agent/StellarAgent.ts:716](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L716)

Install (or rotate) the Groth16 verifying key that
[StellarAgent.verifySolvencyProof](#verifysolvencyproof) checks proofs against.

Admin-only: the **first** caller to set a key becomes the admin for every
future rotation, mirroring `setCircuitBreaker`. Rotating the key is
therefore a one-way door unless the channel is redeployed — set it from
the same key you would want to trust in six months.

#### Parameters

##### vk

[`SolvencyVerifyingKey`](../interfaces/SolvencyVerifyingKey.md)

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

#### Example

```typescript
// From the prover's output — see zk/solvency_proof.
await agent.setSolvencyVk({
  alphaG1: vk.alphaG1,     // 96 bytes
  betaG2: vk.betaG2,       // 192 bytes
  gammaG2: vk.gammaG2,     // 192 bytes
  deltaG2: vk.deltaG2,     // 192 bytes
  gammaAbcG1: vk.gammaAbcG1, // exactly 3 × 96 bytes
});
```

#### Throws

`INVALID_ARGUMENT` when a point is not a
  96/192-byte Soroban-encoded BLS12-381 point, or when `gammaAbcG1` does
  not hold exactly three entries.

***

### verifySolvencyProof()

> **verifySolvencyProof**(`channelId`, `proof`): `Promise`\<`boolean`\>

Defined in: [agent/StellarAgent.ts:746](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/agent/StellarAgent.ts#L746)

Verify a Groth16 solvency proof for `channelId` (read-only).

A valid proof says that *some* ordering of undisclosed payments into
spend-limit periods never exceeded the channel's `limitPerPeriod`, and
that those payments sum to exactly its `totalSpent` — a statement about
the *existence* of a consistent history, not about which payments those
were. See `docs/zk-solvency-design.md`.

Returns `false` for a proof that does not verify; that is the expected
answer, not an error. It throws only when no verifying key has been set
on the contract yet — `setSolvencyVk` — which is a deployment gap rather
than a property of the proof.

#### Parameters

##### channelId

`bigint`

##### proof

[`SolvencyProof`](../interfaces/SolvencyProof.md)

#### Returns

`Promise`\<`boolean`\>

#### Example

```typescript
const ok = await agent.verifySolvencyProof(channelId, {
  a: proof.a, b: proof.b, c: proof.c,
});
```
