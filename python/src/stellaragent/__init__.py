"""StellarAgent — AI Agent Payment Rails on Stellar (Python SDK).

Mirrors the TypeScript `@stellaragent/core` package. The deterministic math
modules are a strict semantic port: every function produces byte-identical
strings to its TS counterpart, verified by a shared fixture suite
(`fixtures/determinism.json`) that both test suites consume.

>>> from stellaragent import StellarAgent
>>> agent = await StellarAgent.create(network="testnet")  # doctest: +SKIP
"""

from __future__ import annotations

from .agent import StellarAgent
from .bid import (
    DEFAULT_BAD_WEIGHTS,
    AgentBid,
    BidWeights,
    ScoreBreakdown,
    ScoredBid,
    is_within_spend_limit,
    rank_bids,
    remaining_budget,
    score_bid,
    select_best_bid,
)
from .circuit_breaker import (
    CircuitBreakerClient,
    CircuitBreakerError,
    InvalidContractIdError,
    execute_proposal,
    is_paused,
    propose_pause,
    propose_unpause,
)
from .contracts import (
    CONTRACT_KEYS,
    UNCONFIGURED_CONTRACTS,
    ContractAddresses,
    ContractsNotDeployedError,
    assert_deployed,
    env_var_names,
    is_deployed_address,
    resolve_contracts,
)
from .fixed_point import (
    BPS_SCALE,
    DECIMAL_PLACES,
    STROOP_SCALE,
    FixedPointError,
    add,
    bn,
    clamp,
    div,
    eq,
    fmt,
    from_stroops,
    gt,
    gte,
    is_positive,
    is_zero,
    lt,
    lte,
    mul,
    pct,
    sub,
    sum_strings,
    to_str,
    to_stroops,
)
from .ledger_time import (
    DEFAULT_LEEDGER_CLOSE_SECONDS,
    estimate_ledger_close_seconds,
    estimate_ledges_remaining,
    estimate_seconds_remaining,
)
from .routing import (
    DEFAULT_ROUTING_POLICY,
    ROUTING_WEIGHT_SCALE,
    RouteScoreBreakdown,
    RoutingPolicy,
    ScoredRoute,
    is_route_eligible,
    rank_routes,
    score_route,
    select_route,
    validate_routing_policy,
)
from .types import (
    NETWORK_CONFIGS,
    ChannelInfo,
    JobInfo,
    Network,
    NetworkConfig,
    OpenChannelParams,
    PayForAPIParams,
    RateLimitConfig,
    RateLimitStatus,
    UNCONFIGURED_RATE_LIMIT,
    RequestWorkParams,
    SpendLimit,
    SpendReport,
    TxResult,
)

__version__ = "0.1.0"

__all__ = [
    "__version__",
    # agent
    "StellarAgent",
    # fixed point
    "BPS_SCALE",
    "DECIMAL_PLACES",
    "STROOP_SCALE",
    "FixedPointError",
    "add",
    "bn",
    "clamp",
    "div",
    "eq",
    "fmt",
    "from_stroops",
    "gt",
    "gte",
    "is_positive",
    "is_zero",
    "lt",
    "lte",
    "mul",
    "pct",
    "sub",
    "sum_strings",
    "to_str",
    "to_stroops",
    # bidding
    "AgentBid",
    "BidWeights",
    "DEFAULT_BAD_WEIGHTS",
    "ScoreBreakdown",
    "ScoredBid",
    "is_within_spend_limit",
    "rank_bids",
    "remaining_budget",
    "score_bid",
    "select_best_bid",
    # circuit breaker
    "CircuitBreakerClient",
    "CircuitBreakerError",
    "InvalidContractIdError",
    "execute_proposal",
    "is_paused",
    "propose_pause",
    "propose_unpause",
    # contracts
    "CONTRACT_KEYS",
    "UNCONFIGURED_CONTRACTS",
    "ContractAddresses",
    "ContractsNotDeployedError",
    "assert_deployed",
    "env_var_names",
    "is_deployed_address",
    "resolve_contracts",
    # types
    "NETWORK_CONFIGS",
    "ChannelInfo",
    "JobInfo",
    "Network",
    "NetworkConfig",
    "OpenChannelParams",
    "PayForAPIParams",
    "RateLimitConfig",
    "RateLimitStatus",
    "UNCONFIGURED_RATE_LIMIT",
    "RequestWorkParams",
    "SpendLimit",
    "SpendReport",
    "TxResult",
    # deterministic routing
    "ROUTING_WEIGHT_SCALE",
    "DEFAULT_ROUTING_POLICY",
    "RoutingPolicy",
    "RouteScoreBreakdown",
    "ScoredRoute",
    "score_route",
    "is_route_eligible",
    "rank_routes",
    "select_route",
    "validate_routing_policy",
    # ledger time
    "DEFAULT_LEDGER_CLOSE_SECONDS",
    "estimate_ledger_close_seconds",
    "estimate_ledges_remaining",
    "estimate_seconds_remaining",
]
