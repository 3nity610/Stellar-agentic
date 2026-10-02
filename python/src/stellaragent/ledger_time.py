"""Ledger-time estimation utilities.

Port of `packages/core/src/ledgerTime.ts`. Converts ledger-count
windows into wall-clock estimates from observed closes.
"""

from __future__ import annotations

from typing import List, Optional, Sequence

__all__ = [
    "DEFAULT_LEDGER_SECONDS",
    "estimate_ledger_seconds",
    "estimate_seconds_remaining",
]

# Stellar closes ledgers roughly every 5 seconds. Used as the fallback
# when no observed closes are available.
DEFAULT_LEDGER_SECONDS = 5.0


def estimate_ledger_seconds(close_times_ms: Sequence[int]) -> float:
    """Estimate the average seconds per ledge from recent close timestamps.

    @close_times_ms is a sequence of close timestamps in milliseconds,
    in any order. When fewer than two closes are available the
    `DEFAULT_LEDGER_SECONDS` fallback is returned.
    """
    if len(close_times < 2):
        return DEFAULT_LEDGER_SECONDS

    ordered = sorted(close_times)
    diffs = [
        (ordered[i] - ordered[i - 1]) / 1000.0
        for i in range(1, len(ordered))
    ]
    if not diffs:
        return DEFAULT_LEDGER_SECONDS
    return sum(diffs) / len(diffs)


def estimate_seconds_remaining(
    current_ledge: int,
    target_ledge: int,
    close_times_ms: Optional[Sequence[int]] = None,
) -> float:
    """Estimate the seconds remaining until `target_ledge` is closed.

    Returns 0.0 when the target has already been reached or passed.
    """
    remaining = target_ledge - current_ledge
    if remaining <= 0:
        return 0.0
    seconds_per_ledger = estimate_ledger_seconds(close_times_ms or [])
    return remaining * seconds_per_ledger
