"""CHALLENGE-001 acceptance tests: the receiver-owned contribution path.

What these tests pin down:
- The frozen criteria hash in challenge_acceptance.py equals the sha256 of
  the frozen research/challenge-001/CHALLENGE-CRITERIA-001.md file.
- K1-K7 structural admission on fixed fixtures (patch/test/review).
- Amended K5: a two-bug test is ADMITTED structurally; the one-bug rule
  is evaluator merit, not a machine refusal.
- Submitted code is never executed: a malicious-looking body is treated
  as inert text (no exec/import/eval anywhere in the path).
- The full World path: create (owner/admin scope) -> contribute (gated,
  byte-bound, admitted) -> evaluate (evaluator-only ACCEPT/DECLINE) ->
  refusals recorded with named reason codes (MANDATE_REVOKED,
  EVALUATOR_NOT_OWNER).
- The challenge chapter survives a World reload via the snapshot
  (restart durability); a reset starts a fresh chapter.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.
"""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from world import World  # noqa: E402

from custody_client import _Client  # noqa: E402

from challenge_acceptance import (  # noqa: E402
    CHALLENGE_ID, CRITERIA_HASH, SCOPE_NOTE, evaluate_contribution)
from challenge_chapter import ChallengeChapter  # noqa: E402

RESEARCH = Path(__file__).resolve().parent.parent.parent / "research"
CRITERIA_FILE = RESEARCH / "challenge-001" / "CHALLENGE-CRITERIA-001.md"

PATCH_BODY = """--- a/toy-app/ledger.py
+++ b/toy-app/ledger.py
@@ -8,6 +8,6 @@
     out = []
-    for i in range(len(values) - window):
+    for i in range(len(values) - window + 1):
         out.append(sum(values[i:i+window]))
     return out
"""

TEST_BODY = """# test_rolling_sum.py — failing test for BUG-1 in toy-app/ledger.py
# Expected behavior per toy-app/EXPECTED.md: rolling_sum([1,2,3,4], 2) == [3,5,7]
from toy_app.ledger import rolling_sum

def test_last_window():
    got = rolling_sum([1, 2, 3, 4], 2)
    assert got == [3, 5, 7], f"expected [3,5,7], got {got}"
"""

TWO_BUG_TEST_BODY = """# test_two_bugs.py — demonstrates BUG-1 and BUG-2 in toy-app/ledger.py
# Expected behavior per toy-app/EXPECTED.md
from toy_app.ledger import rolling_sum, apply_discount

def test_both():
    assert rolling_sum([1, 2, 3, 4], 2) == [3, 5, 7]
    assert apply_discount(5, 50) == 3  # BUG-2: banker's rounding gives 2
"""

REVIEW_BODY = """Review of CHC-0001 (rolling_sum off-by-one patch).

Finding: the patch changes range(len(values) - window) to
range(len(values) - window + 1). Checkable without running: for
values=[1,2,3,4], window=2 the fixed expression is range(3), i.e. 3
windows, matching EXPECTED.md's [3, 5, 7]. The claim is about the
expression's value, not about execution.
"""

MALICIOUS_PATCH_BODY = """--- a/toy-app/ledger.py
+++ b/toy-app/ledger.py
@@ -1,3 +1,4 @@
+__import__('os').system('echo pwned')
 def rolling_sum(values, window):
     out = []
     for i in range(len(values) - window + 1):"""


def _world():
    return World(data_root=Path(tempfile.mkdtemp(prefix="ch-test-")))


def _base(**overrides):
    body = overrides.pop("body", PATCH_BODY)
    params = {
        "kind": "patch", "title": "Fix rolling_sum off-by-one",
        "body": body, "challenge_id": CHALLENGE_ID,
        "criteria_hash": CRITERIA_HASH,
        "declared_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "participant_id": "alice", "expected_author": "alice",
        "references": "", "original": True, "derived_from": [],
        "existing_ids": frozenset(),
    }
    params.update(overrides)
    return evaluate_contribution(**params)


class TestFrozenBinding(unittest.TestCase):
    def test_criteria_hash_matches_frozen_file(self):
        pinned = hashlib.sha256(
            CRITERIA_FILE.read_bytes()).hexdigest()
        self.assertEqual(CRITERIA_HASH, pinned)
        self.assertEqual(CHALLENGE_ID, "CHALLENGE-001")

    def test_scope_note_disclaims_verification(self):
        self.assertIn("never", SCOPE_NOTE)
        self.assertIn("not factual verification", SCOPE_NOTE)


