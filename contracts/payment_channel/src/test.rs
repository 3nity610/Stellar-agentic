extern crate std;

use crate::{
    PaymentChannel, PaymentChannelClient, SpendPeriod, SwapHop, MAX_ROUTE_HOPS, MAX_SLIPPAGE_BPS,
    PRICE_SCALE,
};
use amm_swap::{AmmSwap, AmmSwapClient, RATE_SCALE};
use price_oracle::{PriceOracle, PriceOracleClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Bytes, Env, Vec,
};

/// `settlement_token` stands in for the channel's funding asset (e.g.
/// USDC); `dest_token` stands in for a recipient's preferred asset (e.g.
/// XLM) that the channel was never funded in. The oracle and AMM both
/// quote 1 `settlement_token` == 5 `dest_token`, matching the example in
/// the design brief (agent funded in USDC, provider only accepts XLM).
struct Harness<'a> {
    env: Env,
    channel: PaymentChannelClient<'a>,
    oracle: PriceOracleClient<'a>,
    amm: AmmSwapClient<'a>,
    owner: Address,
    agent: Address,
    settlement_token: Address,
    intermediate_token: Address,
    dest_token: Address,
}

const RATE: i128 = 5;

fn setup() -> Harness<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);

    let settlement_admin = Address::generate(&env);
    let settlement_token = env
        .register_stellar_asset_contract_v2(settlement_admin)
        .address();
    token::StellarAssetClient::new(&env, &settlement_token).mint(&owner, &10_000_000);

    let dest_admin = Address::generate(&env);
    let dest_token = env.register_stellar_asset_contract_v2(dest_admin).address();
    let intermediate_admin = Address::generate(&env);
    let intermediate_token = env
        .register_stellar_asset_contract_v2(intermediate_admin)
        .address();

    let channel_id = env.register(PaymentChannel, ());
    let channel = PaymentChannelClient::new(&env, &channel_id);

    let oracle_admin = Address::generate(&env);
    let oracle_id = env.register(PriceOracle, ());
    let oracle = PriceOracleClient::new(&env, &oracle_id);
    oracle.initialize(&oracle_admin);
    oracle.set_price(
        &oracle_admin,
        &settlement_token,
        &dest_token,
        &(RATE * PRICE_SCALE),
    );

    let amm_admin = Address::generate(&env);
    let amm_id = env.register(AmmSwap, ());
    let amm = AmmSwapClient::new(&env, &amm_id);
    amm.initialize(&amm_admin);
    amm.set_rate(
        &amm_admin,
        &settlement_token,
        &dest_token,
        &(RATE * RATE_SCALE),
    );
    amm.set_rate(
        &amm_admin,
        &settlement_token,
        &intermediate_token,
        &(2 * RATE_SCALE),
    );
    amm.set_rate(
        &amm_admin,
        &intermediate_token,
        &dest_token,
        &(3 * RATE_SCALE),
    );
    token::StellarAssetClient::new(&env, &dest_token).mint(&amm_admin, &1_000_000_000);
    token::StellarAssetClient::new(&env, &intermediate_token).mint(&amm_admin, &1_000_000_000);
    amm.fund(&amm_admin, &dest_token, &1_000_000_000);
    amm.fund(&amm_admin, &intermediate_token, &1_000_000_000);

    channel.set_price_oracle(&oracle_admin, &oracle_id);
    channel.set_amm(&amm_admin, &amm_id);

    Harness {
        env,
        channel,
        oracle,
        amm,
        owner,
        agent,
        settlement_token,
        intermediate_token,
        dest_token,
    }
}

fn open_channel(h: &Harness, deposit: i128, limit: i128) -> u64 {
    h.channel.open_channel(
        &h.owner,
        &h.agent,
        &h.settlement_token,
        &deposit,
        &limit,
        &SpendPeriod::Daily,
    )
}

fn memo(env: &Env) -> Bytes {
    Bytes::new(env)
}

