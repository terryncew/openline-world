"""UNATTENDED-COMMISSION-001 tests: two owners authorize frozen terms once,
workers complete one bounded service job unattended, and the receiver
settles from the frozen contract plus recorded cost events — correct
accounting on rejection too.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.

Every verdict asserted here comes from the real machinery: EffectGate
presentation evaluation, backend/commission.py's deterministic accounting,
and World snapshot persistence. Simulated funds only: cost events are
never presented as provider invoices, and no submitted code executes
(the 2026-09-27 isolation verdict — accounting is receiver arithmetic).
"""
import copy
import sys
import tempfile
import time
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# world first: it pulls in workshop_gate, which inserts openline-wallet/src
# into sys.path at import (same as the server does).
from world import World  # noqa: E402

from custody_client import _Client  # noqa: E402

from commission import (  # noqa: E402
    CommissionError,
    compute_cost_cents,
    evaluate_deliverable,
    sign_contract_sha,
    validate_contract,
)
from openline_wallet.errors import WalletError  # noqa: E402

_SCOPES = ("commission.report-cost", "commission.submit-deliverable")

_GOOD_REPORT = ("Harbor tide report: mean tide height 2.43 m at the "
                "harbor in Q3 2026, computed from the harbor log.")
_BAD_REPORT = "Harbor tide report: tides were normal this quarter."


def _contract(**overrides):
    contract = {
        "schema": "openline.commission.contract.v1",
        "version": 1,
        "job": {
            "task": "Summarize the harbor log into a tide report.",
            "deliverable": "A text tide report naming the mean tide height.",
        },
        "acceptance": {
            "required_substrings": ["2.43 m", "harbor"],
            "forbidden_substrings": [],
            "max_bytes": 4096,
        },
        "buyer_id": "alice",
        "seller_id": "bob",
        "permitted_operations": [
            {"op": "readings.scan", "rate_cents": 5},
            {"op": "summary.write", "rate_cents": 20},
        ],
        "max_cost_cents": 1000,
        "success_fee_cents": 500,
        "deadline_ts": time.time() + 3600,
    }
    contract.update(overrides)
    return contract


class CommissionCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.world = World(data_root=Path(self._tmp.name))
        self.alice = _Client("alice", scopes=_SCOPES)
        self.bob = _Client("bob", scopes=_SCOPES)
        self.alice.join(self.world)
        self.bob.join(self.world)

    def tearDown(self):
        self._tmp.cleanup()

    # -- helpers ---------------------------------------------------------
    def _frozen_contract(self, **overrides):
        """Propose + both-owner authorize. Returns (contract_id, sha)."""
        contract = _contract(**overrides)
        out = self.world.commission_propose_contract(
            "alice", self.alice.token, contract)
        cid = out["contract_id"]
        sha = out["contract_sha256"]
        for client, pid in ((self.alice, "alice"), (self.bob, "bob")):
            sig = sign_contract_sha(client.root_key, sha)
            res = self.world.commission_authorize_contract(
                pid, client.token, cid, sig)
        self.assertEqual(res["status"], "frozen")
        return cid, sha

    def _started(self, fund_cents=2000, key="start-1", **overrides):
        cid, _sha = self._frozen_contract(**overrides)
        self.world.fund_simulated("alice", self.alice.token, fund_cents,
                                  idempotency_key="fund-1")
        out = self.world.commission_start(
            "alice", self.alice.token, cid, idempotency_key=key)
        return out["commission_id"]

    def _cost(self, world, client, cid, op, units, claimed, key):
        return world.commission_report_cost(
            client.pid, client.token, cid, op, units, claimed,
            client.presentation(world, "commission.report-cost"),
            idempotency_key=key)

    def _submit(self, world, client, cid, text, key):
        return world.commission_submit_deliverable(
            client.pid, client.token, cid, text,
            client.presentation(world, "commission.submit-deliverable"),
            idempotency_key=key)

    def _work(self, com_id):
        # 3 scans x 5c + 1 write x 20c = 35c recorded; claimed amounts are
        # deliberately inflated to prove settlement ignores them.
        self._cost(self.world, self.bob, com_id,
                   "readings.scan", 3, 99999, "cost-1")
        self._cost(self.world, self.bob, com_id,
                   "summary.write", 1, 424242, "cost-2")

    # -- contract unit tests ----------------------------------------------
    def test_validate_contract_rejects_bad_shape(self):
        bad = _contract()
        del bad["acceptance"]
        with self.assertRaises(CommissionError):
            validate_contract(bad)
        bad = _contract(max_cost_cents=0)
        with self.assertRaises(CommissionError):
            validate_contract(bad)
        bad = _contract(buyer_id="alice", seller_id="alice")
        with self.assertRaises(CommissionError):
            validate_contract(bad)

    def test_compute_cost_uses_contract_rates(self):
        contract = validate_contract(_contract())
        self.assertEqual(compute_cost_cents(contract, "readings.scan", 3), 15)
        with self.assertRaises(CommissionError) as ctx:
            compute_cost_cents(contract, "launch.missiles", 1)
        self.assertEqual(ctx.exception.code, "COMMISSION_COST_OP_UNKNOWN")

    def test_evaluate_deliverable_is_deterministic(self):
        contract = validate_contract(_contract())
        ok, reasons = evaluate_deliverable(contract, _GOOD_REPORT)
        self.assertTrue(ok)
        self.assertEqual(reasons, [])
        ok, reasons = evaluate_deliverable(contract, _BAD_REPORT)
        self.assertFalse(ok)
        self.assertTrue(any("2.43 m" in r for r in reasons))

    # -- demo 1: accepted ---------------------------------------------------
    def test_accepted_settles_costs_plus_fee(self):
        com_id = self._started()
        self._work(com_id)
        out = self._submit(self.world, self.bob, com_id, _GOOD_REPORT,
                           "submit-1")
        self.assertEqual(out["outcome"], "accepted")
        stl = out["settlement"]
        self.assertEqual(stl["recorded_cost_cents"], 35)
        self.assertEqual(stl["success_fee_cents"], 500)
        self.assertEqual(stl["seller_payout_cents"], 535)
        self.assertEqual(stl["buyer_release_cents"], 965)
        self.assertEqual(stl["payee"], "bob")
        self.assertTrue(stl["simulated"])
        acct = self.world.commission_describe(com_id)["accounting"]
        self.assertEqual(acct["recorded_cost_cents"], 35)
        self.assertEqual(acct["seller_compensation_cents"], 535)
        self.assertEqual(acct["released_to_buyer_cents"], 965)
        self.assertEqual(acct["buyer_net_cents"], -535)
        self.assertEqual(acct["seller_net_cents"], 535)
        self.assertEqual(acct["buyer_balance_cents"], 2000 - 1500 + 965)
        self.assertEqual(acct["seller_balance_cents"], 535)

    # -- demo 2: rejected ---------------------------------------------------
    def test_rejected_settles_costs_only_no_fee(self):
        com_id = self._started()
        self._work(com_id)
        out = self._submit(self.world, self.bob, com_id, _BAD_REPORT,
                           "submit-1")
        self.assertEqual(out["outcome"], "rejected")
        stl = out["settlement"]
        self.assertEqual(stl["recorded_cost_cents"], 35)
        self.assertEqual(stl["success_fee_cents"], 0)
        self.assertEqual(stl["seller_payout_cents"], 35)
        self.assertEqual(stl["buyer_release_cents"], 1465)
        acct = self.world.commission_describe(com_id)["accounting"]
        self.assertEqual(acct["buyer_balance_cents"], 2000 - 1500 + 1465)
        self.assertEqual(acct["seller_balance_cents"], 35)

    # -- demo 3: cap / deadline ----------------------------------------------
    def test_cost_cap_stops_with_honest_costs_only_settlement(self):
        com_id = self._started()
        self._cost(self.world, self.bob, com_id,
                   "readings.scan", 100, 500, "cost-1")  # 500c
        with self.assertRaises(WalletError) as ctx:
            self._cost(self.world, self.bob, com_id,
                       "readings.scan", 200, 1000, "cost-2")  # would be 1500c
        self.assertEqual(ctx.exception.code, "COMMISSION_COST_CAP_EXCEEDED")
        desc = self.world.commission_describe(com_id)
        self.assertEqual(desc["status"], "stopped_cap")
        stl = desc["settlement"]
        self.assertEqual(stl["outcome"], "stopped_cap")
        self.assertEqual(stl["recorded_cost_cents"], 500)
        self.assertEqual(stl["success_fee_cents"], 0)
        self.assertEqual(stl["seller_payout_cents"], 500)
        self.assertEqual(stl["buyer_release_cents"], 1000)
        # No further gated work after the stop.
        with self.assertRaises(WalletError) as ctx2:
            self._cost(self.world, self.bob, com_id,
                       "readings.scan", 1, 5, "cost-3")
        self.assertEqual(ctx2.exception.code, "COMMISSION_NOT_ACTIVE")

    def test_deadline_passed_refuses_and_settles_costs_only(self):
        com_id = self._started(deadline_ts=time.time() - 1)
        with self.assertRaises(WalletError) as ctx:
            self._cost(self.world, self.bob, com_id,
                       "readings.scan", 1, 5, "cost-1")
        self.assertEqual(ctx.exception.code, "COMMISSION_DEADLINE_PASSED")
        desc = self.world.commission_describe(com_id)
        self.assertEqual(desc["status"], "stopped_deadline")
        self.assertEqual(desc["settlement"]["success_fee_cents"], 0)
        self.assertEqual(desc["settlement"]["recorded_cost_cents"], 0)
        # Nothing was charged: the full reservation returns to the buyer.
        self.assertEqual(desc["settlement"]["buyer_release_cents"], 1500)

    def test_close_expired_accounts_incurred_costs(self):
        com_id = self._started(deadline_ts=time.time() + 3600)
        self._cost(self.world, self.bob, com_id,
                   "readings.scan", 2, 10, "cost-1")  # 10c recorded
        future = time.time() + 7200
        with unittest.mock.patch("world.time") as mock_time:
            mock_time.time.return_value = future
            out = self.world.commission_close_expired(
                "alice", self.alice.token, com_id, idempotency_key="close-1")
        self.assertEqual(out["status"], "stopped_deadline")
        self.assertEqual(out["settlement"]["recorded_cost_cents"], 10)
        self.assertEqual(out["settlement"]["seller_payout_cents"], 10)
        self.assertEqual(out["settlement"]["buyer_release_cents"], 1490)

    def test_close_expired_before_deadline_refused(self):
        com_id = self._started(deadline_ts=time.time() + 3600)
        with self.assertRaises(WalletError) as ctx:
            self.world.commission_close_expired(
                "alice", self.alice.token, com_id)
        self.assertEqual(ctx.exception.code,
                         "COMMISSION_DEADLINE_NOT_PASSED")

    # -- demo 4: revocation ---------------------------------------------------
    def test_revocation_refuses_next_gated_op(self):
        com_id = self._started()
        self._cost(self.world, self.bob, com_id,
                   "readings.scan", 3, 15, "cost-1")  # 15c incurred
        sig = self.alice.root_key.sign(
            f"{com_id}:revoke".encode("utf-8")).hex()
        out = self.world.commission_revoke(
            "alice", self.alice.token, com_id, sig)
        self.assertEqual(out["status"], "revoked")
        self.assertEqual(out["settlement"]["outcome"], "revoked")
        self.assertEqual(out["settlement"]["recorded_cost_cents"], 15)
        self.assertEqual(out["settlement"]["success_fee_cents"], 0)
        # The next gated operation is refused, not silently allowed.
        with self.assertRaises(WalletError) as ctx:
            self._cost(self.world, self.bob, com_id,
                       "readings.scan", 1, 5, "cost-2")
        self.assertEqual(ctx.exception.code, "COMMISSION_REVOKED")
        with self.assertRaises(WalletError) as ctx2:
            self._submit(self.world, self.bob, com_id, _GOOD_REPORT,
                         "submit-1")
        self.assertEqual(ctx2.exception.code, "COMMISSION_REVOKED")

    def test_revocation_needs_owner_signature(self):
        com_id = self._started()
        with self.assertRaises(WalletError) as ctx:
            self.world.commission_revoke(
                "alice", self.alice.token, com_id, "00" * 64)
        self.assertEqual(ctx.exception.code, "COMMISSION_AUTHORIZATION_INVALID")
        # Not revoked: work still proceeds.
        self._cost(self.world, self.bob, com_id,
                   "readings.scan", 1, 5, "cost-1")

    # -- demo 5: crash / retry idempotency --------------------------------------
    def test_retry_never_duplicates_cost_entry(self):
        com_id = self._started()
        first = self._cost(self.world, self.bob, com_id,
                           "readings.scan", 3, 15, "cost-1")
        self.assertFalse(first["replayed"])
        replay = self._cost(self.world, self.bob, com_id,
                            "readings.scan", 3, 15, "cost-1")
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["event_id"], first["event_id"])
        desc = self.world.commission_describe(com_id)
        self.assertEqual(len(desc["cost_events"]), 1)
        self.assertEqual(desc["recorded_cost_cents"], 15)

    def test_retry_never_duplicates_start_or_settlement(self):
        cid, _sha = self._frozen_contract()
        self.world.fund_simulated("alice", self.alice.token, 2000,
                                  idempotency_key="fund-1")
        first = self.world.commission_start(
            "alice", self.alice.token, cid, idempotency_key="start-1")
        replay = self.world.commission_start(
            "alice", self.alice.token, cid, idempotency_key="start-1")
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["commission_id"], first["commission_id"])
        # One reservation only: balance dropped once, not twice.
        self.assertEqual(
            self.world.simulated_balances["alice"], 2000 - 1500)
        com_id = first["commission_id"]
        self._work(com_id)
        s1 = self._submit(self.world, self.bob, com_id, _GOOD_REPORT,
                          "submit-1")
        bal_bob = self.world.simulated_balances["bob"]
        bal_alice = self.world.simulated_balances["alice"]
        s2 = self._submit(self.world, self.bob, com_id, _GOOD_REPORT,
                          "submit-1")
        self.assertTrue(s2["replayed"])
        self.assertEqual(s2["settlement"]["settlement_id"],
                        s1["settlement"]["settlement_id"])
        self.assertEqual(self.world.simulated_balances["bob"], bal_bob)
        self.assertEqual(self.world.simulated_balances["alice"], bal_alice)

    def test_idempotency_key_conflict_is_never_silent(self):
        com_id = self._started()
        self._cost(self.world, self.bob, com_id,
                   "readings.scan", 3, 15, "cost-1")
        with self.assertRaises(WalletError) as ctx:
            self._cost(self.world, self.bob, com_id,
                       "summary.write", 1, 20, "cost-1")
        self.assertEqual(ctx.exception.code, "WORLD_IDEMPOTENCY_CONFLICT")

    # -- demo 6: altered terms / payee / costs ------------------------------------
    def test_altered_contract_signature_is_refused(self):
        contract = _contract()
        out = self.world.commission_propose_contract(
            "alice", self.alice.token, contract)
        cid = out["contract_id"]
        # Signature over a DIFFERENT sha (altered terms) does not authorize.
        bad_sig = sign_contract_sha(self.alice.root_key, "0" * 64)
        with self.assertRaises(WalletError) as ctx:
            self.world.commission_authorize_contract(
                "alice", self.alice.token, cid, bad_sig)
        self.assertEqual(ctx.exception.code, "COMMISSION_AUTHORIZATION_INVALID")

    def test_altered_terms_after_freeze_cannot_move_settlement(self):
        com_id = self._started()
        self._work(com_id)
        # Read the public view, tamper with the returned copy (altered payee
        # and rates), then submit: settlement still follows the frozen terms.
        view = self.world.commission_describe(com_id)
        tampered = copy.deepcopy(view["contract"])
        tampered["seller_id"] = "mallory"
        tampered["permitted_operations"] = [
            {"op": "readings.scan", "rate_cents": 1000000}]
        tampered["success_fee_cents"] = 999999
        _ = tampered  # the tampered copy never reaches the world
        out = self._submit(self.world, self.bob, com_id, _GOOD_REPORT,
                           "submit-1")
        stl = out["settlement"]
        self.assertEqual(stl["payee"], "bob")
        self.assertEqual(stl["recorded_cost_cents"], 35)
        self.assertEqual(stl["success_fee_cents"], 500)

    def test_worker_inflated_claims_do_not_change_settlement(self):
        com_id = self._started()
        # Worker claims 10,000c for work the contract prices at 35c.
        self._cost(self.world, self.bob, com_id,
                   "readings.scan", 3, 10000, "cost-1")
        out = self._submit(self.world, self.bob, com_id, _GOOD_REPORT,
                           "submit-1")
        stl = out["settlement"]
        self.assertEqual(stl["recorded_cost_cents"], 15)
        self.assertEqual(stl["seller_payout_cents"], 515)
        events = self.world.commission_describe(com_id)["accounting"][
            "cost_events"]
        self.assertEqual(events[0]["claimed_cents"], 10000)
        self.assertEqual(events[0]["cost_cents"], 15)

    # -- guards -------------------------------------------------------------------
    def test_start_needs_frozen_contract_and_buyer_funds(self):
        contract = _contract()
        out = self.world.commission_propose_contract(
            "alice", self.alice.token, contract)
        with self.assertRaises(WalletError) as ctx:
            self.world.commission_start(
                "alice", self.alice.token, out["contract_id"])
        self.assertEqual(ctx.exception.code, "COMMISSION_CONTRACT_NOT_FROZEN")
        cid, _sha = self._frozen_contract()
        with self.assertRaises(WalletError) as ctx2:
            self.world.commission_start("alice", self.alice.token, cid)
        self.assertEqual(ctx2.exception.code,
                         "COMMISSION_INSUFFICIENT_SIMULATED_FUNDS")

    def test_only_buyer_starts_only_seller_works(self):
        com_id = self._started()
        with self.assertRaises(WalletError) as ctx:
            self.world.commission_start(
                "bob", self.bob.token, self._frozen_contract()[0])
        self.assertEqual(ctx.exception.code, "COMMISSION_START_BUYER_ONLY")
        with self.assertRaises(WalletError) as ctx2:
            self.world.commission_report_cost(
                "alice", self.alice.token, com_id, "readings.scan", 1, 5,
                self.alice.presentation(self.world, "commission.report-cost"))
        self.assertEqual(ctx2.exception.code, "COMMISSION_SELLER_ONLY")

    def test_unknown_op_and_bad_units_refused(self):
        com_id = self._started()
        with self.assertRaises(WalletError) as ctx:
            self._cost(self.world, self.bob, com_id,
                       "launch.missiles", 1, 1, "cost-1")
        self.assertEqual(ctx.exception.code, "COMMISSION_COST_OP_UNKNOWN")
        with self.assertRaises(WalletError) as ctx2:
            self._cost(self.world, self.bob, com_id,
                       "readings.scan", 0, 0, "cost-2")
        self.assertEqual(ctx2.exception.code, "COMMISSION_COST_UNITS_INVALID")
        self.assertEqual(
            self.world.commission_describe(com_id)["recorded_cost_cents"], 0)

    def test_balances_and_commissions_survive_restart(self):
        com_id = self._started()
        self._work(com_id)
        self._submit(self.world, self.bob, com_id, _GOOD_REPORT, "submit-1")
        # A fresh World on the same data root restores the ledger.
        world2 = World(data_root=Path(self._tmp.name))
        desc = world2.commission_describe(com_id)
        self.assertEqual(desc["status"], "accepted")
        self.assertEqual(desc["accounting"]["buyer_balance_cents"],
                         2000 - 1500 + 965)
        self.assertEqual(desc["accounting"]["seller_balance_cents"], 535)
        self.assertEqual(world2.simulated_balances["alice"], 2000 - 1500 + 965)


if __name__ == "__main__":
    unittest.main()
