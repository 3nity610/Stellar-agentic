[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / KeypairSigner

# Class: KeypairSigner

Defined in: [signer.ts:138](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L138)

The original behaviour, kept for backward compatibility: an in-memory
`Keypair`.

This is fine for testnet, for development, and for agents holding
negligible value. It is explicitly *not* what you want for an agent with
real funds — see [RemoteSigner](RemoteSigner.md).

The secret is held in a module-private closure rather than on the instance,
so it does not appear when the signer (or an agent holding it) is logged,
serialised by an error reporter, or walked by a heap inspector that only
follows enumerable properties.

## Implements

- [`Signer`](../interfaces/Signer.md)

## Constructors

### Constructor

> **new KeypairSigner**(`keypair`): `KeypairSigner`

Defined in: [signer.ts:141](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L141)

#### Parameters

##### keypair

`Keypair`

#### Returns

`KeypairSigner`

## Methods

### fromSecret()

> `static` **fromSecret**(`secretKey`): `KeypairSigner`

Defined in: [signer.ts:149](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L149)

Build from a `S...` secret key string.

#### Parameters

##### secretKey

`string`

#### Returns

`KeypairSigner`

***

### random()

> `static` **random**(): `KeypairSigner`

Defined in: [signer.ts:154](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L154)

Generate a fresh random keypair.

#### Returns

`KeypairSigner`

***

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [signer.ts:158](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L158)

The Stellar public address (`G...`) this signer signs for.

Must be obtainable **without** the secret being present in the calling
process — a remote signer derives it on the far side of the boundary and
returns just the address.

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`Signer`](../interfaces/Signer.md).[`getPublicKey`](../interfaces/Signer.md#getpublickey)

***

### publicKey()

> **publicKey**(): `string`

Defined in: [signer.ts:163](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L163)

Synchronous accessor — available because the key is local.

#### Returns

`string`

***

### exportSecret()

> **exportSecret**(): `string`

Defined in: [signer.ts:174](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L174)

Reveal the raw secret.

Deliberately a method with a blunt name rather than a `secretKey` getter:
exporting key material should be a visible, greppable act, not something
that happens by reading a property.

#### Returns

`string`

***

### signTransaction()

> **signTransaction**(`xdr`, `options`): `Promise`\<`string`\>

Defined in: [signer.ts:178](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L178)

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

Defined in: [signer.ts:189](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L189)

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
