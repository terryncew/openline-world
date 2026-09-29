"""CHALLENGE-001 credit-cascade tests: explicit reuse links, owner-signed
claim registration, authorized correction, and the propagation result.

Every classification asserted here comes from the real openline-claim-graph
engine (analyze_source_impact + verify_impact_report + the receiver-admitted
edge policy). Nothing is asserted from an animation of an expected answer.

Run:  cd backend && python3 -m pytest tests/test_challenge_cascade.py
"""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# world first: it pulls in workshop_gate, which inserts openline-wallet/src
# into sys.path at import (same as the server does).
from world import World, WorldRuleError  # noqa: E402

from custody_client import _Client  # noqa: E402

CHALLENGE_ID = "CHALLENGE-001"
CRITERIA_HASH = "86be00e377e030b00b4a8d33b3c9b0d4d95e7049125981d714023a2ca5f6537a"

PATCH_BODY = """--- a/toy-app/ledger.py
+++ b/toy-app/ledger.py
@@ -8,6 +8,6 @@
     out = []
-    for i in range(len(values) - window):
+    for i in range(len(values) - window + 1):
         out.append(sum(values[i:i+window]))
     return out
"""

REVIEW_BODY = """Review of the rolling_sum off-by-one patch.

Finding: the patch changes range(len(values) - window) to
range(len(values) - window + 1). Checkable without running: for
values=[1,2,3,4], window=2 the fixed expression is range(3), i.e. 3
windows, matching EXPECTED.md's [3, 5, 7]. The claim is about the
expression's value, not about execution.
"""

CONTROL_BODY = """--- a/toy-app/ledger.py
+++ b/toy-app/ledger.py
@@ -20,6 +20,6 @@
 def apply_discount(price_cents, pct):
     # BUG-2: round() is banker's rounding (half to even), not half-up.
-    return round(price_cents * (100 - pct) / 100)
+    return math.floor(price_cents * (100 - pct) / 100 + 0.5)
"""


def _canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def _wire_contribution(pid, kind, body, title, builds_on=(), references=""):
    links = [{"contribution_id": cid, "what_reused": w}
             for cid, w in builds_on]
    return {
        "kind": kind, "title": title, "body": body,
        "challenge_id": CHALLENGE_ID, "criteria_hash": CRITERIA_HASH,
        "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "participant_id": pid, "references": references,
        "original": True, "derived_from": [],
        "builds_on": links,
        "builds_on_sha256": hashlib.sha256(
            _canonical(links).encode("utf-8")).hexdigest(),
    }


class CascadeFixture(unittest.TestCase):
    """One world: challenge open, patch + review + control accepted."""

    def _world(self):
        return World(data_root=Path(tempfile.mkdtemp(prefix="cascade-test-")))

    def setUp(self):
        self.world = self._world()
        w = self.world
        self.owner = _Client("owner", scopes=("challenge.admin",
                                              "challenge.contribute",
                                              "claimgraph.correct"),
                             agent_id="owner-agent")
        self.owner.join(w)
        self.alice = _Client("alice", scopes=("challenge.contribute",),
                             agent_id="alice-agent")
        self.alice.join(w)
        created = w.challenge_create(
            "owner", self.owner.token,
            {"challenge_id": CHALLENGE_ID, "criteria_hash": CRITERIA_HASH,
             "problem_sha256": "b" * 64,
             "deadline_iso": "2026-10-12T00:00:00+00:00"},
            presentation=self.owner.presentation(w, "challenge.admin"))
        self.assertEqual(created["decision"], "ALLOWED")

        def contribute(client, kind, body, title, builds_on=(), key=None,
                       references=""):
            out = w.challenge_contribute(
                client.pid, client.token,
                _wire_contribution(client.pid, kind, body, title, builds_on,
                                   references=references),
                presentation=client.presentation(w, "challenge.contribute"),
                idempotency_key=key or f"{kind}-{title}-{client.pid}")
            self.assertEqual(out["decision"], "ALLOWED")
            return out["contribution_id"]

        def accept(cid, reason, key):
            out = w.challenge_evaluate(
                "owner", self.owner.token, cid, "ACCEPT", reason,
                presentation=self.owner.presentation(w, "challenge.admin"),
                idempotency_key=key)
            self.assertEqual(out["decision"], "ALLOWED")

        self.patch_id = contribute(self.alice, "patch", PATCH_BODY,
                                   "Fix rolling_sum off-by-one",
                                   key="t-patch")
        accept(self.patch_id, "fixes BUG-1 per EXPECTED.md", "t-eval-patch")
        self.review_id = contribute(self.alice, "review", REVIEW_BODY,
                                    "Review of the rolling_sum patch",
                                    builds_on=((self.patch_id,
                                                "the one-line diff"),),
                                    key="t-review", references=self.patch_id)
        accept(self.review_id, "review is checkable; records the reuse",
               "t-eval-review")
        self.control_id = contribute(self.alice, "patch", CONTROL_BODY,
                                     "Fix apply_discount banker's rounding",
                                     key="t-control")
        accept(self.control_id, "half-up per EXPECTED.md", "t-eval-control")

    def _registration(self, report_id="cascade:test-pair"):
        return {
            "challenge_id": CHALLENGE_ID, "report_id": report_id,
            "title": "accepted patch + review, with the recorded reuse edge",
            "links": [
                {
                    "contribution_id": self.patch_id,
                    "finding_quote":
                        "for i in range(len(values) - window + 1):",
                    "finding_text": "The patch's recorded scope.",
                    "claim_text": f"{self.patch_id} fixes BUG-1.",
                    "depends_on": None,
                },
                {
                    "contribution_id": self.review_id,
                    "finding_quote":
                        "Finding: the patch changes range(len(values) - window) to",
                    "finding_text": "The review's key finding.",
                    "claim_text": f"{self.review_id} builds on {self.patch_id}.",
                    "depends_on": self.patch_id,
                },
            ],
        }

    def _register(self, registration, key="t-register"):
        w = self.world
        return w.challenge_cascade_register(
            "owner", self.owner.token, registration,
            presentation=self.owner.presentation(w, "challenge.admin"),
            idempotency_key=key)

    def _correct(self, client, status, **kw):
        w = self.world
        return w.claimgraph_correct(
            client.pid, client.token, status,
            presentation=client.presentation(w, "claimgraph.correct"), **kw)


