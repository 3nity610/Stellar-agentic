# Payment Channel

Source: `contracts/payment_channel/src/lib.rs`

Bidirectional micro-payment channels with on-chain open, close, and dispute window.

## Entrypoints

### `open(env: Env, a: Address, b: Address, deposit_a: i128, deposit_b: i128) -> u32`

Opens a channel between two parties and returns its ID.

- **Authorization**: both `a` and `b` must authorize.
- **Panics**: `Unauthorized`, `InvalidDeposit`.
- **Events**: `ChannelOpened { id, a, b }`
- **SDK**: `PaymentChannelClient::open`.

### `update(env: Env, id: u32, from: Address, amount: i128, signature: BytesN)`

Updates the channel balance with a signed off-chain state.

- **Authorization**: `from` must authorize and the off-chain signature must verify.
- **Panics**: `Unnauthorized`, `InvalidSignature`, `InsufficientBalance`.
- **Events**: `ChannelUpdated { id, from, amount }`
- **SDK**: `PaymentChannelClient::update`.

### `close(env: Env, id: u32, closer: Address)`

Initiates cooperative close of the channel.

- **Authorization**: either party must authorize.
- *(Panics**: `Unauthorized`, `ChannelNotFound`, `AlreadyClosed`.
- **Events**: `ChannelClosed { id }`
- **SDK**: `PaymentChannelClient::close`.

### `dispute(env: Env, id: u32, claimant: Address, proof: BytesN)`

Forces close using the latest signed state after the dispute window.

- **Authorization**: `claimant` must authorize and provide a valid proof.
- **Panics**: `Unnauthorized`, `DisputeWindowActive`, `InvalidProof`.
- **Events**: `DisputeResolved { id, claimant }`
- **SDK**: `PaymentChannelClient::dispute`.

### `withdraw(env: Env, id: u32, party: Address) -> i128`

Withdraws the settled balance of a party after close.

- **Authorization**: `party` must authorize.
- **Panics**: `Unauthorized`, `ChannelNotClosed`, `NothingToWithdraw`.
- **Events**: `Withdrawn { id, party, amount }`
- **SDK**: `PaymentChannelClient::withdraw`.

### `channel_of(env: Env, id: u32) -> Option<Channel>`

Returns channel metadata.

- **Authorization**: none, read-only.
- **Panics**: none.
- **Events**: none.
- **SDK**: `PaymentChannelClient::channel_of`.