class TestStructuralAdmission(unittest.TestCase):
    def test_good_patch_admitted(self):
        rec = _base()
        self.assertEqual(rec["verdict"], "ADMITTED")
        self.assertTrue(all(r["result"] == "pass" for r in rec["results"]))

    def test_bad_kind_refused_k1(self):
        rec = _base(kind="essay")
        self.assertEqual(rec["verdict"], "REFUSED")
        self.assertIn("K1", [r["criterion"] for r in rec["results"]
                             if r["result"] == "fail"])

    def test_hash_mismatch_refused_k2(self):
        rec = _base(declared_sha256="0" * 64)
        self.assertEqual(rec["verdict"], "REFUSED")
        failed = [r["criterion"] for r in rec["results"] if r["result"] == "fail"]
        self.assertIn("K2", failed)

    def test_wrong_criteria_hash_refused_k2(self):
        rec = _base(criteria_hash="f" * 64)
        self.assertEqual(rec["verdict"], "REFUSED")

    def test_author_mismatch_refused_k3(self):
        rec = _base(participant_id="mallory")
        self.assertEqual(rec["verdict"], "REFUSED")
        failed = [r["criterion"] for r in rec["results"] if r["result"] == "fail"]
        self.assertIn("K3", failed)

    def test_patch_without_hunk_refused_k4(self):
        rec = _base(body="just some text about ledger.py\n")
        self.assertEqual(rec["verdict"], "REFUSED")

    def test_good_test_admitted(self):
        rec = _base(kind="test", title="Failing test for BUG-1",
                    body=TEST_BODY)
        self.assertEqual(rec["verdict"], "ADMITTED")

    def test_two_bug_test_admitted_structurally(self):
        # Amended K5: one-bug-per-test is evaluator merit (Stage 2), not a
        # structural refusal. The machine admits it; the evaluator declines.
        rec = _base(kind="test", title="Test bundling two bugs",
                    body=TWO_BUG_TEST_BODY)
        self.assertEqual(rec["verdict"], "ADMITTED")

    def test_test_without_assert_refused_k5(self):
        rec = _base(kind="test", title="Test with no assert",
                    body="toy-app/ledger.py\nEXPECTED.md says rolling_sum gives [3,5,7]\n")
        self.assertEqual(rec["verdict"], "REFUSED")

    def test_good_review_admitted(self):
        rec = _base(kind="review", title="Review of the rolling_sum patch",
                    body=REVIEW_BODY, references="CHC-0001",
                    existing_ids=frozenset({"CHC-0001"}))
        self.assertEqual(rec["verdict"], "ADMITTED")

    def test_review_of_unknown_id_refused_k6(self):
        rec = _base(kind="review", title="Review of nothing",
                    body=REVIEW_BODY, references="CHC-9999",
                    existing_ids=frozenset({"CHC-0001"}))
        self.assertEqual(rec["verdict"], "REFUSED")

    def test_review_without_finding_refused_k6(self):
        rec = _base(kind="review", title="Empty review",
                    body="I looked at it. Seems fine.\n",
                    references="CHC-0001",
                    existing_ids=frozenset({"CHC-0001"}))
        self.assertEqual(rec["verdict"], "REFUSED")

    def test_nonoriginal_without_sources_refused_k7(self):
        rec = _base(original=False, derived_from=[])
        self.assertEqual(rec["verdict"], "REFUSED")

    def test_nonoriginal_with_url_source_admitted(self):
        rec = _base(original=False,
                    derived_from=["https://example.com/patch-notes"])
        self.assertEqual(rec["verdict"], "ADMITTED")

    def test_malicious_body_is_inert_text(self):
        # A body that would be dangerous if executed must still be treated
        # as inert text: structurally admitted (it is a well-formed diff),
        # and this call returns normally — nothing in this module executes,
        # imports, evals, or applies the body.
        rec = _base(body=MALICIOUS_PATCH_BODY)
        self.assertEqual(rec["verdict"], "ADMITTED")