fn two_hop_route(h: &Harness) -> Vec<SwapHop> {
    Vec::from_array(
        &h.env,
        [
            SwapHop {
                venue: h.amm.address.clone(),
                from_token: h.settlement_token.clone(),
                to_token: h.intermediate_token.clone(),
                min_out: 1_900,
            },
            SwapHop {
                venue: h.amm.address.clone(),
                from_token: h.intermediate_token.clone(),
                to_token: h.dest_token.clone(),
                min_out: 5_700,
            },
        ],
    )
}

// ── Baseline: existing `pay()` behavior is untouched ───────────────────────

#[test]
fn pay_transfers_settlement_token_and_tracks_spend() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);

    h.channel
        .pay(&h.agent, &channel_id, &recipient, &1_000, &memo(&h.env));

    let settlement_client = token::Client::new(&h.env, &h.settlement_token);
    assert_eq!(settlement_client.balance(&recipient), 1_000);

    let info = h.channel.get_channel(&channel_id);
    assert_eq!(info.spent_this_period, 1_000);
    assert_eq!(info.total_spent, 1_000);
}

#[test]
#[should_panic(expected = "spend limit exceeded for this period")]
fn pay_still_enforces_the_spend_limit() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);

    h.channel
        .pay(&h.agent, &channel_id, &recipient, &600_000, &memo(&h.env));
}

// ── Same-asset `pay_with_conversion` == `pay()`, no regression ─────────────

#[test]
fn pay_with_conversion_same_asset_behaves_like_pay() {
    // Deliberately does NOT call set_price_oracle / set_amm on this
    // channel, to prove the same-asset path never touches either — it is
    // purely additive on top of today's `pay()`.
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let recipient = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let settlement_token = env
        .register_stellar_asset_contract_v2(token_admin)
        .address();
    token::StellarAssetClient::new(&env, &settlement_token).mint(&owner, &1_000_000);

    let channel_id_contract = env.register(PaymentChannel, ());
    let channel = PaymentChannelClient::new(&env, &channel_id_contract);
    let channel_id = channel.open_channel(
        &owner,
        &agent,
        &settlement_token,
        &1_000_000,
        &500_000,
        &SpendPeriod::Daily,
    );

    let received = channel.pay_with_conversion(
        &agent,
        &channel_id,
        &recipient,
        &1_000,
        &settlement_token,
        &1_000,
        &memo(&env),
    );

    assert_eq!(received, 1_000);
    let settlement_client = token::Client::new(&env, &settlement_token);
    assert_eq!(settlement_client.balance(&recipient), 1_000);

    let info = channel.get_channel(&channel_id);
    assert_eq!(info.spent_this_period, 1_000);
    assert_eq!(info.total_spent, 1_000);
}

// ── Cross-asset conversion ──────────────────────────────────────────────────

#[test]
fn cross_asset_payment_within_slippage_updates_normalized_spend() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);

    // Spend 1_000 settlement_token -> expect 5_000 dest_token at the 5x
    // rate; accept any amount >= 4_900 (well within MAX_SLIPPAGE_BPS).
    let received = h.channel.pay_with_conversion(
        &h.agent,
        &channel_id,
        &recipient,
        &1_000,
        &h.dest_token,
        &4_900,
        &memo(&h.env),
    );

    assert_eq!(received, 5_000);

    let dest_client = token::Client::new(&h.env, &h.dest_token);
    assert_eq!(dest_client.balance(&recipient), 5_000);

    // The spend limit is charged in settlement_token units (1_000), not
    // dest_token units (5_000) — this is what "normalized" means here.
    let info = h.channel.get_channel(&channel_id);
    assert_eq!(info.spent_this_period, 1_000);
    assert_eq!(info.total_spent, 1_000);
}

