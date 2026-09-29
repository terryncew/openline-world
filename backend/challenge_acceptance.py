"""Challenge-contribution acceptance: the receiver-owned structural checks.

Mechanical port of the frozen research/challenge-001/CHALLENGE-CRITERIA-001.md
(2026-09-28), K1-K7, implemented here so the backend's challenge-contribute
path can run the declared admission checks server-side, on the pinned
bytes, at admission time.

WHAT THESE CHECKS ARE AND ARE NOT:
- They are STRUCTURAL checks: kind presence, challenge/criteria binding,
  authorship match, per-kind format, reference existence, byte binding.
  They verify the artifact's shape.
- They are NOT factual verification: a contribution that is ADMITTED may
  still make false claims — a patch may not fix the bug, a test may not
  fail, a review's finding may be wrong. Nothing in the acceptance record,
  the UI, or the capture may present these checks as verifying that any
  claim in the contribution is true. The acceptance record carries this
  scope note verbatim.

NO EXECUTION, EVER: this module is pure text and regex over the pinned
bytes. It never imports, execs, evals, compiles, or applies a submitted
body. A patch is inert text here, as everywhere on the server. The
isolation verdict (research/ISOLATION-VERDICT-2026-09-27.md) stands: the
study runner was not a security boundary, so the server has no runner.

The canonical criteria live in
research/challenge-001/CHALLENGE-CRITERIA-001.md and their frozen sha256
is hardcoded below; backend/tests/test_challenge_acceptance.py asserts
this module's verdicts against the frozen file's rules on fixed fixtures.
"""

from __future__ import annotations

import hashlib
import re

# Frozen sha256 of research/challenge-001/CHALLENGE-CRITERIA-001.md.
CRITERIA_HASH = "86be00e377e030b00b4a8d33b3c9b0d4d95e7049125981d714023a2ca5f6537a"
CHALLENGE_ID = "CHALLENGE-001"

KINDS = ("patch", "test", "review")

_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")

SCOPE_NOTE = (
    "Structural checks only: they verify the contribution's shape (kind "
    "present, challenge/criteria binding exact, authorship matches the "
    "presenting session, per-kind format well-formed, review references an "
    "existing contribution, bytes bound to the pinned hash). They do NOT "
    "verify that any claim in the contribution is true: an admitted patch "
    "may not fix the bug, an admitted test may not fail, an admitted "
    "review's finding may be wrong. Admission admits the artifact for "
    "evaluation; it is not factual verification. Submitted code is never "
    "executed on the server."
)


def check_k1(kind: str, title: str, body: str) -> tuple[str, str]:
    if kind not in KINDS:
        return "fail", f"kind {kind!r} not in {list(KINDS)}"
    if not title or len(title) > 120:
        return "fail", "title missing or longer than 120 chars"
    if not body.strip() or len(body) > 16384:
        return "fail", "body empty or longer than 16384 chars"
    return "pass", f"kind {kind}; title {len(title)} chars; body {len(body)} chars"


def check_k2(challenge_id: str, criteria_hash: str, declared: str,
             pinned: str) -> tuple[str, str]:
    if challenge_id != CHALLENGE_ID:
        return "fail", f"challenge_id {challenge_id!r} != {CHALLENGE_ID!r}"
    if criteria_hash != CRITERIA_HASH:
        return "fail", "criteria_hash does not match the frozen criteria"
    if declared != pinned:
        return "fail", "declared sha256 != sha256 of the pinned bytes"
    return "pass", "challenge, criteria, and byte binding all match"


def check_k3(participant_id: str, expected_author: str) -> tuple[str, str]:
    if participant_id != expected_author:
        return "fail", "declared participant_id != presenting session"
    return "pass", "authorship matches the presenting session"


def check_k4_patch(body: str) -> tuple[str, str]:
    problems = []
    if not re.search(r"^---\s+\S+", body, re.M):
        problems.append("no '---' header")
    if not re.search(r"^\+\+\+\s+\S+", body, re.M):
        problems.append("no '+++' header")
    if not re.search(r"^@@\s+", body, re.M):
        problems.append("no '@@' hunk")
    if "toy-app/ledger.py" not in body and "ledger.py" not in body:
        problems.append("does not touch toy-app/ledger.py")
    if problems:
        return "fail", "; ".join(problems)
    return "pass", "unified diff with headers, hunk, and ledger.py target"


