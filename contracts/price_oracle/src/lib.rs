#![no_std]

//! # Price Oracle Contract
//!
//! A minimal, single-admin price-feed contract used by `PaymentChannel` to
//! get a trusted reference price when converting between assets in
//! `pay_with_conversion`.
//!
//! ## Trust model
//!
//! This is intentionally the simplest possible design: one admin key
//! publishes prices via `set_price`, and every reader trusts whatever was
//! last published. That is a **new external trust dependency** the rest of
//! this contract suite doesn't otherwise have — `PaymentChannel`,
//! `Escrow`, and `RateLimiter` are all self-contained modulo the
//! `CircuitBreaker` (which itself requires a 5-of-N quorum of trusted
//! nodes, not a single key).
//!
//! A single admin is a reasonable *starting point* (explicitly suggested
//! by the design brief this contract implements) because it keeps the
//! on-chain surface area small and easy to audit, and because
//! `PaymentChannel` only ever uses the price as a *safety bound* on top of
//! an already-executed AMM swap (see `pay_with_conversion`'s doc comment)
//! rather than as the sole determinant of how much value moves. It is
//! **not** sufficient for a production deployment moving meaningful value:
//! a compromised or careless admin can publish a bad price and degrade the
//! slippage protection it's supposed to provide. Before mainnet use this
//! should be replaced with (or layered under) a decentralized/aggregated
//! feed such as Reflector on Stellar, or a multi-admin quorum mirroring
//! `CircuitBreaker`'s trusted-node model.
//!
//! ## Price representation
//!
//! `set_price(admin, base, quote, price)` publishes: `price` units of
//! `quote`'s base-units are equivalent to `PRICE_SCALE` (1e7, matching
//! Stellar's 7-decimal-place convention) base-units of `base`. i.e.
//! `quote_amount = base_amount * price / PRICE_SCALE`.
//!
//! `get_price` panics if no price has been published for the requested
//! pair, or if the freshest published price is older than the configured
//! max age. Callers (e.g. `PaymentChannel`) MUST treat that panic as "price
//! unavailable" and abort the whole operation rather than assuming a
//! fallback rate — an unpriced or stale conversion must never be treated
//! as an unlimited/free one.
//!
//! ## Staleness
//!
//! Every published price is stamped with the ledger sequence it was
//! written at. `get_price` rejects a price whose age (in ledgers) exceeds
//! `max_age`, so an oracle that stops updating stops being usable rather
//! than silently quoting an arbitrarily old rate. `max_age` defaults to
//! [`DEFAULT_MAX_PRICE_AGE_LEDGERS`] and is admin-configurable via
//! `set_max_age` to fit a deployment's own freshness requirements.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Map};

/// Fixed-point scale for published prices, matching Stellar's 7-decimal
/// convention. Must match `payment_channel::PRICE_SCALE`.
pub const PRICE_SCALE: i128 = 10_000_000;

/// Default max age a published price may be read at before `get_price`
/// treats it as stale, in ledgers (~5 minutes at 5s ledgers). Admin can
/// override via `set_max_age`.
pub const DEFAULT_MAX_PRICE_AGE_LEDGERS: u32 = 60;

/// A published price together with the ledger sequence it was written at.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PriceEntry {
    pub price: i128,
    pub ledger: u32,
}

#[contract]
pub struct PriceOracle;

