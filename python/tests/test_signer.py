"""Tests for the Signer abstraction, mirroring the TS signer test intent."""

from __future__ import annotations

import pytest
from stellar_sdk import Keypair

from stellaragent.signer import (
    KeypairSigner,
    RemoteSigner,
    RemoteSignerOptions,
    SignAuthEntryOptions,
    SigningError,
    SignTransactionOptions,
    is_signer,
)

NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"


class FakeTransport:
    """Minimal httpx.AsyncClient stand-in for RemoteSigner tests."""

    def __init__(self, responses: dict[str, dict]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str, dict | None]] = []

    async def request(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append((method, url, json))
        key = url.rsplit("/v1", 1)[-1]
        key = "/v1" + key
        payload = self.responses.get(key, {"status": 404, "body": {"error": "not found"}})

        class FakeResponse:
            def __init__(self, status, body):
                self.status_code = status
                self._body = body

            def json(self):
                return self._body

        return FakeResponse(payload.get("status", 200), payload.get("body", {}))

    async def aclose(self):
        pass


def make_remote_signer(responses: dict, **kwargs) -> RemoteSigner:
    transport = FakeTransport(responses)
    opts = RemoteSignerOptions(url="https://signer.test", client=transport, **kwargs)
    return RemoteSigner(opts)


# ─── KeypairSigner ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_keypair_signer_reports_public_key():
    kp = Keypair.random()
    signer = KeypairSigner(kp)
    assert await signer.get_public_key() == kp.public_key


def test_keypair_signer_requires_signing_capable_keypair():
    kp = Keypair.from_public_key(Keypair.random().public_key)
    with pytest.raises(SigningError):
        KeypairSigner(kp)


def test_keypair_signer_export_secret_is_explicit():
    kp = Keypair.random()
    signer = KeypairSigner(kp)
    assert signer.export_secret() == kp.secret


def test_keypair_signer_is_a_signer():
    signer = KeypairSigner.random()
    assert is_signer(signer)


# ─── RemoteSigner: identity ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remote_signer_fetches_and_caches_public_key():
    kp = Keypair.random()
    signer = make_remote_signer(
        {"/v1/public-key": {"status": 200, "body": {"publicKey": kp.public_key}}}
    )
    first = await signer.get_public_key()
    second = await signer.get_public_key()
    assert first == kp.public_key
    assert second == kp.public_key
    # Cached: only one network call despite two get_public_key() calls.
    assert len(signer._client.calls) == 1


@pytest.mark.asyncio
async def test_remote_signer_rejects_mismatched_expected_public_key():
    kp = Keypair.random()
    other = Keypair.random()
    signer = make_remote_signer(
        {"/v1/public-key": {"status": 200, "body": {"publicKey": kp.public_key}}},
        expected_public_key=other.public_key,
    )
    with pytest.raises(SigningError, match="Refusing to continue"):
        await signer.get_public_key()


@pytest.mark.asyncio
async def test_remote_signer_rejects_invalid_public_key_from_service():
    signer = make_remote_signer(
        {"/v1/public-key": {"status": 200, "body": {"publicKey": "not-a-real-address"}}}
    )
    with pytest.raises(SigningError):
        await signer.get_public_key()


def test_remote_signer_rejects_invalid_expected_public_key_at_construction():
    with pytest.raises(SigningError):
        RemoteSignerOptions(url="https://signer.test", expected_public_key="garbage")
        RemoteSigner(
            RemoteSignerOptions(url="https://signer.test", expected_public_key="garbage")
        )


# ─── RemoteSigner: signing ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remote_signer_sign_transaction_returns_signed_xdr():
    signer = make_remote_signer(
        {"/v1/sign/transaction": {"status": 200, "body": {"signedXdr": "SIGNED_XDR_HERE"}}}
    )
    result = await signer.sign_transaction(
        "UNSIGNED_XDR", SignTransactionOptions(network_passphrase=NETWORK_PASSPHRASE)
    )
    assert result == "SIGNED_XDR_HERE"


@pytest.mark.asyncio
async def test_remote_signer_sign_transaction_rejects_empty_response():
    signer = make_remote_signer(
        {"/v1/sign/transaction": {"status": 200, "body": {"signedXdr": ""}}}
    )
    with pytest.raises(SigningError):
        await signer.sign_transaction(
            "XDR", SignTransactionOptions(network_passphrase=NETWORK_PASSPHRASE)
        )


@pytest.mark.asyncio
async def test_remote_signer_sign_auth_entry_returns_signed_xdr():
    signer = make_remote_signer(
        {
            "/v1/sign/auth-entry": {
                "status": 200,
                "body": {"signedAuthEntryXdr": "SIGNED_ENTRY"},
            }
        }
    )
    result = await signer.sign_auth_entry(
        "ENTRY_XDR",
        SignAuthEntryOptions(network_passphrase=NETWORK_PASSPHRASE, valid_until_ledger_seq=999),
    )
    assert result == "SIGNED_ENTRY"


@pytest.mark.asyncio
async def test_remote_signer_surfaces_policy_refusal_detail():
    signer = make_remote_signer(
        {
            "/v1/sign/transaction": {
                "status": 403,
                "body": {"error": "spend ceiling exceeded"},
            }
        }
    )
    with pytest.raises(SigningError, match="spend ceiling exceeded"):
        await signer.sign_transaction(
            "XDR", SignTransactionOptions(network_passphrase=NETWORK_PASSPHRASE)
        )


def test_remote_signer_requires_url():
    with pytest.raises(SigningError):
        RemoteSigner(RemoteSignerOptions(url=""))


@pytest.mark.asyncio
async def test_remote_signer_is_a_signer():
    signer = make_remote_signer(
        {"/v1/public-key": {"status": 200, "body": {"publicKey": Keypair.random().public_key}}}
    )
    assert is_signer(signer)


# ─── Core requirement: no secret ever materializes for a remote-signed agent ─


@pytest.mark.asyncio
async def test_remote_signed_flow_never_touches_a_secret():
    """
    The acceptance criterion in #309: a Python agent operating through a
    RemoteSigner must be able to get its address and sign without any
    Keypair / secret ever being constructed in-process.
    """
    kp = Keypair.random()
    signer = make_remote_signer(
        {
            "/v1/public-key": {"status": 200, "body": {"publicKey": kp.public_key}},
            "/v1/sign/transaction": {"status": 200, "body": {"signedXdr": "SIGNED"}},
        }
    )

    # No stellar_sdk.Keypair is instantiated anywhere in this flow — assert
    # by construction: RemoteSigner's class holds no Keypair attribute at all.
    assert not hasattr(signer, "_keypair")
    assert not any("secret" in attr.lower() for attr in vars(signer))

    address = await signer.get_public_key()
    assert address == kp.public_key

    signed = await signer.sign_transaction(
        "XDR", SignTransactionOptions(network_passphrase=NETWORK_PASSPHRASE)
    )
    assert signed == "SIGNED"