def check_k5_test(body: str) -> tuple[str, str]:
    if "toy-app" not in body and "ledger" not in body:
        return "fail", "does not name the toy-app target"
    if "EXPECTED.md" not in body:
        return "fail", "does not cite EXPECTED.md for the expected behavior"
    if not re.search(r"\bassert\b", body):
        return "fail", "no assert statement"
    # NOTE (amended criteria): "exactly one documented bug" is a merit
    # judgment for the evaluator (Stage 2), not a structural refusal.
    return "pass", "failing-test file naming the target and expected behavior"


def check_k6_review(body: str, references: str,
                    existing_ids: frozenset[str]) -> tuple[str, str]:
    if not references or references not in existing_ids:
        return "fail", f"references {references!r}: no such contribution"
    if "Finding:" not in body:
        return "fail", "no 'Finding:' checkable-finding section"
    return "pass", f"reviews {references} with a checkable finding"


def check_k7(original: bool, derived_from: list[str],
             existing_ids: frozenset[str]) -> tuple[str, str]:
    if original:
        if derived_from:
            return "fail", "declared original but lists derived_from sources"
        return "pass", "declared original work"
    if not derived_from:
        return "fail", "not original but no sources listed"
    bad = [s for s in derived_from
           if not (s.startswith(("http://", "https://")) or s in existing_ids)]
    if bad:
        return "fail", f"source(s) not a URL or known contribution id: {bad[:3]}"
    return "pass", f"{len(derived_from)} source(s) named"


def evaluate_contribution(*, kind: str, title: str, body: str,
                          challenge_id: str, criteria_hash: str,
                          declared_sha256: str, participant_id: str,
                          expected_author: str, references: str = "",
                          original: bool = True,
                          derived_from: list[str] | None = None,
                          existing_ids: frozenset[str] = frozenset()) -> dict:
    """Run K1-K7 on the exact pinned bytes. Returns the acceptance record.

    The record binds itself to the pinned bytes via evaluated_sha256. It
    is a structural assessment, not factual verification (see SCOPE_NOTE).
    No part of this function executes, imports, or applies `body`.
    """
    derived_from = derived_from or []
    pinned_sha256 = hashlib.sha256(body.encode("utf-8")).hexdigest()
    results: list[dict[str, str]] = []

    def record(criterion: str, check: str, outcome: tuple[str, str]) -> None:
        result, detail = outcome
        results.append({"criterion": criterion, "check_performed": check,
                        "result": result, "detail": detail})

    record("K1", "kind in {patch,test,review}; title/body present and bounded",
           check_k1(kind, title, body))
    record("K2", "challenge_id + criteria_hash match frozen values; "
                 "declared sha256 == pinned sha256",
           check_k2(challenge_id, criteria_hash, declared_sha256, pinned_sha256))
    record("K3", "declared participant_id == presenting session",
           check_k3(participant_id, expected_author))
    if kind == "patch":
        record("K4", "patch: unified-diff headers, @@ hunk, ledger.py target",
               check_k4_patch(body))
    elif kind == "test":
        record("K5", "test: names toy-app target, cites EXPECTED.md, asserts "
                     "(one-bug-per-test is evaluator merit, not structural)",
               check_k5_test(body))
    elif kind == "review":
        record("K6", "review: references an existing contribution id, states "
                     "a checkable finding",
               check_k6_review(body, references, existing_ids))
    record("K7", "original declared, or non-original with named sources",
           check_k7(original, derived_from, existing_ids))

    return {
        "criteria_frozen": "research/challenge-001/CHALLENGE-CRITERIA-001.md "
                           "(2026-09-28)",
        "criteria_hash": CRITERIA_HASH,
        "evaluator": "backend/challenge_acceptance.py (deterministic; no "
                     "model, no network; submitted code never executed)",
        "evaluated_sha256": pinned_sha256,
        "scope_note": SCOPE_NOTE,
        "results": results,
        "verdict": "ADMITTED" if all(r["result"] == "pass" for r in results)
                   else "REFUSED",
    }
