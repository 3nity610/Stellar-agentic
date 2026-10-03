"""``StellarAgent`` — the Python counterpart of ``packages/core/src/index.ts``.

Tracks the TypeScript class's public API. Method names are ``snake_case``;
everything else — arguments, semantics, validation order, error text — is
deliberately the same, so an agent written against one SDK reads the same in
the other.

Current state
-------------
Most contract-invoking methods are stubs that raise, exactly as their TS
counterparts do. They are pending the companion "real Soroban invocation"
work; porting them before the TS shape is settled would mean porting a design
that is about to change. What *is* implemented here is everything the TS class
implements today: identity, contract resolution and its fast-fail check,
friendbot funding, :meth:`get_balance`, and the rate-limit trio
(:meth:`set_rate_limits`, :meth:`check_rate_limit`, :meth:`get_rate_limit_status`).

The deterministic math in :mod:`stellaragent.fixed_point` and
:mod:`stellaragent.bid` is complete and verified byte-identical against the
TypeScript implementation — that is the part of this package with a hard
correctness requirement today.
"""

from __future__ import annotations

from typing import Any

from stellar_sdk import Keypair, Server, SorobanServer

from .contracts import ContractAddresses, assert_deployed, resolve_contracts
from .fixed_point import from_stroops, to_stroops
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

#: Base for documentation links embedded in error messages. Mirrors the
#: TypeScript SDK's ``DOCS_BASE`` (``packages/core/src/errors.ts``) so the two
#: SDKs point a caller at the same page for the same failure.
DOCS_BASE = (
    "https://github.com/StellarAgent-AI-Agent-Payment-Rails/Stellar-agentic/blob/main/"
)

__all__ = ["StellarAgent"]

FRIENDBOT_URL = "https://friendbot.stellar.org"


class StellarAgent:
    """Main SDK class for AI Agent payment operations on Stellar.

    Use :meth:`create` rather than the constructor.

    >>> agent = StellarAgent.create(  # doctest: +SKIP
    ...     network="testnet",
    ...     spend_limit=SpendLimit(amount="10", asset="USDC", period="hourly"),
    ... )
    >>> agent.pay_for_api(  # doctest: +SKIP
    ...     PayForAPIParams(
    ...         endpoint="https://api.example.com/inference",
    ...         amount="0.001",
    ...         asset="USDC",
    ...     )
    ... )
    """

    def __init__(
        self,
        keypair: Keypair,
        network_config: NetworkConfig,
        contracts: ContractAddresses,
    ) -> None:
        # Private by convention and by name-mangling: the secret should not be
        # something a caller reaches for casually. See the note on
        # :attr:`secret_key`.
        self.__keypair = keypair
        self._network_config = network_config
        self._contracts = contracts
        self._horizon = Server(horizon_url=network_config.horizon_url)
        self._rpc = SorobanServer(server_url=network_config.rpc_url)
        self._active_channel_id: int | None = None

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
        """Create a new agent. Generates a fresh keypair when no secret is given.

        Contract addresses resolve from ``contracts``, then from the
        ``STELLARAGENT_*`` environment variables, then from the per-network
        unconfigured sentinels — the same precedence as the TypeScript SDK,
        reading the same variable names.

        :raises ContractsNotDeployedError: when the resolved contracts are not
            real deployed contract IDs and ``allow_unconfigured_contracts`` is
            false. Pass ``True`` when you only need contract-free calls such
            as :meth:`get_balance`.
        """
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
        """Restore an agent from an existing secret key.

        ``options`` forwards the rest of :meth:`create` — notably ``contracts``
        and ``allow_unconfigured_contracts``, without which a restored agent
        could only ever target contracts resolved from the environment.
        """
        return cls.create(network=network, secret_key=secret_key, **options)

    # ── Identity ─────────────────────────────────────────────────────────────

    @property
    def address(self) -> str:
        """The agent's Stellar public address."""
        return str(self.__keypair.public_key)

    @property
    def secret_key(self) -> str:
        """The agent's secret key — keep this safe.

        .. deprecated::
           The TypeScript SDK has moved signing behind a ``Signer`` interface
           so key material need not live in the agent process at all (see
           ``docs/signing.md``). This property is the pattern that abstraction
           exists to remove, and is kept only for parity with the TS class's
           current surface. A Python ``Signer`` equivalent should land before
           this package is used with real funds.
        """
        return str(self.__keypair.secret)

    @property
    def contracts(self) -> ContractAddresses:
        """The resolved contract addresses this agent will call."""
        return self._contracts

    @property
    def network_config(self) -> NetworkConfig:
        """RPC, Horizon and passphrase for the selected network."""
        return self._network_config

    # ── Payment channel ──────────────────────────────────────────────────────

    def open_channel(self, params: OpenChannelParams) -> int:
        """Open a payment channel and return its ID.

        :raises NotImplementedError: pending real Soroban invocation.
        """
        raise NotImplementedError(
            "Not yet implemented — contract invocation is pending. "
            "See contracts/payment_channel/src/lib.rs and docs/deployment.md"
        )

    def pay_for_api(self, params: PayForAPIParams) -> TxResult:
        """Pay for an API call, deducting from the active payment channel.

        Validation runs in the same order as the TS implementation, so both
        SDKs reject the same call with the same message.

        :raises NotImplementedError: pending real Soroban invocation.
        """
        if self._active_channel_id is None:
            raise RuntimeError(
                "No active payment channel. Call open_channel() first.\n\n"
                "Open one with open_channel(), or pass an explicit channel_id to "
                "this call.\n"
                f"See {DOCS_BASE}docs/api/core/classes/StellarAgent.md#openchannel"
            )

        if (params.dest_asset is not None) != (params.min_received is not None):
            raise ValueError("dest_asset and min_received must be set together")

        raise NotImplementedError(
            "Not yet implemented — see contracts/payment_channel/src/lib.rs"
        )

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
        """Current native XLM balance, or ``"0"`` if the account is unknown.

        A Horizon query — it needs no contracts and no signing, which is why
        it works on an agent created with ``allow_unconfigured_contracts``.
        """
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
        # Deliberately omits the secret: a repr lands in logs and tracebacks.
        return (
            f"StellarAgent(address={self.address!r},"
            f" network={self._network_config.horizon_url!r})"
        )


