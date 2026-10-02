[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RemoteSignerOptions

# Interface: RemoteSignerOptions

Defined in: [signer.ts:208](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L208)

## Properties

### url

> **url**: `string`

Defined in: [signer.ts:210](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L210)

Base URL of the signing service, e.g. `https://signer.internal:8443`.

***

### token?

> `optional` **token?**: `string`

Defined in: [signer.ts:216](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L216)

Bearer token presented on every request. This is the *only* credential
the agent process holds — losing it costs a token rotation, not a key
rotation and a migration of every funded account.

***

### expectedPublicKey?

> `optional` **expectedPublicKey?**: `string`

Defined in: [signer.ts:223](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L223)

Public address this signer is expected to sign for. When set, it is
checked against what the service reports and a mismatch is rejected, so
a misconfigured or swapped-out service cannot quietly sign as a different
account.

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [signer.ts:225](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L225)

Per-request timeout in milliseconds.

#### Default

```ts
10000
```

***

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [signer.ts:227](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L227)

Extra headers (mTLS proxies, tracing, tenant routing).

***

### fetch?

> `optional` **fetch?**: (`input`, `init?`) => `Promise`\<`Response`\>

Defined in: [signer.ts:229](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L229)

Injectable `fetch`, for tests and for custom agents/proxies.

#### Parameters

##### input

`string` \| `URL` \| `Request`

##### init?

`RequestInit`

#### Returns

`Promise`\<`Response`\>