#[test]
#[should_panic(expected = "slippage tolerance exceeds maximum allowed deviation")]
fn cross_asset_payment_exceeding_slippage_tolerance_reverts() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);

    // Fair value is 5_000 dest_token; MAX_SLIPPAGE_BPS allows down to
    // 5_000 * (10_000 - 500) / 10_000 = 4_750. Ask for far less than that.
    let min_received = 3_000;
    assert!(min_received < 5_000 * (10_000 - MAX_SLIPPAGE_BPS) / 10_000);

    h.channel.pay_with_conversion(
        &h.agent,
        &channel_id,
        &recipient,
        &1_000,
        &h.dest_token,
        &min_received,
        &memo(&h.env),
    );
}

#[test]
fn price_feed_unavailable_fails_safely() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);

    // A token the oracle has never been told a price for.
    let unpriced_token = Address::generate(&h.env);

    let before = h.channel.get_channel(&channel_id);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.channel.pay_with_conversion(
            &h.agent,
            &channel_id,
            &recipient,
            &1_000,
            &unpriced_token,
            &0,
            &memo(&h.env),
        );
    }));

    assert!(
        result.is_err(),
        "payment with no price feed must fail, not silently proceed unpriced"
    );

    // Fails safe: nothing transferred, spend counters untouched.
    let after = h.channel.get_channel(&channel_id);
    assert_eq!(after.spent_this_period, before.spent_this_period);
    assert_eq!(after.total_spent, before.total_spent);

    let settlement_client = token::Client::new(&h.env, &h.settlement_token);
    assert_eq!(settlement_client.balance(&recipient), 0);
}

#[test]
#[should_panic(expected = "swap output below min_out")]
fn cross_asset_payment_reverts_if_amm_cannot_clear_min_received() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);

    // min_received of 5_000 clears the oracle-fairness floor (fair value
    // is exactly 5_000 at the configured 5x rate) but asking for one more
    // than the AMM can actually produce must revert via the AMM's own
    // min_out check.
    h.channel.pay_with_conversion(
        &h.agent,
        &channel_id,
        &recipient,
        &1_000,
        &h.dest_token,
        &5_001,
        &memo(&h.env),
    );
}

// ── Acceptance criteria: normalized limit across a same/cross-asset mix ────

#[test]
fn spend_limit_enforced_in_normalized_terms_across_same_and_cross_asset_payments() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 10_000);
    let recipient = Address::generate(&h.env);

    // 1) Plain same-asset pay(): 3_000 settlement_token.
    h.channel
        .pay(&h.agent, &channel_id, &recipient, &3_000, &memo(&h.env));

    // 2) pay_with_conversion, same asset: 2_000 settlement_token.
    h.channel.pay_with_conversion(
        &h.agent,
        &channel_id,
        &recipient,
        &2_000,
        &h.settlement_token,
        &2_000,
        &memo(&h.env),
    );

    // 3) pay_with_conversion, cross asset: 4_000 settlement_token ->
    //    20_000 dest_token.
    let received = h.channel.pay_with_conversion(
        &h.agent,
        &channel_id,
        &recipient,
        &4_000,
        &h.dest_token,
        &19_000,
        &memo(&h.env),
    );
    assert_eq!(received, 20_000);

    // Total charged against the limit: 3_000 + 2_000 + 4_000 = 9_000,
    // regardless of which asset each payment actually settled in.
    let info = h.channel.get_channel(&channel_id);
    assert_eq!(info.spent_this_period, 9_000);
    assert_eq!(info.total_spent, 9_000);
    assert_eq!(h.channel.remaining_this_period(&channel_id), 1_000);

    // One more settlement-token unit than the remaining 1_000 must still
    // be rejected, whether same-asset or cross-asset.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.channel
            .pay(&h.agent, &channel_id, &recipient, &1_001, &memo(&h.env));
    }));
    assert!(result.is_err());

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.channel.pay_with_conversion(
            &h.agent,
            &channel_id,
            &recipient,
            &1_001,
            &h.dest_token,
            &0,
            &memo(&h.env),
        );
    }));
    assert!(result.is_err());

    // But exactly the remaining 1_000 still goes through, from either path.
    h.channel
        .pay(&h.agent, &channel_id, &recipient, &1_000, &memo(&h.env));
    let info = h.channel.get_channel(&channel_id);
    assert_eq!(info.spent_this_period, 10_000);
    assert_eq!(h.channel.remaining_this_period(&channel_id), 0);
}

