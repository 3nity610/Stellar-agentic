# Events Reference

This document lists every event emitted by the contracts in `contracts/`, the topic tuple and data payload for each, and whether the indexer in `packages/indexer/src/decoder.ts` decodes it today.

## Conventions

All events follow the same topic convention:

- The first topic is the contract name as a `symbol_short!` (e.g. `agent_wallet`, `factory`).
- The second topic is the event name as a `symbol_short!` (e.g. `created`, `transfer`, `updated`).
- The third topic, when present, is the primary address or identifier involved in the event (e.g. wallet address, owner address).
- The data payload is a tuple of the remaining fields, encoded in the order they appear in this document.

All topics use `symbol_short!` for the contract and event names. This is consistent across all contracts and allows an indexer to dispatch on the first two topics without reading the contract source.

## Event Index

| Contract | Event | Topics | Data | Indexer decodes? |
| --- | --- | --- | --- | --- |
| `agent_wallet` | `initialized` | `(agent_wallet, initialized, owner)` | `(threshold, guardians)` | Yes |
| `agent_wallet` | `created` | `(agent_wallet, created, wallet)` | `(owner, threshold, guardians)` | Yes |
| `agent_wallet` | `transferred` | `(agent_wallet, transferred, wallet)` | `(to, amount, token)` | Yes |
| `agent_wallet` | `threshold_updated` | `(agent_wallet, threshold_updated, wallet)` | `(old_threshold, new_threshold)` | No |
| `agent_wallet` | `guardian_added` | `(agent_wallet, guardian_added, wallet)` | `(guardian)` | No |
| `agent_wallet` | `guardian_removed` | `(agent_wallet, guardian_removed, wallet)` | `(guardian)` | No |
| `agent_wallet` | `admin_changed` | `(agent_wallet, admin_changed, wallet)` | `(old_admin, new_admin)` | No |
| `factory` | `wallet_created` | `(factory, wallet_created, wallet)` | `(owner, threshold, guardians)` | Yes |
| `factory` | `wallet_registered` | `(factory, wallet_registered, wallet)` | `(owner)` | No |
| `factory` | `wallet_removed` | `(factory, wallet_removed, wallet)` | `(owner)` | No |
| `factory` | `admin_changed` | `(factory, admin_changed, admin)` | `(old_admin, new_admin)` | No |

## Event Details

### `agent_wallet`

#### `initialized`

- Topics: `(agent_wallet, initialized, owner)`
- Data: `(threshold, guardians)`
- Emitted when the wallet is initialized with its owner, threshold, and guardian set.
- Indexer decodes: Yes.

#### `created`

- Topics: `(agent_wallet, created, wallet)`
- Data: `(owner, threshold, guardians)`
- Emitted when a new wallet is created by the factory.
- Indexer decodes: Yes.

#### `transferred`

- Topics: `(agent_wallet, transferred, wallet)`
- Data: `(to, amount, token)`
- Emitted when the wallet transfers tokens to a recipient.
- Indexer decodes: Yes.

#### `threshold_updated`

- Topics: `(agent_wallet, threshold_updated, wallet)`
- Data: `(old_threshold, new_threshold)`
- Emitted when the wallet threshold is changed.
- Indexer decodes: No.

#### `guardian_added`

- Topics: `(agent_wallet, guardian_added, wallet)`
- Data: `(guardian)`
- Emitted when a guardian is added to the wallet.
- Indexer decodes: No.

#### `guardian_removed`

- Topics: `(agent_wallet, guardian_removed, wallet)`
- Data: `(guardian)`
- Emitted when a guardian is removed from the wallet.
- Indexer decodes: No.

#### `admin_changed`

- Topics: `(agent_wallet, admin_changed, wallet)`
- Data: `(old_admin, new_admin)`
- Emitted when the wallet admin is changed.
- Indexer decodes: No.

### `factory`

#### `wallet_created`

- Topics: `(factory, wallet_created, wallet)`
- Data: `(owner, threshold, guardians)`
- Emitted when the factory creates a new wallet.
- Indexer decodes: Yes.

#### `wallet_registered`

- Topics: `(factory, wallet_registered, wallet)`
- Data: `(owner)`
- Emitted when a wallet is registered in the factory registry.
- Indexer decodes: No.

#### `wallet_removed`

- Topics: `(factory, wallet_removed, wallet)`
- Data: `(owner)`
- Emitted when a wallet is removed from the factory registry.
- Indexer decodes: No.

#### `admin_changed`

- Topics: `(factory, admin_changed, admin)`
- Data: `(old_admin, new_admin)`
- Emitted when the factory admin is changed.
- Indexer decodes: No.

## Indexer Coverage

The indexer in `packages/indexer/src/decoder.ts` currently decodes the following events:

- `agent_wallet::initialized`
- `agent_wallet::created`
- `agent_wallet::transferred`
- `factory::wallet_created`

The following events are emitted by the contracts but are not decoded by the indexer today:

- `agent_walet::threshold_updated`
- `agent_walet::guardian_added`
- `agent_wallet::guardian_removed`
- `agent_walet::admin_changed`
- `factory::wallet_registered`
- `factory::wallet_removed`
- `factory::admin_changed`

## Writing an Event Consumer

An event consumer can dispatch on the first two topics without reading the contract source:

```ts
import { symbolShort } from "@stellar/stellar-sdk";

function handleEvent(topics: string[], data: unknown) {
  const [contract, event] = topics.map((t) => t);
  switch (`${contract}::${event}`) {
    case "agent_wallet::initialized":
      // data = (threshold, guardians)
      break;
    case "agent_wallet::created":
      // data = (owner, threshold, guardians)
      break;
    case "agent_wallet::transferred":
      // data = (to, amount, token)
      break;
    case "factory::wallet_created":
      // data = (owner, threshold, guardians)
      break;
    default:
      // event not decoded by the indexer today
      break;
  }
}
```
