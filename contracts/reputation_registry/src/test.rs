use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env};

fn setup() -> (Env, ReputationRegistryClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(ReputationRegistry, ());
    let client = ReputationRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let reporter = Address::generate(&env);
    client.initialize(&admin);
    client.set_reporter(&admin, &reporter, &true);
    (env, client, reporter, admin)
}

#[test]
fn records_outcomes_and_scores_them() {
    let (env, client, reporter, _) = setup();
    let agent = Address::generate(&env);
    client.record_completion(&reporter, &agent, &100);
    client.record_refund(&reporter, &agent, &20);
    client.record_dispute(&reporter, &agent, &10);
    let rep = client.get_reputation(&agent);
    assert_eq!(rep.completions, 1);
    assert_eq!(rep.refunds, 1);
    assert_eq!(rep.disputes, 1);
    assert_eq!(rep.volume, 130);
    assert_eq!(client.score(&agent), 50);
    let _ = env;
}

#[test]
#[should_panic(expected = "not authorized reporter")]
fn rejects_unknown_reporters() {
    let (env, client, _, _) = setup();
    let agent = Address::generate(&env);
    let unknown = Address::generate(&env);
    client.record_completion(&unknown, &agent, &1);
}