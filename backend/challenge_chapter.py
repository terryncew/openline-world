"""CHALLENGE-001 chapter: durable store for challenge contributions.

The challenge chapter is DURABLE, unlike the newsroom/ClaimGraph chapters:
its state is written into the world snapshot (save/load) and survives a
server restart. Closing the browser erases nothing — the browser is a
viewer; it holds no keys, no tokens, no contributions.

What lives here:
- challenges: the frozen problem statement reference + criteria hash +
  deadline + designated evaluator, bound at creation.
- contributions: admitted contributions (inert text; never executed).
- decisions: evaluator ACCEPT/DECLINE records with reason.
- refusals: the refusal ledger — every refused attempt with a named
  reason (gate stops, binding failures, admission failures, unauthorized
  evaluations).

All writes are plain JSON-safe dicts; snapshot() / load() round-trip the
whole chapter. Sequence counters are restored from the loaded state so
ids never repeat across restarts.
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ChallengeChapter:
    def __init__(self) -> None:
        self.challenges: dict[str, dict[str, Any]] = {}
        self.contributions: list[dict[str, Any]] = []
        self.decisions: list[dict[str, Any]] = []
        self.refusals: list[dict[str, Any]] = []
        self._seq = 0

    # -- creation -----------------------------------------------------------

    def create(self, *, challenge_id: str, problem_sha256: str,
               criteria_hash: str, deadline_iso: str,
               owner_participant_id: str, gate_receipt: dict[str, Any],
               created_by: str) -> dict[str, Any]:
        if challenge_id in self.challenges:
            raise KeyError(f"challenge exists: {challenge_id}")
        challenge = {
            "challenge_id": challenge_id,
            "problem_sha256": problem_sha256,
            "criteria_hash": criteria_hash,
            "deadline_iso": deadline_iso,
            "owner_participant_id": owner_participant_id,
            "created_by": created_by,
            "created_at": _utc_now_iso(),
            "create_receipt_id": _receipt_id(gate_receipt),
        }
        self.challenges[challenge_id] = challenge
        return copy.deepcopy(challenge)

    # -- contributions -------------------------------------------------------

    def contribution_ids(self) -> set[str]:
        return {c["contribution_id"] for c in self.contributions}

    def get_contribution(self, contribution_id: str) -> dict[str, Any] | None:
        for c in self.contributions:
            if c["contribution_id"] == contribution_id:
                return c
        return None

    def contribute(self, *, challenge_id: str, kind: str, title: str,
                   body: str, body_sha256: str, participant_id: str,
                   display_name: str, references: str, original: bool,
                   derived_from: list[str], builds_on: list[dict[str, Any]],
                   builds_on_sha256: str, acceptance: dict[str, Any],
                   gate_receipt: dict[str, Any]) -> dict[str, Any]:
        self._seq += 1
        contribution = {
            "contribution_id": f"CHC-{self._seq:04d}",
            "challenge_id": challenge_id,
            "kind": kind,
            "title": title,
            "body": body,
            "body_sha256": body_sha256,
            "participant_id": participant_id,
            "display_name": display_name,
            "references": references,
            "original": original,
            "derived_from": list(derived_from),
            # Explicit reuse: [{contribution_id, what_reused}]. Declared by
            # the contributor, byte-bound like the body (declared/pinned
            # sha256 over the canonical link bytes must match).
            "builds_on": [dict(link) for link in builds_on],
            "builds_on_sha256": builds_on_sha256,
            "acceptance": copy.deepcopy(acceptance),
            "gate_receipt_id": _receipt_id(gate_receipt),
            "submitted_at": _utc_now_iso(),
            "status": "admitted",
        }
        self.contributions.append(contribution)
        return copy.deepcopy(contribution)

    # -- evaluation ----------------------------------------------------------

    def evaluate(self, *, contribution_id: str, decision: str, reason: str,
                 evaluator_id: str, gate_receipt: dict[str, Any]) -> dict[str, Any]:
        contribution = self.get_contribution(contribution_id)
        if contribution is None:
            raise KeyError(f"unknown contribution: {contribution_id}")
        record = {
            "contribution_id": contribution_id,
            "challenge_id": contribution["challenge_id"],
            "decision": decision,
            "reason": reason,
            "evaluator_id": evaluator_id,
            "gate_receipt_id": _receipt_id(gate_receipt),
            "decided_at": _utc_now_iso(),
        }
        self.decisions.append(record)
        contribution["status"] = "accepted" if decision == "ACCEPT" else "declined"
        return copy.deepcopy(record)

    # -- refusals ------------------------------------------------------------

    def refuse(self, *, participant_id: str | None, challenge_id: str | None,
               contribution_id: str | None, reason_codes: list[str],
               gate_receipt: dict[str, Any] | None,
               note: str = "") -> dict[str, Any]:
        entry = {
            "refusal_id": f"RFS-{len(self.refusals) + 1:04d}",
            "at": _utc_now_iso(),
            "participant_id": participant_id,
            "challenge_id": challenge_id,
            "contribution_id": contribution_id,
            "reason_codes": list(reason_codes),
            "gate_receipt_id": _receipt_id(gate_receipt) if gate_receipt else None,
            "note": note,
        }
        self.refusals.append(entry)
        return copy.deepcopy(entry)

    # -- read -----------------------------------------------------------------

    def describe(self) -> dict[str, Any]:
        return {
            "challenges": [copy.deepcopy(c) for c in self.challenges.values()],
            "contributions": [copy.deepcopy(c) for c in self.contributions],
            "decisions": [copy.deepcopy(d) for d in self.decisions],
            "refusals": [copy.deepcopy(r) for r in self.refusals],
        }

    # -- persistence ------------------------------------------------------------

    def snapshot(self) -> dict[str, Any]:
        return {
            "challenges": copy.deepcopy(self.challenges),
            "contributions": copy.deepcopy(self.contributions),
            "decisions": copy.deepcopy(self.decisions),
            "refusals": copy.deepcopy(self.refusals),
            "seq": self._seq,
        }

    def load(self, data: Any) -> None:
        if not isinstance(data, dict):
            return
        self.challenges = copy.deepcopy(data.get("challenges") or {})
        self.contributions = copy.deepcopy(data.get("contributions") or [])
        self.decisions = copy.deepcopy(data.get("decisions") or [])
        self.refusals = copy.deepcopy(data.get("refusals") or [])
        seq = data.get("seq")
        self._seq = int(seq) if isinstance(seq, int) and seq >= 0 else len(
            self.contributions)


def _receipt_id(receipt: dict[str, Any] | None) -> str | None:
    if not receipt:
        return None
    if receipt.get("receipt_id"):
        return str(receipt["receipt_id"])
    sig = receipt.get("signature")
    value = sig.get("value") if isinstance(sig, dict) else None
    return value[:16] if isinstance(value, str) and value else None
