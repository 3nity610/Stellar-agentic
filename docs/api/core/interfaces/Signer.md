[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / Signer

# Interface: Signer

Defined in: [signer.ts:82](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L82)

Somewhere that can sign on behalf of one Stellar account.

Implementations must never require the caller to hold key material. The
only thing a `StellarAgent` ever learns from a Signer is a public address
and some signed bytes.

## Methods

### getPublicKey()

> **getPublicKey**(): `Promise`\<`string`\>

Defined in: [signer.ts:90](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L90)

The Stellar public address (`G...`) this signer signs for.

Must be obtainable **without** the secret being present in the calling
process — a remote signer derives it on the far side of the boundary and
returns just the address.

#### Returns

`Promise`\<`string`\>

***

### signTransaction()

> **signTransaction**(`xdr`, `options`): `Promise`\<`string`\>

Defined in: [signer.ts:98](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L98)

Sign a transaction envelope.

#### Parameters

##### xdr

`string`

base64 transaction envelope XDR

##### options

[`SignTransactionOptions`](SignTransactionOptions.md)

#### Returns

`Promise`\<`string`\>

base64 **signed** transaction envelope XDR

***

### signAuthEntry()

> **signAuthEntry**(`authEntryXdr`, `options`): `Promise`\<`string`\>

Defined in: [signer.ts:110](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L110)

Sign a Soroban authorization entry.

Soroban auth entries are signed separately from the envelope that carries
them, so a signer that only implements `signTransaction` cannot authorize
a contract invocation.

#### Parameters

##### authEntryXdr

`string`

base64 `SorobanAuthorizationEntry` XDR

##### options

[`SignAuthEntryOptions`](SignAuthEntryOptions.md)

#### Returns

`Promise`\<`string`\>

base64 **signed** `SorobanAuthorizationEntry` XDR
