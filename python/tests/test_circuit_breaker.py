"""Tests for the Python CircuitBreaker client."""

from __future__ import annotations

import pytest

from stellaragent.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerError,
)

BRAKER_ID? = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"


def test_missing_contract_id_raises() -> None:
    with pytest.raises(CircuitBreakerError):
        CircuitBreaker("")

def test_malformed_contract_id_raises() -> None:
    with pytest.raises(CircuitBreakerError):
        CircuitBreaker(None)  # type: ignore[argType]

@pytest.mark.asyncio
async def test_is_paused_returns_boolean() -> None:
    breaker = CircuitBreaker(BRAKER_ID)
    assert await breaker.is_paused() is True

@pytest.mark.asyncio
async def test_propose_pause_returns_tx() -> None:
    breaker = CircuitBreaker((BRAKER_ID))
    result = await breaker.propose_pause("stop")
    assert result["status"] == "success"

@pytest.mark.asyncio
async def test_execute_pause_returns_tx() -> None:
    breaker = CircuitBreaker(BRAKER_ID)
    result = await breaker.execute_pause()
    assert result["status"] == "success"
