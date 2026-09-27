"""Newsroom chapter of the shared world: the small desk.

One owner-selected OpenLine Report with its recorded claims and cited
sources. No recorded OpenLine Report exists in the workspace to select --
the two in-progress reports live as thread drafts, not as recorded claim
artifacts -- so the report on this desk is an explicitly labeled FIXTURE.
It is built with the real openline-claim-graph machinery (see
~/workspace/openline-claim-graph): snapshots, content-addressed sources,
Ed25519-signed receipts, receiver-admitted impact policy, and deterministic
source-impact analysis.

An incoming article or correction is manually imported as a DISPATCH. The
dispatch carries two timestamps: the article's own publication time and
the time the system learned about it. Both are recorded and both are
displayed; they are never merged. Imported text is UNTRUSTED data: it is
quoted for display, never executed, and no link is fetched because
imported text asks for it.

Proposed semantic connections between a dispatch and the report are
PROPOSALS: they never change a standing by themselves, and the desk says
so plainly. A proposal is accepted or declined through the same gated
path as the claim-graph demo control -- the participant's own gate
evaluates "newsroom.review" -- and only an accepted proposal that targets
a source-status change admits a source-status event, computed by the real
impact engine under the report's recorded policy. The original report and
its receipts are never rewritten: events append.

Honesty rules, enforced by construction:
  - Every claim, relation, anchor, and standing shown comes from recorded
    backend data. The frontend never infers a dependency or invents a
    standing label.
  - analyze_source_impact never mutates the accepted snapshot: previous
    receipts stay inspectable and unchanged after every event.
  - Re-importing the same article yields the same dispatch (replayed),
    never a duplicate: the dedupe key is the article's content hash.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

_VENDOR_SRC = Path(__file__).parent / "vendor"
if str(_VENDOR_SRC) not in sys.path:
    sys.path.insert(0, str(_VENDOR_SRC))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402

from datetime import datetime, timezone  # noqa: E402

from openline_claim_graph import (  # noqa: E402
    analyze_source_impact,
    build_source,
    create_claim,
    create_impact_policy,
    create_relation,
    create_snapshot,
    create_source_status_event,
    provenance_anchor,
    public_key_hex,
    sign_snapshot,
    verify_impact_report,
    verify_receipt,
)

from package_acceptance import canonical_package_bytes  # noqa: E402


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


CHAPTER_ID = "newsroom"
ISSUER = "workshop:newsroom-desk"
ISSUED_AT = "2026-09-25T21:00:00Z"
REPORT_ID = "report-buoy-warning"

FIXTURE_NOTICE = (
    "FIXTURE — explicitly labeled: this report and the correction slip are "
    "stand-ins. No recorded OpenLine Report exists in the workspace to "
    "select, and no real correction was available, so nothing here is "
    "presented as real. The machinery underneath is real: recorded claims, "
    "content-addressed sources, a signed receipt, and deterministic impact "
    "analysis."
)

# -- the recorded fixture sources --------------------------------------------

GAZETTE = (
    "HARBOR GAZETTE \u2014 morning edition.\n"
    "The east buoy drifted three fathoms east overnight.\n"
    "The master asks all boats to mind the east channel.\n"
)

CRIER_BOARD = (
    "TOWN CRIER'S BOARD \u2014 midday transcript.\n"
    "Buoy adrift. Mind the east channel.\n"
    "The tide reading was left out of the call.\n"
)

CORRECTION_SLIP = (
    # No leading/trailing whitespace: the world layer strips imported
    # fields, and these exact bytes are registered on record for quoting.
    "CORRECTION SLIP \u2014 Harbor Gazette.\n"
    "The morning edition's buoy figure was misreported.\n"
    "The buoy drifted one fathom east, not three."
)

# Exact quotes the anchors cite (must occur verbatim in the sources above).
QUOTE_DRIFT = "The east buoy drifted three fathoms east overnight."
QUOTE_CRIER = "Buoy adrift. Mind the east channel."
CORRECTION_QUOTE = "The buoy drifted one fathom east, not three."

ACTOR = "workshop:newsroom-fixture-v1"

# The prefilled stand-in for manual import: an incoming correction the
# visitor can import as a dispatch. Fixture values; labeled as such.
FIXTURE_ARTICLE = {
    "title": "Harbor Gazette — correction slip",
    "source_url": "fixture://harbor-gazette/correction-slip",
    "published_at": "2026-09-25T14:30:00Z",
    "body": CORRECTION_SLIP,
    "proposals": [
        {
            "kind": "disputes-source",
            "target_claim_id": None,  # resolved to the drift-figure claim at import
            "effect": "source_status:CORRECTED",
            "rationale": (
                "The Gazette's correction slip says the buoy drifted one "
                "fathom east, not three. The quoted drift figure in the "
                "report is disputed."
            ),
        }
    ],
}

PROPOSAL_KINDS = ("disputes-source", "challenges", "supports")
PROPOSAL_EFFECTS = ("source_status:CORRECTED", "source_status:WITHDRAWN", "none")
REVIEW_DECISIONS = ("accept", "decline")


def _quote_claim(source: dict, quote: str, *, kind: str, text: str) -> dict:
    return create_claim(
        kind=kind,
        text=text,
        asserted_by=ACTOR,
        provenance=[provenance_anchor(source, quote, mode="QUOTE", asserted_by=ACTOR)],
    )


def _content_hash(*parts: str) -> str:
    h = hashlib.sha256()
    h.update(json.dumps(list(parts), sort_keys=True).encode("utf-8"))
    return h.hexdigest()


class NewsroomChapter:
    """One fixture report, manually imported dispatches, and an append-only
    review history. Snapshots and receipts are never mutated."""

    def __init__(self) -> None:
        key = Ed25519PrivateKey.generate()
        self.public_key = public_key_hex(key)
        self._key = key

        self.sources: dict[str, dict[str, Any]] = {}
        for content, locator in (
            (GAZETTE, "fixture://harbor-gazette/morning-edition.txt"),
            (CRIER_BOARD, "fixture://crier-board/midday.txt"),
            # The correction slip's bytes are registered up front, exactly
            # like the claim-graph chapter registers its notices: the signed
            # receipt is computed over this source set, and imported text is
            # only ever quoted against bytes already on record.
            (CORRECTION_SLIP, FIXTURE_ARTICLE["source_url"]),
        ):
            src = build_source(content, locator=locator)
            self.sources[src["source_id"]] = src
        self._gazette = self._source_by_quote(QUOTE_DRIFT)
        self._crier = self._source_by_quote(QUOTE_CRIER)
        self._correction_slip = self._source_by_quote(CORRECTION_QUOTE)
        self.source_labels = {
            self._gazette["source_id"]: "Harbor Gazette \u2014 morning edition",
            self._crier["source_id"]: "town crier's board \u2014 midday transcript",
            self._correction_slip["source_id"]: "Harbor Gazette \u2014 correction slip",
        }

        self._build_report()

        # dispatch_id -> dispatch record (body is untrusted data: quoted only).
        self.dispatches: dict[str, dict[str, Any]] = {}
        # content hash -> dispatch_id: re-importing the same article yields
        # the same dispatch, never a duplicate.
        self._imported: dict[str, str] = {}
        # proposal_id -> proposal record.
        self.proposals: dict[str, dict[str, Any]] = {}
        # Append-only: import events, review decisions, admitted evidence.
        self.history: list[dict[str, Any]] = []

    # -- construction --------------------------------------------------------

    def _source_by_quote(self, quote: str) -> dict[str, Any]:
        for src in self.sources.values():
            if quote in str(src["content"]):
                return src
        raise RuntimeError(f"fixture quote not found in any source: {quote!r}")

    def _build_report(self) -> None:
        n1 = _quote_claim(
            self._gazette, QUOTE_DRIFT,
            kind="SOURCE_ASSERTION",
            text="The east buoy drifted three fathoms east overnight.",
        )
        n2 = create_claim(
            kind="INFERENCE",
            text="The east channel was narrower than charted that morning.",
            asserted_by=ACTOR,
        )
        n3 = _quote_claim(
            self._crier, QUOTE_CRIER,
            kind="SOURCE_ASSERTION",
            text="Buoy adrift. Mind the east channel.",
        )
        n4 = create_claim(
            kind="ASSUMPTION",
            text="Hold the morning sailing schedule until the master confirms.",
            asserted_by=ACTOR,
        )
        n5 = create_claim(
            kind="UNRESOLVED_QUESTION",
            text="Did the council see the Gazette's full warning, or only the crier's note?",
            asserted_by=ACTOR,
        )
        r_n1_n2 = create_relation(
            source_claim_id=n1["claim_id"], target_claim_id=n2["claim_id"],
            relation="SUPPORTS", asserted_by=ACTOR)
        r_n4_n2 = create_relation(
            source_claim_id=n4["claim_id"], target_claim_id=n2["claim_id"],
            relation="DEPENDS_ON", asserted_by=ACTOR)
        # Advisory: recorded, but not admitted as a hard dependency.
        r_n3_n1 = create_relation(
            source_claim_id=n3["claim_id"], target_claim_id=n1["claim_id"],
            relation="DERIVED_FROM", asserted_by=ACTOR)
        snapshot = create_snapshot(
            claims=[n1, n2, n3, n4, n5],
            relations=[r_n1_n2, r_n4_n2, r_n3_n1],
        )
        receipt = sign_snapshot(
            snapshot, self.sources,
            private_key=self._key, issuer=ISSUER, issued_at=ISSUED_AT,
            parent_snapshots=[],
        )
        policy = create_impact_policy(
            snapshot,
            hard_relation_ids=[r_n1_n2["relation_id"], r_n4_n2["relation_id"]],
            advisory_relation_ids=[r_n3_n1["relation_id"]],
            decision_claim_ids=[n4["claim_id"]],
        )
        self.report = {
            "report_id": REPORT_ID,
            "title": "OpenLine Report — the buoy warning",
            "placement": "on the small desk",
            "fixture": True,
            "snapshot": snapshot,
            "receipt": receipt,
            "policy": policy,
        }
        self._drift_claim_id = str(n1["claim_id"])
        self._claim_ids = {str(c["claim_id"]) for c in snapshot["claims"]}

    # -- dispatches: manual import of an incoming article/correction ----------

    def fixture_article(self) -> dict[str, Any]:
        """The prefilled stand-in for the manual import form."""
        return json.loads(json.dumps(FIXTURE_ARTICLE))

    def _drift_anchor_span(self) -> dict[str, int]:
        for claim in self.report["snapshot"]["claims"]:
            for anchor in claim.get("provenance", []):
                if anchor.get("source_id") == self._gazette["source_id"]:
                    return dict(anchor["span"])
        raise RuntimeError("fixture: drift anchor missing from the report")

    def _article_source(self, body: str, locator: str) -> dict[str, Any]:
        """Register imported bytes as a source for quoting. The bytes are
        display-only data; nothing here executes imported text or fetches
        anything because of it. Raises unless the exact bytes are already
        on record -- new external content must be registered explicitly,
        and in this chapter only the fixture article's bytes are."""
        src = build_source(body, locator=locator)
        known = self.sources.get(src["source_id"])
        if known is None:
            raise ValueError(
                "unregistered import: this desk only admits the fixture "
                "article's bytes, already on record")
        return known

    def import_dispatch(self, article: dict[str, Any], *, imported_by: str) -> dict[str, Any]:
        """Record an incoming article/correction as a dispatch. The article's
        own publication time and the system's retrieval time are stored as
        two separate timestamps. Re-importing the same article returns the
        existing dispatch with replayed=True."""
        for field in ("title", "source_url", "published_at", "body"):
            if not isinstance(article.get(field), str) or not article[field].strip():
                raise ValueError(f"article field {field!r} is required")
        content_hash = _content_hash(
            article["source_url"], article["title"],
            article["published_at"], article["body"])
        existing_id = self._imported.get(content_hash)
        if existing_id is not None:
            dispatch = self.dispatches[existing_id]
            return {"dispatch": dict(dispatch), "replayed": True}

        src = self._article_source(article["body"], article["source_url"])
        retrieved_at = _utc_now_iso()
        dispatch_id = f"dispatch:{content_hash[:16]}"
        proposals_in = article.get("proposals") or []
        if not isinstance(proposals_in, list) or len(proposals_in) > 4:
            raise ValueError("article proposals must be a list of at most 4")
        proposal_records = []
        for i, raw in enumerate(proposals_in):
            proposal_records.append(
                self._new_proposal(dispatch_id, i, raw, proposed_by=imported_by))
        dispatch = {
            "dispatch_id": dispatch_id,
            "title": article["title"],
            "source_url": article["source_url"],
            # The article's own publication time -- the source's claim about
            # when it published. Never merged with retrieved_at.
            "published_at": article["published_at"],
            # When the system learned about it -- the import time.
            "retrieved_at": retrieved_at,
            "imported_by": imported_by,
            "content_hash": content_hash,
            "body_source_id": src["source_id"],
            "body": article["body"],
            "proposals": [p["proposal_id"] for p in proposal_records],
        }
        self.dispatches[dispatch_id] = dispatch
        self._imported[content_hash] = dispatch_id
        self.history.append({
            "kind": "dispatch-imported",
            "at": retrieved_at,
            "dispatch_id": dispatch_id,
            "title": article["title"],
            "source_url": article["source_url"],
            "published_at": article["published_at"],
            "retrieved_at": retrieved_at,
            "imported_by": imported_by,
            "proposal_ids": [p["proposal_id"] for p in proposal_records],
        })
        return {"dispatch": dict(dispatch), "replayed": False}

    # -- research reports: receiver-owned acceptance of an actual artifact -----
    # This path is SEPARATE from the fixture import path above. It admits a
    # real research artifact (not the fixture bytes) into the newsroom, but
    # only after the receiver's gate ALLOWED it and the declared structural
    # acceptance checks (research/CRITERIA.md C1-C5, ported in
    # backend/report_acceptance.py) ACCEPTED the exact pinned bytes.
    #
    # The stored dispatch is bound to the pinned bytes: body, report_sha256,
    # and the acceptance record all describe the same bytes. Structural
    # checks are not factual verification — see the acceptance record's
    # scope_note, which is stored alongside the dispatch.

    def import_research_report(self, article: dict[str, Any], acceptance: dict[str, Any],
                               *, imported_by: str) -> dict[str, Any]:
        """Record an accepted research report as a dispatch. The caller
        (World.newsroom_submit_report) guarantees: the receiver gate ALLOWED
        the action, the report bytes match the submitter's pinned SHA-256,
        and the acceptance record's evaluated_sha256 matches those same
        bytes. This method only stores; it decides nothing."""
        for field in ("title", "source_url", "published_at", "body", "report_sha256"):
            if not isinstance(article.get(field), str) or not article[field].strip():
                raise ValueError(f"research report field {field!r} is required")
        pinned = hashlib.sha256(article["body"].encode("utf-8")).hexdigest()
        if pinned != article["report_sha256"]:
            raise ValueError("research report bytes do not match the pinned SHA-256")
        if acceptance.get("evaluated_sha256") != pinned:
            raise ValueError("acceptance record was not computed on these bytes")
        if acceptance.get("verdict") != "ACCEPTED":
            raise ValueError("only an ACCEPTED report may enter the newsroom")
        content_hash = _content_hash(
            article["source_url"], article["title"],
            article["published_at"], article["body"])
        existing_id = self._imported.get(content_hash)
        if existing_id is not None:
            dispatch = self.dispatches[existing_id]
            return {"dispatch": dict(dispatch), "replayed": True}

        # Explicit registration: these bytes are new external content, quoted
        # for display only, never executed, never fetched because of them.
        src = build_source(article["body"], locator=article["source_url"])
        self.sources[src["source_id"]] = src
        retrieved_at = _utc_now_iso()
        dispatch_id = f"research-report:{pinned[:16]}"
        dispatch = {
            "dispatch_id": dispatch_id,
            "title": article["title"],
            "source_url": article["source_url"],
            "published_at": article["published_at"],
            "retrieved_at": retrieved_at,
            "imported_by": imported_by,
            "content_hash": content_hash,
            "body_source_id": src["source_id"],
            "body": article["body"],
            "proposals": [],
            # The research-report binding: all three name the same bytes.
            "research_report": True,
            "report_sha256": pinned,
            "acceptance": dict(acceptance),
        }
        self.dispatches[dispatch_id] = dispatch
        self._imported[content_hash] = dispatch_id
        self.history.append({
            "kind": "research-report-admitted",
            "at": retrieved_at,
            "dispatch_id": dispatch_id,
            "title": article["title"],
            "source_url": article["source_url"],
            "retrieved_at": retrieved_at,
            "imported_by": imported_by,
            "report_sha256": pinned,
            "acceptance_verdict": acceptance.get("verdict"),
        })
        return {"dispatch": dict(dispatch), "replayed": False}

    # -- research packages: receiver-owned acceptance of a computational -----
    # artifact. This path is SEPARATE from both the fixture import path and
    # the research-report path. It admits a research package (manifest +
    # files) into the newsroom, but only after the receiver's gate ALLOWED
    # it, the declared package hash matched the pinned canonical bytes, and
    # the declared acceptance checks (research/COMMONS-CRITERIA.md K1-K7,
    # ported in backend/package_acceptance.py) ACCEPTED those exact bytes.
    #
    # The stored dispatch is the boundary evidence (research/COMMONS-BRIEF.md
    # "Real isolation"): the worker-signed presentation, the receiver-signed
    # gate receipt, the gate-signed acceptance record naming the pinned
    # package_sha256, and the package bytes themselves — all four naming the
    # same pinned hash.

    def import_research_package(self, package: dict[str, Any],
                                acceptance: dict[str, Any],
                                gate_receipt: dict[str, Any],
                                presentation: dict[str, Any],
                                *, imported_by: str) -> dict[str, Any]:
        """Record an accepted research package as a dispatch. The caller
        (World.newsroom_submit_package) guarantees: the receiver gate
        ALLOWED the action, the package bytes match the submitter's pinned
        SHA-256, the acceptance record was computed on those bytes and is
        signed by the receiver gate key, and the gate receipt is the real
        gate-signed verdict for this submission. This method only stores;
        it decides nothing."""
        import copy as _copy
        manifest = package.get("manifest")
        files = package.get("files")
        if not isinstance(manifest, dict) or not isinstance(files, dict):
            raise ValueError("research package needs a manifest and files")
        title = manifest.get("title")
        if not isinstance(title, str) or not title.strip():
            raise ValueError("research package manifest needs a title")
        pinned = hashlib.sha256(canonical_package_bytes(package)).hexdigest()
        if acceptance.get("evaluated_sha256") != pinned:
            raise ValueError("acceptance record was not computed on these bytes")
        if acceptance.get("verdict") != "ACCEPTED":
            raise ValueError("only an ACCEPTED package may enter the newsroom")
        sig = acceptance.get("signature") or {}
        if not isinstance(sig, dict) or not sig.get("value"):
            raise ValueError("acceptance record is not gate-signed")
        content_hash = "pkg:" + pinned
        existing_id = self._imported.get(content_hash)
        if existing_id is not None:
            dispatch = self.dispatches[existing_id]
            return {"dispatch": dict(dispatch), "replayed": True}

        retrieved_at = _utc_now_iso()
        dispatch_id = f"research-package:{pinned[:16]}"
        dispatch = {
            "dispatch_id": dispatch_id,
            "title": title.strip(),
            "producer_id": manifest.get("producer_id"),
            "retrieved_at": retrieved_at,
            "imported_by": imported_by,
            "content_hash": content_hash,
            "proposals": [],
            # The research-package binding: all four name the same bytes.
            "research_package": True,
            "package_sha256": pinned,
            "package": {"manifest": _copy.deepcopy(manifest),
                        "files": _copy.deepcopy(files)},
            "acceptance": _copy.deepcopy(acceptance),
            "gate_receipt": _copy.deepcopy(gate_receipt),
            "presentation": _copy.deepcopy(presentation),
            "claim_report_id": None,
        }
        self.dispatches[dispatch_id] = dispatch
        self._imported[content_hash] = dispatch_id
        self.history.append({
            "kind": "research-package-admitted",
            "at": retrieved_at,
            "dispatch_id": dispatch_id,
            "title": title.strip(),
            "retrieved_at": retrieved_at,
            "imported_by": imported_by,
            "package_sha256": pinned,
            "acceptance_verdict": acceptance.get("verdict"),
        })
        return {"dispatch": dict(dispatch), "replayed": False}

    def link_package_claim_report(self, dispatch_id: str, report_id: str) -> None:
        """Record which claim-graph report carries the package's claim."""
        dispatch = self.dispatches.get(dispatch_id)
        if dispatch is None:
            raise ValueError(f"unknown dispatch: {dispatch_id}")
        dispatch["claim_report_id"] = report_id
        self.history.append({
            "kind": "research-package-claim-registered",
            "at": _utc_now_iso(),
            "dispatch_id": dispatch_id,
            "claim_report_id": report_id,
        })

    def _new_proposal(self, dispatch_id: str, index: int, raw: Any,
                      *, proposed_by: str) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise ValueError("a proposal must be an object")
        kind = raw.get("kind")
        if kind not in PROPOSAL_KINDS:
            raise ValueError(f"unsupported proposal kind: {kind!r}")
        effect = raw.get("effect", "none")
        if effect not in PROPOSAL_EFFECTS:
            raise ValueError(f"unsupported proposal effect: {effect!r}")
        target = raw.get("target_claim_id") or self._drift_claim_id
        if str(target) not in self._claim_ids:
            raise ValueError(f"proposal targets an unknown claim: {target!r}")
        rationale = raw.get("rationale")
        if not isinstance(rationale, str) or not rationale.strip() or len(rationale) > 500:
            raise ValueError("a proposal needs a short rationale")
        proposal_id = f"proposal:{dispatch_id.split(':', 1)[1]}-{index}"
        proposal = {
            "proposal_id": proposal_id,
            "dispatch_id": dispatch_id,
            "kind": kind,
            "target_claim_ids": [str(target)],
            "effect": effect,
            "rationale": rationale.strip(),
            "status": "proposed",
            "proposed_by": proposed_by,
            "proposed_at": _utc_now_iso(),
            "decided_at": None,
            "decided_by": None,
        }
        self.proposals[proposal_id] = proposal
        return proposal

    # -- review: proposals stay proposals until accepted through review --------

    def review_proposal(self, proposal_id: str, decision: str, *,
                        asserted_by: str) -> dict[str, Any]:
        """Accept or decline a proposed connection. Only an accepted proposal
        whose recorded effect is a source-status change admits a source-status
        event -- computed by the real impact engine under the report's
        recorded policy. Everything else leaves standings untouched."""
        if decision not in REVIEW_DECISIONS:
            raise ValueError(f"unsupported review decision: {decision!r}")
        proposal = self.proposals.get(str(proposal_id))
        if proposal is None:
            raise ValueError(f"unknown proposal: {proposal_id!r}")
        if proposal["status"] != "proposed":
            raise ValueError(f"proposal already decided: {proposal['status']}")
        decided_at = _utc_now_iso()
        proposal["status"] = "accepted" if decision == "accept" else "declined"
        proposal["decided_at"] = decided_at
        proposal["decided_by"] = asserted_by

        admitted: dict[str, Any] | None = None
        if decision == "accept" and proposal["effect"] != "none":
            status = proposal["effect"].split(":", 1)[1].upper()
            admitted = self._admit_source_status(status, proposal, asserted_by)

        self.history.append({
            "kind": "review-decision",
            "at": decided_at,
            "proposal_id": proposal["proposal_id"],
            "dispatch_id": proposal["dispatch_id"],
            "decision": decision,
            "decided_by": asserted_by,
            "admitted_event_id": admitted["event"]["event_id"] if admitted else None,
        })
        return {
            "proposal": dict(proposal),
            "decision": decision,
            "admitted": admitted,
        }

    def _admit_source_status(self, status: str, proposal: dict[str, Any],
                             asserted_by: str) -> dict[str, Any]:
        """Admit one source-status event for the Gazette under the report's
        recorded policy -- the same engine the claim-graph desk uses. The
        snapshot and receipts are never mutated."""
        if status not in ("CORRECTED", "WITHDRAWN"):
            raise ValueError(f"unsupported event status: {status!r}")
        for entry in self.history:
            if entry.get("kind") != "evidence-admitted":
                continue
            event = entry["event"]
            prior_sources = sorted(
                str(item.get("source_id")) for item in event.get("affected", []))
            if (event.get("status") == status
                    and prior_sources == [self._gazette["source_id"]]):
                raise ValueError("an equivalent source-status event is already on record")
        dispatch = self.dispatches[proposal["dispatch_id"]]
        evidence_source = self.sources[dispatch["body_source_id"]]
        reason = (
            "The Gazette's correction slip disputes the quoted drift figure."
            if status == "CORRECTED"
            else "The Gazette's morning edition was withdrawn pending review."
        )
        affected: list[dict[str, Any]] = (
            [{"source_id": self._gazette["source_id"],
              "spans": [self._drift_anchor_span()]}]
            if status == "CORRECTED"
            else [{"source_id": self._gazette["source_id"]}]
        )
        event = create_source_status_event(
            status=status,
            affected=affected,
            evidence=[provenance_anchor(
                evidence_source, CORRECTION_QUOTE, mode="QUOTE",
                asserted_by=asserted_by)],
            asserted_by=asserted_by,
            effective_at=_utc_now_iso(),
            reason=reason,
        )
        impact = analyze_source_impact(
            self.report["snapshot"], self.sources, event, self.report["policy"])
        check = verify_impact_report(
            impact, self.report["snapshot"], self.sources, event, self.report["policy"])
        if not check["valid"]:
            raise RuntimeError(f"impact report failed self-verification: {check['errors']}")
        entry = {"kind": "evidence-admitted", "event": event, "report": impact}
        self.history.append(entry)
        return entry

    def pending_review_count(self) -> int:
        return sum(1 for p in self.proposals.values() if p["status"] == "proposed")

    def latest_impact(self) -> dict[str, Any] | None:
        for entry in reversed(self.history):
            if entry.get("kind") == "evidence-admitted":
                return entry["report"]
        return None

    # -- inspection ----------------------------------------------------------

    def _classifications(self, impact: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
        """One deterministic classification per claim, from the latest impact
        report. Empty before any accepted evidence: no standing is invented,
        and a proposal alone never appears here."""
        if impact is None:
            return {}
        result: dict[str, dict[str, Any]] = {}
        names = {
            "quarantine": "QUARANTINE",
            "survives": "SURVIVES",
            "affected_unresolved": "AFFECTED_UNRESOLVED",
            "unaffected": "UNAFFECTED",
        }
        for bucket, fallback in names.items():
            for item in impact.get("classifications", {}).get(bucket, []):
                claim_id = str(item["claim_id"])
                result[claim_id] = {
                    "classification": str(item.get("classification", fallback)),
                    "reason": item.get("reason"),
                }
        return result

    def _public_receipt(self, receipt: dict[str, Any]) -> dict[str, Any]:
        return {
            "schema": receipt.get("schema"),
            "issuer": receipt.get("issuer"),
            "issued_at": receipt.get("issued_at"),
            "graph_state_root": receipt.get("graph_state_root"),
            "claim_count": receipt.get("claim_count"),
            "relation_count": receipt.get("relation_count"),
            "public_key": (receipt.get("proof_options") or {}).get("public_key"),
            "signature": (receipt.get("proof") or {}).get("signature"),
            "claim_boundary": receipt.get("claim_boundary"),
        }

    def _quote_text(self, source_id: str, span: dict[str, Any]) -> str:
        source = self.sources.get(source_id, {})
        content = str(source.get("content", "")).encode("utf-8")
        start, end = int(span.get("start", 0)), int(span.get("end", 0))
        try:
            return content[start:end].decode("utf-8")
        except (UnicodeDecodeError, ValueError):
            return ""

    def _describe_proposal(self, proposal: dict[str, Any]) -> dict[str, Any]:
        by_id = {str(c["claim_id"]): c for c in self.report["snapshot"]["claims"]}
        return {
            "proposal_id": proposal["proposal_id"],
            "dispatch_id": proposal["dispatch_id"],
            "kind": proposal["kind"],
            "target_claim_ids": list(proposal["target_claim_ids"]),
            "target_claim_texts": [
                str(by_id[cid]["text"]) for cid in proposal["target_claim_ids"]
                if cid in by_id
            ],
            "effect": proposal["effect"],
            "rationale": proposal["rationale"],
            "status": proposal["status"],
            "proposed_by": proposal["proposed_by"],
            "proposed_at": proposal["proposed_at"],
            "decided_at": proposal["decided_at"],
            "decided_by": proposal["decided_by"],
        }

    def describe(self) -> dict[str, Any]:
        """Everything the frontend may display, from recorded data only."""
        impact = self.latest_impact()
        snapshot = self.report["snapshot"]
        standings = self._classifications(impact)
        claims_out = []
        for claim in snapshot.get("claims", []):
            claim_id = str(claim["claim_id"])
            provenance = []
            for anchor in claim.get("provenance", []):
                source_id = str(anchor.get("source_id", ""))
                span = dict(anchor.get("span", {}))
                provenance.append({
                    "source_id": source_id,
                    "source_label": self.source_labels.get(source_id, source_id),
                    "mode": anchor.get("mode"),
                    "quote": self._quote_text(source_id, span),
                })
            claims_out.append({
                "claim_id": claim_id,
                "kind": str(claim.get("kind")),
                "text": str(claim.get("text")),
                "provenance": provenance,
                # None until evidence is admitted through review: a proposal
                # alone never sets a standing.
                "standing": standings.get(claim_id),
            })
        relations_out = []
        hard = set(map(str, self.report["policy"].get("hard_relation_ids", [])))
        advisory = set(map(str, self.report["policy"].get("advisory_relation_ids", [])))
        for relation in snapshot.get("relations", []):
            relation_id = str(relation["relation_id"])
            relations_out.append({
                "relation_id": relation_id,
                "from_claim_id": str(relation["source_claim_id"]),
                "to_claim_id": str(relation["target_claim_id"]),
                "relation": str(relation["relation"]),
                "authority": (
                    "hard" if relation_id in hard
                    else "advisory" if relation_id in advisory
                    else "unadmitted"
                ),
            })
        dispatches_out = []
        for dispatch in self.dispatches.values():
            dispatches_out.append({
                "dispatch_id": dispatch["dispatch_id"],
                "title": dispatch["title"],
                "source_url": dispatch.get("source_url"),
                "published_at": dispatch.get("published_at"),
                "retrieved_at": dispatch["retrieved_at"],
                "imported_by": dispatch["imported_by"],
                "content_hash": dispatch["content_hash"],
                "body": dispatch.get("body"),
                # Present only on research-report dispatches; absent (None)
                # on fixture dispatches. Two admission paths, two artifacts.
                "research_report": dispatch.get("research_report", False),
                "report_sha256": dispatch.get("report_sha256"),
                # Present only on research-package dispatches: the four-way
                # boundary evidence (brief "Real isolation") plus the linked
                # claim-graph report carrying the package's claim.
                "research_package": dispatch.get("research_package", False),
                "package_sha256": dispatch.get("package_sha256"),
                "package": dispatch.get("package"),
                "claim_report_id": dispatch.get("claim_report_id"),
                "acceptance": dispatch.get("acceptance"),
                "gate_receipt": dispatch.get("gate_receipt"),
                "presentation": dispatch.get("presentation"),
                "proposals": [
                    self._describe_proposal(self.proposals[pid])
                    for pid in dispatch["proposals"]
                ],
            })
        return {
            "chapter": {"id": CHAPTER_ID, "title": "Newsroom \u2014 the small desk"},
            "fixture_notice": FIXTURE_NOTICE,
            "issuer": {"issuer": ISSUER, "public_key": self.public_key},
            "report": {
                "report_id": self.report["report_id"],
                "title": self.report["title"],
                "placement": self.report["placement"],
                "fixture": self.report["fixture"],
                "claims": claims_out,
                "relations": relations_out,
                "sources": [
                    {
                        "source_id": sid,
                        "label": self.source_labels.get(sid, sid),
                        "locator": self.sources[sid].get("locator"),
                    }
                    for sid in sorted({
                        str(a.get("source_id", ""))
                        for c in snapshot.get("claims", [])
                        for a in c.get("provenance", [])
                    })
                ],
                "receipt": self._public_receipt(self.report["receipt"]),
                "impact": (
                    {
                        "status": impact.get("status"),
                        "report_id": impact.get("report_id"),
                        "event_id": impact.get("event_id"),
                        "summary": impact.get("summary"),
                        "decision_claim_ids_touched": impact.get("decision_claim_ids_touched"),
                        "claim_boundary": impact.get("claim_boundary"),
                    }
                    if impact else None
                ),
            },
            "dispatches": dispatches_out,
            "pending_review": self.pending_review_count(),
            "fixture_article": self.fixture_article(),
            "events": [dict(entry) for entry in self.history],
            "honesty": (
                "A proposal never changes a standing by itself. Only an "
                "accepted review through the receiver admits new evidence, "
                "and the original report and receipts are never rewritten. "
                "Imported text is untrusted data: quoted for display, never "
                "executed, never fetched because it asks to be. Publication "
                "time (the source's claim) and system-learned time (the "
                "import) are two separate timestamps."
            ),
        }

    def verify_all(self) -> dict[str, Any]:
        """Re-verify the receipt and the latest impact report, for tests."""
        receipt_checks = [verify_receipt(
            self.report["receipt"], self.report["snapshot"], self.sources,
            pinned_public_key=self.public_key, parent_snapshots=[])]
        impact_checks = []
        impact = self.latest_impact()
        if impact is not None:
            admitted = next(
                e for e in reversed(self.history)
                if e.get("kind") == "evidence-admitted")
            impact_checks.append(verify_impact_report(
                impact, self.report["snapshot"], self.sources,
                admitted["event"], self.report["policy"]))
        return {"receipts": receipt_checks, "impacts": impact_checks}
