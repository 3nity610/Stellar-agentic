# Circuit Breaker

Source: `contracts/circuit_breaker/src/lib.rs`

Global pause switch used by other contracts to halt operations during an incident.

## Entrypoints

### `initialize(env: Env, admin: Address)`

Sets the administrator who may trip and reset the breaker.

- **Authorization**: none. Must not already be initialized.
- **Panics**: `AlreadyInitialized`.
- **Events**: `Initialized { admin }`
- **SDK**: unwrapped — no high-level SDK method exists yet.

### `trip(env: Env, reason: Symbol)`

Trips the breaker, marking the protocol as paused.

- **Authorization**: admin must authorize.
- **Panics**: `Unnauthorized`, `AlreadyTripped`.
- **Events**: `Tripped { reason }`
- **SDK**: unwrapped.

### `reset(env: Env)`

Clears the tripped state.

- **Authorization**: admin must authorize.
- *(Panics**: `Unauthorized`, `NotTripped`.
- **Events**: `Reset`
- **SDK**: unwrapped.

### `is_tripped(env: Env) -> bool`

Returns whether the breaker is currently tripped.

- **Authorization**: none, read-only.
- **Panics**: none.
- **Events**: none.
- **SDK**: unwrapped.

### `assert_not_tripped(env: Env)`

Convenience guard other contracts call before mutating state.

- **Authorization**: none.
- **Panics**: `CircuitTripped`.
- **Events**: none.
- **SDK**: unwrapped.
