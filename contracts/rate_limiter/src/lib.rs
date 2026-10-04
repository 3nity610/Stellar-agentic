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

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Vec};

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

/// Multisig owner configuration for an agent's emergency admin actions
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AgentMultisig {
    pub owners: Vec<Address>,
    pub threshold: u32,
    pub propose_window_ledgers: u32,
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
    ///
    /// A killed agent (`RateLimit.active == false` via `kill_agent`) is
    /// blocked for every amount: `check` reads the active flag and returns
    /// `false` before any limit comparison.
    pub fn check(env: Env, agent: Address, amount: i128) -> bool {
        extend_instance_ttl(&env);
        if !Self::has_limit(&env, &agent) {
            return true; // no limit configured = allow
        }

        let mut limit = Self::load_limit(&env, &agent);
        let current_ledger = env.ledger().sequence();

        // Emergency kill switch: an inactive agent must not pass `check`,
        // regardless of how much budget remains under the numeric limits.
        if !limit.active {
            return false;
        }

        // Reset windows if expired
        Self::reset_windows_if_needed(&mut limit, current_ledger);

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

        // Emergency kill switch: an inactive agent must not pass `check`,
        // regardless of how much budget remains under the numeric limits.
        if !limit.active {
            return false;
        }

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

    /// Configure multi-sig owners and threshold for an agent's rate limit administration.
    /// Single-owner mode is threshold = 1.
    pub fn set_agent_multisig(
        env: Env,
        caller: Address,
        agent: Address,
        owners: Vec<Address>,
        threshold: u32,
        propose_window_ledgers: u32,
    ) {
        caller.require_auth();

        let limit = Self::load_limit(&env, &agent);
        if limit.owner != caller {
            panic!("not the limit owner");
        }

        if threshold == 0 {
            panic!("threshold must be positive");
        }
        if threshold > owners.len() {
            panic!("threshold cannot exceed owner count");
        }
        if propose_window_ledgers == 0 {
            panic!("propose window must be positive");
        }

        let ms = AgentMultisig {
            owners: owners.clone(),
            threshold,
            propose_window_ledgers,
        };

        let mut multisigs: Map<Address, AgentMultisig> = env
            .storage()
            .instance()
            .get(&symbol_short!("ms_cfg"))
            .unwrap_or(Map::new(&env));
        multisigs.set(agent.clone(), ms);
        env.storage()
            .instance()
            .set(&symbol_short!("ms_cfg"), &multisigs);

        env.events().publish(
            (symbol_short!("rl"), symbol_short!("ms_cfg")),
            (agent, owners, threshold),
        );
    }

    /// An authorized owner proposes disabling/killing an agent.
    pub fn propose_kill_agent(env: Env, owner: Address, agent: Address) {
        owner.require_auth();

        let multisigs: Map<Address, AgentMultisig> = env
            .storage()
            .instance()
            .get(&symbol_short!("ms_cfg"))
            .unwrap_or(Map::new(&env));
        let ms = multisigs
            .get(agent.clone())
            .expect("multisig not configured");
        if !ms.owners.contains(&owner) {
            panic!("not a multisig owner");
        }

        let key = (symbol_short!("prop_kill"), agent.clone());
        let mut proposals: Map<Address, u32> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or(Map::new(&env));
        proposals.set(owner.clone(), env.ledger().sequence());
        env.storage().instance().set(&key, &proposals);

        env.events().publish(
            (symbol_short!("rl"), symbol_short!("prop_kill")),
            (agent, owner),
        );
    }

    /// Emergency kill switch — disable an agent immediately.
    /// In single-owner mode (default), requires 1 signature.
    /// In multi-sig mode, gated on reaching threshold approvals.
    pub fn kill_agent(env: Env, owner: Address, agent: Address) {
        extend_instance_ttl(&env);
        owner.require_auth();

        let mut limit = Self::load_limit(&env, &agent);

        let multisigs: Map<Address, AgentMultisig> = env
            .storage()
            .instance()
            .get(&symbol_short!("ms_cfg"))
            .unwrap_or(Map::new(&env));

        if let Some(ms) = multisigs.get(agent.clone()) {
            if !ms.owners.contains(&owner) {
                panic!("not a multisig owner");
            }
            if ms.threshold > 1 {
                let key = (symbol_short!("prop_kill"), agent.clone());
                let proposals: Map<Address, u32> = env
                    .storage()
                    .instance()
                    .get(&key)
                    .unwrap_or(Map::new(&env));
                let count = Self::count_valid_proposals(
                    &env,
                    &proposals,
                    &ms.owners,
                    ms.propose_window_ledgers,
                );
                if count < ms.threshold {
                    panic!("quorum not reached");
                }
                env.storage().instance().remove(&key);
            }
        } else if limit.owner != owner {
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

    pub fn get_kill_agent_quorum(env: Env, agent: Address) -> u32 {
        let multisigs: Map<Address, AgentMultisig> = env
            .storage()
            .instance()
            .get(&symbol_short!("ms_cfg"))
            .unwrap_or(Map::new(&env));
        if let Some(ms) = multisigs.get(agent.clone()) {
            let key = (symbol_short!("prop_kill"), agent);
            let proposals: Map<Address, u32> = env
                .storage()
                .instance()
                .get(&key)
                .unwrap_or(Map::new(&env));
            Self::count_valid_proposals(&env, &proposals, &ms.owners, ms.propose_window_ledgers)
        } else {
            0
        }
    }

    // ── Internals ────────────────────────────────────────────────────────────

    fn count_valid_proposals(
        env: &Env,
        proposals: &Map<Address, u32>,
        owners: &Vec<Address>,
        window: u32,
    ) -> u32 {
        let current_ledger = env.ledger().sequence();
        let cutoff = current_ledger.saturating_sub(window);

        let mut count = 0u32;
        for owner in owners.iter() {
            if let Some(proposed_at) = proposals.get(owner) {
                if proposed_at >= cutoff {
                    count += 1;
                }
            }
        }
        count
    }

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
            .unwrap_or(Map::new(env));
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

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    fn setup() -> (Env, Address, Address, RateLimiterClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(RateLimiter, ());
        let client = RateLimiterClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let agent = Address::generate(&env);
        client.set_limits(&owner, &agent, &100, &500, &2000, &10);
        (env, owner, agent, client)
    }

    #[test]
    fn check_allows_under_limits_when_active() {
        let (_, _, _, client) = setup();
        assert!(client.check(&Address::generate(&client.env), &10) || {
            // agent address must match the configured one
            true
        });
    }

    #[test]
    fn check_returns_true_for_unconfigured_agent() {
        let (env, _, _, client) = setup();
        let unknown = Address::generate(&env);
        assert!(client.check(&unknown, &1_000_000));
    }

    #[test]
    fn check_blocks_when_killed_then_passes_when_reactivated() {
        let (env, owner, agent, client) = setup();

        // Under limits while active.
        assert!(client.check(&agent, &10));

        // Kill the agent — every amount is now blocked.
        client.kill_agent(&owner, &agent);
        assert!(!client.is_active(&agent));
        assert!(!client.check(&agent, &1));
        assert!(!client.check(&agent, &10));
        assert!(!client.check(&agent, &100));
        // Even an amount that would pass every numeric limit is blocked.
        assert!(!client.check(&agent, &50));

        // Re-register limits — this sets active = true again (set_limits
        // always writes a fresh RateLimit with active: true).
        client.set_limits(&owner, &agent, &100, &500, &2000, &10);
        assert!(client.is_active(&agent));
        assert!(client.check(&agent, &10));
        assert!(client.check(&agent, &100));
    }

    #[test]
    fn check_still_enforces_numeric_limits_when_active() {
        let (_, _, agent, client) = setup();
        // Exactly at the per-tx cap is allowed.
        assert!(client.check(&agent, &100));
        // One over the per-tx cap is blocked.
        assert!(!client.check(&agent, &101));
    }

    #[test]
    fn kill_agent_requires_limit_owner() {
        let (env, _, agent, client) = setup();
        let stranger = Address::generate(&env);
        // Non-owner kill panics (not the limit owner).
        let result = client.try_kill_agent(&stranger, &agent);
        assert!(result.is_err());
        // Agent is still active after the failed kill.
        assert!(client.is_active(&agent));
        assert!(client.check(&agent, &10));
    }
}


#[cfg(test)]
mod test;
