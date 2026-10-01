#![cfg(test)]

use crate::{RateLimit, RateLimiter, RateLimiterClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, Vec,
};

fn total_hourly_spend(limit: &RateLimit) -> i128 {
    let mut total = 0;
    for i in 0..limit.hourly_buckets.len() {
        total += limit.hourly_buckets.get(i).unwrap().spend;
    }
    total
}

fn total_daily_spend(limit: &RateLimit) -> i128 {
    let mut total = 0;
    for i in 0..limit.daily_buckets.len() {
        total += limit.daily_buckets.get(i).unwrap().spend;
    }
    total
}

fn total_hourly_txs(limit: &RateLimit) -> u32 {
    let mut total = 0;
    for i in 0..limit.hourly_buckets.len() {
        total += limit.hourly_buckets.get(i).unwrap().tx_count;
    }
    total
}

const LEDGERS_PER_HOUR: u32 = 720;
const LEDGERS_PER_DAY: u32 = 17_280;

fn setup() -> (Env, RateLimiterClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, RateLimiter);
    let client = RateLimiterClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    (env, client, owner, agent)
}

fn advance_ledgers(env: &Env, by: u32) {
    let seq = env.ledger().sequence();
    let protocol = env.ledger().protocol_version();
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp(),
        protocol_version: protocol,
        sequence_number: seq + by,
        network_id: [0; 32],
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 1_000_000,
    });
}

fn set_default_limits(client: &RateLimiterClient, owner: &Address, agent: &Address) {
    client.set_limits(owner, agent, &100, &500, &2000, &5);
}

#[test]
#[should_panic(expected = "limits must be positive")]
fn set_limits_rejects_zero_max_per_tx() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &0, &500, &2000, &5);
}

#[test]
#[should_panic(expected = "limits must be positive")]
fn set_limits_rejects_negative_max_per_tx() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &-10, &500, &2000, &5);
}

#[test]
#[should_panic(expected = "limits must be positive")]
fn set_limits_rejects_zero_max_per_hour() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &100, &0, &2000, &5);
}

#[test]
#[should_panic(expected = "limits must be positive")]
fn set_limits_rejects_zero_max_per_day() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &100, &500, &0, &5);
}

#[test]
#[should_panic(expected = "hourly limit cannot exceed daily limit")]
fn set_limits_rejects_hourly_above_daily() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &100, &3000, &2000, &5);
}

#[test]
#[should_panic(expected = "per-tx limit cannot exceed hourly limit")]
fn set_limits_rejects_per_tx_above_hourly() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &600, &500, &2000, &5);
}

#[test]
fn set_limits_succeeds_and_initializes_zeroed_state() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);

    let limit: RateLimit = client.get_limits(&agent);
    assert_eq!(limit.max_per_tx, 100);
    assert_eq!(limit.max_per_hour, 500);
    assert_eq!(limit.max_per_day, 2000);
    assert_eq!(limit.max_txs_per_hour, 5);
    assert_eq!(total_hourly_spend(&limit), 0);
    assert_eq!(total_daily_spend(&limit), 0);
    assert_eq!(total_hourly_txs(&limit), 0);
    assert!(limit.active);
}

#[test]
fn check_allows_when_no_limit_configured() {
    let (_env, client, _owner, agent) = setup();
    assert!(client.check(&agent, &999_999));
}

#[test]
fn check_allows_amount_at_per_tx_limit() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    assert!(client.check(&agent, &100));
}

#[test]
fn check_allows_amount_under_per_tx_limit() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    assert!(client.check(&agent, &99));
}

#[test]
fn check_rejects_amount_over_per_tx_limit() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    assert!(!client.check(&agent, &101));
}

#[test]
fn check_allows_when_hourly_spend_would_hit_exactly_the_limit() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    for _ in 0..4 {
        client.record_payment(&owner, &agent, &100);
    }
    assert!(client.check(&agent, &100));
}

