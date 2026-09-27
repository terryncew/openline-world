"""Newsroom chapter tests: proposals never change standing by themselves,
imports dedupe, publication time and system-learned time stay distinct,
historical records stay unchanged, and import/review are truly authorized.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.

Every standing asserted here comes from the real openline-claim-graph
engine (analyze_source_impact + verify_impact_report), and every gate
verdict is a real EffectGate evaluation. Nothing is asserted from an
animation of an expected answer.
"""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# world first: it pulls in workshop_gate, which inserts openline-wallet/src
# into sys.path at import (same as the server does).
from world import World, WorldRuleError, WorldAuthError  # noqa: E402

from custody_client import _Client  # noqa: E402

from newsroom_chapter import (  # noqa: E402
    NewsroomChapter,
    REPORT_ID,
)


def _claims_by_text(report_desc):
    return {c["text"]: c for c in report_desc["claims"]}


class TestChapterData(unittest.TestCase):
    def test_describe_is_recorded_data_with_fixture_notice(self):
        chapter = NewsroomChapter()
        desc = chapter.describe()
        self.assertEqual(desc["chapter"]["id"], "newsroom")
        self.assertIn("FIXTURE", desc["fixture_notice"])
        report = desc["report"]
        self.assertEqual(report["report_id"], REPORT_ID)
        self.assertTrue(report["fixture"])
        # Every displayed claim is a recorded claim, verbatim.
        self.assertEqual(
            [c["claim_id"] for c in report["claims"]],
            [c["claim_id"] for c in chapter.report["snapshot"]["claims"]],
        )
        self.assertEqual(
            [c["text"] for c in report["claims"]],
            [c["text"] for c in chapter.report["snapshot"]["claims"]],
        )
        # Before anything is imported there is no standing and no marker.
        for claim in report["claims"]:
            self.assertIsNone(claim["standing"])
        self.assertEqual(desc["dispatches"], [])
        self.assertEqual(desc["pending_review"], 0)
        self.assertTrue(bool(desc["honesty"]))

    def test_import_records_two_distinct_timestamps(self):
        chapter = NewsroomChapter()
        article = chapter.fixture_article()
        out = chapter.import_dispatch(article, imported_by="test:owner")
        self.assertFalse(out["replayed"])
        dispatch = out["dispatch"]
        # Publication time is the article's own claim; retrieved time is when
        # the system learned about it. Two separate recorded fields.
        self.assertEqual(dispatch["published_at"], article["published_at"])
        self.assertTrue(dispatch["retrieved_at"])
        self.assertNotEqual(dispatch["published_at"], dispatch["retrieved_at"])
        self.assertGreater(dispatch["retrieved_at"], dispatch["published_at"])
        self.assertEqual(dispatch["body"], article["body"])
        desc = chapter.describe()
        shown = desc["dispatches"][0]
        self.assertEqual(shown["published_at"], article["published_at"])
        self.assertEqual(shown["retrieved_at"], dispatch["retrieved_at"])
        self.assertEqual(desc["pending_review"], 1)

    def test_reimport_yields_same_dispatch_not_a_duplicate(self):
        chapter = NewsroomChapter()
        article = chapter.fixture_article()
        first = chapter.import_dispatch(article, imported_by="test:owner")
        second = chapter.import_dispatch(article, imported_by="test:owner")
        self.assertFalse(first["replayed"])
        self.assertTrue(second["replayed"])
        self.assertEqual(first["dispatch"]["dispatch_id"],
                         second["dispatch"]["dispatch_id"])
        self.assertEqual(len(chapter.dispatches), 1)
        self.assertEqual(
            len([e for e in chapter.history if e["kind"] == "dispatch-imported"]), 1)

    def test_proposal_alone_never_sets_a_standing(self):
        chapter = NewsroomChapter()
        out = chapter.import_dispatch(chapter.fixture_article(), imported_by="test:owner")
        by_text = _claims_by_text(chapter.describe()["report"])
        for text, claim in by_text.items():
            self.assertIsNone(claim["standing"], text)
        # The proposal record itself says plainly what it is not.
        proposal_id = out["dispatch"]["proposals"][0]
        proposal = chapter.describe()["dispatches"][0]["proposals"][0]
        self.assertEqual(proposal["proposal_id"], proposal_id)
        self.assertEqual(proposal["status"], "proposed")

    def test_decline_leaves_everything_untouched(self):
        chapter = NewsroomChapter()
        before = copy.deepcopy(chapter.describe()["report"]["receipt"])
        out = chapter.import_dispatch(chapter.fixture_article(), imported_by="test:owner")
        result = chapter.review_proposal(
            out["dispatch"]["proposals"][0], "decline", asserted_by="test:owner")
        self.assertEqual(result["decision"], "decline")
        self.assertIsNone(result["admitted"])
        desc = chapter.describe()
        for claim in desc["report"]["claims"]:
            self.assertIsNone(claim["standing"], claim["text"])
        self.assertEqual(desc["report"]["impact"], None)
        self.assertEqual(desc["pending_review"], 0)
        # The original receipt is byte-identical: history appended, never rewritten.
        self.assertEqual(before, desc["report"]["receipt"])
        # The review decision is appended to history, not silently dropped.
        kinds = [e["kind"] for e in chapter.history]
        self.assertIn("dispatch-imported", kinds)
        self.assertIn("review-decision", kinds)

    def test_accept_admits_evidence_through_the_real_engine(self):
        chapter = NewsroomChapter()
        receipt_before = copy.deepcopy(chapter.describe()["report"]["receipt"])
        out = chapter.import_dispatch(chapter.fixture_article(), imported_by="test:owner")
        result = chapter.review_proposal(
            out["dispatch"]["proposals"][0], "accept", asserted_by="test:owner")
        self.assertEqual(result["decision"], "accept")
        self.assertIsNotNone(result["admitted"])

        desc = chapter.describe()
        by_text = _claims_by_text(desc["report"])
        expected = {
            "The east buoy drifted three fathoms east overnight.":
                ("QUARANTINE", "SOURCE_BASIS_LOST"),
            "The east channel was narrower than charted that morning.":
                ("QUARANTINE", "ALL_ADMITTED_SUPPORT_PATHS_LOST"),
            "Hold the morning sailing schedule until the master confirms.":
                ("QUARANTINE", "REQUIRED_DEPENDENCY_LOST"),
            "Buoy adrift. Mind the east channel.":
                ("AFFECTED_UNRESOLVED", "PATH_INCLUDES_ADVISORY_EDGE"),
            "Did the council see the Gazette's full warning, or only the crier's note?":
                ("UNAFFECTED", None),
        }
        for text, (classification, reason) in expected.items():
            standing = by_text[text]["standing"]
            self.assertIsNotNone(standing, text)
            self.assertEqual(standing["classification"], classification, text)
            self.assertEqual(standing["reason"], reason, text)

        # Displayed standings are exactly the backend impact report's:
        # apply the same bucket-name fallback the chapter uses.
        impact = result["admitted"]["report"]
        names = {"quarantine": "QUARANTINE", "survives": "SURVIVES",
                 "affected_unresolved": "AFFECTED_UNRESOLVED",
                 "unaffected": "UNAFFECTED"}
        backend_index = {}
        for bucket, fallback in names.items():
            for item in impact["classifications"][bucket]:
                backend_index[item["claim_id"]] = (
                    item.get("classification", fallback), item.get("reason"))
        for claim in desc["report"]["claims"]:
            shown = claim["standing"]
            self.assertEqual(
                (shown["classification"], shown["reason"]),
                backend_index[claim["claim_id"]], claim["text"])

        # The original receipt is byte-identical: history appended, never rewritten.
        self.assertEqual(receipt_before, desc["report"]["receipt"])
        check = chapter.verify_all()
        self.assertTrue(all(c["valid"] for c in check["receipts"]))
        self.assertTrue(all(c["valid"] for c in check["impacts"]))
        self.assertEqual(desc["pending_review"], 0)

    def test_review_rules(self):
        chapter = NewsroomChapter()
        out = chapter.import_dispatch(chapter.fixture_article(), imported_by="test:owner")
        pid = out["dispatch"]["proposals"][0]
        with self.assertRaises(ValueError):
            chapter.review_proposal(pid, "maybe", asserted_by="test:owner")
        with self.assertRaises(ValueError):
            chapter.review_proposal("proposal:nope-0", "accept", asserted_by="test:owner")
        chapter.review_proposal(pid, "decline", asserted_by="test:owner")
        with self.assertRaises(ValueError):
            chapter.review_proposal(pid, "accept", asserted_by="test:owner")

    def test_bad_imports_rejected(self):
        chapter = NewsroomChapter()
        with self.assertRaises(ValueError):
            chapter.import_dispatch({"title": "x"}, imported_by="test:owner")
        bad = chapter.fixture_article()
        bad["body"] = "invented bytes not on record"
        with self.assertRaises(ValueError):
            chapter.import_dispatch(bad, imported_by="test:owner")


