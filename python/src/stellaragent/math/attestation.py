"""Bid-attestation signing and verification (port of ``packages/core/src/math/attestation.ts``)."""

from hashlib import sha256

__all__ = ["digest_attestation_header"]


def digest_attestation_header(header: dict) -> str:
    """sha256 hex digest over every attestation field except the signature."""
    return sha256(
        __import__("json").dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()
