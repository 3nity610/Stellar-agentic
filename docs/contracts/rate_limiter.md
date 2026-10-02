# Rate Limiter

Source: `contracts/rate_limiter/src/lib.rs`

Per-account rate limiting used by other contracts to cap how often an account may call an operation.

## Entrypoints

### `initialize(env: Env, admin: Address)`

Sets the administrator who may configure limits.

- **Authorization**: none. Must not already be initialized.
- **Panics**: `AlreadyInitialized`.
- **Events**: `Initialized { admin }`
- **SDK**: `RateLimiterClient::initialize`.

### `set_limit(env: Env, admin: Address, account: Address, max_calls: u32, window_seconds: u64)`

Configures the limit for a specific account.

- **Authorization**: admin must authorize.
- **Panics**: `Unauthorized`, `InvalidWindow`.
- **Events**: `LimitSet { account, max_calls, window_seconds }`
- **SDK**: `RateLimiterClient::set_limit`.

### `check_and_consume(env: Env, account: Address)`

Verifies the account is within its limit and records a call.

- **Authorization**: account must authorize.
- **Panics**: `Unauthorized`, `RateLimitExceeded`, `LimitNotSet`.
- **Events**: `CallConsumed { account, used, max_calls }`
- **SDK**: `RateLimiterClient::check_and_consume`.

### `remaining(env: Env, account: Address) -> u32`

Returns how many calls the account has left in the current window.

- **Authorization**: none, read-only.
- **Panics**: `LimitNotSet`.
- **Events**: none.
- **SDK**: `RateLimiterClient::remaining`.

### `reset(env: Env, admin: Address, account: Address)`

Clears the account's window counter.

- **Authorization**: admin must authorize.
- **Panics**: `Unnauthorized`.
- **Events**: `Reset { account }`
- **SDK**: `RateLimiterClient::reset`.