class TestBuildsOnBinding(CascadeFixture):
    def test_valid_links_stored_byte_bound(self):
        desc = self.world.challenge_describe()
        by_id = {c["contribution_id"]: c for c in desc["contributions"]}
        review = by_id[self.review_id]
        self.assertEqual(
            review["builds_on"],
            [{"contribution_id": self.patch_id,
              "what_reused": "the one-line diff"}])
        self.assertEqual(
            review["builds_on_sha256"],
            hashlib.sha256(_canonical(review["builds_on"]).encode("utf-8")
                           ).hexdigest())
        self.assertEqual(by_id[self.patch_id]["builds_on"], [])

    def test_hash_mismatch_refused(self):
        params = _wire_contribution(
            "alice", "patch", PATCH_BODY, "mismatched",
            builds_on=((self.patch_id, "the diff"),))
        params["builds_on_sha256"] = "0" * 64
        out = self.world.challenge_contribute(
            "alice", self.alice.token, params,
            presentation=self.alice.presentation(
                self.world, "challenge.contribute"))
        self.assertEqual(out["decision"], "STOPPED")
        self.assertIn("CHALLENGE_BUILDS_ON_HASH_MISMATCH",
                      out["reason_codes"])
        self.assertIsNone(out["contribution_id"])

    def test_unknown_reuse_id_refused(self):
        params = _wire_contribution(
            "alice", "patch", PATCH_BODY, "unknown-link",
            builds_on=(("CHC-9999", "no such contribution"),))
        out = self.world.challenge_contribute(
            "alice", self.alice.token, params,
            presentation=self.alice.presentation(
                self.world, "challenge.contribute"))
        self.assertEqual(out["decision"], "STOPPED")
        self.assertIn("CHALLENGE_BUILDS_ON_UNKNOWN", out["reason_codes"])
        self.assertIsNone(out["contribution_id"])