#[contractimpl]
impl PriceOracle {
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
        env.storage()
            .instance()
            .set(&symbol_short!("max_age"), &DEFAULT_MAX_PRICE_AGE_LEDGERS);
    }

    /// Admin-only: publish (or update) the trusted price of `base` in terms
    /// of `quote`. See module docs for the fixed-point convention.
    ///
    /// Emits: topics `("oracle", "price")`, data `(base, price)`. The
    /// `quote` asset is intentionally not part of the payload; indexers
    /// must key on the `base` address and treat the pair as
    /// `(base, quote)` per the stored map.
    pub fn set_price(env: Env, admin: Address, base: Address, quote: Address, price: i128) {
        extend_instance_ttl(&env);
        Self::require_admin(&env, &admin);

        if price <= 0 {
            panic!("price must be positive");
        }

        let entry = PriceEntry {
            price,
            ledger: env.ledger().sequence(),
        };
        let mut by_base = Self::prices_for(&env, &base);
        by_base.set(quote, entry);
        Self::save_prices_for(&env, &base, &by_base);

        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("price")),
            (base, price),
        );
    }

    /// Returns the trusted price of `base` in terms of `quote`. Identity
    /// pairs (`base == quote`) always return `PRICE_SCALE` without needing
    /// a stored entry. Panics if no price has been published, or if the
    /// freshest published price is older than `max_age` ledgers — callers
    /// must fail safe on either case, not substitute a default rate.
    pub fn get_price(env: Env, base: Address, quote: Address) -> i128 {
        extend_instance_ttl(&env);
        if base == quote {
            return PRICE_SCALE;
        }
        let entry = Self::entry_for(&env, &base, &quote);
        Self::require_fresh(&env, &entry);
        entry.price
    }

    /// Age, in ledgers, of the freshest published price for this pair.
    /// Lets callers inspect freshness directly (e.g. to show a UI warning)
    /// without waiting for `get_price` to panic. Identity pairs are always
    /// age 0. Panics if no price has been published, same as `get_price`.
    pub fn get_price_age(env: Env, base: Address, quote: Address) -> u32 {
        if base == quote {
            return 0;
        }
        let entry = Self::entry_for(&env, &base, &quote);
        env.ledger().sequence().saturating_sub(entry.ledger)
    }

    /// Whether a price has been published for this pair, without panicking.
    /// Useful for callers that want to check availability before spending
    /// gas on a call that would otherwise panic. Does not check staleness.
    pub fn has_price(env: Env, base: Address, quote: Address) -> bool {
        extend_instance_ttl(&env);
        if base == quote {
            return true;
        }
        Self::prices_for(&env, &base).contains_key(quote)
    }

    pub fn get_admin(env: Env) -> Address {
        extend_instance_ttl(&env);
        env.storage()
            .instance()
            .get(&symbol_short!("admin"))
            .expect("not initialized")
    }

    /// Admin-only: set the max age, in ledgers, a published price may be
    /// read at before `get_price` rejects it as stale.
    pub fn set_max_age(env: Env, admin: Address, max_age: u32) {
        Self::require_admin(&env, &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("max_age"), &max_age);
    }

    /// Current max age, in ledgers, a published price may be read at
    /// before `get_price` rejects it as stale.
    pub fn get_max_age(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("max_age"))
            .unwrap_or(DEFAULT_MAX_PRICE_AGE_LEDGERS)
    }

    // ── Internals ────────────────────────────────────────────────────────────

    fn entry_for(env: &Env, base: &Address, quote: &Address) -> PriceEntry {
        Self::prices_for(env, base)
            .get(quote.clone())
            .expect("price not available")
    }

    fn require_fresh(env: &Env, entry: &PriceEntry) {
        let age = env.ledger().sequence().saturating_sub(entry.ledger);
        let max_age: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("max_age"))
            .unwrap_or(DEFAULT_MAX_PRICE_AGE_LEDGERS);
        if age > max_age {
            panic!("price is stale");
        }
    }

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

    fn prices_for(env: &Env, base: &Address) -> Map<Address, PriceEntry> {
        let all: Map<Address, Map<Address, PriceEntry>> = env
            .storage()
            .instance()
            .get(&symbol_short!("prices"))
            .unwrap_or(Map::new(env));
        all.get(base.clone()).unwrap_or(Map::new(env))
    }

    fn save_prices_for(env: &Env, base: &Address, by_base: &Map<Address, PriceEntry>) {
        let mut all: Map<Address, Map<Address, PriceEntry>> = env
            .storage()
            .instance()
            .get(&symbol_short!("prices"))
            .unwrap_or(Map::new(env));
        all.set(base.clone(), by_base.clone());
        env.storage().instance().set(&symbol_short!("prices"), &all);
    }
}

#[cfg(test)]
mod test;
