# Price Oracle

Source: `contracts/price_oracle/src/lib.rs`

Signed price feeds with staleless checks.

## Entrypoints

### `initialize(env: Env, admin: Address, max_age_seconds: u64)`

Sets the administrator and maximum acceptable age of a price feed.

- **Authorization**: none. Must not already be initialized.
- **Panics**: `AlreadyInitialized`.
- **Events**: `Initialized { admin, max_age_seconds }`
- **SDK**: unwrapped — no high-level SDK method exists yet.

### `set_feeder(env: Env, admin: Address, feeder: Address, allowed: bool)`

Grants or revokes a feeder's permission to publish prices.

- **Authorization**: admin must authorize.
- **Panics**: `Unauthorized`.
- **Events**: `FeederUpdated { feeder, allowed }`
- **SDK**: unwrapped.

### `publish(env: Env, feeder: Address, asset: Symbol, price: i128, timestamp: u64)`

Publishes a price feed for an asset.

- **Authorization**: feeder must authorize and be allowed.
- ***Panics**: `Unnauthorized`, `FeederNotAllowed`, `StaleTimestamp`.
- **Events**: `PricePublished { asset, price, timestamp }`
- **SDK**: unwrapped.

### `get_price(env: Env, asset: Symbol) -> i128`

Returns the latest price for an asset.

- **Authorization**: none, read-only.
- **Panics**: `AssetNotFound`, `PriceStale`.
- **Events**: none.
- **SDK**: unwrapped.

### `last_update(env: Env, asset: Symbol) -> u64`

Returns the timestamp of the latest published price.

- **Authorization**: none, read-only.
- **Panics**: `AssetNotFound`.
- **Events**: none.
- **SDK**: unwrapped.