class TestChapterPersistence(unittest.TestCase):
    def test_snapshot_round_trip(self):
        ch = ChallengeChapter()
        ch.create(challenge_id="CHALLENGE-001", problem_sha256="a" * 64,
                  criteria_hash=CRITERIA_HASH, deadline_iso="2026-10-12T00:00:00+00:00",
                  owner_participant_id="owner", gate_receipt={}, created_by="Owner")
        c = ch.contribute(challenge_id="CHALLENGE-001", kind="patch",
                          title="t", body=PATCH_BODY,
                          body_sha256=hashlib.sha256(
                              PATCH_BODY.encode()).hexdigest(),
                          participant_id="alice", display_name="Alice",
                          references="", original=True, derived_from=[],
                          builds_on=[], builds_on_sha256=hashlib.sha256(
                              b"[]").hexdigest(),
                          acceptance={"verdict": "ADMITTED"},
                          gate_receipt={})
        ch.evaluate(contribution_id=c["contribution_id"], decision="ACCEPT",
                    reason="fixes BUG-1 per EXPECTED.md", evaluator_id="owner",
                    gate_receipt={})
        ch.refuse(participant_id="mallory", challenge_id="CHALLENGE-001",
                  contribution_id=None, reason_codes=["MANDATE_REVOKED"],
                  gate_receipt=None)
        ch2 = ChallengeChapter()
        ch2.load(ch.snapshot())
        d = ch2.describe()
        self.assertEqual(len(d["contributions"]), 1)
        self.assertEqual(d["contributions"][0]["status"], "accepted")
        self.assertEqual(len(d["decisions"]), 1)
        self.assertEqual(len(d["refusals"]), 1)
        # Sequence counter restored: no id reuse across restarts.
        c2 = ch2.contribute(challenge_id="CHALLENGE-001", kind="test",
                            title="t2", body="x", body_sha256="y",
                            participant_id="b", display_name="B",
                            references="", original=True, derived_from=[],
                            builds_on=[], builds_on_sha256=hashlib.sha256(
                                b"[]").hexdigest(),
                            acceptance={"verdict": "ADMITTED"},
                            gate_receipt={})
        self.assertEqual(c2["contribution_id"], "CHC-0002")


def _spec():
    return {"challenge_id": CHALLENGE_ID, "criteria_hash": CRITERIA_HASH,
            "problem_sha256": "b" * 64,
            "deadline_iso": "2026-10-12T00:00:00+00:00"}


def _contribution(client, kind, body, **kw):
    builds_on = kw.get("builds_on", [])
    params = {"kind": kind, "title": kw.get("title", f"{kind} by {client.pid}"),
              "body": body, "challenge_id": CHALLENGE_ID,
              "criteria_hash": CRITERIA_HASH,
              "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
              "participant_id": client.pid,
              "references": kw.get("references", ""),
              "original": kw.get("original", True),
              "derived_from": kw.get("derived_from", []),
              "builds_on": builds_on,
              "builds_on_sha256": hashlib.sha256(
                  json.dumps(builds_on, sort_keys=True,
                             separators=(",", ":")).encode("utf-8")
              ).hexdigest()}
    return params


