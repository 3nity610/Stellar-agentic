"""Tests for ``stellaragent.math.predict`` — semantic port of packages/core/src/math/predict.ts."""

from stellaragent.math.predict import (
    ChannelSpendState,
    PredictPaymentOutcomeParams,
    RateLimitSpendState,
    predict_payment_outcome,
)


def make_channel(**overrides):
    base = dict(
        active=True,
        limit_per_period="10000",
        spent_this_period="0",
        period_start_ledger=1000,
        period="hourly",
    )
    base.update(overrides)
    return ChannelSpendState(**base)


def make_rate_limit(**overrides):
    base = dict(
        configured=True,
        active=True,
        max_per_tx="100",
        max_per_hour="500",
        max_per_day="2000",
        max_txs_per_hour=10,
        hourly_spend="0",
        daily_spend="0",
        hourly_tx_count=0,
        hour_window_start_ledger=1000,
        day_window_start_ledger=1000,
    )
    base.update(overrides)
    return RateLimitSpendState(**base)


def test_allows_under_limits_when_active():
    rl = make_rate_limit(hourly_spend="50", daily_spend="200", hourly_tx_count=2)
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="10", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.would_block is False
    assert r.reasons == []


def test_killed_agent_blocks_any_amount():
    rl = make_rate_limit(active=False)
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="1", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.would_block is True
    assert r.reasons == ["rate_limit_inactive"]


def test_killed_agent_blocks_even_under_numeric_limits():
    rl = make_rate_limit(
        active=False,
        max_per_tx="1000000",
        max_per_hour="1000000",
        max_per_day="1000000",
        max_txs_per_hour=100,
    )
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="5", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.would_block is True
    assert r.reasons == ["rate_limit_inactive"]


def test_killed_agent_does_not_double_report_numeric_limits():
    rl = make_rate_limit(active=False, max_per_tx="1")
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="100", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.reasons == ["rate_limit_inactive"]


def test_reactivated_agent_passes_again():
    rl = make_rate_limit(active=True, max_per_tx="100")
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="10", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.would_block is False
    assert r.reasons == []


def test_per_tx_boundary_inclusive():
    rl = make_rate_limit(max_per_tx="100")
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="100", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.would_block is False
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="101", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.would_block is True
    assert r.reasons == ["rate_limit_per_tx"]


def test_tx_count_uses_gte():
    rl = make_rate_limit(max_txs_per_hour=10, hourly_tx_count=10)
    r = predict_payment_outcome(
        PredictPaymentOutcomeParams(amount="1", current_ledger=1000, rate_limit_state=rl)
    )
    assert r.would_block is True
    assert r.reasons == ["rate_limit_tx_count"]