#[test]
fn check_allows_when_hourly_spend_stays_under_limit() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    client.record_payment(&owner, &agent, &100);
    assert!(client.check(&agent, &50));
}

#[test]
fn check_rejects_when_hourly_spend_would_exceed_limit() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    for _ in 0..4 {
        client.record_payment(&owner, &agent, &100);
    }
    client.record_payment(&owner, &agent, &100);
    assert!(!client.check(&agent, &1));
}

#[test]
fn check_allows_when_daily_spend_would_hit_exactly_the_limit() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &2000, &2000, &2000, &100);
    client.record_payment(&owner, &agent, &1900);
    assert!(client.check(&agent, &100));
}

#[test]
fn check_allows_when_daily_spend_stays_under_limit() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &2000, &2000, &2000, &100);
    client.record_payment(&owner, &agent, &500);
    assert!(client.check(&agent, &100));
}

#[test]
fn check_rejects_when_daily_spend_would_exceed_limit() {
    let (_env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &2000, &2000, &2000, &100);
    client.record_payment(&owner, &agent, &1900);
    assert!(!client.check(&agent, &101));
}

#[test]
fn check_allows_when_tx_count_is_under_limit() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    for _ in 0..3 {
        client.record_payment(&owner, &agent, &10);
    }
    assert!(client.check(&agent, &10));
}

#[test]
fn check_allows_the_exact_last_allowed_tx() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    for _ in 0..4 {
        client.record_payment(&owner, &agent, &10);
    }
    assert!(client.check(&agent, &10));
}

#[test]
fn check_rejects_when_tx_count_limit_reached() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    for _ in 0..5 {
        client.record_payment(&owner, &agent, &10);
    }
    assert!(!client.check(&agent, &10));
}

#[test]
fn record_payment_accumulates_spend_and_tx_count() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);

    client.record_payment(&owner, &agent, &30);
    client.record_payment(&owner, &agent, &20);

    let limit: RateLimit = client.get_limits(&agent);
    assert_eq!(total_hourly_spend(&limit), 50);
    assert_eq!(total_daily_spend(&limit), 50);
    assert_eq!(total_hourly_txs(&limit), 2);
}

#[test]
fn record_payment_is_a_noop_when_no_limit_configured() {
    let (_env, client, owner, agent) = setup();
    client.record_payment(&owner, &agent, &50);
    assert!(client.is_active(&agent));
}

#[test]
fn hourly_window_resets_after_720_ledgers() {
    let (env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);

    client.record_payment(&owner, &agent, &100);
    client.record_payment(&owner, &agent, &100);
    let before: RateLimit = client.get_limits(&agent);
    assert_eq!(total_hourly_spend(&before), 200);
    assert_eq!(total_hourly_txs(&before), 2);

    advance_ledgers(&env, LEDGERS_PER_HOUR);

    assert!(client.check(&agent, &100));
    client.record_payment(&owner, &agent, &1);

    let after: RateLimit = client.get_limits(&agent);
    assert_eq!(total_hourly_spend(&after), 1);
    assert_eq!(total_hourly_txs(&after), 1);
}

#[test]
fn daily_window_resets_after_17280_ledgers() {
    let (env, client, owner, agent) = setup();
    client.set_limits(&owner, &agent, &2000, &2000, &2000, &100);

    client.record_payment(&owner, &agent, &500);
    let before: RateLimit = client.get_limits(&agent);
    assert_eq!(total_daily_spend(&before), 500);

    advance_ledgers(&env, LEDGERS_PER_DAY);

    client.record_payment(&owner, &agent, &1);

    let after: RateLimit = client.get_limits(&agent);
    assert_eq!(total_daily_spend(&after), 1);
}

#[test]
fn hourly_window_does_not_reset_before_720_ledgers() {
    let (env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);

    client.record_payment(&owner, &agent, &100);
    advance_ledgers(&env, LEDGERS_PER_HOUR - 1);
    client.record_payment(&owner, &agent, &50);

    let limit: RateLimit = client.get_limits(&agent);
    assert_eq!(total_hourly_spend(&limit), 150);
    assert_eq!(total_hourly_txs(&limit), 2);
}

