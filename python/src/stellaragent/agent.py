"""``StellarAgent`` — the Python counterpart of ``packages/core/src/index.ts``.

Tracks the TypeScript class's public API. Method names are ``snake_case``;
everything else — arguments, semantics, validation order, error text — is
deliberately the same, so an agent written against one SDK reads the same in
the other.
"""

from __future__ import annotations

import copy
import time
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Any, cast

from stellar_sdk import (
    Account,
    Address,
    Asset,
    InvokeHostFunction,
    Keypair,
    Server,
    SorobanDataBuilder,
    SorobanServer,
    TransactionBuilder,
    TransactionEnvelope,
    scval,
    xdr,
)
from stellar_sdk.auth import authorize_entry

from .contracts import ContractAddresses, assert_deployed, resolve_contracts
from .errors import InvalidArgumentError, StellarAgentError, contract_error
from .fixed_point import to_stroops
from .types import (
    NETWORK_CONFIGS,
    UNCONFIGURED_RATE_LIMIT,
    ChannelInfo,
    JobInfo,
    Network,
    NetworkConfig,
    OpenChannelParams,
    PayForAPIParams,
    RateLimitConfig,
    RateLimitStatus,
    RequestWorkParams,
    SpendLimit,
    SpendReport,
    TxResult,
)

SorobanAuthorizationEntry = xdr.SorobanAuthorizationEntry
SorobanCredentialsType = xdr.SorobanCredentialsType
SorobanTransactionData = xdr.SorobanTransactionData

__all__ = ["StellarAgent", "InvocationResult"]

FRIENDBOT_URL = "https://friendbot.stellar.org"


@dataclass(frozen=True)
class InvocationResult:
    """The result of a Soroban contract invocation."""

    value: Any
    tx: TxResult


class _InvokeContractAdapter:
    def __init__(self, invoke_contract: Any) -> None:
        self._invoke_contract = invoke_contract

    def args(self) -> list[xdr.SCVal]:
        return list(self._invoke_contract.args)

    @property
    def contract_address(self) -> Any:
        return self._invoke_contract.contract_address

    @property
    def function_name(self) -> Any:
        return self._invoke_contract.function_name


class _FuncAdapter:
    def __init__(self, host_fn: Any) -> None:
        self._host_fn = host_fn

    def invokeContract(self) -> _InvokeContractAdapter:
        return _InvokeContractAdapter(self._host_fn.invoke_contract)

    def invoke_contract(self) -> _InvokeContractAdapter:
        return _InvokeContractAdapter(self._host_fn.invoke_contract)


def spend_period_variant(period: str) -> str:
    mapping = {
        "per_ledger": "PerLedger",
        "hourly": "Hourly",
        "daily": "Daily",
    }
    if period not in mapping:
        raise InvalidArgumentError(
            "INVALID_ARGUMENT",
            f"Invalid spend period '{period}'. Expected one of: {', '.join(sorted(mapping))}",
        )
    return mapping[period]


def resolve_asset_contract(
    asset: str,
    asset_contracts: dict[str, str] | None,
    network_passphrase: str,
) -> str:
    if asset == "XLM":
        return Asset.native().contract_id(network_passphrase)
    contracts = asset_contracts or {}
    resolved = contracts.get(asset, asset)
    try:
        Address(resolved)
        if not resolved.startswith("C"):
            raise ValueError("not a contract")
        return resolved
    except Exception as exc:
        raise InvalidArgumentError(
            "INVALID_ARGUMENT",
            f'Unknown asset "{asset}". Pass its C... token contract ID or configure assetContracts.{asset}.',
            cause=exc,
        ) from exc


def _get_account(rpc: Any, address: str) -> Account:
    for name in ("load_account", "get_account", "getAccount"):
        fn = getattr(rpc, name, None)
        if callable(fn):
            acc: Any = fn(address)
            if isinstance(acc, Account):
                acc.sequence = int(acc.sequence)
                return acc
            if hasattr(acc, "sequence"):
                seq = int(acc.sequence)
                return Account(address, seq)
            return Account(address, 0)
    raise AttributeError("RPC server missing load_account / get_account")


