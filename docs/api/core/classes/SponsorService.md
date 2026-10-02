[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / SponsorService

# Class: SponsorService

Defined in: [fleet/sponsorship.ts:77](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L77)

Creates zero-balance accounts by sponsoring their account-entry reserve.
The creation envelope contains begin/create/end operations atomically and is
signed by both sponsor and target. The sponsor is also the transaction source,
so the new account never needs XLM for this lifecycle operation.

## Constructors

### Constructor

> **new SponsorService**(`options`): `SponsorService`

Defined in: [fleet/sponsorship.ts:90](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L90)

#### Parameters

##### options

[`SponsorServiceOptions`](../interfaces/SponsorServiceOptions.md)

#### Returns

`SponsorService`

## Accessors

### feePayerSigner

#### Get Signature

> **get** **feePayerSigner**(): [`Signer`](../interfaces/Signer.md)

Defined in: [fleet/sponsorship.ts:102](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L102)

Signer used as the outer fee source for sponsored account transactions.

##### Returns

[`Signer`](../interfaces/Signer.md)

## Methods

### getSponsorAddress()

> **getSponsorAddress**(): `Promise`\<`string`\>

Defined in: [fleet/sponsorship.ts:106](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L106)

#### Returns

`Promise`\<`string`\>

***

### getRecord()

> **getRecord**(`account`): [`SponsorshipRecord`](../interfaces/SponsorshipRecord.md) \| `undefined`

Defined in: [fleet/sponsorship.ts:111](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L111)

#### Parameters

##### account

`string`

#### Returns

[`SponsorshipRecord`](../interfaces/SponsorshipRecord.md) \| `undefined`

***

### list()

> **list**(): [`SponsorshipRecord`](../interfaces/SponsorshipRecord.md)[]

Defined in: [fleet/sponsorship.ts:116](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L116)

#### Returns

[`SponsorshipRecord`](../interfaces/SponsorshipRecord.md)[]

***

### ensureSponsoredAccount()

> **ensureSponsoredAccount**(`accountSigner`, `options?`): `Promise`\<[`SponsorshipRecord`](../interfaces/SponsorshipRecord.md)\>

Defined in: [fleet/sponsorship.ts:121](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L121)

Return an existing account unchanged, or atomically create it sponsored.

#### Parameters

##### accountSigner

[`Signer`](../interfaces/Signer.md)

##### options?

[`SponsoredAccountOptions`](../interfaces/SponsoredAccountOptions.md) = `{}`

#### Returns

`Promise`\<[`SponsorshipRecord`](../interfaces/SponsorshipRecord.md)\>

***

### createSponsoredAccount()

> **createSponsoredAccount**(`accountSigner`, `options?`): `Promise`\<[`SponsorshipRecord`](../interfaces/SponsorshipRecord.md)\>

Defined in: [fleet/sponsorship.ts:149](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L149)

Atomically sponsor the reserve and create a target account.

#### Parameters

##### accountSigner

[`Signer`](../interfaces/Signer.md)

##### options?

[`SponsoredAccountOptions`](../interfaces/SponsoredAccountOptions.md) = `{}`

#### Returns

`Promise`\<[`SponsorshipRecord`](../interfaces/SponsorshipRecord.md)\>

***

### revokeAccountSponsorship()

> **revokeAccountSponsorship**(`account`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [fleet/sponsorship.ts:198](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L198)

Revoke sponsorship of the account entry. The target must hold enough XLM
for its own reserve before the network will accept this operation.

#### Parameters

##### account

`string`

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

***

### closeSponsoredAccount()

> **closeSponsoredAccount**(`accountSigner`, `destination?`): `Promise`\<[`TxResult`](../interfaces/TxResult.md)\>

Defined in: [fleet/sponsorship.ts:223](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/fleet/sponsorship.ts#L223)

Reclaim a disposable sponsored account by merging it into the sponsor.
The target authorizes the merge while the sponsor pays the transaction fee.

#### Parameters

##### accountSigner

[`Signer`](../interfaces/Signer.md)

##### destination?

`string`

#### Returns

`Promise`\<[`TxResult`](../interfaces/TxResult.md)\>
