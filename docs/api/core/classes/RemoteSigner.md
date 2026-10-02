[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / RemoteSigner

# Class: RemoteSigner

Defined in: [signer.ts:270](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L270)

A [Signer](../interfaces/Signer.md) backed by an HTTP signing service.

## Protocol

Three endpoints, all JSON. The key never crosses the boundary.

### `GET {url}/v1/public-key`
```json
→ 200 { "publicKey": "G..." }
```

### `POST {url}/v1/sign/transaction`
```json
← { "xdr": "<base64 envelope>", "networkPassphrase": "..." }
→ 200 { "signedXdr": "<base64 signed envelope>" }
```

### `POST {url}/v1/sign/auth-entry`
```json
← { "authEntryXdr": "<base64>", "networkPassphrase": "...",
    "validUntilLedgerSeq": 12345 }
→ 200 { "signedAuthEntryXdr": "<base64>" }
```

Errors return a non-2xx status with `{ "error": "<message>" }`. A service
that refuses on policy grounds — spend ceiling, rate limit, revoked token —
should use `403` with a description; it surfaces here as a
[SigningError](SigningError.md) carrying that text.

## Why signed XDR rather than a raw signature

Returning `signedXdr` means the service parses what it is signing and can
therefore apply policy to it — reject payments over a ceiling, enforce a
destination allow-list, log the operation. A service that only returned a
signature over an opaque hash could not do any of that, which would waste
the main advantage of moving the key behind a boundary in the first place.

## Implements

- [`Signer`](../interfaces/Signer.md)

## Constructors

### Constructor

> **new RemoteSigner**(`options`): `RemoteSigner`

Defined in: [signer.ts:277](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L277)

#### Parameters

##### options

[`RemoteSignerOptions`](../interfaces/RemoteSignerOptions.md)

#### Returns

`RemoteSigner`

## Methods

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [signer.ts:295](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L295)

The Stellar public address (`G...`) this signer signs for.

Must be obtainable **without** the secret being present in the calling
process — a remote signer derives it on the far side of the boundary and
returns just the address.

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`Signer`](../interfaces/Signer.md).[`getPublicKey`](../interfaces/Signer.md#getpublickey)

***

### signTransaction()

> **signTransaction**(`xdr`, `options`): `Promise`\<`string`\>

Defined in: [signer.ts:315](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L315)

Sign a transaction envelope.

#### Parameters

##### xdr

`string`

base64 transaction envelope XDR

##### options

[`SignTransactionOptions`](../interfaces/SignTransactionOptions.md)

#### Returns

`Promise`\<`string`\>

base64 **signed** transaction envelope XDR

#### Implementation of

[`Signer`](../interfaces/Signer.md).[`signTransaction`](../interfaces/Signer.md#signtransaction)

***

### signAuthEntry()

> **signAuthEntry**(`authEntryXdr`, `options`): `Promise`\<`string`\>

Defined in: [signer.ts:327](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L327)

Sign a Soroban authorization entry.

Soroban auth entries are signed separately from the envelope that carries
them, so a signer that only implements `signTransaction` cannot authorize
a contract invocation.

#### Parameters

##### authEntryXdr

`string`

base64 `SorobanAuthorizationEntry` XDR

##### options

[`SignAuthEntryOptions`](../interfaces/SignAuthEntryOptions.md)

#### Returns

`Promise`\<`string`\>

base64 **signed** `SorobanAuthorizationEntry` XDR

#### Implementation of

[`Signer`](../interfaces/Signer.md).[`signAuthEntry`](../interfaces/Signer.md#signauthentry)
