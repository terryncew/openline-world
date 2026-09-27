"""Research-report admission tests: the receiver-owned acceptance path for an
actual research artifact (newsroom_submit_report).

What these tests pin down:
- The submitted bytes, the evaluation, the acceptance, and the displayed
  dispatch are bound to the SAME exact bytes (hash-pinned at submit).
- Altered/substituted bytes are refused by the receiver before any effect.
- Revocation stops the next gated submit.
- The structural checks never claim factual verification.
- The original fixture import path is untouched.

Run:  ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests
from backend/.
"""
import hashlib
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# world first: it pulls in workshop_gate, which inserts openline-wallet/src
# into sys.path at import (same as the server does).
from world import World  # noqa: E402

from custody_client import _Client  # noqa: E402

from report_acceptance import evaluate_report, PERMITTED_SOURCES  # noqa: E402

RESEARCH = Path(__file__).resolve().parent.parent.parent / "research"
REAL_REPORT = RESEARCH / "report-20260926T233916Z.md"
REAL_SHA = "d80eed02cabf6e331e96258e8bb61d75d1dc1499447de99112ba2cb123b1f558"

# A minimal body that passes C1-C5 structurally. Shape only — these are
# structural checks, never factual verification. Content directly follows
# each "##" heading (no blank line), matching the real report's format —
# the frozen C4 check strips the Uncertainties section by exact match, so a
# blank line after the heading would defeat it (observed behavior, ported
# exactly; see research/evaluate.py).
PASSING_BODY = """# T
## Sourced observations
- Observation one, from the source texts.
## Interpretation
The following is model interpretation, not sourced fact.
## Sources
- https://www.w3.org/TR/did-core/ (retrieved: 2026-09-26)
- https://datatracker.ietf.org/doc/html/rfc6749 (retrieved: 2026-09-26)
- https://openid.net/specs/openid-connect-core-1_0.html (retrieved: 2026-09-26)
## Uncertainties
- One genuine uncertainty; self-improvement was not demonstrated.
"""


def _world():
    return World(data_root=Path(tempfile.mkdtemp(prefix="rr-test-")))


def _join(world, pid, scopes=("newsroom.review",)):
    client = _Client(pid, scopes=scopes)
    out = client.join(world)
    return client, out


def _submit(world, client, body, sha=None, **kw):
    return world.newsroom_submit_report(
        client.pid, client.token, _submission(body, sha),
        presentation=client.presentation(world, "newsroom.review"), **kw)


def _submission(body, sha=None, title="Research report"):
    return {"title": title, "source_url": "agent-submission://atlas-1/report",
            "published_at": "2026-09-26T23:39:16Z", "body": body,
            "report_sha256": sha or hashlib.sha256(body.encode("utf-8")).hexdigest()}