def _scval_to_native(val: Any) -> Any:
    if isinstance(val, (xdr.SCVal, xdr.sc_val.SCVal)):
        return scval.to_native(val)
    if isinstance(val, str):
        try:
            parsed = xdr.SCVal.from_xdr(val)
            return scval.to_native(parsed)
        except Exception:
            return val
    return val


def _extract_simulation_retval(simulation: Any) -> Any:
    results = getattr(simulation, "results", None) or (
        simulation.get("results") if isinstance(simulation, dict) else None
    )
    if results and len(results) > 0:
        first = results[0]
        val = (
            getattr(first, "xdr", None)
            or getattr(first, "retval", None)
            or (first.get("xdr") if isinstance(first, dict) else None)
            or (first.get("retval") if isinstance(first, dict) else None)
        )
        if val is not None:
            return _scval_to_native(val)
    result = getattr(simulation, "result", None) or (
        simulation.get("result") if isinstance(simulation, dict) else None
    )
    if result:
        val = getattr(result, "retval", None) or (
            result.get("retval") if isinstance(result, dict) else None
        )
        if val is not None:
            return _scval_to_native(val)
    return None


def _extract_simulation_auth(simulation: Any) -> list[Any]:
    results = getattr(simulation, "results", None) or (
        simulation.get("results") if isinstance(simulation, dict) else None
    )
    if results and len(results) > 0:
        first = results[0]
        auth = getattr(first, "auth", None) or (
            first.get("auth") if isinstance(first, dict) else None
        )
        if auth:
            return list(auth)
    result = getattr(simulation, "result", None) or (
        simulation.get("result") if isinstance(simulation, dict) else None
    )
    if result:
        auth = getattr(result, "auth", None) or (
            result.get("auth") if isinstance(result, dict) else None
        )
        if auth:
            return list(auth)
    return []


def _extract_return_value(confirmed: Any) -> Any:
    for attr in ("return_value", "returnValue"):
        val = getattr(confirmed, attr, None) or (
            confirmed.get(attr) if isinstance(confirmed, dict) else None
        )
        if val is not None:
            return _scval_to_native(val)
    meta_xdr = getattr(confirmed, "result_meta_xdr", None) or (
        confirmed.get("result_meta_xdr") if isinstance(confirmed, dict) else None
    )
    if meta_xdr:
        try:
            meta = xdr.TransactionMeta.from_xdr(meta_xdr)
            if meta.v3 and meta.v3.soroban_meta and meta.v3.soroban_meta.return_value:
                return _scval_to_native(meta.v3.soroban_meta.return_value)
        except Exception:
            pass
    return None


