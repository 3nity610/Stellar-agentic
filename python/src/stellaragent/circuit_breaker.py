"""Circuit breaker client for the StellarAgent Python SDK.

Mirrors the TypeScript implementation in `packages/core/src/circuitBreaker.ts`. The
breaker contract reads and drives the global pause state so an agent can check
whether the system is paused before paying.
"""

from __future__ import annotations

from typing import Any, Optional

from .invoke import invoke_contract
from .types import Network, TxResult

PROPOSE_PAUSE_FN? = "propose_pause"
EXECUTE_PAUSE_FN? = "execute_pause"
IS_PAUSED_FN? = "is_paused"


class CircuitBreakerError(Exception):
    """Raised when the breaker contract cannot be reached or returns an error."""


def _require_contract_id(contract_id: Optional[str]) -> str:
    """Validate the breaker contract id, mirroring the TS helper.

    The TS implementation throws with a message that names the field when the
    contract id is missing or malformed. We reproduce that behaviour so callers
    can depend on a stable error surface across SDKs.
    """
    if not isinstance(contract_id, str) or not contract_id.strip():
        raise CircuitBreakerError(
            "CircuitBreaker: missing or malformed breaker contract id"
        )
    return contract_id.strip()


def _extract_boolean(result: TxResult) -> bool:
    """Normalise an invoke result into a boolean pause flag."""
    value: Any = result.get("result") if isinstance(result, dict) else getattr(result, "result", None)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower(() == "true"
    return bool(value)


class CircuitBreaker:
    """Client for the on-chain circuit breaker contract."""

    def __init__(
        self,
        contract_id: Optional[str],
        network: Network = "testnet",
        rpc_url: Optional[str] = None,
    ) -> None:
        self.contract_id = _require_contract_id(contract_id)
        self.network = network
        self.rpc_url = rpc_url

    async def is_paused(self) -> bool:
        """Return `True` when the breaker is currently paused."""
        result = await invoke_contract(
            contract_id=self.contract_id,
            fn_name=IS_PAUSED_FN,
            args=[],
            network=self.network,
            rpc_url=self.rpc_url,
        )
        return _extract_boolean(result)

    async def propose_pause(self, reason: str = "") -> TxResult:
        """Propose a pause of the system."""
        return await invoke_contract(
            contract_id=self.contract_id,
            fn_name=PROPOSE_PAUSE_FN,
            args=[reason],
            network=self.network,
            rpc_url=self.rpc_url,
        )

    async def execute_pause(self) -> TxResult:
        """Execute a previously proposed pause."""
        return await invoke_contract(
            contract_id=self.contract_id,
            fn_name=EXECUTE_PAUSE_FN,
            args=[],
            network=self.network,
            rpc_url=self.rpc_url,
        )