class TestSubmitReport(unittest.TestCase):
    def test_real_report_admitted_and_bound_to_same_bytes(self):
        world = _world()
        client, _ = _join(world, "carol")
        body = REAL_REPORT.read_text(encoding="utf-8")
        self.assertEqual(hashlib.sha256(body.encode("utf-8")).hexdigest(), REAL_SHA)
        r = _submit(world, client, body, REAL_SHA, idempotency_key="t1")
        self.assertEqual(r["decision"], "ALLOWED")
        self.assertTrue(r["binding"]["match"])
        self.assertEqual(r["binding"]["declared_sha256"], REAL_SHA)
        self.assertEqual(r["binding"]["pinned_sha256"], REAL_SHA)
        self.assertEqual(r["acceptance"]["verdict"], "ACCEPTED")
        self.assertEqual(r["acceptance"]["evaluated_sha256"], REAL_SHA)
        self.assertIsNotNone(r["dispatch_id"])
        # The displayed artifact is the same bytes.
        desc = world.newsroom_describe()
        disp = next(d for d in desc["dispatches"]
                    if d["dispatch_id"] == r["dispatch_id"])
        self.assertTrue(disp["research_report"])
        self.assertEqual(disp["report_sha256"], REAL_SHA)
        self.assertEqual(hashlib.sha256(disp["body"].encode("utf-8")).hexdigest(),
                         REAL_SHA)
        self.assertEqual(disp["body"], body)
        self.assertEqual(disp["acceptance"]["verdict"], "ACCEPTED")

    def test_backend_matches_reference_evaluator(self):
        """The server-side port agrees with research/evaluate.py, and the
        frozen evaluation record from the original run binds to the same
        bytes."""
        body = REAL_REPORT.read_text(encoding="utf-8")
        mine = evaluate_report(body)
        frozen = json.loads((RESEARCH / "evaluation-20260926T233916Z.json")
                            .read_text(encoding="utf-8"))
        self.assertEqual(frozen["report_sha256"], REAL_SHA)
        self.assertEqual(frozen["verdict"], "ACCEPTED")
        self.assertEqual(mine["verdict"], frozen["verdict"])
        self.assertEqual(
            [(c["criterion"], c["result"]) for c in mine["results"]],
            [(c["criterion"], c["result"]) for c in frozen["results"]])
        # The backend's permitted-source list matches the frozen LIMITS.md.
        text = (RESEARCH / "LIMITS.md").read_text(encoding="utf-8")
        urls = re.findall(r"https?://\S+", "\n".join(
            line for line in text.splitlines()
            if re.match(r"^\d+\.\s+https?://", line)))
        self.assertEqual(sorted(set(urls)), sorted(PERMITTED_SOURCES))

    def test_altered_bytes_refused_before_effect(self):
        world = _world()
        client, _ = _join(world, "dave")
        body = REAL_REPORT.read_text(encoding="utf-8")
        flipped = body.replace("agent's identity", "agent's IDENTIFY", 1)
        self.assertNotEqual(flipped, body)
        # Substituted bytes presented under the original pinned hash.
        r = _submit(world, client, flipped, REAL_SHA, idempotency_key="t3")
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("REPORT_HASH_MISMATCH", r["reason_codes"])
        self.assertFalse(r["binding"]["match"])
        self.assertIsNone(r["dispatch_id"])
        self.assertEqual(world.newsroom_describe()["dispatches"], [])

    def test_criteria_failure_refused(self):
        world = _world()
        client, _ = _join(world, "erin")
        # Drop the Uncertainties section entirely: C2 must fail.
        body = PASSING_BODY.split("## Uncertainties")[0]
        r = _submit(world, client, body, idempotency_key="t4")
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("REPORT_ACCEPTANCE_FAILED", r["reason_codes"])
        self.assertEqual(r["acceptance"]["verdict"], "REJECTED")
        self.assertIsNone(r["dispatch_id"])
        self.assertEqual(world.newsroom_describe()["dispatches"], [])

    def test_revocation_stops_the_next_submit(self):
        world = _world()
        client, _ = _join(world, "frank")
        client.revoke(world)
        body = REAL_REPORT.read_text(encoding="utf-8")
        r = _submit(world, client, body, REAL_SHA, idempotency_key="t5")
        self.assertEqual(r["decision"], "STOPPED")
        self.assertIn("MANDATE_REVOKED", r["reason_codes"])
        self.assertIsNone(r["dispatch_id"])
        self.assertEqual(world.newsroom_describe()["dispatches"], [])

    def test_structural_checks_never_claim_factual_verification(self):
        rec = evaluate_report(PASSING_BODY)
        self.assertEqual(rec["verdict"], "ACCEPTED")
        note = rec["scope_note"]
        self.assertIn("Structural checks only", note)
        self.assertIn("do NOT", note)
        self.assertIn("verify that any claim", note)

    def test_fixture_import_path_untouched(self):
        world = _world()
        client, _ = _join(world, "grace", ("notes.read", "newsroom.review"))
        fixture = world.newsroom.fixture_article()
        r = world.newsroom_import(
            "grace", client.token, fixture,
            presentation=client.presentation(world, "newsroom.review"))
        self.assertEqual(r["decision"], "ALLOWED")
        self.assertIsNotNone(r["dispatch_id"])
        desc = world.newsroom_describe()
        disp = next(d for d in desc["dispatches"]
                    if d["dispatch_id"] == r["dispatch_id"])
        # Fixture dispatches carry no research-report binding.
        self.assertFalse(disp.get("research_report"))
        self.assertIsNone(disp.get("report_sha256"))
        self.assertIsNone(disp.get("acceptance"))
        # Unregistered bytes are still refused on the fixture path.
        with self.assertRaises(ValueError):
            world.newsroom.import_dispatch(
                {"title": "x", "source_url": "u", "published_at": "t",
                 "body": "not the fixture bytes"}, imported_by="test")

    def test_replay_returns_original_without_new_effect(self):
        world = _world()
        client, _ = _join(world, "heidi")
        body = REAL_REPORT.read_text(encoding="utf-8")
        first = _submit(world, client, body, REAL_SHA, idempotency_key="t8")
        second = _submit(world, client, body, REAL_SHA, idempotency_key="t8")
        self.assertEqual(second["dispatch_id"], first["dispatch_id"])
        self.assertEqual(len(world.newsroom_describe()["dispatches"]), 1)
        # Same bytes submitted without a key: chapter dedupe, replayed.
        third = _submit(world, client, body, REAL_SHA)
        self.assertTrue(third["replayed"])
        self.assertEqual(third["dispatch_id"], first["dispatch_id"])
        self.assertEqual(len(world.newsroom_describe()["dispatches"]), 1)


if __name__ == "__main__":
    unittest.main()