class TestWorldPath(unittest.TestCase):
    def test_full_path_and_controls(self):
        w = _world()
        owner = _Client("owner", scopes=("challenge.admin", "challenge.contribute"))
        owner.join(w)
        alice = _Client("alice", scopes=("challenge.contribute",))
        alice.join(w)
        bob = _Client("bob", scopes=("challenge.contribute",))
        bob.join(w)

        # create: owner designates itself evaluator
        created = w.challenge_create(
            owner.pid, owner.token, _spec(),
            presentation=owner.presentation(w, "challenge.admin"))
        self.assertEqual(created["decision"], "ALLOWED")
        self.assertEqual(created["challenge"]["owner_participant_id"], "owner")

        # alice contributes a patch
        resp = w.challenge_contribute(
            alice.pid, alice.token,
            _contribution(alice, "patch", PATCH_BODY),
            presentation=alice.presentation(w, "challenge.contribute"))
        self.assertEqual(resp["decision"], "ALLOWED")
        patch_id = resp["contribution_id"]
        self.assertTrue(patch_id.startswith("CHC-"))

        # bob reviews alice's patch (peer review of another contribution)
        resp = w.challenge_contribute(
            bob.pid, bob.token,
            _contribution(bob, "review", REVIEW_BODY, references=patch_id,
                          title="Review of the rolling_sum patch"),
            presentation=bob.presentation(w, "challenge.contribute"))
        self.assertEqual(resp["decision"], "ALLOWED")
        review_id = resp["contribution_id"]

        # evaluator ACCEPTs the patch, DECLINEs the two-bug test
        resp = w.challenge_contribute(
            bob.pid, bob.token,
            _contribution(bob, "test", TWO_BUG_TEST_BODY,
                          title="Test bundling two bugs"),
            presentation=bob.presentation(w, "challenge.contribute"))
        self.assertEqual(resp["decision"], "ALLOWED")
        test_id = resp["contribution_id"]

        ev = w.challenge_evaluate(
            owner.pid, owner.token, patch_id, "ACCEPT",
            "diff is well-formed; the one-line change matches EXPECTED.md for BUG-1",
            presentation=owner.presentation(w, "challenge.admin"))
        self.assertEqual(ev["decision"], "ALLOWED")

        ev = w.challenge_evaluate(
            owner.pid, owner.token, test_id, "DECLINE",
            "bundles BUG-1 and BUG-2; one bug per test",
            presentation=owner.presentation(w, "challenge.admin"))
        self.assertEqual(ev["decision"], "ALLOWED")

        # control: contributor self-approval changes nothing
        ev = w.challenge_evaluate(
            bob.pid, bob.token, review_id, "ACCEPT", "I approve my own review",
            presentation=bob.presentation(w, "challenge.contribute"))
        self.assertEqual(ev["decision"], "STOPPED")
        self.assertIn("EVALUATOR_NOT_OWNER", ev["reason_codes"])
        board = w.challenge_describe()
        self.assertEqual(
            [d["decision"] for d in board["decisions"]], ["ACCEPT", "DECLINE"])

        # control: revoked participant is refused with a named reason
        bob.revoke(w)
        resp = w.challenge_contribute(
            bob.pid, bob.token,
            _contribution(bob, "patch", PATCH_BODY, title="after revocation"),
            presentation=bob.presentation(w, "challenge.contribute"))
        self.assertEqual(resp["decision"], "STOPPED")
        self.assertIn("MANDATE_REVOKED", resp["reason_codes"])
        self.assertIsNotNone(resp["refusal_id"])

        # public read still works
        board = w.challenge_describe()
        self.assertEqual(len(board["contributions"]), 3)
        self.assertEqual(len(board["refusals"]), 2)
        self.assertEqual(board["criteria_hash"], CRITERIA_HASH)

        # idempotency: same key + same bytes replays the stored result
        key = "idem-key-1"
        r1 = w.challenge_contribute(
            alice.pid, alice.token,
            _contribution(alice, "patch", PATCH_BODY, title="idem"),
            presentation=alice.presentation(w, "challenge.contribute"),
            idempotency_key=key)
        r2 = w.challenge_contribute(
            alice.pid, alice.token,
            _contribution(alice, "patch", PATCH_BODY, title="idem"),
            presentation=alice.presentation(w, "challenge.contribute"),
            idempotency_key=key)
        self.assertTrue(r2["replayed"])
        self.assertEqual(r1["contribution_id"], r2["contribution_id"])

    def test_create_requires_admin_scope(self):
        w = _world()
        stranger = _Client("stranger", scopes=("challenge.contribute",))
        stranger.join(w)
        with self.assertRaises(Exception) as ctx:
            w.challenge_create(
                stranger.pid, stranger.token, _spec(),
                presentation=stranger.presentation(w, "challenge.admin"))
        self.assertIn("WORLD_AUTHORIZATION_REFUSED", str(ctx.exception))

    def test_survives_reload(self):
        w = _world()
        root = w._data_root
        owner = _Client("owner", scopes=("challenge.admin", "challenge.contribute"))
        owner.join(w)
        w.challenge_create(owner.pid, owner.token, _spec(),
                           presentation=owner.presentation(w, "challenge.admin"))
        w2 = World(data_root=root)
        board = w2.challenge_describe()
        self.assertEqual(len(board["challenges"]), 1)
        self.assertEqual(board["challenges"][0]["challenge_id"], "CHALLENGE-001")


if __name__ == "__main__":
    unittest.main()
