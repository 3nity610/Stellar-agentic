# Contract Reference

Reference documentation for every on-chain entrypoint exposed by the contracts in this repository. Use this when integrating without the SDK or when auditing authorization and failure modes.

## Contracts

| Contract | Purpose | Entrypoints | SDK coverage |
| --- | --- | --- | --- |
| [`agent_wallet_factory`](./agent_wallet_factory.md) | Deploys and registers agent wallets | 4 | full |
| [`amm_swap`](./amm_swap.md) | Constant-product AMM | 6 | full |
| [`circuit_breaker`](./circuit_breaker.md) | Global pause switch for protocol operations | 5 | partial |
| [`escrow`](./escrow.md) | Escrow with arbitration | 6 | full |
| [`payment_channel`](./payment_channel.md) | Bidirectional micro-payment channels | 6 | full |
| [`price_oracle`](./price_oracle.md) | Signed price feeds with stalemess checks | 5 | partial |
| [`rate_limiter`](./rate_limiter.md) | Per-account rate limiting | 5 | full |

## Conventions

Each page documents, for every entrypoint:

- **Signature** — the Rust function and its argument types.
- **Authorization** — who must sign the invocation, and what the contract checks.
- **Panics** — every error code the entrypoint can raise.
- **Events** — topics emitted on success.
- **SDK** — the wrapper method if one exists, otherwise noted as **unwrapped**.

## Drift checklist

When adding, removing, or renaming an entrypoint in any `contracts/*/src/lib.rs`, the PR must:

- [ ] Update the corresponding page in this directory.
- [ ] Document authorization and every panic code.
- [ ] Note the SDK wrapper or mark the entrypoint as unwrapped.
- [ ] Update the contract table above if the entrypoint count changes.

The `docs/contracts-drift` CI job runs on every PR touching `contracts/*/src/lib.rs` and fails when a `pub fn ` is added or removed without a matching change to the corresponding reference page.