class TestCascadeRegistration(CascadeFixture):
    def test_register_links_claims_with_hard_dependency_edge(self):
        out = self._register(self._registration())
        self.assertEqual(out["decision"], "ALLOWED")
        self.assertEqual(out["report_id"], "cascade:test-pair")
        self.assertEqual(len(out["sources"]), 2)

        desc = self.world.challenge_describe()
        cascade = desc["cascade"]
        self.assertEqual(len(cascade["reports"]), 1)
        report = cascade["reports"][0]
        self.assertEqual(report["report_id"], "cascade:test-pair")
        # The review's INFERENCE claim depends on the patch's assertion claim.
        relations = [(r["relation"], r["authority"])
                     for r in report["relations"]]
        self.assertIn(("DEPENDS_ON", "hard"), relations)
        supports = [r for r in relations if r[0] == "SUPPORTS"]
        self.assertEqual(len(supports), 2)
        self.assertTrue(all(r[1] == "hard" for r in supports))
        # Assertion claims carry the verbatim quote as their text (quote
        # mode requires claim text == anchored quote).
        assertion_texts = {c["text"] for c in report["claims"]
                           if c["kind"] == "SOURCE_ASSERTION"}
        self.assertIn("for i in range(len(values) - window + 1):",
                      assertion_texts)
        self.assertIn("Finding: the patch changes range(len(values) - window) to",
                      assertion_texts)

    def test_register_is_idempotent_by_report_id(self):
        first = self._register(self._registration(), key="t-reg-1")
        second = self._register(self._registration(), key="t-reg-2")
        self.assertTrue(first["replayed"] is False)
        self.assertTrue(second["replayed"])
        self.assertEqual(first["report_id"], second["report_id"])
        self.assertEqual(
            len(self.world.challenge_describe()["cascade"]["reports"]), 1)

    def test_register_rejects_non_accepted_contribution(self):
        reg = self._registration()
        # Submit a fresh, unaccepted contribution and link it instead.
        cid = self.world.challenge_contribute(
            "alice", self.alice.token,
            _wire_contribution("alice", "patch", PATCH_BODY, "unaccepted"),
            presentation=self.alice.presentation(
                self.world, "challenge.contribute"),
            idempotency_key="t-unaccepted")["contribution_id"]
        reg["links"][0]["contribution_id"] = cid
        out = self._register(reg, key="t-reg-nonaccepted")
        self.assertEqual(out["decision"], "STOPPED")
        self.assertIn("CHALLENGE_CASCADE_LINK_NOT_ACCEPTED",
                      out["reason_codes"])

    def test_register_rejects_non_verbatim_quote(self):
        reg = self._registration()
        reg["links"][1]["finding_quote"] = "a quote that is not in the body"
        out = self._register(reg, key="t-reg-quote")
        self.assertEqual(out["decision"], "STOPPED")
        self.assertIn("CHALLENGE_CASCADE_QUOTE_MISMATCH",
                      out["reason_codes"])

    def test_register_rejects_unlinked_dependency(self):
        reg = self._registration()
        reg["links"][1]["depends_on"] = "CHC-9999"
        out = self._register(reg, key="t-reg-dep")
        self.assertEqual(out["decision"], "STOPPED")
        self.assertIn("CHALLENGE_CASCADE_DEPENDENCY_UNKNOWN",
                      out["reason_codes"])