class StellarAgent:
    """Main SDK class for AI Agent payment operations on Stellar.

    Use :meth:`create` rather than the constructor.
    """

    def __init__(
        self,
        keypair: Keypair,
        network_config: NetworkConfig,
        contracts: ContractAddresses,
    ) -> None:
        self.__keypair = keypair
        self._network_config = network_config
        self._contracts = contracts
        self._horizon = Server(horizon_url=network_config.horizon_url)
        self._rpc: Any = SorobanServer(server_url=network_config.rpc_url)
        self._active_channel_id: int | None = None
        self._poll_interval: float = 1.0

    # ── Factory methods ──────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        network: Network = "testnet",
        secret_key: str | None = None,
        spend_limit: SpendLimit | None = None,
        contracts: dict[str, str] | None = None,
        allow_unconfigured_contracts: bool = False,
    ) -> StellarAgent:
        """Create a new agent. Generates a fresh keypair when no secret is given."""
        if network not in NETWORK_CONFIGS:
            raise ValueError(
                f"Unknown network {network!r}. Expected one of: "
                f"{', '.join(sorted(NETWORK_CONFIGS))}"
            )

        keypair = Keypair.from_secret(secret_key) if secret_key else Keypair.random()
        network_config = NETWORK_CONFIGS[network]
        resolved = resolve_contracts(network, contracts)

        if not allow_unconfigured_contracts:
            assert_deployed(network, resolved)

        agent = cls(keypair, network_config, resolved)
        agent._spend_limit = spend_limit  # type: ignore[attr-defined]

        # Only a freshly generated keypair gets funded, matching the TS rule.
        if network == "testnet" and not secret_key:
            agent._fund_from_friendbot()

        return agent

    @classmethod
    def from_secret(
        cls,
        secret_key: str,
        network: Network = "testnet",
        **options: Any,
    ) -> StellarAgent:
        """Restore an agent from an existing secret key."""
        return cls.create(network=network, secret_key=secret_key, **options)

    # ── Identity ─────────────────────────────────────────────────────────────

    @property
    def address(self) -> str:
        """The agent's Stellar public address."""
        return str(self.__keypair.public_key)

    @property
    def secret_key(self) -> str:
        """The agent's secret key — keep this safe."""
        return str(self.__keypair.secret)

    @property
    def contracts(self) -> ContractAddresses:
        """The resolved contract addresses this agent will call."""
        return self._contracts

    @property
    def network_config(self) -> NetworkConfig:
        """RPC, Horizon and passphrase for the selected network."""
        return self._network_config

    @property
    def active_channel_id(self) -> int | None:
        """The active payment channel ID, if one is currently open."""
        return self._active_channel_id

    @active_channel_id.setter
    def active_channel_id(self, channel_id: int | None) -> None:
        self._active_channel_id = channel_id

    @property
    def rpc(self) -> Any:
        """The Soroban RPC server instance."""
        return self._rpc

    @rpc.setter
    def rpc(self, server: Any) -> None:
        self._rpc = server

    @property
    def signer(self) -> Any:
        """Signer interface for parity with the TS SDK."""
        return self

    # ── Shared invocation helper ─────────────────────────────────────────────

    def _invoke_contract(
        self,
        contract_id: str,
        method: str,
        args: Sequence[xdr.SCVal],
        read_only: bool = False,
    ) -> InvocationResult:
        """Build, simulate, sign, submit, and poll a Soroban contract invocation."""
        # 1. Build
        try:
            account = _get_account(self._rpc, self.address)
        except Exception as exc:
            if isinstance(exc, StellarAgentError):
                raise
            raise StellarAgentError(
                "NETWORK_ERROR",
                f"{method} failed while communicating with Soroban RPC: {exc}",
                cause=exc,
            ) from exc

        builder = (
            TransactionBuilder(
                source_account=account,
                network_passphrase=self._network_config.network_passphrase,
                base_fee=100,
            )
            .set_timeout(30)
            .append_invoke_contract_function_op(
                contract_id=contract_id,
                function_name=method,
                parameters=list(args),
            )
        )
        te = builder.build()
        op = te.transaction.operations[0]
        assert isinstance(op, InvokeHostFunction)
        cast(Any, op).func = _FuncAdapter(op.host_function)
        cast(Any, te).operations = te.transaction.operations

        # 2. Simulate
        try:
            sim_fn = getattr(self._rpc, "simulate_transaction", None) or getattr(
                self._rpc, "simulateTransaction", None
            )
            if not callable(sim_fn):
                raise AttributeError("RPC server missing simulate_transaction / simulateTransaction")
            simulation = sim_fn(te)
        except Exception as exc:
            if isinstance(exc, StellarAgentError):
                raise
            raise StellarAgentError(
                "NETWORK_ERROR",
                f"{method} failed while communicating with Soroban RPC: {exc}",
                cause=exc,
            ) from exc

        sim_error = getattr(simulation, "error", None) or (
            simulation.get("error") if isinstance(simulation, dict) else None
        )
        if sim_error:
            raise contract_error("SIMULATION_FAILED", f"{method} simulation failed: {sim_error}")

        restore_preamble = (
            getattr(simulation, "restore_preamble", None)
            or (
                simulation.get("restore_preamble") or simulation.get("restorePreamble")
                if isinstance(simulation, dict)
                else None
            )
        )
        if restore_preamble:
            raise StellarAgentError(
                "SIMULATION_FAILED",
                f"{method} requires restoring expired ledger entries before invocation",
            )

        if read_only:
            val = _extract_simulation_retval(simulation)
            return InvocationResult(value=val, tx=TxResult(hash="", success=True))

        # 3. Sign Auth Entries & Assemble
        latest_ledger = (
            getattr(simulation, "latest_ledger", None)
            or getattr(simulation, "latestLedger", None)
            or (
                simulation.get("latest_ledger") or simulation.get("latestLedger")
                if isinstance(simulation, dict)
                else None
            )
            or 0
        )
        valid_until = latest_ledger + 100
        raw_auth = _extract_simulation_auth(simulation)
        signed_auth: list[SorobanAuthorizationEntry] = []
        for entry in raw_auth:
            signed_entry = self.sign_auth_entry(entry, valid_until)
            if isinstance(signed_entry, str):
                signed_entry = SorobanAuthorizationEntry.from_xdr(signed_entry)
            signed_auth.append(signed_entry)

        assert isinstance(op, InvokeHostFunction)
        authorized_op = InvokeHostFunction(
            host_function=op.host_function,
            auth=signed_auth,
            source=op.source,
        )

        td = (
            getattr(simulation, "transaction_data", None)
            or getattr(simulation, "transactionData", None)
            or (
                simulation.get("transaction_data") or simulation.get("transactionData")
                if isinstance(simulation, dict)
                else None
            )
        )
        if isinstance(td, SorobanDataBuilder):
            soroban_data = td.build()  # type: ignore[no-untyped-call]
        elif isinstance(td, str):
            soroban_data = SorobanTransactionData.from_xdr(td)
        elif isinstance(td, (xdr.SorobanTransactionData, SorobanTransactionData)):
            soroban_data = td
        else:
            soroban_data = SorobanDataBuilder().build()  # type: ignore[no-untyped-call]

        min_resource_fee = int(
            getattr(simulation, "min_resource_fee", 0)
            or getattr(simulation, "minResourceFee", 0)
            or (
                simulation.get("min_resource_fee") or simulation.get("minResourceFee")
                if isinstance(simulation, dict)
                else 0
            )
            or 0
        )

        assembled = copy.deepcopy(te)
        assembled.signatures = []
        assembled.transaction.soroban_data = soroban_data
        assembled.transaction.fee += min_resource_fee
        assembled.transaction.operations = [authorized_op]

        self.sign_transaction(assembled)

        # 4. Submit
        try:
            send_fn = getattr(self._rpc, "send_transaction", None) or getattr(
                self._rpc, "sendTransaction", None
            )
            if not callable(send_fn):
                raise AttributeError("RPC server missing send_transaction / sendTransaction")
            submit_res = send_fn(assembled)
        except Exception as exc:
            if isinstance(exc, StellarAgentError):
                raise
            raise StellarAgentError(
                "NETWORK_ERROR",
                f"{method} failed while communicating with Soroban RPC: {exc}",
                cause=exc,
            ) from exc

        status = (
            getattr(submit_res, "status", None)
            or (submit_res.get("status") if isinstance(submit_res, dict) else None)
        )
        status_name = status.name if isinstance(status, Enum) else str(status).upper()

        tx_hash = (
            getattr(submit_res, "hash", None)
            or getattr(submit_res, "transaction_hash", None)
            or (
                submit_res.get("hash") or submit_res.get("transaction_hash")
                if isinstance(submit_res, dict)
                else None
            )
            or ""
        )

        if status_name not in ("PENDING", "DUPLICATE", "SUCCESS"):
            err_msg = f"{method} submission failed ({status_name})"
            diag = getattr(submit_res, "error_result_xdr", None) or (
                submit_res.get("error_result_xdr") if isinstance(submit_res, dict) else None
            )
            if diag:
                err_msg += f": {diag}"
            raise contract_error("SUBMISSION_FAILED", err_msg, tx_hash)

        # 5. Poll
        get_tx_fn = getattr(self._rpc, "get_transaction", None) or getattr(
            self._rpc, "getTransaction", None
        )
        if not callable(get_tx_fn):
            raise AttributeError("RPC server missing get_transaction / getTransaction")

        for _ in range(30):
            try:
                confirmed = get_tx_fn(tx_hash)
            except Exception as exc:
                if isinstance(exc, StellarAgentError):
                    raise
                raise StellarAgentError(
                    "NETWORK_ERROR",
                    f"{method} failed while communicating with Soroban RPC: {exc}",
                    cause=exc,
                ) from exc

            c_status = (
                getattr(confirmed, "status", None)
                or (confirmed.get("status") if isinstance(confirmed, dict) else None)
            )
            c_status_str = c_status.name if isinstance(c_status, Enum) else str(c_status).upper()

            if c_status_str == "SUCCESS":
                val = _extract_return_value(confirmed)
                ledger = (
                    getattr(confirmed, "ledger", None)
                    or (confirmed.get("ledger") if isinstance(confirmed, dict) else None)
                )
                return InvocationResult(
                    value=val,
                    tx=TxResult(hash=tx_hash, success=True, ledger=ledger),
                )
            if c_status_str == "FAILED":
                raise contract_error(
                    "TRANSACTION_FAILED",
                    f"{method} transaction failed",
                    tx_hash,
                )
            time.sleep(self._poll_interval)

        raise StellarAgentError(
            "TRANSACTION_TIMEOUT",
            f"{method} transaction did not complete in time",
            transaction_hash=tx_hash,
        )

    def sign_auth_entry(
        self,
        entry: SorobanAuthorizationEntry | str,
        valid_until_ledger_seq: int,
    ) -> SorobanAuthorizationEntry:
        """Sign a Soroban authorization entry."""
        entry_obj = (
            SorobanAuthorizationEntry.from_xdr(entry)
            if isinstance(entry, str)
            else entry
        )

        if entry_obj.credentials.type != SorobanCredentialsType.SOROBAN_CREDENTIALS_ADDRESS:
            return entry_obj

        return authorize_entry(
            entry=entry_obj,
            signer=self.__keypair,
            valid_until_ledger_sequence=valid_until_ledger_seq,
            network_passphrase=self._network_config.network_passphrase,
        )

    def sign_transaction(self, envelope: TransactionEnvelope) -> TransactionEnvelope:
        """Sign a transaction envelope with the agent's keypair."""
        envelope.sign(self.__keypair)
        return envelope

    # ── Payment channel ──────────────────────────────────────────────────────

    def open_channel(self, params: OpenChannelParams) -> int:
        """Open a payment channel and return its ID."""
        token_contract = resolve_asset_contract(
            params.token or "XLM",
            {},
            self._network_config.network_passphrase,
        )
        args = [
            Address(self.address).to_xdr_sc_val(),
            Address(self.address).to_xdr_sc_val(),
            Address(token_contract).to_xdr_sc_val(),
            scval.to_int128(to_stroops(params.deposit)),
            scval.to_int128(to_stroops(params.limit_per_period)),
            scval.to_vec([scval.to_symbol(spend_period_variant(params.period))]),
        ]
        res = self._invoke_contract(
            self._contracts.payment_channel,
            "open_channel",
            args,
            read_only=False,
        )
        channel_id = int(res.value)
        self._active_channel_id = channel_id
        return channel_id

    def pay_for_api(self, params: PayForAPIParams) -> TxResult:
        """Pay for an API call, deducting from the active payment channel."""
        channel_id = (
            params.channel_id if params.channel_id is not None else self._active_channel_id
        )
        if channel_id is None:
            raise StellarAgentError(
                "NO_ACTIVE_CHANNEL", "No active payment channel. Call open_channel() first."
            )

        if (params.dest_asset is not None) != (params.min_received is not None):
            raise InvalidArgumentError(
                "INVALID_ARGUMENT", "dest_asset and min_received must be set together"
            )

        common_args = [
            Address(self.address).to_xdr_sc_val(),
            scval.to_uint64(channel_id),
            Address(params.recipient or self.address).to_xdr_sc_val(),
            scval.to_int128(to_stroops(params.amount)),
        ]

        if params.dest_asset is None:
            method = "pay"
            args = [*common_args, scval.to_bytes(params.endpoint.encode("utf-8"))]
        else:
            method = "pay_with_conversion"
            dest_contract = resolve_asset_contract(
                params.dest_asset,
                {},
                self._network_config.network_passphrase,
            )
            assert params.min_received is not None
            args = [
                *common_args,
                Address(dest_contract).to_xdr_sc_val(),
                scval.to_int128(to_stroops(params.min_received)),
                scval.to_bytes(params.endpoint.encode("utf-8")),
            ]

        res = self._invoke_contract(
            self._contracts.payment_channel,
            method,
            args,
            read_only=False,
        )
        return res.tx

    # ── Agent-to-agent escrow ────────────────────────────────────────────────

    def request_work(self, params: RequestWorkParams) -> int:
        """Create an escrow job delegating work to another agent."""
        raise NotImplementedError("Not yet implemented — see contracts/escrow/src/lib.rs")

    def accept_job(self, job_id: int) -> TxResult:
        """Accept an open escrow job as a worker agent."""
        raise NotImplementedError("Not yet implemented")

    def submit_result(self, job_id: int, result: str) -> TxResult:
        """Submit a work result for an escrow job."""
        raise NotImplementedError("Not yet implemented")

    def release_payment(self, job_id: int) -> TxResult:
        """Release escrow payment to the worker."""
        raise NotImplementedError("Not yet implemented")

    # ── Rate limits ──────────────────────────────────────────────────────────

    def set_rate_limits(self, config: RateLimitConfig) -> TxResult:
        """Configure on-chain rate limits for this agent.

        Calls ``RateLimiter.set_limits`` with the agent acting as both owner
        and subject — the same semantics as the TypeScript
        ``mutations.setRateLimits`` helper.

        Validation mirrors the TypeScript ordering so both SDKs reject invalid
        input with the same error before a transaction is sent:

        1. All amounts must convert to positive stroops.
        2. ``max_per_tx`` ≤ ``max_per_hour`` ≤ ``max_per_day``.
        3. ``max_txs_per_hour`` must be a positive integer.

        :raises ValueError: when any limit is non-positive or the ordering
            constraint is violated.
        :raises RuntimeError: when the RPC call or transaction submission fails.
        """
        max_per_tx_stroops = to_stroops(config.max_per_tx)
        max_per_hour_stroops = to_stroops(config.max_per_hour)
        max_per_day_stroops = to_stroops(config.max_per_day)

        if max_per_tx_stroops <= 0:
            raise ValueError("max_per_tx must be positive")
        if max_per_hour_stroops <= 0:
            raise ValueError("max_per_hour must be positive")
        if max_per_day_stroops <= 0:
            raise ValueError("max_per_day must be positive")
        if not isinstance(config.max_txs_per_hour, int) or config.max_txs_per_hour <= 0:
            raise ValueError("max_txs_per_hour must be a positive integer")
        if max_per_tx_stroops > max_per_hour_stroops:
            raise ValueError("max_per_tx cannot exceed max_per_hour")
        if max_per_hour_stroops > max_per_day_stroops:
            raise ValueError("max_per_hour cannot exceed max_per_day")

        return self._invoke_contract(  # type: ignore[return-value]
            self._contracts.rate_limiter,
            "set_limits",
            [
                self.address,  # owner
                self.address,  # agent
                int(max_per_tx_stroops),
                int(max_per_hour_stroops),
                int(max_per_day_stroops),
                config.max_txs_per_hour,
            ],
            read_only=False,
        )

    def check_rate_limit(self, amount: str) -> bool:
        """Whether a payment of ``amount`` would be allowed by rate limits.

        Read-only — mirrors ``queries.checkRateLimit`` in the TypeScript SDK.
        Returns ``True`` when no limits have been configured (the contract's
        ``check`` method returns ``true`` for an unconfigured agent).

        :param amount: Decimal string in display units (e.g. ``"0.5"``).
        :raises ValueError: when ``amount`` cannot be parsed as a positive
            decimal.
        """
        amount_stroops = to_stroops(amount)
        if amount_stroops <= 0:
            raise ValueError("amount must be positive")

        result = self._invoke_contract(
            self._contracts.rate_limiter,
            "check",
            [self.address, int(amount_stroops)],
            read_only=True,
        )
        # The contract returns a boolean ScVal; _invoke_contract unwraps it.
        return bool(result)

    def get_rate_limit_status(self, agent_address: str | None = None) -> RateLimitStatus:
        """Current rate-limit usage alongside the configured limits.

        Mirrors ``getRateLimitStatus`` in ``packages/core/src/agent/queries.ts``.

        ``RateLimiter.get_limits`` panics on-chain ("no rate limit for agent")
        when nothing has been configured — that panic is caught and mapped to
        ``configured: False``, exactly as the TypeScript SDK does.

        :param agent_address: Address of the agent to query.  Defaults to
            this agent's own address, matching the TypeScript default.
        :returns: :data:`~stellaragent.types.UNCONFIGURED_RATE_LIMIT` when
            ``set_limits`` has never been called for ``agent_address``.
        """
        target = agent_address if agent_address is not None else self.address

        try:
            raw = self._invoke_contract(
                self._contracts.rate_limiter,
                "get_limits",
                [target],
                read_only=True,
            )
        except RuntimeError as exc:
            # The contract panics with "no rate limit for agent" when the agent
            # has never been configured — map to the unconfigured sentinel.
            if "no rate limit for agent" in str(exc).lower():
                return UNCONFIGURED_RATE_LIMIT
            raise

        # raw is a dict with snake_case keys decoded from the Soroban XDR struct.
        return RateLimitStatus(
            configured=True,
            active=bool(raw.get("active", True)),
            max_per_tx=from_stroops(raw["max_per_tx"]),
            max_per_hour=from_stroops(raw["max_per_hour"]),
            max_per_day=from_stroops(raw["max_per_day"]),
            max_txs_per_hour=int(raw["max_txs_per_hour"]),
            spent_this_hour=from_stroops(raw["hourly_spend"]),
            spent_today=from_stroops(raw["daily_spend"]),
            txs_this_hour=int(raw["hourly_tx_count"]),
            hour_window_start_ledger=int(raw["hour_window_start"]),
            day_window_start_ledger=int(raw["day_window_start"]),
        )

    # ── Queries ──────────────────────────────────────────────────────────────

    def get_balance(self) -> str:
        """Current native XLM balance, or ``"0"`` if the account is unknown."""
        try:
            account = self._horizon.accounts().account_id(self.address).call()
        except Exception:  # noqa: BLE001 — an unfunded account is a normal state
            return "0"

        for balance in account.get("balances", []):
            if balance.get("asset_type") == "native":
                return str(balance.get("balance", "0"))
        return "0"

    def get_spend_report(self) -> SpendReport:
        """Spend report for the current period."""
        raise NotImplementedError("Not yet implemented")

    def get_channel(self, channel_id: int) -> ChannelInfo:
        """Info about a payment channel."""
        raise NotImplementedError("Not yet implemented")

    def get_job(self, job_id: int) -> JobInfo:
        """Info about an escrow job."""
        raise NotImplementedError("Not yet implemented")

    # ── Internals ────────────────────────────────────────────────────────────

    def _invoke_contract(
        self,
        contract_id: str,
        method: str,
        args: list[Any],
        *,
        read_only: bool,
    ) -> Any:
        """Simulate (and optionally submit) a Soroban contract invocation.

        This is the Python counterpart of the TypeScript ``invokeContract``
        private method.  It uses ``stellar-sdk``'s ``SorobanServer`` to
        simulate the call and — for mutations — also signs and submits the
        resulting transaction.

        :param contract_id: Stellar contract address (``C...``).
        :param method: Contract function name.
        :param args: Positional arguments in Python-native types:
            ``str`` → ``Address``, ``int`` → ``i128`` or ``u32`` (inferred
            from the method), ``bool`` → ``Bool``.
        :param read_only: When ``True`` only simulate; do not submit.
        :returns: The decoded return value of the contract call, or a
            :class:`~stellaragent.types.TxResult` for mutations.
        :raises RuntimeError: on RPC / simulation / submission errors,
            including on-chain panics (the error message includes the
            contract's panic string).
        """
        from stellar_sdk import Network as SdkNetwork
        from stellar_sdk import TransactionBuilder
        from stellar_sdk.contract import ContractClient
        from stellar_sdk.soroban_rpc import SendTransactionStatus

        try:
            passphrase = self._network_config.network_passphrase

            # Build the native ScVal argument list from Python values.
            from stellar_sdk import xdr as stellar_xdr
            from stellar_sdk import Address as StellarAddress
            from stellar_sdk.xdr import SCVal

            def _to_sc_val(v: Any) -> SCVal:
                if isinstance(v, str):
                    # Stellar/contract address
                    return StellarAddress(v).to_xdr_sc_val()
                if isinstance(v, bool):
                    return stellar_xdr.SCVal(stellar_xdr.SCValType.SCV_BOOL, b=v)
                if isinstance(v, int):
                    # Use i128 for amounts, u32 for counters — callers already
                    # pass the right Python int size so we just encode as i128
                    # (safe for all positive values that fit).
                    from stellar_sdk.xdr import Int128Parts, SCVal, SCValType, Uint32
                    high = v >> 64
                    low = v & 0xFFFF_FFFF_FFFF_FFFF
                    return SCVal(
                        SCValType.SCV_I128,
                        i128=Int128Parts(hi=high, lo=low),
                    )
                raise TypeError(f"Unsupported argument type {type(v)!r} for Soroban call")

            sc_args = [_to_sc_val(a) for a in args]

            # Load the source account.
            account = self._rpc.load_account(self.address)

            tx = (
                TransactionBuilder(
                    source_account=account,
                    network_passphrase=passphrase,
                    base_fee=300,
                )
                .append_invoke_contract_function_op(
                    contract_id=contract_id,
                    function_name=method,
                    parameters=sc_args,
                )
                .set_timeout(30)
                .build()
            )

            # Simulate to preflight the transaction and get resource fees.
            sim = self._rpc.simulate_transaction(tx)
            if sim.error:
                raise RuntimeError(f"Simulation error: {sim.error}")

            if read_only:
                # Decode the return value from the simulation result.
                return _decode_sim_result(sim)

            # Mutations: prepare the transaction with simulation results, sign,
            # and submit.
            from stellar_sdk import Keypair as _Keypair

            prepared = self._rpc.prepare_transaction(tx, sim)
            keypair = _Keypair.from_secret(self.secret_key)
            prepared.sign(keypair)

            response = self._rpc.send_transaction(prepared)
            if response.status == SendTransactionStatus.ERROR:
                raise RuntimeError(f"Transaction submission failed: {response.error_result_xdr}")

            # Poll until the transaction is confirmed.
            import time

            for _ in range(30):
                status_resp = self._rpc.get_transaction(response.hash)
                if status_resp.status == "SUCCESS":
                    return TxResult(
                        hash=response.hash,
                        success=True,
                        ledger=getattr(status_resp, "ledger", None),
                    )
                if status_resp.status in ("FAILED", "NOT_FOUND"):
                    raise RuntimeError(
                        f"Transaction {response.hash} ended with status {status_resp.status}"
                    )
                time.sleep(1)

            raise RuntimeError(f"Timed out waiting for transaction {response.hash}")

        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(str(exc)) from exc

    def _fund_from_friendbot(self) -> None:
        """Best-effort testnet funding. An already-funded account is not an error."""
        try:
            import urllib.request

            with urllib.request.urlopen(
                f"{FRIENDBOT_URL}?addr={self.address}", timeout=30
            ) as response:
                if response.status != 200:
                    print("Friendbot funding failed — account may already exist")
        except Exception:  # noqa: BLE001 — funding is optional
            print("Could not reach friendbot")

    def __repr__(self) -> str:
        return f"StellarAgent(address={self.address!r}, network={self._network_config.horizon_url!r})"
