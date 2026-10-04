use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, Vec,
};

struct MultisigHarness {
    env: Env,
    channel: PaymentChannelClient<'static>,
    owners: [Address; 3],
    impostor: Address,
    cb: Address,
    oracle: Address,
    amm: Address,
}

fn setup_multisig() -> MultisigHarness {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PaymentChannel, ());
    let channel = PaymentChannelClient::new(&env, &contract_id);

    let owners = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    let impostor = Address::generate(&env);
    let cb = Address::generate(&env);
    let oracle = Address::generate(&env);
    let amm = Address::generate(&env);

    MultisigHarness {
        env,
        channel,
        owners,
        impostor,
        cb,
        oracle,
        amm,
    }
}

// ── Single owner tests (Threshold = 1 / Default) ─────────────────────────────

#[test]
fn single_owner_executes_without_prior_proposals() {
    let h = setup_multisig();

    // Default: no multisig configured, threshold = 1
    assert_eq!(h.channel.get_multisig_threshold(), 1);

    // Any admin caller can set circuit breaker directly with 1 signature
    h.channel.set_circuit_breaker(&h.owners[0], &h.cb);

    // And set price oracle directly
    h.channel.set_price_oracle(&h.owners[0], &h.oracle);

    // And set AMM directly
    h.channel.set_amm(&h.owners[0], &h.amm);
}

#[test]
fn single_owner_mode_configured_threshold_one_executes_immediately() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());

    // Configure single-owner mode (threshold = 1)
    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &1, &1000);
    assert_eq!(h.channel.get_multisig_threshold(), 1);

    // Executes directly without proposal
    h.channel.set_circuit_breaker(&h.owners[0], &h.cb);
}

// ── Multi-sig Quorum, Proposal & Execution ───────────────────────────────────

#[test]
fn multisig_quorum_reached_executes_action() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());
    owners_vec.push_back(h.owners[2].clone());

    // Set 2-of-3 multisig with 500 ledgers window
    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);
    assert_eq!(h.channel.get_multisig_threshold(), 2);
    assert_eq!(h.channel.get_multisig_propose_window(), 500);

    // Initial quorum count is 0
    assert_eq!(h.channel.get_circuit_breaker_quorum(&h.cb), 0);

    // Owner 0 proposes
    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);
    assert_eq!(h.channel.get_circuit_breaker_quorum(&h.cb), 1);

    // Owner 1 proposes -> Quorum count is 2 (reaches threshold 2)
    h.channel.propose_circuit_breaker(&h.owners[1], &h.cb);
    assert_eq!(h.channel.get_circuit_breaker_quorum(&h.cb), 2);

    // Now execution succeeds
    h.channel.set_circuit_breaker(&h.owners[0], &h.cb);
}

#[test]
#[should_panic(expected = "quorum not reached")]
fn execution_fails_when_quorum_not_reached() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());
    owners_vec.push_back(h.owners[2].clone());

    // 2-of-3 multisig
    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);

    // Only Owner 0 proposes (1 of 2 required)
    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);
    assert_eq!(h.channel.get_circuit_breaker_quorum(&h.cb), 1);

    // Execution must panic with "quorum not reached"
    h.channel.set_circuit_breaker(&h.owners[0], &h.cb);
}

#[test]
fn duplicate_proposals_from_same_owner_only_count_once() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    // 2-of-2 multisig
    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);

    // Owner 0 proposes multiple times
    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);
    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);
    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);

    // Quorum count is still only 1
    assert_eq!(h.channel.get_circuit_breaker_quorum(&h.cb), 1);
}

// ── Expiry ───────────────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "quorum not reached")]
fn expired_proposals_do_not_count_toward_quorum() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    // 2-of-2 with window of 100 ledgers
    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &100);

    // Owner 0 proposes at current ledger (e.g. 0)
    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);

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
    h.channel.propose_circuit_breaker(&h.owners[1], &h.cb);

    // Owner 0's proposal has expired (150 - 0 > 100), so quorum count is only 1
    assert_eq!(h.channel.get_circuit_breaker_quorum(&h.cb), 1);

    // Must panic with "quorum not reached"
    h.channel.set_circuit_breaker(&h.owners[1], &h.cb);
}

// ── Replay Protection ────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "quorum not reached")]
fn already_executed_action_cannot_be_replayed() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    // 2-of-2
    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);

    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);
    h.channel.propose_circuit_breaker(&h.owners[1], &h.cb);

    // Execution succeeds and clears proposals
    h.channel.set_circuit_breaker(&h.owners[0], &h.cb);

    // Replay attempt immediately panics because proposals were consumed
    h.channel.set_circuit_breaker(&h.owners[0], &h.cb);
}

// ── Authorization Checks ────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "not an admin owner")]
fn non_owner_cannot_propose() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);

    // Impostor tries to propose
    h.channel.propose_circuit_breaker(&h.impostor, &h.cb);
}

#[test]
#[should_panic(expected = "not an admin owner")]
fn non_owner_cannot_execute() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);

    h.channel.propose_circuit_breaker(&h.owners[0], &h.cb);
    h.channel.propose_circuit_breaker(&h.owners[1], &h.cb);

    // Impostor tries to execute even though quorum was reached
    h.channel.set_circuit_breaker(&h.impostor, &h.cb);
}

// ── PriceOracle and AMM multi-sig ────────────────────────────────────────────

#[test]
fn multisig_price_oracle_and_amm_lifecycle() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);

    // Test PriceOracle
    h.channel.propose_price_oracle(&h.owners[0], &h.oracle);
    assert_eq!(h.channel.get_price_oracle_quorum(&h.oracle), 1);
    h.channel.propose_price_oracle(&h.owners[1], &h.oracle);
    assert_eq!(h.channel.get_price_oracle_quorum(&h.oracle), 2);
    h.channel.set_price_oracle(&h.owners[0], &h.oracle);

    // Test AMM
    h.channel.propose_amm(&h.owners[0], &h.amm);
    assert_eq!(h.channel.get_amm_quorum(&h.amm), 1);
    h.channel.propose_amm(&h.owners[1], &h.amm);
    assert_eq!(h.channel.get_amm_quorum(&h.amm), 2);
    h.channel.set_amm(&h.owners[1], &h.amm);
}

// ── Multisig Config Rotation with Quorum ─────────────────────────────────────

#[test]
fn rotating_multisig_config_requires_quorum() {
    let h = setup_multisig();

    let mut owners_vec = Vec::new(&h.env);
    owners_vec.push_back(h.owners[0].clone());
    owners_vec.push_back(h.owners[1].clone());

    // 2-of-2
    h.channel.set_multisig_config(&h.owners[0], &owners_vec, &2, &500);

    let mut new_owners = Vec::new(&h.env);
    new_owners.push_back(h.owners[0].clone());
    new_owners.push_back(h.owners[1].clone());
    new_owners.push_back(h.owners[2].clone());

    // Owner 0 and Owner 1 propose config rotation
    h.channel.propose_multisig_config(&h.owners[0]);
    h.channel.propose_multisig_config(&h.owners[1]);

    // Now set_multisig_config succeeds
    h.channel.set_multisig_config(&h.owners[0], &new_owners, &3, &600);
    assert_eq!(h.channel.get_multisig_threshold(), 3);
    assert_eq!(h.channel.get_multisig_propose_window(), 600);
}
