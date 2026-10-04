"""Shared contract response shapes for the Python SDK's future RPC decode path.

The Python contract methods still raise NotImplementedError. This test checks
their generated response types without pretending that RPC decoding exists.
"""

from __future__ import annotations

import json
import re
from dataclasses import fields
from pathlib import Path
from typing import Any

import pytest

from stellaragent.generated.contract_types import RawAgentInfo, RawChannel, RawJob, RawRateLimit

RESPONSES = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "contract-responses.json").read_text(
        encoding="utf-8"
    )
)
TYPES = {
    "get_agent": RawAgentInfo,
    "get_channel": RawChannel,
    "get_job": RawJob,
    "get_limits": RawRateLimit,
}


def native_value(value: Any) -> Any:
    """Represent JSON scalars as Python values returned by a future RPC decoder."""
    if isinstance(value, str) and re.fullmatch(r"-?\d+", value):
        return int(value)
    if isinstance(value, str) and re.fullmatch(r"0x(?:[0-9a-fA-F]{2})*", value):
        return bytes.fromhex(value[2:])
    if isinstance(value, list):
        assert len(value) == 1  # Soroban unit-variant enum
        return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", value[0]).lower()
    return value


@pytest.mark.parametrize("method", TYPES)
def test_shared_response_matches_generated_python_type(method: str) -> None:
    response = RESPONSES[method]
    raw_type = TYPES[method]
    assert set(response) == {field.name for field in fields(raw_type)}
    native = {name: native_value(value) for name, value in response.items()}
    assert vars(raw_type(**native)) == native

    if method == "get_channel":
        assert native["period"] == "hourly"
        assert native["collateral"] == 100
    if method == "get_job":
        assert native["task_description"] == b"task"
        assert native["status"] == "pending_release"
