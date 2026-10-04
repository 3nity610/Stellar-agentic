# AMM Swap

Source: `contracts/amm_swap/src/lib.rs`

Constant-product automated market maker with a 0.3% swap fee.

## Entrypoints

### `initialize(env: Env, token_a: Address, token_b: Address)`

Sets the two tokens traded by this pool.

- **Authorization**: none. Must not already be initialized.
- **Panics**: `AlreadyInitialized`, `IdenticalTokens`.
- **Events**: `Initialized { token_a, token_b }`
- **SDK**: `AmmSwapClient::initialize`.

### `add_liquidity(env: Env, provider: Address, amount_a: i128, amount_b: i128) -> i128`

Deposits both tokens and mints liquidity shares to `provider`.

- **Authorization**: `provider` must authorize.
- **Panics**: `Unauthorized`, `InsufficientLiquidity`, `InvalidAmount`.
- **Events**: `LiquidityAdded { provider, amount_a, amount_b, shares }`
- **SDK**: `AmmSwapClient::add_liquidity`.

### `remove_liquidity(env: Env, provider: Address, shares: i128) -> (i128, i128)`

Burns liquidity shares and returns the underlying tokens.

- **Authorization**: `provider` must authorize.
- **Panics**: `Unauthorized`, `InsufficientShares`, `InvalidAmount`.
- **Events**: `LiquidityRemoved { provider, shares, amount_a, amount_b }`
- **SDK**: `AmmSwapClient::remove_liquidity`.

### `swap(env: Env, trader: Address, token_in: Address, amount_in: i128, min_out: i128) -> i128`

Executes a swap and returns the amount of the other token received.

- **Authorization**: `trader` must authorize.
- **Panics**: `UnregisteredToken`, `InsufficientInput`, `SlippageExceeded`.
- **Events**: `Swap { trader, token_in, amount_in, amount_out }`
- **SDK**: `AmmSwapClient::swap`.

### `get_reserves(env: Env) -> (i128, i128)`

Returns the current reserves of both tokens.

- **Authorization**: none, read-only.
- **Panics**: none.
- **Events**: none.
- **SDK**: `AmmSwapClient::get_reserves`.

### `quote(env: Env, token_in: Address, amount_in: i128) -> i128`

Returns the output amount for a given input without executing the swap.

- **Authorization**: none, read-only.
- **Panics**: `UnregisteredToken`.
- **Events**: none.
- **SDK**: `AmmSwapClient::quote`.
