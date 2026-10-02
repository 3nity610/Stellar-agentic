"""Direct tests for deterministic route scoring and validation."""

from __future__ import annotations

from typing import Any

import pytest

from stellaragent.routing import (
    DEFAULT_ROUTING_POLICY,
    RoutingPolicy,
    is_route_eligible,
    rank_routes,
    score_route,
    select_route,
    validate_routing_policy,
)


def _route(**overrides: Any) -> dict[str, Any]:
    route: dict[str, Any] = {
        "id": "route",
        "sourceAsset": "XLM",
        "destinationAsset": "USDC",
        "sourceAmount": "100000000",
        "expectedDestinationAmount": "20000000",
        "totalFeeBps": 30,
        "expectedSlippageBps": 20,
        "reliabilityBps": 9500,
        "hopCount": 1,
        "hops": [],
    }
    route.update(overrides)
    return route


def test_score_breakdown_is_integer_only() -> None:
    scored = score_route(_route(hopCount=3))
    assert scored.score == "131"
    assert scored.breakdown.weighted_cost == "15"
    assert scored.breakdown.weighted_slippage == "6"
    assert scored.breakdown.weighted_reliability == "100"
    assert scored.breakdown.hop_penalty == "10"


def test_rank_uses_complete_tie_break_order() -> None:
    policy = RoutingPolicy(
        cost_weight=10_000,
        slippage_weight=0,
        reliability_weight=0,
        hop_penalty=0,
    )
    routes = [
        _route(id="z", expectedDestinationAmount="2"),
        _route(id="slippery", expectedDestinationAmount="3", expectedSlippageBps=2),
        _route(id="a", expectedDestinationAmount="3", expectedSlippageBps=1, hopCount=2),
        _route(id="b", expectedDestinationAmount="3", expectedSlippageBps=1, hopCount=1),
        _route(id="A", expectedDestinationAmount="3", expectedSlippageBps=1, hopCount=1),
    ]
    assert [entry.id for entry in rank_routes(routes, policy)] == [
        "A", "b", "a", "slippery", "z"
    ]


def test_rank_uses_utf8_byte_order_for_non_bmp_ids() -> None:
    private_use = _route(id="\ue000-route")
    astral = _route(id="\U00010000-route")
    assert [entry.id for entry in rank_routes([astral, private_use])] == [
        "\ue000-route", "\U00010000-route"
    ]


def test_rank_orders_an_id_before_its_prefix_extension() -> None:
    routes = [_route(id="route/long"), _route(id="route")]
    assert [entry.id for entry in rank_routes(routes)] == ["route", "route/long"]


def test_filter_and_empty_selection() -> None:
    unreliable = _route(reliabilityBps=0)
    slippery = _route(expectedSlippageBps=1001)
    assert not is_route_eligible(unreliable)
    assert not is_route_eligible(slippery)
    assert select_route([unreliable, slippery]) is None
    assert select_route([]) is None


@pytest.mark.parametrize(
    "policy",
    [
        RoutingPolicy(hop_penalty=-1),
        RoutingPolicy(cost_weight=4999),
        RoutingPolicy(max_slippage_bps=10001),
        RoutingPolicy(min_reliability_bps=10001),
        RoutingPolicy(hop_penalty=True),  # type: ignore[arg-type]
    ],
)
def test_invalid_policies(policy: RoutingPolicy) -> None:
    with pytest.raises(ValueError):
        validate_routing_policy(policy)


@pytest.mark.parametrize(
    "override",
    [
        {"id": ""},
        {"sourceAmount": "0"},
        {"expectedDestinationAmount": "1.2"},
        {"totalFeeBps": -1},
        {"expectedSlippageBps": 10001},
        {"reliabilityBps": 1.5},
        {"hopCount": 0},
        {"hopCount": True},
    ],
)
def test_invalid_routes(override: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        rank_routes([_route(**override)])


def test_score_rejects_policy_excluded_route() -> None:
    with pytest.raises(ValueError, match="outside routing policy bounds"):
        score_route(_route(reliabilityBps=0), DEFAULT_ROUTING_POLICY)
