"""Claim-graph chapter tests: displayed propagation matches backend results,
historical records stay unchanged, and the demo control is truly authorized.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.

Every classification asserted here comes from the real openline-claim-graph
engine (analyze_source_impact + verify_impact_report), and every gate verdict
is a real EffectGate evaluation. Nothing is asserted from an animation of an
expected answer.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# world first: it pulls in workshop_gate, which inserts openline-wallet/src
# into sys.path at import (same as the server does).
from world import World, WorldRuleError  # noqa: E402

from custody_client import _Client  # noqa: E402
from claim_graph_chapter import (  # noqa: E402
    ClaimGraphChapter,
    REPORT_A_ID,
    REPORT_B_ID,
)


CLAIM_TERMS = {"QUARANTINE", "SURVIVES", "AFFECTED_UNRESOLVED", "UNAFFECTED"}
REASON_TERMS = {
    "SOURCE_BASIS_LOST",
    "REQUIRED_DEPENDENCY_LOST",
    "ALL_ADMITTED_SUPPORT_PATHS_LOST",
    "ADMITTED_ALTERNATIVE_BASIS_REMAINS",
    "PATH_INCLUDES_ADVISORY_EDGE",
}


def _claims_by_text(report_desc):
    return {c["text"]: c for c in report_desc["claims"]}


class TestChapterData(unittest.TestCase):
    def test_describe_reports_recorded_data_only(self):
        chapter = ClaimGraphChapter()
        desc = chapter.describe()
        self.assertEqual(desc["chapter"]["id"], "claim-graph")
        self.assertEqual(len(desc["reports"]), 2)
        for report_desc, report in zip(desc["reports"], chapter.reports):
            snapshot = report["snapshot"]
            # Every displayed claim is a recorded claim, verbatim.
            self.assertEqual(
                [c["claim_id"] for c in report_desc["claims"]],
                [c["claim_id"] for c in snapshot["claims"]],
            )
            self.assertEqual(
                [c["text"] for c in report_desc["claims"]],
                [c["text"] for c in snapshot["claims"]],
            )
            # Every displayed relation is a recorded relation: endpoints are
            # real claim ids, the authority label comes from the receiver's
            # admitted policy, and nothing is invented.
            claim_ids = {c["claim_id"] for c in snapshot["claims"]}
            policy = report["policy"]
            hard = set(map(str, policy["hard_relation_ids"]))
            advisory = set(map(str, policy["advisory_relation_ids"]))
            self.assertEqual(len(report_desc["relations"]), len(snapshot["relations"]))
            for shown, recorded in zip(report_desc["relations"], snapshot["relations"]):
                self.assertEqual(shown["relation_id"], recorded["relation_id"])
                self.assertEqual(shown["from_claim_id"], recorded["source_claim_id"])
                self.assertEqual(shown["to_claim_id"], recorded["target_claim_id"])
                self.assertEqual(shown["relation"], recorded["relation"])
                self.assertIn(shown["from_claim_id"], claim_ids)
                self.assertIn(shown["to_claim_id"], claim_ids)
                expected_authority = (
                    "hard" if shown["relation_id"] in hard
                    else "advisory" if shown["relation_id"] in advisory
                    else "unadmitted"
                )
                self.assertEqual(shown["authority"], expected_authority)
            # Before any event there is no standing to show.
            for claim in report_desc["claims"]:
                self.assertIsNone(claim["standing"])

    def test_receipts_verify_before_and_after_events(self):
        chapter = ClaimGraphChapter()
        before = [r["receipt"] for r in chapter.describe()["reports"]]
        check = chapter.verify_all()
        self.assertTrue(all(c["valid"] for c in check["receipts"]))
        chapter.append_event("CORRECTED", asserted_by="test:one")
        chapter.append_event("WITHDRAWN", asserted_by="test:two")
        after = [r["receipt"] for r in chapter.describe()["reports"]]
        # Previous receipts stay inspectable and unchanged: byte-identical.
        self.assertEqual(before, after)
        check = chapter.verify_all()
        self.assertTrue(all(c["valid"] for c in check["receipts"]),
                        [c["errors"] for c in check["receipts"]])
        self.assertTrue(all(c["valid"] for c in check["impacts"]),
                        [c["errors"] for c in check["impacts"]])

    def test_correction_propagation_uses_backend_terms_only(self):
        chapter = ClaimGraphChapter()
        entry = chapter.append_event("CORRECTED", asserted_by="test:one")
        desc = chapter.describe()
        reports = {r["report_id"]: r for r in desc["reports"]}
        by_text = _claims_by_text(reports[REPORT_A_ID])

        expected = {
            "The tide gauge read 2.4 m at 06:35.": ("QUARANTINE", "SOURCE_BASIS_LOST"),
            "The channel was deep enough for the morning sailing.":
                ("QUARANTINE", "ALL_ADMITTED_SUPPORT_PATHS_LOST"),
            "Approve the morning sailing schedule.":
                ("QUARANTINE", "REQUIRED_DEPENDENCY_LOST"),
            "Should the sailing schedule be republished?":
                ("AFFECTED_UNRESOLVED", "PATH_INCLUDES_ADVISORY_EDGE"),
        }
        for text, (classification, reason) in expected.items():
            standing = by_text[text]["standing"]
            self.assertIsNotNone(standing, text)
            self.assertEqual(standing["classification"], classification, text)
            self.assertEqual(standing["reason"], reason, text)

        # The displayed standings are exactly the backend report's
        # classifications: the UI contract is "render the report", nothing else.
        report = entry["reports"][REPORT_A_ID]
        backend_index = {}
        for bucket in ("quarantine", "survives", "affected_unresolved", "unaffected"):
            for item in report["classifications"][bucket]:
                backend_index[item["claim_id"]] = (
                    item.get("classification"), item.get("reason"))
        for claim in reports[REPORT_A_ID]["claims"]:
            shown = claim["standing"]
            self.assertIsNotNone(shown)
            self.assertEqual(
                (shown["classification"], shown["reason"]),
                backend_index[claim["claim_id"]],
                claim["text"],
            )
            self.assertIn(shown["classification"], CLAIM_TERMS)
            if shown["reason"] is not None:
                self.assertIn(shown["reason"], REASON_TERMS)

        # The dependent report is still present, needs reconsideration, and
        # was NOT marked false: QUARANTINE proposes review, it is not a
        # verdict on truth.
        self.assertEqual(len(reports[REPORT_A_ID]["claims"]), 4)

        # The independently supported report keeps its status.
        by_b = _claims_by_text(reports[REPORT_B_ID])
        for text, claim in by_b.items():
            self.assertEqual(claim["standing"]["classification"], "UNAFFECTED", text)
        summary = entry["reports"][REPORT_B_ID]["summary"]
        self.assertEqual(summary["unaffected"], 3)
        self.assertEqual(summary["quarantine"], 0)

    def test_withdrawal_propagation(self):
        chapter = ClaimGraphChapter()
        entry = chapter.append_event("WITHDRAWN", asserted_by="test:one")
        desc = chapter.describe()
        reports = {r["report_id"]: r for r in desc["reports"]}
        by_text = _claims_by_text(reports[REPORT_A_ID])
        for text in (
            "The tide gauge read 2.4 m at 06:35.",
            "The channel was deep enough for the morning sailing.",
            "Approve the morning sailing schedule.",
        ):
            self.assertEqual(by_text[text]["standing"]["classification"], "QUARANTINE", text)
        self.assertEqual(
            by_text["Should the sailing schedule be republished?"]["standing"]["classification"],
            "AFFECTED_UNRESOLVED",
        )
        by_b = _claims_by_text(reports[REPORT_B_ID])
        for text, claim in by_b.items():
            self.assertEqual(claim["standing"]["classification"], "UNAFFECTED", text)

    def test_identical_event_is_not_recorded_twice(self):
        chapter = ClaimGraphChapter()
        first = chapter.append_event("CORRECTED", asserted_by="test:same")
        second = chapter.append_event("CORRECTED", asserted_by="test:same")
        self.assertFalse(first["replayed"])
        self.assertTrue(second["replayed"])
        self.assertEqual(first["event"]["event_id"], second["event"]["event_id"])
        self.assertEqual(len(chapter.history), 1)

    def test_invalid_status_rejected(self):
        chapter = ClaimGraphChapter()
        with self.assertRaises(ValueError):
            chapter.append_event("RETRACTED", asserted_by="test:x")


class TestAuthorizedControl(unittest.TestCase):
    def _join(self, world, pid, scopes, agent_id=None):
        client = _Client(pid, scopes=scopes, agent_id=agent_id)
        out = client.join(world)
        return client, out

    def _world(self):
        import tempfile
        return World(data_root=Path(tempfile.mkdtemp(prefix="cg-test-")))

    def _correct(self, world, client, status, **kw):
        return world.claimgraph_correct(
            client.pid, client.token, status,
            presentation=client.presentation(world, "claimgraph.correct"), **kw)

    def test_allowed_participant_appends_event(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read", "claimgraph.correct"))
        result = self._correct(world, client, "CORRECTED")
        self.assertEqual(result["decision"], "ALLOWED")
        self.assertIsNotNone(result["event_id"])
        self.assertFalse(result["replayed"])
        desc = world.claimgraph_describe()
        self.assertEqual(len(desc["events"]), 1)
        self.assertEqual(desc["events"][0]["status"], "CORRECTED")
        by_text = _claims_by_text(
            {r["report_id"]: r for r in desc["reports"]}[REPORT_A_ID])
        self.assertEqual(
            by_text["The tide gauge read 2.4 m at 06:35."]["standing"]["classification"],
            "QUARANTINE")

    def test_out_of_scope_action_is_stopped_and_appends_nothing(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read",))  # no claimgraph scope
        result = self._correct(world, client, "CORRECTED")
        self.assertEqual(result["decision"], "STOPPED")
        self.assertIn("ACTION_OUTSIDE_MANDATE", result["reason_codes"])
        self.assertIsNone(result["event_id"])
        self.assertEqual(world.claimgraph_describe()["events"], [])

    def test_revoked_participant_is_stopped(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read", "claimgraph.correct"))
        client.revoke(world)
        result = self._correct(world, client, "CORRECTED")
        self.assertEqual(result["decision"], "STOPPED")
        self.assertIn("MANDATE_REVOKED", result["reason_codes"])
        self.assertEqual(world.claimgraph_describe()["events"], [])

    def test_bad_token_and_bad_status(self):
        world = self._world()
        client, out = self._join(world, "alice", ("notes.read", "claimgraph.correct"))
        from world import WorldAuthError
        with self.assertRaises(WorldAuthError):
            world.claimgraph_correct("alice", "wrong-token", "CORRECTED")
        with self.assertRaises(WorldRuleError):
            world.claimgraph_correct("alice", out["token"], "CORRECTED!!")

    def test_idempotent_retry_returns_original(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read", "claimgraph.correct"))
        first = self._correct(world, client, "CORRECTED", idempotency_key="cg-key-1")
        second = self._correct(world, client, "CORRECTED", idempotency_key="cg-key-1")
        self.assertEqual(first["event_id"], second["event_id"])
        self.assertEqual(len(world.claim_graph.history), 1)


if __name__ == "__main__":
    unittest.main()
