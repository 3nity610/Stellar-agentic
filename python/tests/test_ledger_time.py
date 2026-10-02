"""Tests for ledger_time module, mirroring packages/core/src/__tests__/ledgerTime.test.ts"""
from __future__ import annotations

import pytest

from stellaragent.ledger_time import (
    DEFAULT_LEDGER_TIME_SECONDS,
    estimate_ledger_time,
    estimate_seconds_remaining,
    average_close_seconds,
)


def test_default_ledger_time_seconds_is_five_seconds() -> None:
    assert DEFAULT_LEDGER_TIME_SECONDS == 5.0


def test_average_close_seconds_uses_default_when_empty() -> None:
    assert average_close_seconds([]) == DEFAULT_LEDGER_TIME_SECONDS


def test_average_close_seconds_averages_recent_closes() -> None:
    closes = [10.0, 20.0, 30.0]
    assert average_close_seconds(closes) == pytest.approx(20.0)


def test_average_close_seconds_only_uses_recent_closes() -> None:
    closes = [1000.0, 1000.0, 10.0, 20.0, 30.0]
    assert average_close_seconds(closes, window=3) == pytest.approx(20.0)


def test_estimate_ledger_time_converts_ledges_to_seconds() -> None:
    closes = [5.0, 5.0, 5.0]
    assert estimate_ledger_time(12, closes) == pytest.approx(60.0)


def test_estimate_ledger_time_uses_default_when_no_closes() -> None:
    assert estimate_ledger_time(12, []) == pytest.approx(12 * DEFAULT_LEDGER_TIME_SECONDS)


def test_estimate_ledger_time_zero_ledges() -> None:
    assert estimate_ledger_time(0, [5.0, 5.0]) == 0.0


def test_estimate_seconds_remaining_returns_remaining() -> None:
    closes = [5.0, 5.0, 5.0]
    assert estimate_seconds_remaining(100, 100, closes) == 0.0
    assert estimate_seconds_remaining(100, 105, closes) == pytest.approx(25.0)


def test_estimate_seconds_remaining_clamps_negative() -> None:
    closes = [5.0, 5.0, 5.0]
    assert estimate_seconds_remaining(100, 90, closes) == 0.0


def test_estimate_seconds_remaining_uses_default_when_no_closes() -> None:
    assert estimate_seconds_remaining(100, 105, []) == pytest.approx(5 * DEFAULT_LEDGER_TIME_SECONDS)