#[test]
fn update_limits_changes_the_stored_limits() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);

    client.update_limits(&owner, &agent, &200, &800, &3000, &10);

    let limit: RateLimit = client.get_limits(&agent);
    assert_eq!(limit.max_per_tx, 200);
    assert_eq!(limit.max_per_hour, 800);
    assert_eq!(limit.max_per_day, 3000);
    assert_eq!(limit.max_txs_per_hour, 10);
}

#[test]
#[should_panic(expected = "not the limit owner")]
fn update_limits_rejects_non_owner() {
    let (env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    let stranger = Address::generate(&env);
    client.update_limits(&stranger, &agent, &200, &800, &3000, &10);
}

#[test]
#[should_panic(expected = "no rate limit for agent")]
fn update_limits_panics_for_unknown_agent() {
    let (env, client, owner, _agent) = setup();
    let unknown_agent = Address::generate(&env);
    client.update_limits(&owner, &unknown_agent, &200, &800, &3000, &10);
}

#[test]
fn kill_agent_deactivates_the_agent() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    assert!(client.is_active(&agent));

    client.kill_agent(&owner, &agent);

    assert!(!client.is_active(&agent));
    let limit: RateLimit = client.get_limits(&agent);
    assert!(!limit.active);
}

#[test]
#[should_panic(expected = "not the limit owner")]
fn kill_agent_rejects_non_owner() {
    let (env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    let stranger = Address::generate(&env);
    client.kill_agent(&stranger, &agent);
}

#[test]
#[should_panic(expected = "no rate limit for agent")]
fn kill_agent_panics_for_unknown_agent() {
    let (env, client, owner, _agent) = setup();
    let unknown_agent = Address::generate(&env);
    client.kill_agent(&owner, &unknown_agent);
}

#[test]
fn get_limits_returns_the_stored_configuration() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    let limit: RateLimit = client.get_limits(&agent);
    assert_eq!(limit.agent, agent);
    assert_eq!(limit.owner, owner);
}

#[test]
#[should_panic(expected = "no rate limit for agent")]
fn get_limits_panics_for_unknown_agent() {
    let (env, client, _owner, _agent) = setup();
    let unknown_agent = Address::generate(&env);
    client.get_limits(&unknown_agent);
}

#[test]
fn is_active_defaults_true_for_unconfigured_agent() {
    let (env, client, _owner, _agent) = setup();
    let unknown_agent = Address::generate(&env);
    assert!(client.is_active(&unknown_agent));
}

#[test]
fn is_active_reflects_active_flag_after_kill() {
    let (_env, client, owner, agent) = setup();
    set_default_limits(&client, &owner, &agent);
    client.kill_agent(&owner, &agent);
    assert!(!client.is_active(&agent));
}

struct RateLimiterHarness {
    env: Env,
    client: RateLimiterClient<'static>,
    owner: Address,
    agent: Address,
    owners: [Address; 3],
    impostor: Address,
}

fn setup_rate_limiter() -> RateLimiterHarness {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(RateLimiter, ());
    let client = RateLimiterClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let owners = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let impostor = Address::generate(&env);

    client.set_limits(&owner, &agent, &100, &1_000, &10_000, &10);

    RateLimiterHarness {
        env,
        client,
        owner,
        agent,
        owners,
        impostor,
    }
}

// ── Single Owner Mode (Threshold = 1) ────────────────────────────────────────

#[test]
fn single_owner_kill_agent_executes_immediately() {
    let h = setup_rate_limiter();

    assert!(h.client.is_active(&h.agent));

    // Owner kills agent with 1 signature
    h.client.kill_agent(&h.owner, &h.agent);

    assert!(!h.client.is_active(&h.agent));
}

#[test]
#[should_panic(expected = "not the limit owner")]
fn single_owner_non_owner_cannot_kill() {
    let h = setup_rate_limiter();
    h.client.kill_agent(&h.impostor, &h.agent);
}

