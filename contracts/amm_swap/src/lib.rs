#![no_std]

//! # AMM Swap Contract
//!
//! A minimal, admin-rate-quoted swap contract standing in for a full
//! Soroban AMM/DEX integration (e.g. Soroswap, Comet). `PaymentChannel`
//! calls `execute_swap` to convert its settlement token into whatever
//! asset a recipient wants (see `pay_with_conversion`).
//!
//! This is deliberately *not* a constant-product pool: it holds admin-
//! funded reserves and quotes admin-set fixed rates. That keeps the
//! reference implementation small and deterministic to test. A production
//! deployment should swap this out for a real DEX aggregator contract that
//! implements the same `execute_swap` shape (or adapt `PaymentChannel` to
//! call the aggregator's native interface) — `PaymentChannel` never
//! trusts this contract's quote on its own for spend-limit purposes; see
//! `PaymentChannel::pay_with_conversion` for why the independent
//! `PriceOracle` bound is what actually protects against a manipulated
//! pool/quote here.
//!
//! ## Funding model
//!
//! Callers are expected to push `from_amount` of `from_token` to this
//! contract's own balance *before* calling `execute_swap` (the same
//! self-authorized-transfer pattern `PaymentChannel::pay` already uses to
//! pay recipients directly) — `execute_swap` does not pull funds itself.
//! It pays out `to_token` from its own reserves, which the admin must
//! `fund` in advance.

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Map};

/// Fixed-point scale for published swap rates. Matches
/// `price_oracle::PRICE_SCALE` / `payment_channel::PRICE_SCALE` by
/// convention, though this contract does not depend on that crate.
pub const RATE_SCALE: i128 = 10_000_000;


pub const DAY_IN_LEDGERS: u32 = 17280;
pub const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const INSTANCE_LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;


pub fn extend_instance_ttl(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

#[contract]
pub struct AmmSwap;

/// Event topic/data layout for `amm_swap`.
///
/// Topics are always `(symbol_short!("amm_swap"), action, ...)`, matching the
/// convention documented in `docs/events.md`. Data payloads are listed there.
mod events {
    use soroban_sdk::symbol_short;

    pub const CONTRACT: soroban_sdk::Symbol = symbol_short!("amm_swap");
    pub const INIT: soroban_sdk::Symbol = symbol_short!("init");
    pub const FUND: soroban_sdk::Symbol = symbol_short!("fund");
    pub const SET_RATE: soroban_sdk::Symbol = symbol_short!("set_rate");
    pub const SWAP: soroban_sdk::Symbol = symbol_short!("swap");
}

#[contractimpl]
impl AmmSwap {
    /// One-time setup. The first caller becomes the admin.
    pub fn initialize(env: Env, admin: Address) {
        extend_instance_ttl(&env);
        if env.storage().instance().has(&symbol_short!("admin")) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("admin"), &admin);
        env.events().publish((events::CONTRACT, events::INIT), admin);
    }

    /// Admin-only: fund this contract's reserve of `token` so it can pay
    /// out future swaps into it.
    pub fn fund(env: Env, admin: Address, token: Address, amount: i128) {
        extend_instance_ttl(&env);
        Self::require_admin(&env, &admin);
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&admin, &env.current_contract_address(), &amount);
        env.events()
            .publish((events::CONTRACT, events::FUND), (token, amount));
    }

    /// Admin-only: set the swap rate for `from_token` -> `to_token`.
    /// `rate` = units of `to_token` (base units) paid out per `RATE_SCALE`
    /// base units of `from_token` sent in.
    pub fn set_rate(env: Env, admin: Address, from_token: Address, to_token: Address, rate: i128) {
        extend_instance_ttl(&env);
        Self::require_admin(&env, &admin);
        if rate <= 0 {
            panic!("rate must be positive");
        }
        let mut by_from = Self::rates_for(&env, &from_token);
        by_from.set(to_token, rate);
        Self::save_rates_for(&env, &from_token, &by_from);
        env.events()
            .publish((events::CONTRACT, events::SET_RATE), (from_token, to_token, rate));
    }

    /// Whether this venue can currently quote a pair, without panicking.
    pub fn has_rate(env: Env, from_token: Address, to_token: Address) -> bool {
        extend_instance_ttl(&env);
        Self::rates_for(&env, &from_token).contains_key(to_token)
    }

    /// Read-only deterministic quote for route discovery.
    pub fn quote(env: Env, from_token: Address, from_amount: i128, to_token: Address) -> i128 {
        extend_instance_ttl(&env);
        if from_amount <= 0 {
            panic!("from_amount must be positive");
        }
        let rate = Self::rates_for(&env, &from_token)
            .get(to_token)
            .expect("no rate configured for this pair");
        from_amount
            .checked_mul(rate)
            .expect("overflow computing swap output")
            / RATE_SCALE
    }

    /// Executes a swap, assuming `from_amount` of `from_token` has already
    /// been transferred to this contract by the caller. Pays out `to_token`
    /// from this contract's own reserves directly to `to`. Panics (and so
    /// reverts the whole transaction, including the caller's earlier
    /// transfer) if no rate is configured or the computed output is below
    /// `min_out`.
    ///
    /// Returns the actual amount of `to_token` paid out.
    pub fn execute_swap(
        env: Env,
        from_token: Address,
        from_amount: i128,
        to_token: Address,
        min_out: i128,
        to: Address,
    ) -> i128 {
        extend_instance_ttl(&env);
        if from_amount <= 0 {
            panic!("from_amount must be positive");
        }

        let out = Self::quote(
            env.clone(),
            from_token.clone(),
            from_amount,
            to_token.clone(),
        );

        if out < min_out {
            panic!("swap output below min_out");
        }

        let to_client = token::Client::new(&env, &to_token);
        to_client.transfer(&env.current_contract_address(), &to, &out);

        env.events()
            .publish((events::CONTRACT, events::SWAP), (from_token, from_amount, to_token, out, to));

        out
    }

    // ── Internals ────────────────────────────────────────────────────────────

    fn require_admin(env: &Env, admin: &Address) {
        admin.require_auth();
        let stored: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .expect("not initialized");
        if stored != *admin {
            panic!("not the admin");
        }
    }

    fn rates_for(env: &Env, from_token: &Address) -> Map<Address, i128> {
        let all: Map<Address, Map<Address, i128>> = env
            .storage()
            .instance()
            .get(&symbol_short!("rates"))
            .unwrap_or(Map::new(env));
        all.get(from_token.clone()).unwrap_or(Map::new(env))
    }

    fn save_rates_for(env: &Env, from_token: &Address, by_from: &Map<Address, i128>) {
        let mut all: Map<Address, Map<Address, i128>> = env
            .storage()
            .instance()
            .get(&symbol_short!("rates"))
            .unwrap_or(Map::new(env));
        all.set(from_token.clone(), by_from.clone());
        env.storage().instance().set(&symbol_short!("rates"), &all);
    }
}

#[cfg(test)]
mod test;
