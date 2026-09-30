use crate::{PriceOracle, PriceOracleClient, DEFAULT_MAX_PRICE_AGE_LEDGERS, PRICE_SCALE};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

fn setup() -> (Env, PriceOracleClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(PriceOracle, ());
    let client = PriceOracleClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn identity_pair_is_always_priced() {
    let (env, client, _admin) = setup();
    let token = Address::generate(&env);
    assert_eq!(client.get_price(&token, &token), PRICE_SCALE);
    assert!(client.has_price(&token, &token));
}

#[test]
fn admin_can_publish_and_read_a_price() {
    let (env, client, admin) = setup();
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);

    // 1 USDC ~= 10 XLM
    client.set_price(&admin, &usdc, &xlm, &(10 * PRICE_SCALE));

    assert_eq!(client.get_price(&usdc, &xlm), 10 * PRICE_SCALE);
    assert!(client.has_price(&usdc, &xlm));
    // No price published in the other direction.
    assert!(!client.has_price(&xlm, &usdc));
}

#[test]
#[should_panic(expected = "price not available")]
fn unpublished_pair_panics() {
    let (env, client, _admin) = setup();
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);

    client.get_price(&usdc, &xlm);
}

#[test]
#[should_panic(expected = "not the admin")]
fn non_admin_cannot_set_price() {
    let (env, client, _admin) = setup();
    let impostor = Address::generate(&env);
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);

    client.set_price(&impostor, &usdc, &xlm, &PRICE_SCALE);
}

#[test]
fn fresh_price_passes() {
    let (env, client, admin) = setup();
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);

    env.ledger().set_sequence_number(1_000);
    client.set_price(&admin, &usdc, &xlm, &(10 * PRICE_SCALE));

    // Still within the default max age.
    env.ledger()
        .set_sequence_number(1_000 + DEFAULT_MAX_PRICE_AGE_LEDGERS);
    assert_eq!(client.get_price(&usdc, &xlm), 10 * PRICE_SCALE);
    assert_eq!(
        client.get_price_age(&usdc, &xlm),
        DEFAULT_MAX_PRICE_AGE_LEDGERS
    );
}

#[test]
#[should_panic(expected = "price is stale")]
fn stale_price_is_rejected() {
    let (env, client, admin) = setup();
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);

    env.ledger().set_sequence_number(1_000);
    client.set_price(&admin, &usdc, &xlm, &(10 * PRICE_SCALE));

    env.ledger()
        .set_sequence_number(1_000 + DEFAULT_MAX_PRICE_AGE_LEDGERS + 1);
    client.get_price(&usdc, &xlm);
}

#[test]
fn max_age_is_configurable() {
    let (env, client, admin) = setup();
    let usdc = Address::generate(&env);
    let xlm = Address::generate(&env);

    assert_eq!(client.get_max_age(), DEFAULT_MAX_PRICE_AGE_LEDGERS);

    client.set_max_age(&admin, &10);
    assert_eq!(client.get_max_age(), 10);

    env.ledger().set_sequence_number(1_000);
    client.set_price(&admin, &usdc, &xlm, &(10 * PRICE_SCALE));

    // Within the tightened window.
    env.ledger().set_sequence_number(1_010);
    assert_eq!(client.get_price(&usdc, &xlm), 10 * PRICE_SCALE);

    // Past it, even though it would have been fine under the old default.
    env.ledger().set_sequence_number(1_011);
    assert!(client.try_get_price(&usdc, &xlm).is_err());
}

#[test]
#[should_panic(expected = "not the admin")]
fn non_admin_cannot_set_max_age() {
    let (env, client, _admin) = setup();
    let impostor = Address::generate(&env);
    client.set_max_age(&impostor, &10);
}
