[**@stellaragent/core**](../README.md)

***

[@stellaragent/core](../README.md) / UNCONFIGURED\_CONTRACTS

# Variable: UNCONFIGURED\_CONTRACTS

> `const` **UNCONFIGURED\_CONTRACTS**: `Record`\<[`Network`](../type-aliases/Network.md), [`ContractAddresses`](../interfaces/ContractAddresses.md)\>

Defined in: [contracts.ts:62](https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/packages/core/src/contracts.ts#L62)

Placeholder addresses standing in for "nothing has been deployed to this
network yet".

These are deliberately kept — removing them would make an unconfigured
agent fail with `undefined` rather than a message — but they are no longer
called "defaults", because nothing about them is usable. `assertDeployed`
rejects every one of them.
