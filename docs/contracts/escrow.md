# Escrow

Source: `contracts/escrow/src/lib.rs`

Escrow with an optional arbitrator for disputes.

## Entrypoints

### `initialize(env: Env, buyer: Address, seller: Address, arbitrator: Option<Address>)`

Sets the parties and optional arbitrator.

- **Authorization**: none. Must not already be initialized.
- **Panics**: `AlreadyInitialized`, `IdenticalParties`.
- **Events**: `Initialized { buyer, seller, arbitrator }`
- **SDK**: `EscrowClient::initialize`.

### `fund(env: Env, from: Address, amount: i128)`

Deposits funds into the escrow.

- **Authorization**: `from` must authorize. Only the buyer may fund.
- **Panics**: `Unnauthorized`, `InvalidAmount`, `AlreadyFunded`.
- **Events**: `Funded { from, amount }`
- **SDK**: `EscrowClient::fund`.

### `release(env: Env, caller: Address)`

Releases the escrowed funds to the seller.

- **Authorization**: buyer or arbitrator must authorize.
- **Panics**: `Unnauthorized`, `NotFunded`, `AlreadyResolved`.
- **Events**: `Released { to, amount }`
- **SDK**: `EscrowClient::release`.

### `refund(env: Env, caller: Address)`

Refunds the escrowed funds to the buyer.

- **Authorization**: seller or arbitrator must authorize.
- **Panics**: `Unauthorized`, `NotFunded`, `AlreadyResolved`.
- **Events**: `Refunded { to, amount }`
- **SDK**: `EscrowClient::refund`.

### `dispute(env: Env, caller: Address, in_favor_of: Address)`

Arbitrator resolves a dispute in favor of one party.

- **Authorization**: arbitrator must authorize.
- **Panics**: `Unnauthorized`, `NoArbitrator`, `AlreadyResolved`.
- **Events**: `DisputeResolved { in_favor_of }`
- **SDK**: `EscrowClient::dispute`.

### `status(env: Env) -> EscrowStatus`

Returns the current escrow state.

- **Authorization**: none, read-only.
- **Panics**: none.
- **Events**: none.
- **SDK**: `EscrowClient::status`.