// ── Explicit bounded route execution ───────────────────────────────────────

#[test]
fn two_hop_route_completes_with_one_end_to_end_bound() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);

    // 1,000 settlement -> 2,000 intermediate -> 6,000 destination.
    // The independent source/destination oracle quotes 5,000, so a 4,750
    // end-to-end floor clears the contract's maximum-slippage rule.
    let received = h.channel.pay_with_route(
        &h.agent,
        &channel_id,
        &recipient,
        &1_000,
        &h.dest_token,
        &two_hop_route(&h),
        &4_750,
        &100,
        &memo(&h.env),
    );

    assert_eq!(received, 6_000);
    assert_eq!(
        token::Client::new(&h.env, &h.dest_token).balance(&recipient),
        6_000
    );
    assert_eq!(
        token::Client::new(&h.env, &h.intermediate_token).balance(&h.channel.address),
        0
    );
    let channel = h.channel.get_channel(&channel_id);
    assert_eq!(channel.spent_this_period, 1_000);
    assert_eq!(channel.total_spent, 1_000);
    assert_eq!(channel.collateral, 999_000);
}

#[test]
fn failed_middle_hop_reverts_every_transfer_and_counter() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);
    let bad_admin = Address::generate(&h.env);
    let bad_id = h.env.register(AmmSwap, ());
    let bad_amm = AmmSwapClient::new(&h.env, &bad_id);
    bad_amm.initialize(&bad_admin);

    let route = Vec::from_array(
        &h.env,
        [
            SwapHop {
                venue: h.amm.address.clone(),
                from_token: h.settlement_token.clone(),
                to_token: h.intermediate_token.clone(),
                min_out: 1_900,
            },
            // Deliberately has no configured intermediate/destination rate.
            SwapHop {
                venue: bad_id.clone(),
                from_token: h.intermediate_token.clone(),
                to_token: h.dest_token.clone(),
                min_out: 4_750,
            },
        ],
    );

    let before = h.channel.get_channel(&channel_id);
    let settlement = token::Client::new(&h.env, &h.settlement_token);
    let intermediate = token::Client::new(&h.env, &h.intermediate_token);
    let destination = token::Client::new(&h.env, &h.dest_token);
    let balances = (
        settlement.balance(&h.channel.address),
        settlement.balance(&h.amm.address),
        intermediate.balance(&h.channel.address),
        intermediate.balance(&h.amm.address),
        intermediate.balance(&bad_id),
        destination.balance(&recipient),
    );

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.channel.pay_with_route(
            &h.agent,
            &channel_id,
            &recipient,
            &1_000,
            &h.dest_token,
            &route,
            &4_750,
            &100,
            &memo(&h.env),
        );
    }));
    assert!(result.is_err());

    let after = h.channel.get_channel(&channel_id);
    assert_eq!(after.spent_this_period, before.spent_this_period);
    assert_eq!(after.total_spent, before.total_spent);
    assert_eq!(after.collateral, before.collateral);
    assert_eq!(
        (
            settlement.balance(&h.channel.address),
            settlement.balance(&h.amm.address),
            intermediate.balance(&h.channel.address),
            intermediate.balance(&h.amm.address),
            intermediate.balance(&bad_id),
            destination.balance(&recipient),
        ),
        balances
    );
}

#[test]
fn explicit_same_asset_route_preserves_direct_payment_behavior() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);
    let received = h.channel.pay_with_route(
        &h.agent,
        &channel_id,
        &recipient,
        &1_000,
        &h.settlement_token,
        &Vec::new(&h.env),
        &1_000,
        &100,
        &memo(&h.env),
    );
    assert_eq!(received, 1_000);
    assert_eq!(
        token::Client::new(&h.env, &h.settlement_token).balance(&recipient),
        1_000
    );
}

