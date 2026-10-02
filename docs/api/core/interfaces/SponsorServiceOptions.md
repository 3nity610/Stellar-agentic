[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SponsorServiceOptions

# Interface: SponsorServiceOptions

Defined in: [fleet/sponsorship.ts:32](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L32)

## Properties

### sponsorSigner

> **sponsorSigner**: [`Signer`](Signer.md)

Defined in: [fleet/sponsorship.ts:33](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L33)

***

### rpc

> **rpc**: [`SponsorRpc`](SponsorRpc.md)

Defined in: [fleet/sponsorship.ts:34](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L34)

***

### networkPassphrase

> **networkPassphrase**: `string`

Defined in: [fleet/sponsorship.ts:35](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L35)

***

### feeStrategy?

> `optional` **feeStrategy?**: `string` \| `number` \| `bigint` \| [`FeeStrategy`](FeeStrategy.md)

Defined in: [fleet/sponsorship.ts:36](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L36)

***

### timeoutSeconds?

> `optional` **timeoutSeconds?**: `number`

Defined in: [fleet/sponsorship.ts:38](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L38)

Transaction validity window.

#### Default

```ts
60
```

***

### confirmationAttempts?

> `optional` **confirmationAttempts?**: `number`

Defined in: [fleet/sponsorship.ts:40](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L40)

Confirmation polls before timing out.

#### Default

```ts
30
```

***

### pollIntervalMs?

> `optional` **pollIntervalMs?**: `number`

Defined in: [fleet/sponsorship.ts:42](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L42)

Delay between confirmation polls.

#### Default

```ts
1000
```

***

### sleep?

> `optional` **sleep?**: (`milliseconds`) => `Promise`\<`void`\>

Defined in: [fleet/sponsorship.ts:43](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L43)

#### Parameters

##### milliseconds

`number`

#### Returns

`Promise`\<`void`\>
