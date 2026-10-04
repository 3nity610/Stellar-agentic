"""Unit tests for the shared Soroban invocation pipeline.

Mirrors packages/core/src/__tests__/soroban-invocation.test.ts.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import Mock

import pytest
from stellar_sdk import (
    Account,
    Address,
    SorobanDataBuilder,
    scval,
    xdr,
)

from stellaragent import (
    StellarAgent,
    StellarAgentError,
)
from stellaragent.types import OpenChannelParams, PayForAPIParams

TEST_SECRET = "SADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP54X"
TEST_PUBLIC = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57"
DEPLOYED: dict[str, str] = {
    "agent_wallet_factory": "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
    "payment_channel": "CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ",
    "escrow": "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3",
    "rate_limiter": "CACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAINCW",
    "circuit_breaker": "CACQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQKBIFAUCQLC2U",
}


def address_auth_entry() -> xdr.SorobanAuthorizationEntry:
    invoke_args = xdr.InvokeContractArgs(
        contract_address=Address(DEPLOYED["payment_channel"]).to_xdr_sc_address(),
        function_name=xdr.SCSymbol(b"open_channel"),
        args=[],
    )
    return xdr.SorobanAuthorizationEntry(
        credentials=xdr.SorobanCredentials(
            type=xdr.SorobanCredentialsType.SOROBAN_CREDENTIALS_ADDRESS,
            address=xdr.SorobanAddressCredentials(
                address=Address(TEST_PUBLIC).to_xdr_sc_address(),
                nonce=xdr.Int64(1),
                signature_expiration_ledger=xdr.Uint32(0),
                signature=xdr.SCVal(type=xdr.SCValType.SCV_VOID),
            ),
        ),
        root_invocation=xdr.SorobanAuthorizedInvocation(
            function=xdr.SorobanAuthorizedFunction(
                type=xdr.SorobanAuthorizedFunctionType.SOROBAN_AUTHORIZED_FUNCTION_TYPE_CONTRACT_FN,
                contract_fn=invoke_args,
            ),
            sub_invocations=[],
        ),
    )


def simulation(
    retval: xdr.SCVal, auth: list[xdr.SorobanAuthorizationEntry] | None = None
) -> dict[str, Any]:
    return {
        "id": "simulation",
        "latestLedger": 100,
        "events": [],
        "_parsed": True,
        "transactionData": SorobanDataBuilder(),
        "minResourceFee": 0,
        "cost": {"cpuInsns": "0", "memBytes": "0"},
        "result": {"auth": auth or [], "retval": retval},
    }


def agent_with_rpc(rpc: Any) -> StellarAgent:
    agent = StellarAgent.create(
        network="testnet",
        secret_key=TEST_SECRET,
        contracts=DEPLOYED,
    )
    agent.rpc = rpc
    agent._poll_interval = 0.001
    return agent


class TestSorobanInvocationPipeline:
    def test_simulates_signs_auth_and_envelope_submits_polls_and_tracks_channel(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        auth = address_auth_entry()
        rpc = Mock()
        rpc.getAccount = Mock(return_value=Account(TEST_PUBLIC, "1"))
        rpc.load_account = rpc.getAccount
        rpc.simulateTransaction = Mock(
            return_value=simulation(scval.to_uint64(7), [auth])
        )
        rpc.simulate_transaction = rpc.simulateTransaction
        rpc.sendTransaction = Mock(return_value={"status": "PENDING", "hash": "tx-hash"})
        rpc.send_transaction = rpc.sendTransaction
        rpc.getTransaction = Mock(
            return_value={
                "status": "SUCCESS",
                "ledger": 123,
                "returnValue": scval.to_uint64(7),
            }
        )
        rpc.get_transaction = rpc.getTransaction

        agent = agent_with_rpc(rpc)

        auth_spy = Mock(wraps=agent.sign_auth_entry)
        monkeypatch.setattr(agent, "sign_auth_entry", auth_spy)
        tx_spy = Mock(wraps=agent.sign_transaction)
        monkeypatch.setattr(agent, "sign_transaction", tx_spy)

        channel_id = agent.open_channel(
            OpenChannelParams(
                deposit="10",
                limit_per_period="1",
                period="hourly",
            )
        )
        assert channel_id == 7
        assert agent.active_channel_id == 7

        assert rpc.simulateTransaction.call_count == 1
        simulated_tx = rpc.simulateTransaction.call_args[0][0]

        # Verify operations and args structure mirroring TS test
        invoke_args = simulated_tx.operations[0].func.invokeContract().args()
        arg_types = [arg.type.name for arg in invoke_args]
        assert arg_types == [
            "SCV_ADDRESS",
            "SCV_ADDRESS",
            "SCV_ADDRESS",
            "SCV_I128",
            "SCV_I128",
            "SCV_VEC",
        ]
        assert scval.to_native(invoke_args[3]) == 100_000_000
        assert scval.to_native(invoke_args[4]) == 10_000_000
        assert scval.to_native(invoke_args[5]) == ["Hourly"]

        auth_spy.assert_called_once()
        call_args = auth_spy.call_args
        assert call_args[0][1] == 200  # validUntilLedgerSeq = 100 + 100

        tx_spy.assert_called_once()
        assert rpc.sendTransaction.call_count == 1
        rpc.getTransaction.assert_called_with("tx-hash")

    def test_uses_simulation_only_execution_for_reads_and_decodes_result(self) -> None:
        rpc = Mock()
        rpc.getAccount = Mock(return_value=Account(TEST_PUBLIC, "1"))
        rpc.load_account = rpc.getAccount
        rpc.simulateTransaction = Mock(return_value=simulation(scval.to_bool(False)))
        rpc.simulate_transaction = rpc.simulateTransaction
        rpc.sendTransaction = Mock()
        rpc.send_transaction = rpc.sendTransaction
        rpc.getTransaction = Mock()
        rpc.get_transaction = rpc.getTransaction

        agent = agent_with_rpc(rpc)
        res = agent._invoke_contract(
            DEPLOYED["rate_limiter"],
            "check",
            [
                Address(TEST_PUBLIC).to_xdr_sc_val(),
                scval.to_int128(12_500_000),
            ],
            read_only=True,
        )
        assert res.value is False
        assert rpc.simulateTransaction.call_count == 1
        assert rpc.sendTransaction.call_count == 0

    def test_maps_contract_panics_to_a_stable_machine_readable_code(self) -> None:
        rpc = Mock()
        rpc.getAccount = Mock(return_value=Account(TEST_PUBLIC, "1"))
        rpc.load_account = rpc.getAccount
        rpc.simulateTransaction = Mock(
            return_value={
                "id": "simulation",
                "latestLedger": 100,
                "events": [],
                "_parsed": True,
                "error": "contract panic: spend limit exceeded for this period",
            }
        )
        rpc.simulate_transaction = rpc.simulateTransaction

        agent = agent_with_rpc(rpc)
        agent.active_channel_id = 1

        with pytest.raises(StellarAgentError) as exc_info:
            agent.pay_for_api(
                PayForAPIParams(
                    endpoint="https://api.example.com",
                    amount="2",
                )
            )
        assert exc_info.value.code == "SPEND_LIMIT_EXCEEDED"

    def test_wraps_rpc_transport_failures_without_misclassifying_them_as_contract_panics(
        self,
    ) -> None:
        rpc_error = ConnectionError("connection refused")
        rpc = Mock()
        rpc.getAccount = Mock(side_effect=rpc_error)
        rpc.load_account = rpc.getAccount

        agent = agent_with_rpc(rpc)

        with pytest.raises(StellarAgentError) as exc_info:
            agent.open_channel(
                OpenChannelParams(
                    deposit="10",
                    limit_per_period="1",
                    period="hourly",
                )
            )
        assert exc_info.value.code == "NETWORK_ERROR"
        assert exc_info.value.cause is rpc_error

    def test_pay_for_api_submits_and_returns_tx_result(self) -> None:
        rpc = Mock()
        rpc.getAccount = Mock(return_value=Account(TEST_PUBLIC, "1"))
        rpc.load_account = rpc.getAccount
        rpc.simulateTransaction = Mock(
            return_value=simulation(scval.to_void())
        )
        rpc.simulate_transaction = rpc.simulateTransaction
        rpc.sendTransaction = Mock(return_value={"status": "PENDING", "hash": "pay-hash"})
        rpc.send_transaction = rpc.sendTransaction
        rpc.getTransaction = Mock(
            return_value={
                "status": "SUCCESS",
                "ledger": 150,
            }
        )
        rpc.get_transaction = rpc.getTransaction

        agent = agent_with_rpc(rpc)
        agent.active_channel_id = 1

        tx = agent.pay_for_api(
            PayForAPIParams(
                endpoint="https://api.example.com/v1",
                amount="0.5",
            )
        )
        assert tx.hash == "pay-hash"
        assert tx.success is True
        assert tx.ledger == 150

        simulated_tx = rpc.simulateTransaction.call_args[0][0]
        invoke_args = simulated_tx.operations[0].func.invokeContract().args()
        assert simulated_tx.transaction.operations[0].host_function.invoke_contract.function_name.sc_symbol == b"pay"
        assert scval.to_native(invoke_args[3]) == 5_000_000  # 0.5 XLM in stroops

    def test_pay_for_api_with_conversion(self) -> None:
        rpc = Mock()
        rpc.getAccount = Mock(return_value=Account(TEST_PUBLIC, "1"))
        rpc.load_account = rpc.getAccount
        rpc.simulateTransaction = Mock(
            return_value=simulation(scval.to_void())
        )
        rpc.simulate_transaction = rpc.simulateTransaction
        rpc.sendTransaction = Mock(return_value={"status": "PENDING", "hash": "conv-hash"})
        rpc.send_transaction = rpc.sendTransaction
        rpc.getTransaction = Mock(
            return_value={
                "status": "SUCCESS",
                "ledger": 151,
            }
        )
        rpc.get_transaction = rpc.getTransaction

        agent = agent_with_rpc(rpc)
        agent.active_channel_id = 2

        tx = agent.pay_for_api(
            PayForAPIParams(
                endpoint="https://api.example.com/v1",
                amount="1.0",
                dest_asset=DEPLOYED["escrow"],
                min_received="0.9",
            )
        )
        assert tx.hash == "conv-hash"
        assert tx.success is True
        assert tx.ledger == 151

        simulated_tx = rpc.simulateTransaction.call_args[0][0]
        assert simulated_tx.transaction.operations[0].host_function.invoke_contract.function_name.sc_symbol == b"pay_with_conversion"

    @pytest.mark.parametrize(
        ("message", "expected_code"),
        [
            ("spend limit exceeded", "SPEND_LIMIT_EXCEEDED"),
            ("channel not found", "CHANNEL_NOT_FOUND"),
            ("channel is closed", "CHANNEL_CLOSED"),
            ("job not found", "JOB_NOT_FOUND"),
            ("job is not open", "JOB_NOT_OPEN"),
            ("job has expired", "JOB_EXPIRED"),
            ("not authorized", "NOT_AUTHORIZED"),
            ("no rate limit", "RATE_LIMIT_NOT_FOUND"),
            ("deposit amount must be positive", "INVALID_ARGUMENT"),
        ],
    )
    def test_panic_mappings(self, message: str, expected_code: str) -> None:
        rpc = Mock()
        rpc.getAccount = Mock(return_value=Account(TEST_PUBLIC, "1"))
        rpc.load_account = rpc.getAccount
        rpc.simulateTransaction = Mock(
            return_value={
                "id": "simulation",
                "latestLedger": 100,
                "events": [],
                "error": f"contract panic: {message}",
            }
        )
        rpc.simulate_transaction = rpc.simulateTransaction

        agent = agent_with_rpc(rpc)
        agent.active_channel_id = 1

        with pytest.raises(StellarAgentError) as exc_info:
            agent.pay_for_api(PayForAPIParams(endpoint="https://x", amount="1"))
        assert exc_info.value.code == expected_code

    def test_transaction_failure_maps_to_transaction_failed(self) -> None:
        rpc = Mock()
        rpc.getAccount = Mock(return_value=Account(TEST_PUBLIC, "1"))
        rpc.load_account = rpc.getAccount
        rpc.simulateTransaction = Mock(return_value=simulation(scval.to_void()))
        rpc.simulate_transaction = rpc.simulateTransaction
        rpc.sendTransaction = Mock(return_value={"status": "PENDING", "hash": "fail-hash"})
        rpc.send_transaction = rpc.sendTransaction
        rpc.getTransaction = Mock(return_value={"status": "FAILED"})
        rpc.get_transaction = rpc.getTransaction

        agent = agent_with_rpc(rpc)
        agent.active_channel_id = 1

        with pytest.raises(StellarAgentError) as exc_info:
            agent.pay_for_api(PayForAPIParams(endpoint="https://x", amount="1"))
        assert exc_info.value.code == "TRANSACTION_FAILED"
        assert exc_info.value.transaction_hash == "fail-hash"
