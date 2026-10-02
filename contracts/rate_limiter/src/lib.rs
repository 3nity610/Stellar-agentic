//! # Rate Limiter Contract
//!
//! Prevents runaway agents from draining wallets.
//! Enforces per-transaction, per-minute, and per-hour caps on-chain.
//! Works as a standalone guard composable with PaymentChannel.
//!
//! ## Events
//!
//! All events use a `(symbol_short!("rl"), symbol_short!("<action>"))` topic
//! tuple. See `docs/events.md` for the full cross-contract event catalogue.
//!
//! | Topics                          | Data                     | Emitted by        |
//! |---------------------------------|--------------------------|-------------------|
//! | `("rl", "set")`                 | `(agent, limit)`         | `set_limits`      |
//! | `("rl", "recorded")`            | `(agent, amount)`        | `record_payment`  |
//! | `("rl", "updated")`             | `(agent, limit)`         | `update_limits`   |
//! | `("rl", "killed")`              | `agent`                  | `kill_agent`      |

#![no_std]

//! # Rate Limiter Contract
//!
//! Prevents runaway agents from draining wallets.
//! Enforces per-transaction, per-minute, and per-hour caps on-chain.
//! Works as a standalone guard composable with PaymentChannel.

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map, Vec};

// ─── Types ───────────────────────────────────────────────────────────────────

/// Rate limit configuration for an agent
#[contracttype]
#[derive(Clone, Debug)]
pub struct SpendBucket {
    /// Ledger at which this bucket started
    pub start_ledger: u32,
    /// Total spend recorded in this bucket
    pub spend: i128,
    /// Number of transactions recorded in this bucket
    pub tx_count: u32,
}

/// Rate limit configuration for an agent
#[contracttype]
#[derive(Clone, Debug)]
pub struct RateLimit {
    /// The agent being rate-limited
    pub agent: Address,
    /// The owner who set this limit
    pub owner: Address,
    /// Max per single transaction
    pub max_per_tx: i128,
    /// Max total per hour (~720 ledgers)
    pub max_per_hour: i128,
    /// Max total per day (~17280 ledgers)
    pub max_per_day: i128,
    /// Max number of transactions per hour
    pub max_txs_per_hour: u32,

    // ── Sliding window state ──
    /// Buckets covering the last 24h, each spanning LEDGERS_PER_BUCKET ledgers.
    /// Index 0 is the oldest; the last entry is the current bucket.
    pub hourly_buckets: Vec<SpendBucket>,
    /// Buckets covering the last 24h for the daily limit.
    pub daily_buckets: Vec<SpendBucket>,

    pub active: bool,
}

// ─── Contract ────────────────────────────────────────────────────────────────


pub const DAY_IN_LEDGERS: u32 = 17280;
pub const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const INSTANCE_LIFETIME_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;