class TestAuthorizedLane(unittest.TestCase):
    def _world(self):
        import tempfile
        return World(data_root=Path(tempfile.mkdtemp(prefix="nr-test-")))

    def _join(self, world, pid, scopes):
        client = _Client(pid, scopes=scopes)
        out = client.join(world)
        return client, out

    def _presentation(self, world, client):
        return client.presentation(world, "newsroom.review")

    def _import(self, world, client, article, **kw):
        return world.newsroom_import(
            client.pid, client.token, article,
            presentation=self._presentation(world, client), **kw)

    def _review(self, world, client, proposal_id, decision):
        return world.newsroom_review(
            client.pid, client.token, proposal_id, decision,
            presentation=self._presentation(world, client))

    def _article(self, world):
        article = world.newsroom.fixture_article()
        proposal = article["proposals"][0]
        claims = world.newsroom_describe()["report"]["claims"]
        drift = next(c for c in claims
                     if c["text"].startswith("The east buoy drifted"))
        proposal["target_claim_id"] = drift["claim_id"]
        return article

    def test_import_and_review_through_the_gate(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read", "newsroom.review"))
        article = self._article(world)
        r = self._import(world, client, article)
        self.assertEqual(r["decision"], "ALLOWED")
        self.assertFalse(r["replayed"])
        self.assertIsNotNone(r["dispatch_id"])
        desc = world.newsroom_describe()
        self.assertEqual(desc["pending_review"], 1)
        proposal_id = desc["dispatches"][0]["proposals"][0]["proposal_id"]
        # Standings are still null: a proposal changes nothing.
        for claim in desc["report"]["claims"]:
            self.assertIsNone(claim["standing"])
        r2 = self._review(world, client, proposal_id, "accept")
        self.assertEqual(r2["decision"], "ALLOWED")
        self.assertEqual(r2["review"], "accept")
        self.assertIsNotNone(r2["admitted_event_id"])
        by_text = _claims_by_text(world.newsroom_describe()["report"])
        self.assertEqual(
            by_text["The east buoy drifted three fathoms east overnight."]
            ["standing"]["classification"], "QUARANTINE")

    def test_out_of_scope_is_stopped_and_records_nothing(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read",))  # no newsroom scope
        r = self._import(world, client, self._article(world))
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("ACTION_OUTSIDE_MANDATE", r["reason_codes"])
        self.assertIsNone(r["dispatch_id"])
        self.assertEqual(world.newsroom_describe()["dispatches"], [])
        r2 = self._review(world, client, "proposal:x-0", "accept")
        self.assertEqual(r2["decision"], "STOPPED")

    def test_revoked_participant_is_stopped(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read", "newsroom.review"))
        client.revoke(world)
        r = self._import(world, client, self._article(world))
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("MANDATE_REVOKED", r["reason_codes"])
        self.assertEqual(world.newsroom_describe()["dispatches"], [])

    def test_bad_token_and_bad_inputs(self):
        world = self._world()
        client, out = self._join(world, "alice", ("notes.read", "newsroom.review"))
        with self.assertRaises(WorldAuthError):
            world.newsroom_import("alice", "wrong-token", self._article(world))
        with self.assertRaises(WorldRuleError):
            world.newsroom_import("alice", out["token"], {"title": "x"})
        with self.assertRaises(WorldRuleError):
            world.newsroom_review("alice", out["token"], "proposal:x-0", "accept!!")

    def test_idempotent_retry_returns_original(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read", "newsroom.review"))
        article = self._article(world)
        first = self._import(world, client, article, idempotency_key="nr-key-1")
        second = self._import(world, client, article, idempotency_key="nr-key-1")
        self.assertEqual(first["dispatch_id"], second["dispatch_id"])
        self.assertEqual(len(world.newsroom.dispatches), 1)

    def test_reimport_without_key_dedupes_by_content(self):
        world = self._world()
        client, _ = self._join(world, "alice", ("notes.read", "newsroom.review"))
        article = self._article(world)
        first = self._import(world, client, article)
        second = self._import(world, client, article)
        self.assertTrue(second["replayed"])
        self.assertEqual(first["dispatch_id"], second["dispatch_id"])
        self.assertEqual(len(world.newsroom.dispatches), 1)


if __name__ == "__main__":
    unittest.main()
