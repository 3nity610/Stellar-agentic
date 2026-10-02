"""Deterministic multi-asset route selection.

Strict Python port of ``packages/core/src/math/routing.ts``. Route amounts are
integer base-unit strings and all scoring uses integer arithmetic. Shared
fixtures prove that TypeScript and Python return identical scores and ordering.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

__all__ = [
    "ROUTING_WEIGHT_SCALE",
    "RoutingPolicy",
    "DEFAULT_ROUTING_POLICY",
    "RouteScoreBreakdown",
    "ScoredRoute",
    "score_route",
    "is_route_eligible",
    "rank_routes",
    "select_route",
    "validate_routing_policy",
]

ROUTING_WEIGHT_SCALE = 10_000


@dataclass(frozen=True)
class RoutingPolicy:
    """Integer weights and admission bounds for route scoring."""

    cost_weight: int = 5_000
    slippage_weight: int = 3_000
    reliability_weight: int = 2_000
    hop_penalty: int = 5
    max_slippage_bps: int = 1_000
    min_reliability_bps: int = 5_000


DEFAULT_ROUTING_POLICY = RoutingPolicy()


@dataclass(frozen=True)
class RouteScoreBreakdown:
    weighted_cost: str
    weighted_slippage: str
    weighted_reliability: str
    hop_penalty: str


@dataclass(frozen=True)
class ScoredRoute:
    """A route plus its deterministic integer score."""

    route: Mapping[str, Any]
    score: str
    breakdown: RouteScoreBreakdown

    @property
    def id(self) -> str:
        return str(self.route["id"])


def score_route(
    route: Mapping[str, Any],
    policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
) -> ScoredRoute:
    """Validate and score one admitted normalized route."""
    validate_routing_policy(policy)
    _validate_route(route)
    if not is_route_eligible(route, policy):
        raise ValueError(f"route {route['id']} is outside routing policy bounds")

    weighted_cost = _weighted(_field_int(route, "totalFeeBps"), policy.cost_weight)
    weighted_slippage = _weighted(
        _field_int(route, "expectedSlippageBps"), policy.slippage_weight
    )
    shortfall = ROUTING_WEIGHT_SCALE - _field_int(route, "reliabilityBps")
    weighted_reliability = _weighted(shortfall, policy.reliability_weight)
    hop_penalty = (_field_int(route, "hopCount") - 1) * policy.hop_penalty
    score = weighted_cost + weighted_slippage + weighted_reliability + hop_penalty

    return ScoredRoute(
        route=dict(route),
        score=str(score),
        breakdown=RouteScoreBreakdown(
            weighted_cost=str(weighted_cost),
            weighted_slippage=str(weighted_slippage),
            weighted_reliability=str(weighted_reliability),
            hop_penalty=str(hop_penalty),
        ),
    )


def is_route_eligible(
    route: Mapping[str, Any],
    policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
) -> bool:
    return (
        _field_int(route, "expectedSlippageBps") <= policy.max_slippage_bps
        and _field_int(route, "reliabilityBps") >= policy.min_reliability_bps
    )


def rank_routes(
    routes: Sequence[Mapping[str, Any]],
    policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
) -> list[ScoredRoute]:
    """Return the same total ordering as the TypeScript selector."""
    validate_routing_policy(policy)
    admitted: list[ScoredRoute] = []
    for route in routes:
        _validate_route(route)
        if is_route_eligible(route, policy):
            admitted.append(score_route(route, policy))
    admitted.sort(
        key=lambda scored: (
            int(scored.score),
            -int(str(scored.route["expectedDestinationAmount"])),
            _field_int(scored.route, "expectedSlippageBps"),
            _field_int(scored.route, "hopCount"),
            scored.id.encode("utf-8"),
        )
    )
    return admitted


def select_route(
    routes: Sequence[Mapping[str, Any]],
    policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
) -> ScoredRoute | None:
    ranked = rank_routes(routes, policy)
    return ranked[0] if ranked else None


def validate_routing_policy(policy: RoutingPolicy) -> None:
    values = {
        "cost_weight": policy.cost_weight,
        "slippage_weight": policy.slippage_weight,
        "reliability_weight": policy.reliability_weight,
        "hop_penalty": policy.hop_penalty,
        "max_slippage_bps": policy.max_slippage_bps,
        "min_reliability_bps": policy.min_reliability_bps,
    }
    for name, value in values.items():
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"{name} must be a non-negative integer")
    weight_sum = policy.cost_weight + policy.slippage_weight + policy.reliability_weight
    if weight_sum != ROUTING_WEIGHT_SCALE:
        raise ValueError(
            f"routing weights must sum to {ROUTING_WEIGHT_SCALE}, got {weight_sum}"
        )
    if (
        policy.max_slippage_bps > ROUTING_WEIGHT_SCALE
        or policy.min_reliability_bps > ROUTING_WEIGHT_SCALE
    ):
        raise ValueError("routing basis-point bounds must not exceed 10000")


def _weighted(value: int, weight: int) -> int:
    return value * weight // ROUTING_WEIGHT_SCALE


def _validate_route(route: Mapping[str, Any]) -> None:
    if not isinstance(route.get("id"), str) or not route["id"]:
        raise ValueError("route id is required")
    for name in ("sourceAmount", "expectedDestinationAmount"):
        value = route.get(name)
        if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]*", value):
            raise ValueError("route amounts must be positive canonical integers")
    for name in ("totalFeeBps", "expectedSlippageBps", "reliabilityBps"):
        value = _field_int(route, name)
        if value < 0 or value > ROUTING_WEIGHT_SCALE:
            raise ValueError(f"{name} must be an integer from 0 to 10000")
    hop_count = _field_int(route, "hopCount")
    if hop_count < 1:
        raise ValueError("hopCount must be a positive integer")


def _field_int(route: Mapping[str, Any], name: str) -> int:
    value = route.get(name)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    return value