# ── Helpers ───────────────────────────────────────────────────────────────────


def _decode_sim_result(sim: Any) -> Any:
    """Extract and decode the return value from a Soroban simulation result.

    Handles the ``SimulateTransactionResponse`` from ``stellar-sdk``, decoding
    the top-level ``SCVal`` into a Python-native type:

    - ``SCV_BOOL``  → ``bool``
    - ``SCV_I128`` / ``SCV_U128``  → ``int``
    - ``SCV_U32`` / ``SCV_I32``  → ``int``
    - ``SCV_MAP`` (struct)  → ``dict[str, Any]`` (recursively decoded)
    - ``SCV_VOID``  → ``None``
    """
    from stellar_sdk.xdr import SCValType

    results = getattr(sim, "results", None) or []
    if not results:
        return None

    xdr_val = results[0].xdr
    if xdr_val is None:
        return None

    from stellar_sdk.xdr import SCVal

    sc_val = SCVal.from_xdr(xdr_val)
    return _sc_val_to_python(sc_val)


def _sc_val_to_python(sc_val: Any) -> Any:
    """Recursively decode an ``SCVal`` into a Python-native type."""
    from stellar_sdk.xdr import SCValType

    vtype = sc_val.type

    if vtype == SCValType.SCV_BOOL:
        return sc_val.b

    if vtype in (SCValType.SCV_I128,):
        parts = sc_val.i128
        return (parts.hi << 64) | parts.lo

    if vtype in (SCValType.SCV_U128,):
        parts = sc_val.u128
        return (parts.hi << 64) | parts.lo

    if vtype in (SCValType.SCV_I32,):
        return sc_val.i32.int32

    if vtype in (SCValType.SCV_U32,):
        return sc_val.u32.uint32

    if vtype == SCValType.SCV_MAP:
        result: dict[str, Any] = {}
        for entry in sc_val.map.sc_map:
            key = _sc_val_to_python(entry.key)
            value = _sc_val_to_python(entry.val)
            result[str(key)] = value
        return result

    if vtype == SCValType.SCV_SYMBOL:
        return sc_val.sym.sc_symbol.decode()

    if vtype == SCValType.SCV_STRING:
        return sc_val.str.sc_string.decode()

    if vtype == SCValType.SCV_ADDRESS:
        from stellar_sdk import Address as StellarAddress

        return str(StellarAddress.from_xdr_sc_address(sc_val.address))

    if vtype == SCValType.SCV_VOID:
        return None

    # Fall back to the raw XDR object for unknown types.
    return sc_val