class TestCorrectionAuthorization(CascadeFixture):
    def test_unauthorized_correction_is_stopped_and_appends_nothing(self):
        out = self._register(self._registration())
        source_id = out["sources"][self.review_id]
        mallory = _Client("mallory", scopes=("challenge.contribute",),
                          agent_id="mallory-agent")
        mallory.join(self.world)
        result = self.world.claimgraph_correct(
            "mallory", mallory.token, "CORRECTED",
            source_id=source_id, notice_text="unauthorized",
            presentation=mallory.presentation(self.world,
                                              "claimgraph.correct"))
        self.assertEqual(result["decision"], "STOPPED")
        self.assertIn("ACTION_OUTSIDE_MANDATE", result["reason_codes"])
        self.assertIsNone(result["event_id"])
        self.assertEqual(
            self.world.challenge_describe()["cascade"]["events"], [])

    def test_authorized_correction_records_event(self):
        out = self._register(self._registration())
        source_id = out["sources"][self.review_id]
        result = self._correct(self.owner, "CORRECTED", source_id=source_id,
                               notice_text="deliberate demonstration event",
                               reason="test", idempotency_key="t-correct-1")
        self.assertEqual(result["decision"], "ALLOWED")
        self.assertIsNotNone(result["event_id"])
        events = self.world.challenge_describe()["cascade"]["events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["status"], "CORRECTED")
        self.assertEqual(events[0]["affected"][0]["source_id"], source_id)
        self.assertEqual(
            [a["contribution_id"] for a in events[0]["affected"]],
            [self.review_id])

    def test_correction_is_idempotent_by_event_key(self):
        out = self._register(self._registration())
        source_id = out["sources"][self.review_id]
        first = self._correct(self.owner, "CORRECTED", source_id=source_id,
                              idempotency_key="t-correct-2")
        second = self._correct(self.owner, "CORRECTED", source_id=source_id,
                               idempotency_key="t-correct-2")
        self.assertTrue(second["replayed"])
        self.assertEqual(first["event_id"], second["event_id"])
        self.assertEqual(
            len(self.world.challenge_describe()["cascade"]["events"]), 1)


class TestCorrectionPropagation(CascadeFixture):
    """The propagation result is computed by the real claim-graph engine."""

    def _standings(self):
        self._register(self._registration())
        control_reg = {
            "challenge_id": CHALLENGE_ID, "report_id": "cascade:test-control",
            "title": "independent control", "links": [
                {
                    "contribution_id": self.control_id,
                    "finding_quote":
                        "return math.floor(price_cents * (100 - pct) / 100 + 0.5)",
                    "finding_text": "The control's recorded scope.",
                    "claim_text": f"{self.control_id} fixes BUG-2.",
                    "depends_on": None,
                },
            ],
        }
        self._register(control_reg, key="t-reg-control")
        source_id = self.world.claim_graph.challenge_links[
            self.review_id]["source_id"]
        self._correct(self.owner, "CORRECTED", source_id=source_id,
                      notice_text="deliberate demonstration event",
                      idempotency_key="t-correct-3")
        by_contribution = {}
        for r in self.world.challenge_describe()["cascade"]["reports"]:
            for c in r["claims"]:
                by_contribution.setdefault(
                    c["contribution_id"] or "", []).append(c)
        return by_contribution

    def test_review_claims_quarantined_with_engine_reasons(self):
        by_contribution = self._standings()
        review = {c["kind"]: c for c in by_contribution[self.review_id]}
        self.assertEqual(
            review["SOURCE_ASSERTION"]["standing"]["classification"],
            "QUARANTINE")
        self.assertEqual(
            review["SOURCE_ASSERTION"]["standing"]["reason"],
            "SOURCE_BASIS_LOST")
        self.assertEqual(
            review["INFERENCE"]["standing"]["classification"], "QUARANTINE")
        self.assertEqual(
            review["INFERENCE"]["standing"]["reason"],
            "ALL_ADMITTED_SUPPORT_PATHS_LOST")

    def test_patch_and_control_stay_unaffected(self):
        by_contribution = self._standings()
        for cid in (self.patch_id, self.control_id):
            for claim in by_contribution[cid]:
                self.assertEqual(
                    claim["standing"]["classification"], "UNAFFECTED",
                    claim["text"])

    def test_history_preserved_not_rewritten(self):
        self._register(self._registration())
        control_reg = {
            "challenge_id": CHALLENGE_ID, "report_id": "cascade:test-control",
            "title": "independent control", "links": [
                {
                    "contribution_id": self.control_id,
                    "finding_quote":
                        "return math.floor(price_cents * (100 - pct) / 100 + 0.5)",
                    "finding_text": "The control's recorded scope.",
                    "claim_text": f"{self.control_id} fixes BUG-2.",
                    "depends_on": None,
                },
            ],
        }
        self._register(control_reg, key="t-reg-control-hist")
        before = self.world.challenge_describe()
        receipts_before = {
            r["report_id"]: r["receipt"]
            for r in before["cascade"]["reports"]
        }
        self.assertEqual(len(receipts_before), 2)
        source_id = self.world.claim_graph.challenge_links[
            self.review_id]["source_id"]
        self._correct(self.owner, "CORRECTED", source_id=source_id,
                      notice_text="deliberate demonstration event",
                      idempotency_key="t-correct-4")
        after = self.world.challenge_describe()
        by_id_before = {c["contribution_id"]: c
                        for c in before["contributions"]}
        by_id_after = {c["contribution_id"]: c
                       for c in after["contributions"]}
        for cid in (self.patch_id, self.review_id, self.control_id):
            self.assertEqual(by_id_after[cid]["body"],
                             by_id_before[cid]["body"],
                             cid)
            self.assertEqual(by_id_after[cid]["body_sha256"],
                             by_id_before[cid]["body_sha256"],
                             cid)
            accepts = [d for d in after["decisions"]
                       if d["contribution_id"] == cid
                       and d["decision"] == "ACCEPT"]
            self.assertEqual(len(accepts), 1, cid)
        receipts_after = {r["report_id"]: r["receipt"]
                          for r in after["cascade"]["reports"]}
        self.assertEqual(receipts_after, receipts_before)
        self.assertEqual(
            len(after["cascade"]["events"]), 1)
        # Contributions, decisions, refusals untouched by the correction.
        self.assertEqual(len(after["contributions"]),
                         len(before["contributions"]))
        self.assertEqual(len(after["decisions"]), len(before["decisions"]))
        self.assertEqual(len(after["refusals"]), len(before["refusals"]))


if __name__ == "__main__":
    unittest.main()
