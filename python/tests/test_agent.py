"""Unit tests for :mod:`stellaragent.agent` and :mod:`stellaragent.contracts`.

The contract-invoking methods are stubs pending the companion "real Soroban
invocation" work, so what is asserted here is the surface that *is* live:
identity, contract resolution and its fast-fail check, validation ordering,
and the read-only balance path. The stub methods are pinned to raise, so
implementing them is a deliberate, test-visible change rather than a silent
behaviour switch.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

import pytest
from stellar_sdk import Keypair
from stellar_sdk.exceptions import Ed25519SecretSeedInvalidError

from stellaragent import StellarAgent
from stellaragent.agent import InvocationResult
from stellaragent.contracts import (
    CONTRACT_KEYS,
    UNCONFIGURED_CONTRACTS,
    ContractAddresses,
    ContractsNotDeployedError,
    assert_deployed,
    env_var_names,
    is_deployed_address,
    resolve_contracts,
)
from stellaragent.types import NETWORK_CONFIGS, OpenChannelParams, PayForAPIParams, TxResult

# Same deterministic test keypair the TypeScript suite uses, so both sides
# assert against the same address.
TEST_SECRET = "SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X"
TEST_PUBLIC = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57"

# Structurally valid contract IDs — strkey-encoded from fixed payloads, so they
# carry real checksums. Nothing is deployed at them.
DEPLOYED: dict[str, str] = {
    "agent_wallet_factory": "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
    "payment_channel": "CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ",
    "escrow": "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3",
    "rate_limiter": "CACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAINCW",
    "circuit_breaker": "CACQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQLC2U",
}


@pytest.fixture(autouse=True)
def _clean_env() -> Iterator[None]:
    """Keep STELLARAGENT_* out of the environment unless a test sets it."""
    saved = {k: v for k, v in os.environ.items() if k.startswith("STELLARAGENT_")}
    for key in saved:
        del os.environ[key]
    yield
    for key in [k for k in os.environ if k.startswith("STELLARAGENT_")]:
        del os.environ[key]
    os.environ.update(saved)


def make_agent(**overrides: Any) -> StellarAgent:
    kwargs: dict[str, Any] = {
        "network": "testnet",
        "secret_key": TEST_SECRET,
        "contracts": DEPLOYED,
    }
    kwargs.update(overrides)
    return StellarAgent.create(**kwargs)


# ─── Contract validation ─────────────────────────────────────────────────────


class TestIsDeployedAddress:
    def test_accepts_a_real_contract_id(self) -> None:
        assert is_deployed_address(DEPLOYED["payment_channel"])

    def test_rejects_every_testnet_placeholder(self) -> None:
        for key in CONTRACT_KEYS:
            assert not is_deployed_address(getattr(UNCONFIGURED_CONTRACTS["testnet"], key))

    @pytest.mark.parametrize(
        "value", ["", None, "not-a-contract", TEST_PUBLIC, "   ", DEPLOYED["escrow"].lower()]
    )
    def test_rejects_invalid_values(self, value: Any) -> None:
        assert not is_deployed_address(value)

    def test_rejects_a_single_character_typo(self) -> None:
        # Checksum validation, not pattern matching — this is why.
        typo = DEPLOYED["escrow"][:-1] + "A"
        assert len(typo) == 56
        assert not is_deployed_address(typo)

    def test_rejects_a_truncated_id(self) -> None:
        assert not is_deployed_address(DEPLOYED["escrow"][:55])

    def test_the_shipped_placeholders_are_not_even_the_right_length(self) -> None:
        # A real contract ID is exactly 56 characters; these are 60-61.
        for key in CONTRACT_KEYS:
            assert len(getattr(UNCONFIGURED_CONTRACTS["testnet"], key)) != 56


class TestEnvVarNames:
    def test_matches_the_typescript_names_exactly(self) -> None:
        # One deployment's .env block must configure both SDKs.
        assert env_var_names("testnet", "payment_channel") == (
            "STELLARAGENT_TESTNET_PAYMENT_CHANNEL",
            "STELLARAGENT_PAYMENT_CHANNEL",
        )
        assert env_var_names("local", "agent_wallet_factory")[0] == (
            "STELLARAGENT_LOCAL_AGENT_WALLET_FACTORY"
        )

    def test_every_pair_is_unique(self) -> None:
        names = [env_var_names(n, k)[0] for n in NETWORK_CONFIGS for k in CONTRACT_KEYS]
        assert len(set(names)) == len(names)


class TestResolveContracts:
    def test_falls_back_to_the_sentinels(self) -> None:
        assert resolve_contracts("testnet") == UNCONFIGURED_CONTRACTS["testnet"]

    def test_reads_a_network_scoped_variable(self) -> None:
        os.environ["STELLARAGENT_TESTNET_ESCROW"] = DEPLOYED["escrow"]
        assert resolve_contracts("testnet").escrow == DEPLOYED["escrow"]

    def test_falls_back_to_the_unscoped_variable(self) -> None:
        os.environ["STELLARAGENT_ESCROW"] = DEPLOYED["escrow"]
        assert resolve_contracts("local").escrow == DEPLOYED["escrow"]

    def test_scoped_beats_unscoped(self) -> None:
        os.environ["STELLARAGENT_ESCROW"] = DEPLOYED["payment_channel"]
        os.environ["STELLARAGENT_TESTNET_ESCROW"] = DEPLOYED["escrow"]
        assert resolve_contracts("testnet").escrow == DEPLOYED["escrow"]

    def test_explicit_override_beats_everything(self) -> None:
        os.environ["STELLARAGENT_TESTNET_ESCROW"] = DEPLOYED["payment_channel"]
        resolved = resolve_contracts("testnet", {"escrow": DEPLOYED["escrow"]})
        assert resolved.escrow == DEPLOYED["escrow"]

    def test_keeps_networks_separate(self) -> None:
        os.environ["STELLARAGENT_TESTNET_ESCROW"] = DEPLOYED["escrow"]
        os.environ["STELLARAGENT_LOCAL_ESCROW"] = DEPLOYED["payment_channel"]
        assert resolve_contracts("testnet").escrow == DEPLOYED["escrow"]
        assert resolve_contracts("local").escrow == DEPLOYED["payment_channel"]

    def test_never_raises(self) -> None:
        assert resolve_contracts("mainnet") is not None


class TestAssertDeployed:
    def test_passes_for_a_complete_set(self) -> None:
        assert_deployed("testnet", ContractAddresses(**DEPLOYED))

    def test_rejects_the_placeholders(self) -> None:
        with pytest.raises(ContractsNotDeployedError):
            assert_deployed("testnet", UNCONFIGURED_CONTRACTS["testnet"])

    def test_names_every_missing_contract(self) -> None:
        partial = ContractAddresses(**{**DEPLOYED, "escrow": "", "rate_limiter": ""})
        with pytest.raises(ContractsNotDeployedError) as exc:
            assert_deployed("local", partial)
        assert exc.value.missing == ["escrow", "rate_limiter"]

    def test_message_points_at_the_runbook(self) -> None:
        with pytest.raises(ContractsNotDeployedError, match="docs/deployment.md"):
            assert_deployed("testnet", UNCONFIGURED_CONTRACTS["testnet"])

    def test_message_lists_only_the_missing_env_vars(self) -> None:
        partial = ContractAddresses(**{**DEPLOYED, "escrow": ""})
        with pytest.raises(ContractsNotDeployedError) as exc:
            assert_deployed("testnet", partial)
        assert "STELLARAGENT_TESTNET_ESCROW=" in str(exc.value)
        assert "STELLARAGENT_TESTNET_PAYMENT_CHANNEL=" not in str(exc.value)


# ─── Agent identity ──────────────────────────────────────────────────────────


class TestIdentity:
    def test_derives_the_address_from_the_secret(self) -> None:
        assert make_agent().address == TEST_PUBLIC

    def test_matches_the_typescript_fixture_address(self) -> None:
        # Both SDKs derive the same address from the same seed.
        assert Keypair.from_secret(TEST_SECRET).public_key == TEST_PUBLIC

    def test_generates_a_fresh_keypair_when_no_secret_is_given(self) -> None:
        a = make_agent(network="local", secret_key=None)
        b = make_agent(network="local", secret_key=None)
        assert a.address != b.address
        assert a.address.startswith("G") and len(a.address) == 56

    def test_exposes_the_secret_it_was_given(self) -> None:
        assert make_agent().secret_key == TEST_SECRET

    def test_repr_does_not_leak_the_secret(self) -> None:
        # A repr lands in logs and tracebacks.
        assert TEST_SECRET not in repr(make_agent())
        assert TEST_PUBLIC in repr(make_agent())

    def test_rejects_a_malformed_secret(self) -> None:
        with pytest.raises(Ed25519SecretSeedInvalidError):
            make_agent(secret_key="not-a-secret")

    def test_rejects_an_unknown_network(self) -> None:
        with pytest.raises(ValueError, match="Unknown network"):
            make_agent(network="mars")

    def test_from_secret_restores_the_same_address(self) -> None:
        agent = StellarAgent.from_secret(TEST_SECRET, "local", contracts=DEPLOYED)
        assert agent.address == TEST_PUBLIC

    def test_from_secret_forwards_options(self) -> None:
        # Without the passthrough a restored agent could only reach contracts
        # resolved from the environment.
        agent = StellarAgent.from_secret(TEST_SECRET, "local", contracts=DEPLOYED)
        assert agent.contracts.escrow == DEPLOYED["escrow"]


class TestNetworkSelection:
    @pytest.mark.parametrize(
        ("network", "passphrase"),
        [
            ("testnet", "Test SDF Network ; September 2015"),
            ("mainnet", "Public Global Stellar Network ; September 2015"),
            ("local", "Standalone Network ; February 2017"),
        ],
    )
    def test_selects_the_right_passphrase(self, network: str, passphrase: str) -> None:
        assert make_agent(network=network).network_config.network_passphrase == passphrase

    def test_passphrases_match_the_typescript_config(self) -> None:
        # A mismatch here would make signatures from one SDK invalid for the
        # other's network.
        assert NETWORK_CONFIGS["testnet"].network_passphrase == "Test SDF Network ; September 2015"


# ─── Fast-fail on undeployed contracts ───────────────────────────────────────


class TestDeployedContractsCheck:
    def test_refuses_the_testnet_placeholders(self) -> None:
        with pytest.raises(ContractsNotDeployedError, match='network "testnet"'):
            StellarAgent.create(network="testnet", secret_key=TEST_SECRET)

    @pytest.mark.parametrize("network", ["mainnet", "local"])
    def test_refuses_an_unconfigured_network(self, network: str) -> None:
        with pytest.raises(ContractsNotDeployedError):
            StellarAgent.create(network=network, secret_key=TEST_SECRET)

    def test_rejects_a_partially_configured_set(self) -> None:
        with pytest.raises(ContractsNotDeployedError, match="escrow"):
            StellarAgent.create(
                network="local",
                secret_key=TEST_SECRET,
                contracts={**DEPLOYED, "escrow": ""},
            )

    def test_resolves_from_environment_variables(self) -> None:
        for key, value in DEPLOYED.items():
            os.environ[env_var_names("local", key)[0]] = value
        agent = StellarAgent.create(network="local", secret_key=TEST_SECRET)
        assert agent.contracts == ContractAddresses(**DEPLOYED)

    def test_can_be_bypassed_for_read_only_use(self) -> None:
        agent = StellarAgent.create(
            network="local", secret_key=TEST_SECRET, allow_unconfigured_contracts=True
        )
        assert agent.address == TEST_PUBLIC


# ─── Method behaviour ────────────────────────────────────────────────────────


class TestPayForAPI:
    def test_refuses_with_no_open_channel(self) -> None:
        with pytest.raises(RuntimeError, match="No active payment channel"):
            make_agent().pay_for_api(PayForAPIParams(endpoint="https://x", amount="0.001"))

    def test_the_refusal_says_how_to_fix_it(self) -> None:
        """#374: the message has to carry the remedy, not just the diagnosis."""
        with pytest.raises(RuntimeError) as excinfo:
            make_agent().pay_for_api(PayForAPIParams(endpoint="https://x", amount="0.001"))
        message = str(excinfo.value)
        assert "open_channel()" in message
        assert DOCS_BASE in message
        # Same page the TypeScript SDK points at for NO_ACTIVE_CHANNEL.
        assert message.rstrip().endswith("StellarAgent.md#openchannel")

    def test_checks_the_channel_before_validating_arguments(self) -> None:
        # Same ordering as the TypeScript implementation.
        with pytest.raises(RuntimeError, match="No active payment channel"):
            make_agent().pay_for_api(
                PayForAPIParams(endpoint="https://x", amount="0.001", dest_asset="XLM")
            )

    @pytest.mark.parametrize(
        "params",
        [
            {"dest_asset": "XLM"},
            {"min_received": "0.009"},
        ],
    )
    def test_rejects_a_half_specified_conversion(self, params: dict[str, str]) -> None:
        agent = make_agent()
        agent._active_channel_id = 1
        with pytest.raises(ValueError, match="dest_asset and min_received must be set together"):
            agent.pay_for_api(PayForAPIParams(endpoint="https://x", amount="0.001", **params))

    def test_accepts_both_together_and_invokes_contract(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        agent = make_agent()
        agent._active_channel_id = 1
        monkeypatch.setattr(
            agent,
            "_invoke_contract",
            lambda contract, method, args, read_only=False: InvocationResult(
                value=None, tx=TxResult(hash="tx-hash", success=True, ledger=100)
            ),
        )
        tx = agent.pay_for_api(
            PayForAPIParams(
                endpoint="https://x", amount="0.001", dest_asset="XLM", min_received="0.009"
            )
        )
        assert tx.hash == "tx-hash"
        assert tx.success is True


class TestGetBalance:
    def test_returns_the_native_balance(self, monkeypatch: pytest.MonkeyPatch) -> None:
        agent = make_agent()
        monkeypatch.setattr(
            agent,
            "_horizon",
            _FakeHorizon(
                {
                    "balances": [
                        {"asset_type": "credit_alphanum4", "balance": "250.0"},
                        {"asset_type": "native", "balance": "1234.5670000"},
                    ]
                }
            ),
        )
        assert agent.get_balance() == "1234.5670000"

    def test_returns_zero_with_no_native_entry(self, monkeypatch: pytest.MonkeyPatch) -> None:
        agent = make_agent()
        monkeypatch.setattr(
            agent, "_horizon", _FakeHorizon({"balances": [{"asset_type": "credit_alphanum4"}]})
        )
        assert agent.get_balance() == "0"

    def test_returns_zero_for_a_missing_account(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # An unfunded account is a normal state, not an error.
        agent = make_agent()
        monkeypatch.setattr(agent, "_horizon", _FakeHorizon(None, raises=True))
        assert agent.get_balance() == "0"

    def test_works_without_deployed_contracts(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # It touches no contract, so it must stay usable on an unconfigured
        # network — same property as the TypeScript SDK.
        agent = StellarAgent.create(
            network="local", secret_key=TEST_SECRET, allow_unconfigured_contracts=True
        )
        monkeypatch.setattr(
            agent, "_horizon", _FakeHorizon({"balances": [{"asset_type": "native", "balance": "7"}]})
        )
        assert agent.get_balance() == "7"


class TestUnimplementedSurface:
    """Pin the stubs to raise, so implementing them is a visible change."""

    @pytest.mark.parametrize(
        "call",
        [
            lambda a: a.request_work(None),
            lambda a: a.accept_job(1),
            lambda a: a.submit_result(1, "r"),
            lambda a: a.release_payment(1),
            lambda a: a.get_spend_report(),
            lambda a: a.get_channel(1),
            lambda a: a.get_job(1),
        ],
    )
    def test_raises_not_implemented(self, call: Any) -> None:
        with pytest.raises(NotImplementedError):
            call(make_agent())

    def test_open_channel_invokes_contract(self, monkeypatch: pytest.MonkeyPatch) -> None:
        agent = make_agent()
        calls: list[tuple[str, str, Any]] = []
        monkeypatch.setattr(
            agent,
            "_invoke_contract",
            lambda contract, method, args, read_only=False: (
                calls.append((contract, method, args)),
                InvocationResult(value=42, tx=TxResult(hash="tx-hash", success=True, ledger=100)),
            )[1],
        )
        channel_id = agent.open_channel(
            OpenChannelParams(deposit="10", limit_per_period="1", period="hourly")
        )
        assert channel_id == 42
        assert agent.active_channel_id == 42
        assert calls[0][1] == "open_channel"


# ─── Rate limit validation ────────────────────────────────────────────────────


class TestSetRateLimitsValidation:
    """Validation runs before any RPC call — no network needed."""

    from stellaragent.types import RateLimitConfig as _RLC

    def test_rejects_zero_max_per_tx(self) -> None:
        from stellaragent.types import RateLimitConfig

        with pytest.raises(ValueError, match="max_per_tx"):
            make_agent().set_rate_limits(
                RateLimitConfig(max_per_tx="0", max_per_hour="1", max_per_day="2", max_txs_per_hour=5)
            )

    def test_rejects_zero_max_per_hour(self) -> None:
        from stellaragent.types import RateLimitConfig

        with pytest.raises(ValueError, match="max_per_hour"):
            make_agent().set_rate_limits(
                RateLimitConfig(max_per_tx="1", max_per_hour="0", max_per_day="2", max_txs_per_hour=5)
            )

    def test_rejects_zero_max_per_day(self) -> None:
        from stellaragent.types import RateLimitConfig

        with pytest.raises(ValueError, match="max_per_day"):
            make_agent().set_rate_limits(
                RateLimitConfig(max_per_tx="1", max_per_hour="1", max_per_day="0", max_txs_per_hour=5)
            )

    def test_rejects_zero_max_txs_per_hour(self) -> None:
        from stellaragent.types import RateLimitConfig

        with pytest.raises(ValueError, match="max_txs_per_hour"):
            make_agent().set_rate_limits(
                RateLimitConfig(max_per_tx="1", max_per_hour="1", max_per_day="2", max_txs_per_hour=0)
            )

    def test_rejects_per_tx_exceeding_per_hour(self) -> None:
        from stellaragent.types import RateLimitConfig

        with pytest.raises(ValueError, match="max_per_tx cannot exceed max_per_hour"):
            make_agent().set_rate_limits(
                RateLimitConfig(max_per_tx="10", max_per_hour="5", max_per_day="20", max_txs_per_hour=5)
            )

    def test_rejects_per_hour_exceeding_per_day(self) -> None:
        from stellaragent.types import RateLimitConfig

        with pytest.raises(ValueError, match="max_per_hour cannot exceed max_per_day"):
            make_agent().set_rate_limits(
                RateLimitConfig(max_per_tx="1", max_per_hour="20", max_per_day="10", max_txs_per_hour=5)
            )

    def test_validation_matches_typescript_ordering(self) -> None:
        """per_tx > per_hour check fires before per_hour > per_day check."""
        from stellaragent.types import RateLimitConfig

        # Both constraints violated — TS rejects per_tx > per_hour first.
        with pytest.raises(ValueError, match="max_per_tx cannot exceed max_per_hour"):
            make_agent().set_rate_limits(
                RateLimitConfig(
                    max_per_tx="100", max_per_hour="50", max_per_day="30", max_txs_per_hour=5
                )
            )


class TestCheckRateLimitValidation:
    def test_rejects_zero_amount(self) -> None:
        with pytest.raises(ValueError, match="amount must be positive"):
            make_agent().check_rate_limit("0")

    def test_rejects_negative_amount(self) -> None:
        with pytest.raises(ValueError, match="amount must be positive"):
            make_agent().check_rate_limit("-1")


# ─── Rate limit RPC (mocked) ─────────────────────────────────────────────────


class TestSetRateLimitsRpc:
    """``set_rate_limits`` calls _invoke_contract with the right arguments."""

    def test_calls_invoke_contract_with_correct_args(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from stellaragent.types import RateLimitConfig

        captured: dict[str, Any] = {}

        def fake_invoke(
            self_: Any,
            contract_id: str,
            method: str,
            args: list[Any],
            *,
            read_only: bool,
        ) -> Any:
            captured["contract_id"] = contract_id
            captured["method"] = method
            captured["args"] = args
            captured["read_only"] = read_only
            return TxResult(hash="abc123", success=True, ledger=100)

        from stellaragent import StellarAgent as _SA

        monkeypatch.setattr(_SA, "_invoke_contract", fake_invoke)

        agent = make_agent()
        config = RateLimitConfig(
            max_per_tx="1.0",
            max_per_hour="5.0",
            max_per_day="20.0",
            max_txs_per_hour=10,
        )
        result = agent.set_rate_limits(config)

        assert result.hash == "abc123"
        assert result.success is True
        assert captured["contract_id"] == DEPLOYED["rate_limiter"]
        assert captured["method"] == "set_limits"
        assert captured["read_only"] is False
        # First two args are owner and agent — both the agent address.
        assert captured["args"][0] == agent.address
        assert captured["args"][1] == agent.address
        # Amounts are converted to stroops (×10_000_000).
        assert captured["args"][2] == 10_000_000       # 1.0 XLM
        assert captured["args"][3] == 50_000_000       # 5.0 XLM
        assert captured["args"][4] == 200_000_000      # 20.0 XLM
        assert captured["args"][5] == 10               # max_txs_per_hour


class TestCheckRateLimitRpc:
    """``check_rate_limit`` delegates to _invoke_contract and returns a bool."""

    def _patch_invoke(self, monkeypatch: pytest.MonkeyPatch, return_value: Any) -> dict[str, Any]:
        captured: dict[str, Any] = {}

        def fake_invoke(
            self_: Any,
            contract_id: str,
            method: str,
            args: list[Any],
            *,
            read_only: bool,
        ) -> Any:
            captured["contract_id"] = contract_id
            captured["method"] = method
            captured["args"] = args
            captured["read_only"] = read_only
            return return_value

        from stellaragent import StellarAgent as _SA

        monkeypatch.setattr(_SA, "_invoke_contract", fake_invoke)
        return captured

    def test_returns_true_when_contract_allows(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._patch_invoke(monkeypatch, True)
        assert make_agent().check_rate_limit("0.5") is True

    def test_returns_false_when_contract_blocks(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._patch_invoke(monkeypatch, False)
        assert make_agent().check_rate_limit("0.5") is False

    def test_passes_correct_args_to_contract(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured = self._patch_invoke(monkeypatch, True)
        agent = make_agent()
        agent.check_rate_limit("2.5")

        assert captured["contract_id"] == DEPLOYED["rate_limiter"]
        assert captured["method"] == "check"
        assert captured["read_only"] is True
        assert captured["args"][0] == agent.address
        assert captured["args"][1] == 25_000_000  # 2.5 × 10_000_000

    def test_returns_true_for_unconfigured_agent(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The contract returns true when no limits are set.
        self._patch_invoke(monkeypatch, True)
        assert make_agent().check_rate_limit("1") is True


class TestGetRateLimitStatusRpc:
    """``get_rate_limit_status`` decodes the contract struct into a typed dataclass."""

    def _make_raw_limit(self, **overrides: Any) -> dict[str, Any]:
        """A minimal raw struct as returned by _invoke_contract for get_limits."""
        base: dict[str, Any] = {
            "active": True,
            "agent": TEST_PUBLIC,
            "owner": TEST_PUBLIC,
            "max_per_tx": 10_000_000,
            "max_per_hour": 50_000_000,
            "max_per_day": 200_000_000,
            "max_txs_per_hour": 10,
            "hourly_spend": 5_000_000,
            "daily_spend": 15_000_000,
            "hourly_tx_count": 3,
            "hour_window_start": 1234,
            "day_window_start": 1000,
        }
        base.update(overrides)
        return base

    def test_decodes_all_fields_correctly(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from stellaragent import StellarAgent as _SA

        raw = self._make_raw_limit()
        monkeypatch.setattr(
            _SA,
            "_invoke_contract",
            lambda self_, cid, method, args, *, read_only: raw,
        )

        status = make_agent().get_rate_limit_status()

        assert status.configured is True
        assert status.active is True
        assert status.max_per_tx == "1.0000000"
        assert status.max_per_hour == "5.0000000"
        assert status.max_per_day == "20.0000000"
        assert status.max_txs_per_hour == 10
        assert status.spent_this_hour == "0.5000000"
        assert status.spent_today == "1.5000000"
        assert status.txs_this_hour == 3
        assert status.hour_window_start_ledger == 1234
        assert status.day_window_start_ledger == 1000

    def test_returns_unconfigured_sentinel_when_no_limits_set(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The contract panics → Python maps it to configured=False."""
        from stellaragent import StellarAgent as _SA
        from stellaragent.types import UNCONFIGURED_RATE_LIMIT

        def fake_invoke(
            self_: Any,
            contract_id: str,
            method: str,
            args: list[Any],
            *,
            read_only: bool,
        ) -> Any:
            raise RuntimeError("HostError: no rate limit for agent")

        monkeypatch.setattr(_SA, "_invoke_contract", fake_invoke)

        status = make_agent().get_rate_limit_status()

        assert status == UNCONFIGURED_RATE_LIMIT
        assert status.configured is False

    def test_re_raises_other_rpc_errors(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from stellaragent import StellarAgent as _SA

        def fake_invoke(
            self_: Any,
            contract_id: str,
            method: str,
            args: list[Any],
            *,
            read_only: bool,
        ) -> Any:
            raise RuntimeError("Connection refused")

        monkeypatch.setattr(_SA, "_invoke_contract", fake_invoke)

        with pytest.raises(RuntimeError, match="Connection refused"):
            make_agent().get_rate_limit_status()

    def test_defaults_to_own_address(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from stellaragent import StellarAgent as _SA

        captured: dict[str, Any] = {}

        def fake_invoke(
            self_: Any,
            contract_id: str,
            method: str,
            args: list[Any],
            *,
            read_only: bool,
        ) -> Any:
            captured["args"] = args
            return {
                "active": True,
                "agent": args[0],
                "owner": args[0],
                "max_per_tx": 10_000_000,
                "max_per_hour": 50_000_000,
                "max_per_day": 200_000_000,
                "max_txs_per_hour": 5,
                "hourly_spend": 0,
                "daily_spend": 0,
                "hourly_tx_count": 0,
                "hour_window_start": 0,
                "day_window_start": 0,
            }

        monkeypatch.setattr(_SA, "_invoke_contract", fake_invoke)
        agent = make_agent()
        agent.get_rate_limit_status()

        assert captured["args"][0] == agent.address

    def test_can_query_a_different_agent_address(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from stellaragent import StellarAgent as _SA

        other = "GABCABCABCABCABCABCABCABCABCABCABCABCABCABCABCABCABCABCS"
        captured: dict[str, Any] = {}

        def fake_invoke(
            self_: Any,
            contract_id: str,
            method: str,
            args: list[Any],
            *,
            read_only: bool,
        ) -> Any:
            captured["args"] = args
            return {
                "active": False,
                "agent": args[0],
                "owner": args[0],
                "max_per_tx": 1_000_000,
                "max_per_hour": 5_000_000,
                "max_per_day": 20_000_000,
                "max_txs_per_hour": 3,
                "hourly_spend": 0,
                "daily_spend": 0,
                "hourly_tx_count": 0,
                "hour_window_start": 500,
                "day_window_start": 400,
            }

        monkeypatch.setattr(_SA, "_invoke_contract", fake_invoke)

        status = make_agent().get_rate_limit_status(other)

        assert captured["args"][0] == other
        assert status.active is False

    def test_unconfigured_rate_limit_sentinel_matches_typescript_shape(self) -> None:
        """The Python sentinel must be field-for-field equivalent to the TS one."""
        from stellaragent.types import UNCONFIGURED_RATE_LIMIT

        assert UNCONFIGURED_RATE_LIMIT.configured is False
        assert UNCONFIGURED_RATE_LIMIT.active is True
        assert UNCONFIGURED_RATE_LIMIT.max_per_tx == "0"
        assert UNCONFIGURED_RATE_LIMIT.max_per_hour == "0"
        assert UNCONFIGURED_RATE_LIMIT.max_per_day == "0"
        assert UNCONFIGURED_RATE_LIMIT.max_txs_per_hour == 0
        assert UNCONFIGURED_RATE_LIMIT.spent_this_hour == "0"
        assert UNCONFIGURED_RATE_LIMIT.spent_today == "0"
        assert UNCONFIGURED_RATE_LIMIT.txs_this_hour == 0
        assert UNCONFIGURED_RATE_LIMIT.hour_window_start_ledger == 0
        assert UNCONFIGURED_RATE_LIMIT.day_window_start_ledger == 0


# ─── Helpers ─────────────────────────────────────────────────────────────────


class _FakeHorizon:
    """Minimal stand-in for ``stellar_sdk.Server``'s account query chain."""

    def __init__(self, payload: Any, raises: bool = False) -> None:
        self._payload = payload
        self._raises = raises

    def accounts(self) -> _FakeHorizon:
        return self

    def account_id(self, _address: str) -> _FakeHorizon:
        return self

    def call(self) -> Any:
        if self._raises:
            raise RuntimeError("404 Not Found")
        return self._payload
