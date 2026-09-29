"""DISCOVERY-ROOM-001 tests: the research-question listing kind on the
Exchange board, the disclosure set, the real propose->agree->submit loop
with receiver-executed verification + existing-ledger accounting, and the
real refusal path.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.

Every verdict asserted here comes from the real machinery: the EffectGate
presentation evaluation, backend/world.py's deterministic manifest
verification (recomputed sha256 over the frozen repro-lab-001 room), and
the existing commission simulated ledger. The recorded UNFAVORABLE
experiment outcome (C did not beat B) completes the loop; it is not a
loop failure.
"""
import copy
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from world import World, WorldRuleError  # noqa: E402
from custody_client import _Client  # noqa: E402
from commission import sign_contract_sha  # noqa: E402
from openline_wallet.crypto import verify_record  # noqa: E402
from openline_wallet.errors import WalletError  # noqa: E402

_SCOPES = ("research.verify", "commission.report-cost",
           "commission.submit-deliverable")
_DISCLAIMER = ("A receipt records an agreement; it does not establish "
               "intellectual-property rights or scientific truth.")


def _disclosure(**overrides):
    d = {
        "proposed": "Structured receipts improve bounded search.",
        "unproven": "Generalization beyond this task.",
        "test_spec": "Frozen protocol repro-lab-001.",
        "required_contribution": "Recompute the manifest hashes.",
        "resource_ceiling": {"amount": 10,
                             "unit": "simulated-compute-units"},
        "acceptance_criteria": ["hashes recomputed",
                                "counts reported"],
        "contributor_receives": "A gate-signed verification receipt.",
        "buyer_receives": "Confirmation of evidence integrity.",
        "authorized_by": "receiver (gate)",
        "visibility_terms": "Listing public.",
        "reuse_terms": "Reusable for verification. " + _DISCLAIMER,
    }
    d.update(overrides)
    return d


def _task(**overrides):
    t = {"kind": "research-question",
         "title": "Does structured receipt exchange improve search?",
         "detail": "A research question with a disclosure set.",
         "terms": {"requires": []},
         "disclosure": _disclosure()}
    t.update(overrides)
    return t


class DiscoveryRoomCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.world = World(data_root=Path(self._tmp.name))
        self.owner = _Client("owner", scopes=_SCOPES, display="Owner")
        self.contributor = _Client("contrib", scopes=_SCOPES,
                                   display="Contributor")
        self.third = _Client("third", scopes=_SCOPES, display="Third")
        for client in (self.owner, self.contributor, self.third):
            client.join(self.world)

    def tearDown(self):
        self._tmp.cleanup()

    # -- listing kind + disclosure --------------------------------------
    def test_research_question_listing_carries_disclosure(self):
        out = self.world.need(self.owner.pid, self.owner.token, _task(),
                              idempotency_key="t-need-1")
        board = self.world.board({"kind": "research-question"})
        listed = [e for e in board["listings"]
                  if e["listing_id"] == out["need_id"]]
        self.assertEqual(len(listed), 1)
        disclosure = listed[0]["disclosure"]
        self.assertIsNotNone(disclosure)
        self.assertEqual(disclosure["resource_ceiling"],
                         {"amount": 10, "unit": "simulated-compute-units"})
        self.assertIn(_DISCLAIMER, disclosure["reuse_terms"])

    def test_other_kinds_carry_no_disclosure(self):
        out = self.world.need(
            self.owner.pid, self.owner.token,
            {"kind": "tidy-notes", "title": "Tidy", "detail": "d",
             "terms": {"requires": []}},
            idempotency_key="t-need-2")
        board = self.world.board({"kind": "tidy-notes"})
        listed = [e for e in board["listings"]
                  if e["listing_id"] == out["need_id"]]
        self.assertEqual(len(listed), 1)
        self.assertIsNone(listed[0]["disclosure"])

    def test_disclosure_required_for_research_question(self):
        task = _task()
        del task["disclosure"]
        with self.assertRaises(WorldRuleError) as ctx:
            self.world.need(self.owner.pid, self.owner.token, task)
        self.assertEqual(ctx.exception.code,
                         "WORLD_RULE_DISCLOSURE_REQUIRED")

    def test_disclaimer_required_verbatim(self):
        task = _task(disclosure=_disclosure(
            reuse_terms="Reusable for verification. No disclaimer here."))
        with self.assertRaises(WorldRuleError) as ctx:
            self.world.need(self.owner.pid, self.owner.token, task)
        self.assertEqual(ctx.exception.code,
                         "WORLD_RULE_DISCLAIMER_REQUIRED")

    def test_ceiling_unit_must_be_simulated(self):
        task = _task(disclosure=_disclosure(
            resource_ceiling={"amount": 10, "unit": "usd"}))
        with self.assertRaises(WorldRuleError) as ctx:
            self.world.need(self.owner.pid, self.owner.token, task)
        self.assertEqual(ctx.exception.code, "WORLD_RULE_INPUT_INVALID")

    def test_disclosure_rejected_on_other_kinds(self):
        with self.assertRaises(WorldRuleError) as ctx:
            self.world.need(
                self.owner.pid, self.owner.token,
                {"kind": "tidy-notes", "title": "Tidy", "detail": "d",
                 "terms": {"requires": []},
                 "disclosure": _disclosure()})
        self.assertEqual(ctx.exception.code, "WORLD_RULE_INPUT_INVALID")

    # -- the loop ---------------------------------------------------------
    def _posted(self):
        return self.world.need(self.owner.pid, self.owner.token, _task(),
                               idempotency_key="t-loop-need")["need_id"]

    def _commission(self, agreement_id):
        contract = {
            "schema": "openline.commission.contract.v1", "version": 1,
            "job": {"task": f"Verification for agreement {agreement_id}.",
                    "deliverable": "A verification report."},
            "acceptance": {"required_substrings": ["verification"],
                           "forbidden_substrings": [], "max_bytes": 4096},
            "buyer_id": self.owner.pid, "seller_id": self.contributor.pid,
            "permitted_operations": [
                {"op": "evidence.verify", "rate_cents": 100}],
            "max_cost_cents": 1000, "success_fee_cents": 0,
            "deadline_ts": time.time() + 3600,
        }
        ctr = self.world.commission_propose_contract(
            self.owner.pid, self.owner.token, contract)
        cid, sha = ctr["contract_id"], ctr["contract_sha256"]
        for client in (self.owner, self.contributor):
            self.world.commission_authorize_contract(
                client.pid, client.token, cid,
                sign_contract_sha(client.root_key, sha))
        self.world.fund_simulated(self.owner.pid, self.owner.token, 2000,
                                  idempotency_key="t-loop-fund")
        return self.world.commission_start(
            self.owner.pid, self.owner.token, cid,
            idempotency_key="t-loop-start")["commission_id"]

    def test_full_loop_records_result(self):
        need_id = self._posted()
        agr = self.world.propose_agreement(
            self.contributor.pid, self.contributor.token, need_id,
            self.contributor.presentation(self.world, "research.verify"),
            idempotency_key="t-loop-propose")
        agr_id = agr["agreement_id"]
        com_id = self._commission(agr_id)
        self.world.agree(
            self.owner.pid, self.owner.token, agr_id,
            self.owner.presentation(self.world, "research.verify"),
            idempotency_key="t-loop-agree")
        sub = self.world.submit(self.contributor.pid,
                                self.contributor.token, agr_id,
                                idempotency_key="t-loop-submit")
        self.assertEqual(sub["decision"], "ALLOWED")
        agreement = self.world.agreements[agr_id]
        result = agreement["result"]["payload"]
        # EXECUTION: the receiver recomputed the real manifest hashes.
        verification = result["verification"]
        self.assertEqual(verification["artifacts_checked"], 40)
        self.assertEqual(verification["matches"], 40)
        self.assertEqual(verification["mismatches"], [])
        # The listing's stale pin is reported, not hidden.
        self.assertFalse(verification["pin_match"])
        self.assertIsNotNone(verification["manifest_sha256"])
        # EVALUATION: the experiment outcome is preserved verbatim --
        # the UNFAVORABLE result completes the loop.
        outcome = result["experiment_outcome"]
        self.assertEqual(outcome["verdict"], "C did not beat B")
        self.assertFalse(outcome["improved"])
        self.assertEqual(outcome["conditions"]["C"]["mean_mse"],
                         repr(0.01688857691891849))
        # Accounting comes from the EXISTING commission ledger.
        accounting = result["accounting"]
        self.assertTrue(accounting["linked"])
        self.assertEqual(accounting["commission_id"], com_id)
        self.assertEqual(accounting["unit"], "simulated-compute-units")
        self.assertTrue(accounting["simulated"])
        self.assertEqual(accounting["spent_units"], 4)
        self.assertEqual(accounting["ceiling_units"], 10)
        com = self.world.commissions[com_id]
        self.assertEqual(com["recorded_cost_cents"],
                         accounting["spent_cents"])
        # ACCEPTANCE: the result is bound under the gate's signature.
        signed = agreement["result"]["gate_signed"]
        valid, reason = verify_record(
            signed, expected_public_key=self.world.gate.public_key)
        self.assertTrue(valid, reason)
        # The transaction carries the same result.
        tx = self.world.transactions[sub["transaction_id"]]
        self.assertEqual(tx["result"]["payload"]["agreement_id"], agr_id)

    def test_submit_without_linked_commission_records_honestly(self):
        need_id = self._posted()
        agr = self.world.propose_agreement(
            self.contributor.pid, self.contributor.token, need_id,
            self.contributor.presentation(self.world, "research.verify"),
            idempotency_key="t-nolink-propose")
        agr_id = agr["agreement_id"]
        self.world.agree(
            self.owner.pid, self.owner.token, agr_id,
            self.owner.presentation(self.world, "research.verify"),
            idempotency_key="t-nolink-agree")
        self.world.submit(self.contributor.pid, self.contributor.token,
                          agr_id, idempotency_key="t-nolink-submit")
        accounting = self.world.agreements[agr_id]["result"]["payload"][
            "accounting"]
        self.assertFalse(accounting["linked"])
        self.assertIsNone(accounting["commission_id"])

    # -- the refusal --------------------------------------------------------
    def test_non_counterpart_agree_is_refused(self):
        need_id = self._posted()
        agr = self.world.propose_agreement(
            self.contributor.pid, self.contributor.token, need_id,
            self.contributor.presentation(self.world, "research.verify"),
            idempotency_key="t-ref-propose")
        with self.assertRaises(WorldRuleError) as ctx:
            self.world.agree(
                self.third.pid, self.third.token, agr["agreement_id"],
                self.third.presentation(self.world, "research.verify"))
        self.assertEqual(ctx.exception.code, "WORLD_RULE_NOT_COUNTERPART")

    def test_submit_before_agree_is_refused(self):
        need_id = self._posted()
        agr = self.world.propose_agreement(
            self.contributor.pid, self.contributor.token, need_id,
            self.contributor.presentation(self.world, "research.verify"),
            idempotency_key="t-early-propose")
        with self.assertRaises(WalletError) as ctx:
            self.world.submit(self.contributor.pid, self.contributor.token,
                              agr["agreement_id"])
        self.assertEqual(ctx.exception.code, "WORLD_AGREEMENT_NOT_AGREED")

    # -- the manifest-binding defect (v1), fixed --------------------------------
    def test_stale_manifest_pin_refuses_acceptance_and_settlement(self):
        # Reproduces the DISCOVERY-ROOM-001 v1 defect: the listing declares
        # a stale manifest pin (as the v1 seed did). Submit must refuse
        # acceptance AND settlement BEFORE EFFECT: the refusal carries
        # RESEARCH_MANIFEST_PIN_MISMATCH and leaves no transaction, no
        # result record, no ALLOWED verdict, and no commission funds moved.
        task = _task(disclosure=_disclosure(
            acceptance_criteria=[
                "hashes recomputed",
                "counts reported",
                "result bound to manifest sha256 604fe0d3...",
            ]))
        need_id = self.world.need(
            self.owner.pid, self.owner.token, task,
            idempotency_key="t-stalepin-need")["need_id"]
        agr = self.world.propose_agreement(
            self.contributor.pid, self.contributor.token, need_id,
            self.contributor.presentation(self.world, "research.verify"),
            idempotency_key="t-stalepin-propose")
        agr_id = agr["agreement_id"]
        com_id = self._commission(agr_id)
        self.world.agree(
            self.owner.pid, self.owner.token, agr_id,
            self.owner.presentation(self.world, "research.verify"),
            idempotency_key="t-stalepin-agree")
        tx_ids_before = set(self.world.transactions)
        cost_before = self.world.commissions[com_id]["recorded_cost_cents"]
        with self.assertRaises(WalletError) as ctx:
            self.world.submit(self.contributor.pid, self.contributor.token,
                              agr_id, idempotency_key="t-stalepin-submit")
        self.assertEqual(ctx.exception.code,
                         "RESEARCH_MANIFEST_PIN_MISMATCH")
        # No effect: no transaction created, none bound to this agreement.
        self.assertEqual(set(self.world.transactions), tx_ids_before)
        self.assertFalse(any(
            tx.get("agreement_id") == agr_id
            for tx in self.world.transactions.values()))
        # No result record, no ALLOWED verdict, agreement still agreed.
        agreement = self.world.agreements[agr_id]
        self.assertIsNone(agreement.get("result"))
        self.assertIsNone(agreement.get("transaction_id"))
        self.assertNotEqual(agreement.get("decision"), "ALLOWED")
        self.assertEqual(agreement.get("status"), "agreed")
        # No commission funds moved.
        self.assertEqual(
            self.world.commissions[com_id]["recorded_cost_cents"],
            cost_before)
        self.assertEqual(
            self.world.commissions[com_id]["cost_events"], [])

    def test_correct_manifest_pin_allows_settlement(self):
        # The corrected v2 case: the listing declares the manifest's real
        # sha256, so the binding gate passes and the full loop settles.
        import hashlib
        from world import World as _W
        manifest_bytes = _W._research_room_dir().joinpath(
            _W._RESEARCH_MANIFEST_NAME).read_bytes()
        real_pin = hashlib.sha256(manifest_bytes).hexdigest()
        task = _task(disclosure=_disclosure(
            acceptance_criteria=[
                "hashes recomputed",
                "counts reported",
                f"result bound to manifest sha256 {real_pin}",
            ]))
        need_id = self.world.need(
            self.owner.pid, self.owner.token, task,
            idempotency_key="t-goodpin-need")["need_id"]
        agr = self.world.propose_agreement(
            self.contributor.pid, self.contributor.token, need_id,
            self.contributor.presentation(self.world, "research.verify"),
            idempotency_key="t-goodpin-propose")
        agr_id = agr["agreement_id"]
        com_id = self._commission(agr_id)
        self.world.agree(
            self.owner.pid, self.owner.token, agr_id,
            self.owner.presentation(self.world, "research.verify"),
            idempotency_key="t-goodpin-agree")
        sub = self.world.submit(self.contributor.pid, self.contributor.token,
                                agr_id, idempotency_key="t-goodpin-submit")
        self.assertEqual(sub["decision"], "ALLOWED")
        verification = self.world.agreements[agr_id]["result"]["payload"][
            "verification"]
        self.assertTrue(verification["pin_match"])
        self.assertEqual(verification["manifest_sha256"], real_pin)
        self.assertEqual(verification["manifest_sha256_pinned"], real_pin)


if __name__ == "__main__":
    unittest.main()
