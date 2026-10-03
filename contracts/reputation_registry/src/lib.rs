#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Map};

const HALF_LIFE_LEDGERS: u32 = 52_560;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Reputation {
    pub completions: u32,
    pub refunds: u32,
    pub disputes: u32,
    pub volume: i128,
    pub first_seen: u32,
}

#[contracttype]
enum DataKey {
    Admin,
    Reporters,
    Reputation(Address),
}

#[contract]
pub struct ReputationRegistry;

#[contractimpl]
impl ReputationRegistry {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) { panic!("already initialized"); }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Reporters, &Map::<Address, bool>::new(&env));
    }

    pub fn set_reporter(env: Env, admin: Address, reporter: Address, enabled: bool) {
        admin.require_auth();
        let stored: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        if stored != admin { panic!("not admin"); }
        let mut reporters: Map<Address, bool> = env.storage().instance().get(&DataKey::Reporters).unwrap_or(Map::new(&env));
        reporters.set(reporter, enabled);
        env.storage().instance().set(&DataKey::Reporters, &reporters);
    }

    pub fn record_completion(env: Env, reporter: Address, agent: Address, volume: i128) {
        Self::record(&env, &reporter, &agent, volume, 0);
    }

    pub fn record_refund(env: Env, reporter: Address, agent: Address, volume: i128) {
        Self::record(&env, &reporter, &agent, volume, 1);
    }

    pub fn record_dispute(env: Env, reporter: Address, agent: Address, volume: i128) {
        Self::record(&env, &reporter, &agent, volume, 2);
    }

    pub fn get_reputation(env: Env, agent: Address) -> Reputation {
        Self::load(&env, &agent)
    }

    /// Returns a deterministic 0–100 score. Outcomes are weighted 100/50/0,
    /// then linearly decayed to 50% over HALF_LIFE_LEDGERS.
    pub fn score(env: Env, agent: Address) -> u32 {
        let rep = Self::load(&env, &agent);
        let outcomes = rep.completions.saturating_add(rep.refunds).saturating_add(rep.disputes);
        if outcomes == 0 { return 0; }
        let weighted = rep.completions.saturating_mul(100).saturating_add(rep.refunds.saturating_mul(50));
        let base = weighted / outcomes;
        let age = env.ledger().sequence().saturating_sub(rep.first_seen);
        let decay_bps = if age >= HALF_LIFE_LEDGERS { 5_000 } else { 10_000 - (age as u64 * 5_000 / HALF_LIFE_LEDGERS as u64) };
        ((base as u64 * decay_bps) / 10_000) as u32
    }

    fn record(env: &Env, reporter: &Address, agent: &Address, volume: i128, outcome: u32) {
        reporter.require_auth();
        let reporters: Map<Address, bool> = env.storage().instance().get(&DataKey::Reporters).expect("not initialized");
        if !reporters.get(reporter.clone()).unwrap_or(false) { panic!("not authorized reporter"); }
        if volume < 0 { panic!("volume must be non-negative"); }
        let mut rep = Self::load(env, agent);
        if rep.first_seen == 0 { rep.first_seen = env.ledger().sequence(); }
        rep.volume = rep.volume.saturating_add(volume);
        match outcome { 0 => rep.completions = rep.completions.saturating_add(1), 1 => rep.refunds = rep.refunds.saturating_add(1), _ => rep.disputes = rep.disputes.saturating_add(1) }
        env.storage().persistent().set(&DataKey::Reputation(agent.clone()), &rep);
    }

    fn load(env: &Env, agent: &Address) -> Reputation {
        env.storage().persistent().get(&DataKey::Reputation(agent.clone())).unwrap_or(Reputation { completions: 0, refunds: 0, disputes: 0, volume: 0, first_seen: 0 })
    }
}\n\n#[cfg(test)]\nmod test;\n