// ── Multi-sig Quorum, Proposal & Execution ───────────────────────────────────

#[test]
fn multisig_kill_agent_reaches_quorum() {
    let h = setup_rate_limiter();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());
    owners_vec.push_back(h.owners[2].clone());

    // Configure 2-of-3 multisig with 500 ledgers window
    h.client
        .set_agent_multisig(&h.owner, &h.agent, &owners_vec, &2, &500);

    assert_eq!(h.client.get_kill_agent_quorum(&h.agent), 0);

    // Owner 0 proposes
    h.client.propose_kill_agent(&h.owners[0], &h.agent);
    assert_eq!(h.client.get_kill_agent_quorum(&h.agent), 1);

    // Owner 1 proposes
    h.client.propose_kill_agent(&h.owners[1], &h.agent);
    assert_eq!(h.client.get_kill_agent_quorum(&h.agent), 2);

    // Execution succeeds
    h.client.kill_agent(&h.owners[0], &h.agent);
    assert!(!h.client.is_active(&h.agent));
}

#[test]
#[should_panic(expected = "quorum not reached")]
fn multisig_kill_agent_fails_without_quorum() {
    let h = setup_rate_limiter();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    // 2-of-2 multisig
    h.client
        .set_agent_multisig(&h.owner, &h.agent, &owners_vec, &2, &500);

    // Only 1 owner proposes
    h.client.propose_kill_agent(&h.owners[0], &h.agent);
    assert_eq!(h.client.get_kill_agent_quorum(&h.agent), 1);

    // Must panic
    h.client.kill_agent(&h.owners[0], &h.agent);
}

#[test]
fn duplicate_kill_agent_proposals_count_once() {
    let h = setup_rate_limiter();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    h.client
        .set_agent_multisig(&h.owner, &h.agent, &owners_vec, &2, &500);

    h.client.propose_kill_agent(&h.owners[0], &h.agent);
    h.client.propose_kill_agent(&h.owners[0], &h.agent);

    assert_eq!(h.client.get_kill_agent_quorum(&h.agent), 1);
}

#[test]
#[should_panic(expected = "quorum not reached")]
fn expired_kill_agent_proposals_fail() {
    let h = setup_rate_limiter();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    h.client
        .set_agent_multisig(&h.owner, &h.agent, &owners_vec, &2, &100);

    // Propose at ledger 0
    h.client.propose_kill_agent(&h.owners[0], &h.agent);

    // Advance ledger past window
    h.env.ledger().set(LedgerInfo {
        timestamp: 10_000,
        protocol_version: h.env.ledger().protocol_version(),
        sequence_number: 150,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 100_000,
    });

    // Owner 1 proposes at ledger 150
    h.client.propose_kill_agent(&h.owners[1], &h.agent);

    // Owner 0's proposal expired, quorum is 1 < 2
    assert_eq!(h.client.get_kill_agent_quorum(&h.agent), 1);

    h.client.kill_agent(&h.owners[1], &h.agent);
}

#[test]
#[should_panic(expected = "quorum not reached")]
fn already_killed_agent_action_cannot_be_replayed() {
    let h = setup_rate_limiter();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    h.client
        .set_agent_multisig(&h.owner, &h.agent, &owners_vec, &2, &500);

    h.client.propose_kill_agent(&h.owners[0], &h.agent);
    h.client.propose_kill_agent(&h.owners[1], &h.agent);

    // Executes successfully
    h.client.kill_agent(&h.owners[0], &h.agent);

    // Replay attempt panics because proposals were consumed
    h.client.kill_agent(&h.owners[0], &h.agent);
}

#[test]
#[should_panic(expected = "not a multisig owner")]
fn non_multisig_owner_cannot_propose_kill() {
    let h = setup_rate_limiter();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    h.client
        .set_agent_multisig(&h.owner, &h.agent, &owners_vec, &2, &500);

    h.client.propose_kill_agent(&h.impostor, &h.agent);
}
