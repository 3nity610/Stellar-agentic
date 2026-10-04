"""Error taxonomy for StellarAgent failures, mirroring packages/core/src/errors.ts."""

from __future__ import annotations

import re
from typing import Literal

__all__ = [
    "StellarAgentErrorCode",
    "StellarAgentError",
    "InvalidArgumentError",
    "contract_error",
    "CONTRACT_ERROR_MAPPINGS",
]

StellarAgentErrorCode = Literal[
    "INVALID_ARGUMENT",
    "NO_ACTIVE_CHANNEL",
    "NO_ROUTE",
    "QUOTE_EXPIRED",
    "INVALID_ROUTE_OVERRIDE",
    "INSUFFICIENT_LIQUIDITY",
    "VENUE_UNAVAILABLE",
    "SPEND_LIMIT_EXCEEDED",
    "CHANNEL_NOT_FOUND",
    "CHANNEL_CLOSED",
    "JOB_NOT_FOUND",
    "JOB_NOT_OPEN",
    "JOB_EXPIRED",
    "NOT_AUTHORIZED",
    "RATE_LIMIT_NOT_FOUND",
    "CONTRACT_ERROR",
    "SIMULATION_FAILED",
    "SUBMISSION_FAILED",
    "TRANSACTION_FAILED",
    "TRANSACTION_TIMEOUT",
    "NETWORK_ERROR",
]


class StellarAgentError(RuntimeError):
    """Error thrown for SDK validation, Soroban RPC, and contract failures."""

    def __init__(
        self,
        code: StellarAgentErrorCode,
        message: str,
        *,
        cause: Exception | None = None,
        transaction_hash: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code: StellarAgentErrorCode = code
        self.message: str = message
        self.cause: Exception | None = cause
        self.transaction_hash: str | None = transaction_hash

    def __str__(self) -> str:
        return self.message

    def __repr__(self) -> str:
        return (
            f"StellarAgentError(code={self.code!r}, message={self.message!r}, "
            f"transaction_hash={self.transaction_hash!r})"
        )


class InvalidArgumentError(StellarAgentError, ValueError):
    """Error thrown when an argument is invalid (subclasses both StellarAgentError and ValueError)."""

    def __init__(
        self,
        code: StellarAgentErrorCode = "INVALID_ARGUMENT",
        message: str = "Invalid argument",
        *,
        cause: Exception | None = None,
        transaction_hash: str | None = None,
    ) -> None:
        super().__init__(code, message, cause=cause, transaction_hash=transaction_hash)


CONTRACT_ERROR_MAPPINGS: list[tuple[re.Pattern[str], StellarAgentErrorCode]] = [
    (re.compile(r"spend limit exceeded", re.IGNORECASE), "SPEND_LIMIT_EXCEEDED"),
    (re.compile(r"channel not found", re.IGNORECASE), "CHANNEL_NOT_FOUND"),
    (re.compile(r"channel is closed", re.IGNORECASE), "CHANNEL_CLOSED"),
    (re.compile(r"job not found", re.IGNORECASE), "JOB_NOT_FOUND"),
    (re.compile(r"job is not open", re.IGNORECASE), "JOB_NOT_OPEN"),
    (re.compile(r"job has expired", re.IGNORECASE), "JOB_EXPIRED"),
    (
        re.compile(r"not (?:the )?(?:authorized|assigned)|not authorized", re.IGNORECASE),
        "NOT_AUTHORIZED",
    ),
    (re.compile(r"no rate limit|limit not found", re.IGNORECASE), "RATE_LIMIT_NOT_FOUND"),
    (
        re.compile(
            r"(?:amount|deposit|limit).*(?:positive|invalid)|deadline must", re.IGNORECASE
        ),
        "INVALID_ARGUMENT",
    ),
]


def contract_error(
    fallback: StellarAgentErrorCode,
    message: str,
    transaction_hash: str | None = None,
    cause: Exception | None = None,
) -> StellarAgentError:
    """Map a raw contract-panic or RPC failure message to a stable machine-readable code."""
    for pattern, code in CONTRACT_ERROR_MAPPINGS:
        if pattern.search(message):
            if code == "INVALID_ARGUMENT":
                return InvalidArgumentError(
                    code, message, cause=cause, transaction_hash=transaction_hash
                )
            return StellarAgentError(code, message, cause=cause, transaction_hash=transaction_hash)
    if fallback == "INVALID_ARGUMENT":
        return InvalidArgumentError(fallback, message, cause=cause, transaction_hash=transaction_hash)
    return StellarAgentError(fallback, message, cause=cause, transaction_hash=transaction_hash)
