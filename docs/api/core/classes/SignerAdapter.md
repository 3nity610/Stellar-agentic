[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SignerAdapter

# Class: SignerAdapter

Defined in: [signer.ts:420](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L420)

Somewhere that can sign on behalf of one Stellar account.

Implementations must never require the caller to hold key material. The
only thing a `StellarAgent` ever learns from a Signer is a public address
and some signed bytes.

## Implements

- [`Signer`](../interfaces/Signer.md)

## Constructors

### Constructor

> **new SignerAdapter**(`wallet`): `SignerAdapter`

Defined in: [signer.ts:423](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L423)

#### Parameters

##### wallet

[`Sep43Like`](../interfaces/Sep43Like.md)

#### Returns

`SignerAdapter`

## Methods

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [signer.ts:427](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L427)

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

Defined in: [signer.ts:436](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L436)

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

Defined in: [signer.ts:443](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L443)

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