pub fn extend_instance_ttl(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

#[contract]
pub struct RateLimiter;

#[contractimpl]
impl RateLimiter {
    /// Register rate limits for an agent.
    /// Call this when setting up a new agent.
    pub fn set_limits(
        env: Env,
        owner: Address,
        agent: Address,
        max_per_tx: i128,
        max_per_hour: i128,
        max_per_day: i128,
        max_txs_per_hour: u32,
    ) {
        extend_instance_ttl(&env);
        owner.require_auth();

        if max_per_tx <= 0 || max_per_hour <= 0 || max_per_day <= 0 {
            panic!("limits must be positive");
        }
        if max_per_hour > max_per_day {
            panic!("hourly limit cannot exceed daily limit");
        }
        if max_per_tx > max_per_hour {
            panic!("per-tx limit cannot exceed hourly limit");
        }

        let current_ledger = env.ledger().sequence();
        let hourly_buckets = Self::new_buckets(&env, current_ledger, HOURLY_BUCKETS);
        let daily_buckets = Self::new_buckets(&env, current_ledger, DAILY_BUCKETS);
        let limit = RateLimit {
            agent: agent.clone(),
            owner,
            max_per_tx,
            max_per_hour,
            max_per_day,
            max_txs_per_hour,
            hourly_buckets,
            daily_buckets,
            active: true,
        };

        Self::save_limit(&env, &agent, limit.clone());
        env.events().publish(
            (
                soroban_sdk::symbol_short!("rl"),
                soroban_sdk::symbol_short!("set"),
            ),
            (agent, limit),
        );
    }

    /// Check if a proposed payment passes rate limits.
    /// Returns true if allowed, false if it would be blocked.
    /// Does NOT modify state — call `record_payment` after a successful tx.
    pub fn check(env: Env, agent: Address, amount: i128) -> bool {
        extend_instance_ttl(&env);
        if !Self::has_limit(&env, &agent) {
            return true; // no limit configured = allow
        }

        let mut limit = Self::load_limit(&env, &agent);
        let current_ledger = env.ledger().sequence();

        // Advance buckets to the current ledger
        Self::advance_buckets(&mut limit.hourly_buckets, current_ledger, HOURLY_BUCKETS);
        Self::advance_buckets(&mut limit.daily_buckets, current_ledger, DAILY_BUCKETS);

        // Per-tx check
        if amount > limit.max_per_tx {
            return false;
        }

        // Hourly spend check (sum over sliding window)
        if Self::sum_spend(&limit.hourly_buckets) + amount > limit.max_per_hour {
            return false;
        }

        // Daily spend check (sum over sliding window)
        if Self::sum_spend(&limit.daily_buckets) + amount > limit.max_per_day {
            return false;
        }

        // Hourly tx count check
        if Self::sum_tx_count(&limit.hourly_buckets) >= limit.max_txs_per_hour {
            return false;
        }

        true
    }

    /// Record a payment after it has been successfully executed.
    /// Must be called by the payment channel or an authorized contract.
    pub fn record_payment(env: Env, recorder: Address, agent: Address, amount: i128) {
        extend_instance_ttl(&env);
        recorder.require_auth();

        if !Self::has_limit(&env, &agent) {
            return;
        }

        let mut limit = Self::load_limit(&env, &agent);
        let current_ledger = env.ledger().sequence();

        // Advance buckets to the current ledger
        Self::advance_buckets(&mut limit.hourly_buckets, current_ledger, HOURLY_BUCKETS);
        Self::advance_buckets(&mut limit.daily_buckets, current_ledger, DAILY_BUCKETS);

        Self::add_to_current_bucket(&mut limit.hourly_buckets, current_ledger, amount, 1);
        Self::add_to_current_bucket(&mut limit.daily_buckets, current_ledger, amount, 1);

        Self::save_limit(&env, &agent, limit.clone());

        env.events().publish(
            (
                soroban_sdk::symbol_short!("rl"),
                soroban_sdk::symbol_short!("recorded"),
            ),
            (agent.clone(), amount),
        );
        env.events().publish(
            (
                soroban_sdk::symbol_short!("rl"),
                soroban_sdk::symbol_short!("updated"),
            ),
            (agent, limit),
        );
    }

    /// Owner can update limits for an agent
    pub fn update_limits(
        env: Env,
        owner: Address,
        agent: Address,
        max_per_tx: i128,
        max_per_hour: i128,
        max_per_day: i128,
        max_txs_per_hour: u32,
    ) {
        extend_instance_ttl(&env);
        owner.require_auth();

        let mut limit = Self::load_limit(&env, &agent);

        if limit.owner != owner {
            panic!("not the limit owner");
        }

        limit.max_per_tx = max_per_tx;
        limit.max_per_hour = max_per_hour;
        limit.max_per_day = max_per_day;
        limit.max_txs_per_hour = max_txs_per_hour;

        // Rebuild buckets so the new configuration is honored from now on.
        let current_ledger = env.ledger().sequence();
        limit.hourly_buckets = Self::new_buckets(&env, current_ledger, HOURLY_BUCKETS);
        limit.daily_buckets = Self::new_buckets(&env, current_ledger, DAILY_BUCKETS);

        Self::save_limit(&env, &agent, limit.clone());
        env.events().publish(
            (
                soroban_sdk::symbol_short!("rl"),
                soroban_sdk::symbol_short!("updated"),
            ),
            (agent, limit),
        );
    }

    /// Emergency kill switch — disable an agent immediately
    pub fn kill_agent(env: Env, owner: Address, agent: Address) {
        extend_instance_ttl(&env);
        owner.require_auth();

        let mut limit = Self::load_limit(&env, &agent);

        if limit.owner != owner {
            panic!("not the limit owner");
        }

        limit.active = false;
        Self::save_limit(&env, &agent, limit.clone());

        env.events().publish(
            (
                soroban_sdk::symbol_short!("rl"),
                soroban_sdk::symbol_short!("killed"),
            ),
            agent.clone(),
        );
        env.events().publish(
            (
                soroban_sdk::symbol_short!("rl"),
                soroban_sdk::symbol_short!("killed"),
            ),
            (agent, limit),
        );
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    pub fn get_limits(env: Env, agent: Address) -> RateLimit {
        extend_instance_ttl(&env);
        Self::load_limit(&env, &agent)
    }

    pub fn is_active(env: Env, agent: Address) -> bool {
        extend_instance_ttl(&env);
        if !Self::has_limit(&env, &agent) {
            return true;
        }
        Self::load_limit(&env, &agent).active
    }

    // ── Internals ────────────────────────────────────────────────────────────

    /// Number of buckets used to cover the hourly window. Each bucket spans
    /// `LEDGERS_PER_HOUR / HOURLY_BUCKETS` ledgers, giving a sliding window
    /// with bounded granularity while keeping storage small.
    fn new_buckets(env: &Env, current_ledger: u32, count: u32) -> Vec<SpendBucket> {
        let mut buckets = Vec::new(env);
        for _ in 0..count {
            buckets.push_back(SpendBucket {
                start_ledger: current_ledger,
                spend: 0,
                tx_count: 0,
            });
        }
        buckets
    }

    /// Advance the ring of buckets so the last bucket corresponds to the
    /// bucket containing `current_ledger`. Buckets that fall out of the
    /// window are reset and reused.
    fn advance_buckets(buckets: &mut Vec<SpendBucket>, current_ledger: u32, count: u32) {
        let bucket_size = LEDGERS_PER_HOUR / count;
        if bucket_size == 0 {
            return;
        }
        let current_bucket_start = (current_ledger / bucket_size) * bucket_size;

        // Advance until the last bucket's start matches the current bucket.
        loop {
            let last = buckets.get(count - 1).unwrap();
            if last.start_ledger >= current_bucket_start {
                break;
            }
            // Rotate: drop the oldest, push a fresh bucket.
            let mut rotated = Vec::new(buckets.env());
            for i in 1..count {
                rotated.push_back(buckets.get(i).unwrap());
            }
            rotated.push_back(SpendBucket {
                start_ledger: last.start_ledger + bucket_size,
                spend: 0,
                tx_count: 0,
            });
            *buckets = rotated;
        }
    }

    fn sum_spend(buckets: &Vec<SpendBucket>) -> i128 {
        let mut total: i128 = 0;
        for i in 0..buckets.len() {
            total += buckets.get(i).unwrap().spend;
        }
        total
    }

    fn sum_tx_count(buckets: &Vec<SpendBucket>) -> u32 {
        let mut total: u32 = 0;
        for i in 0..buckets.len() {
            total += buckets.get(i).unwrap().tx_count;
        }
        total
    }

    fn add_to_current_bucket(
        buckets: &mut Vec<SpendBucket>,
        current_ledger: u32,
        amount: i128,
        tx_count: u32,
    ) {
        let count = buckets.len();
        if count == 0 {
            return;
        }
        let bucket_size = LEDGERS_PER_HOUR / count;
        if bucket_size == 0 {
            return;
        }
        let current_bucket_start = (current_ledger / bucket_size) * bucket_size;
        let mut last = buckets.get(count - 1).unwrap();
        if last.start_ledger != current_bucket_start {
            last.start_ledger = current_bucket_start;
            last.spend = 0;
            last.tx_count = 0;
        }
        last.spend += amount;
        last.tx_count += tx_count;
        buckets.set(count - 1, last);
    }

    fn has_limit(env: &Env, agent: &Address) -> bool {
        let limits: Map<Address, RateLimit> = env
            .storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("limits"))
            .unwrap_or(Map::new(env));
        limits.contains_key(agent.clone())
    }

    fn load_limit(env: &Env, agent: &Address) -> RateLimit {
        let limits: Map<Address, RateLimit> = env
            .storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("limits"))
            .unwrap();
        limits.get(agent.clone()).expect("no rate limit for agent")
    }

    fn save_limit(env: &Env, agent: &Address, limit: RateLimit) {
        let mut limits: Map<Address, RateLimit> = env
            .storage()
            .instance()
            .get(&soroban_sdk::symbol_short!("limits"))
            .unwrap_or(Map::new(env));
        limits.set(agent.clone(), limit);
        env.storage()
            .instance()
            .set(&soroban_sdk::symbol_short!("limits"), &limits);
    }
}

const LEDGERS_PER_HOUR: u32 = 720;
const HOURLY_BUCKETS: u32 = 12;
const DAILY_BUCKETS: u32 = 24;
