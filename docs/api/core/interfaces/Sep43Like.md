[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / Sep43Like

# Interface: Sep43Like

Defined in: [signer.ts:408](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L408)

Wrap anything already exposing SEP-43's method shape — Freighter and other
browser wallets, `@ledgerhq`-backed signers, an in-house module — as a
[Signer](Signer.md).

This is the extension point for a Ledger integration: hardware signing is
the right choice for admin keys even though it is the wrong choice for an
agent's hot key (see the module doc).

## Methods

### getAddress()

> **getAddress**(): `string` \| `Promise`\<`string`\> \| `Promise`\<\{ `address`: `string`; \}\> \| \{ `address`: `string`; \}

Defined in: [signer.ts:409](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L409)

#### Returns

`string` \| `Promise`\<`string`\> \| `Promise`\<\{ `address`: `string`; \}\> \| \{ `address`: `string`; \}

***

### signTransaction()

> **signTransaction**(`xdr`, `opts?`): `Promise`\<`string` \| \{ `signedTxXdr`: `string`; \}\>

Defined in: [signer.ts:410](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L410)

#### Parameters

##### xdr

`string`

##### opts?

###### networkPassphrase?

`string`

#### Returns

`Promise`\<`string` \| \{ `signedTxXdr`: `string`; \}\>

***

### signAuthEntry()?

> `optional` **signAuthEntry**(`entryXdr`, `opts?`): `Promise`\<`string` \| \{ `signedAuthEntry`: `string`; \}\>

Defined in: [signer.ts:414](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/signer.ts#L414)

#### Parameters

##### entryXdr

`string`

##### opts?

###### networkPassphrase?

`string`

#### Returns

`Promise`\<`string` \| \{ `signedAuthEntry`: `string`; \}\>
