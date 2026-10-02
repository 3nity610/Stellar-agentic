"""
Signing abstraction.

Why this module exists
-----------------------
The original Python SDK took a raw secret and held it as a Keypair for the
whole life of the process. That is a real risk for an agent running with
real funds: the secret is reachable from a core dump, a logged exception
object, or any transitive dependency.

This module separates *what to sign* from *what holds the key*, mirroring
``packages/core/src/signer.ts`` in the TypeScript SDK exactly — same method
names, same SEP-43-shaped XDR-in/XDR-out interface, same choice of a remote
HTTP signing service over hardware signing (see ``docs/signing.md`` for the
full justification, which applies unchanged here: an autonomous agent making
unattended per-call payments cannot wait on a hardware button press).

The two SDKs are meant to be interchangeable at the protocol boundary: a
``RemoteSigner`` here can point at the exact same signing service a
TypeScript agent uses.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol, runtime_checkable

import httpx
from stellar_sdk import Keypair
from stellar_sdk.exceptions import Ed25519PublicKeyInvalidError
from stellar_sdk.strkey import StrKey


class SigningError(Exception):
    """Raised when a signer cannot produce a signature."""

    def __init__(self, message: str, cause: Optional[BaseException] = None) -> None:
        super().__init__(message)
        self.cause = cause


@dataclass(frozen=True)
class SignTransactionOptions:
    """Network passphrase the signature must be bound to."""

    network_passphrase: str


@dataclass(frozen=True)
class SignAuthEntryOptions:
    """Network passphrase and expiry the authorization must be bound to."""

    network_passphrase: str
    valid_until_ledger_seq: int


@runtime_checkable
class Signer(Protocol):
    """
    Somewhere that can sign on behalf of one Stellar account.

    Implementations must never require the caller to hold key material.
    Mirrors the TypeScript ``Signer`` interface in
    ``packages/core/src/signer.ts`` method-for-method.
    """

    async def get_public_key(self) -> str:
        """The Stellar public address (G...) this signer signs for."""
        ...

    async def sign_transaction(self, xdr: str, options: SignTransactionOptions) -> str:
        """Sign a transaction envelope. Returns base64 signed envelope XDR."""
        ...

    async def sign_auth_entry(self, auth_entry_xdr: str, options: SignAuthEntryOptions) -> str:
        """Sign a Soroban authorization entry. Returns base64 signed entry XDR."""
        ...


def is_signer(value: Any) -> bool:
    """Duck-typed check, matching the TS `isSigner` helper."""
    return (
        hasattr(value, "get_public_key")
        and hasattr(value, "sign_transaction")
        and hasattr(value, "sign_auth_entry")
    )


# ─── Keypair-backed signer ──────────────────────────────────────────────────


class KeypairSigner:
    """
    The original behaviour, kept for backward compatibility: an in-memory
    ``Keypair``.

    Fine for testnet, development, or agents holding negligible value. Not
    what you want for an agent with real funds — see ``RemoteSigner``.

    The secret lives behind a name-mangled attribute rather than a public
    property, so it does not appear in a naive ``vars()``/``__dict__`` dump
    or get serialized by something that logs an object's public attributes.
    """

    def __init__(self, keypair: Keypair) -> None:
        if not keypair.can_sign():
            raise SigningError("KeypairSigner requires a keypair with a secret key")
        self.__keypair = keypair

    @classmethod
    def from_secret(cls, secret_key: str) -> "KeypairSigner":
        return cls(Keypair.from_secret(secret_key))

    @classmethod
    def random(cls) -> "KeypairSigner":
        return cls(Keypair.random())

    async def get_public_key(self) -> str:
        return self.__keypair.public_key

    def public_key(self) -> str:
        """Synchronous accessor — available because the key is local."""
        return self.__keypair.public_key

    def export_secret(self) -> str:
        """
        Reveal the raw secret.

        Deliberately a method with a blunt name, not a ``secret_key``
        property: exporting key material should be a visible, greppable
        act, not something that happens by reading an attribute.
        """
        return self.__keypair.secret

    async def sign_transaction(self, xdr: str, options: SignTransactionOptions) -> str:
        from stellar_sdk import TransactionEnvelope

        try:
            envelope = TransactionEnvelope.from_xdr(xdr, options.network_passphrase)
            envelope.sign(self.__keypair)
            return envelope.to_xdr()
        except Exception as err:  # noqa: BLE001 - re-raised as SigningError
            raise SigningError("KeypairSigner: failed to sign transaction", err) from err

    async def sign_auth_entry(self, auth_entry_xdr: str, options: SignAuthEntryOptions) -> str:
        from stellar_sdk import xdr as stellar_xdr
        from stellar_sdk.soroban_rpc import authorize_entry

        try:
            entry = stellar_xdr.SorobanAuthorizationEntry.from_xdr(auth_entry_xdr)
            signed = authorize_entry(
                entry,
                self.__keypair,
                options.valid_until_ledger_seq,
                options.network_passphrase,
            )
            return signed.to_xdr()
        except Exception as err:  # noqa: BLE001
            raise SigningError(
                "KeypairSigner: failed to sign authorization entry", err
            ) from err


# ─── Remote signer ──────────────────────────────────────────────────────────


@dataclass
class RemoteSignerOptions:
    """
    Options for ``RemoteSigner``. Mirrors ``RemoteSignerOptions`` in
    ``packages/core/src/signer.ts`` field-for-field.
    """

    url: str
    token: Optional[str] = None
    expected_public_key: Optional[str] = None
    timeout_s: float = 10.0
    headers: dict[str, str] = field(default_factory=dict)
    client: Optional[httpx.AsyncClient] = None


class RemoteSigner:
    """
    A ``Signer`` backed by an HTTP signing service.

    Speaks the **same protocol** as the TypeScript ``RemoteSigner`` — see
    ``docs/signing.md#the-remote-signing-protocol``. A single signing
    service (e.g. the one in ``services/signer``) can serve both a
    TypeScript and a Python agent fleet interchangeably.

    Protocol (all JSON, key never crosses the boundary):

    * ``GET  {url}/v1/public-key``            -> ``{"publicKey": "G..."}``
    * ``POST {url}/v1/sign/transaction``       -> ``{"signedXdr": "..."}``
    * ``POST {url}/v1/sign/auth-entry``        -> ``{"signedAuthEntryXdr": "..."}``

    Non-2xx responses carry ``{"error": "<message>"}`` and are surfaced as
    ``SigningError``.
    """

    def __init__(self, options: RemoteSignerOptions) -> None:
        if not options.url:
            raise SigningError("RemoteSigner requires a url")
        if options.expected_public_key and not StrKey.is_valid_ed25519_public_key(
            options.expected_public_key
        ):
            raise SigningError(
                "RemoteSigner: expected_public_key is not a valid Stellar address: "
                f"{options.expected_public_key}"
            )
        self._url = options.url.rstrip("/")
        self._token = options.token
        self._expected_public_key = options.expected_public_key
        self._timeout_s = options.timeout_s
        self._headers = options.headers
        self._client = options.client or httpx.AsyncClient()
        self._public_key: Optional[str] = None  # cached; identity can't change

    async def get_public_key(self) -> str:
        if self._public_key:
            return self._public_key

        data = await self._request("GET", "/v1/public-key")
        public_key = data.get("publicKey")
        if not public_key or not StrKey.is_valid_ed25519_public_key(public_key):
            raise SigningError(
                f"RemoteSigner: service returned an invalid public key: {public_key!r}"
            )
        if self._expected_public_key and public_key != self._expected_public_key:
            raise SigningError(
                f"RemoteSigner: service signs for {public_key}, but "
                f"{self._expected_public_key} was expected. Refusing to continue — "
                "this signer may be misconfigured or substituted."
            )
        self._public_key = public_key
        return public_key

    async def sign_transaction(self, xdr: str, options: SignTransactionOptions) -> str:
        data = await self._request(
            "POST",
            "/v1/sign/transaction",
            {"xdr": xdr, "networkPassphrase": options.network_passphrase},
        )
        signed_xdr = data.get("signedXdr")
        if not isinstance(signed_xdr, str) or not signed_xdr:
            raise SigningError("RemoteSigner: service returned no signedXdr")
        return signed_xdr

    async def sign_auth_entry(self, auth_entry_xdr: str, options: SignAuthEntryOptions) -> str:
        data = await self._request(
            "POST",
            "/v1/sign/auth-entry",
            {
                "authEntryXdr": auth_entry_xdr,
                "networkPassphrase": options.network_passphrase,
                "validUntilLedgerSeq": options.valid_until_ledger_seq,
            },
        )
        signed = data.get("signedAuthEntryXdr")
        if not isinstance(signed, str) or not signed:
            raise SigningError("RemoteSigner: service returned no signedAuthEntryXdr")
        return signed

    async def _request(
        self, method: str, path: str, body: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        url = f"{self._url}{path}"
        headers = {"accept": "application/json", **self._headers}
        if body is not None:
            headers["content-type"] = "application/json"
        if self._token:
            headers["authorization"] = f"Bearer {self._token}"

        try:
            response = await self._client.request(
                method, url, json=body, headers=headers, timeout=self._timeout_s
            )
        except httpx.TimeoutException as err:
            raise SigningError(
                f"RemoteSigner: {method} {path} timed out after {self._timeout_s}s", err
            ) from err
        except httpx.HTTPError as err:
            raise SigningError(f"RemoteSigner: {method} {path} failed", err) from err

        if response.status_code >= 400:
            detail = ""
            try:
                payload = response.json()
                if isinstance(payload, dict) and payload.get("error"):
                    detail = f": {payload['error']}"
            except Exception:  # noqa: BLE001 - best-effort detail extraction
                pass
            raise SigningError(
                f"RemoteSigner: {method} {path} returned {response.status_code}{detail}"
            )

        try:
            return response.json()
        except Exception as err:  # noqa: BLE001
            raise SigningError(f"RemoteSigner: {method} {path} returned invalid JSON", err) from err

    async def aclose(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()
