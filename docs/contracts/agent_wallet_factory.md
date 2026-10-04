# Agent Wallet Factory

Source: `contracts/agent_wallet_factory/src/lib.rs`

The factory deploys new agent wallets and registers them in a global index so that other contracts can resolve an agent ID to its wallet address.

## Entrypoints

### `initialize(env: Env, owner: Address)`

Initializes the factory with an administrator.

- **Authorization**: none. The contract must not already be initied.
- **Panics**: `AlreadyInitialized`.
- **Events**: `Initialized { owner }`
- **SDK**: `AgentWalletFactoryClient::initialize`.

### `create_wallet(env: Env, agent_id: Symbol, owner: Address) -> Address`

Deploys a new agent wallet contract and registers it under `agent_id`.

- **Authorization**: `owner` must authorize the call. Only the factory owner may create wallets.
- **Panics**: `Unauthorized`, `AgentIdAlreadyRegistered`, `InvalidAgentId`.
- **Events**: `WalletCreated { agent_id, wallet }`
- **SDK**: `AgentWalletFactoryClient::create_wallet`.

### `register(env: Env, agent_id: Symbol, wallet: Address)`

Registers an existing wallet address under `agent_id`.

- **Authorization**: factory owner must authorize.
- **Panics**: `Unauthorized`, `AgentIdAlreadyRegistered`.
- **Events**: `WalletRegistered { agent_id, wallet }`
- **SDK**: `AgentWalletFactoryClient::register`.

### `wallet_of(env: Env, agent_id: Symbol) -> Option<Address>`

Returns the wallet address for `agent_id`, if registered.

- **Authorization**: none, read-only.
- **Panics**: none.
- **Events**: none.
- **SDK**: `AgentWalletFactoryClient::wallet_of`.