#[test]
#[should_panic(expected = "swap output below min_out")]
fn final_hop_enforces_the_end_to_end_minimum() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let recipient = Address::generate(&h.env);
    h.channel.pay_with_route(
        &h.agent,
        &channel_id,
        &recipient,
        &1_000,
        &h.dest_token,
        &two_hop_route(&h),
        &6_001,
        &100,
        &memo(&h.env),
    );
}

#[test]
#[should_panic(expected = "route quote expired")]
fn expired_route_is_rejected_before_execution() {
    let h = setup();
    h.env
        .ledger()
        .with_mut(|ledger| ledger.sequence_number = 50);
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    h.channel.pay_with_route(
        &h.agent,
        &channel_id,
        &Address::generate(&h.env),
        &1_000,
        &h.dest_token,
        &two_hop_route(&h),
        &4_750,
        &49,
        &memo(&h.env),
    );
}

#[test]
#[should_panic(expected = "route exceeds maximum hop count")]
fn route_depth_is_bounded() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let hop = SwapHop {
        venue: h.amm.address.clone(),
        from_token: h.settlement_token.clone(),
        to_token: h.intermediate_token.clone(),
        min_out: 0,
    };
    let route = Vec::from_array(
        &h.env,
        [hop.clone(), hop.clone(), hop.clone(), hop.clone(), hop],
    );
    assert_eq!(route.len(), MAX_ROUTE_HOPS + 1);
    h.channel.pay_with_route(
        &h.agent,
        &channel_id,
        &Address::generate(&h.env),
        &1_000,
        &h.dest_token,
        &route,
        &4_750,
        &100,
        &memo(&h.env),
    );
}

#[test]
#[should_panic(expected = "route asset discontinuity")]
fn discontinuous_route_is_rejected() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let mut route = two_hop_route(&h);
    route.set(
        1,
        SwapHop {
            venue: h.amm.address.clone(),
            from_token: h.settlement_token.clone(),
            to_token: h.dest_token.clone(),
            min_out: 4_750,
        },
    );
    h.channel.pay_with_route(
        &h.agent,
        &channel_id,
        &Address::generate(&h.env),
        &1_000,
        &h.dest_token,
        &route,
        &4_750,
        &100,
        &memo(&h.env),
    );
}

#[test]
#[should_panic(expected = "route contains an asset cycle")]
fn cyclic_route_is_rejected() {
    let h = setup();
    let channel_id = open_channel(&h, 1_000_000, 500_000);
    let route = Vec::from_array(
        &h.env,
        [
            SwapHop {
                venue: h.amm.address.clone(),
                from_token: h.settlement_token.clone(),
                to_token: h.intermediate_token.clone(),
                min_out: 0,
            },
            SwapHop {
                venue: h.amm.address.clone(),
                from_token: h.intermediate_token.clone(),
                to_token: h.settlement_token.clone(),
                min_out: 0,
            },
            SwapHop {
                venue: h.amm.address.clone(),
                from_token: h.settlement_token.clone(),
                to_token: h.dest_token.clone(),
                min_out: 0,
            },
        ],
    );
    h.channel.pay_with_route(
        &h.agent,
        &channel_id,
        &Address::generate(&h.env),
        &1_000,
        &h.dest_token,
        &route,
        &4_750,
        &100,
        &memo(&h.env),
    );
}

// ── Admin gating on the new wiring endpoints ────────────────────────────────

#[test]
#[should_panic(expected = "not the price oracle admin")]
fn set_price_oracle_is_admin_gated() {
    let h = setup();
    let impostor = Address::generate(&h.env);
    h.channel.set_price_oracle(&impostor, &h.oracle.address);
}

#[test]
#[should_panic(expected = "not the amm admin")]
fn set_amm_is_admin_gated() {
    let h = setup();
    let impostor = Address::generate(&h.env);
    h.channel.set_amm(&impostor, &h.amm.address);
}
