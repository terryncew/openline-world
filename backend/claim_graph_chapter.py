"""Claim Graph chapter of the shared world: the reading desk.

Two inspectable reports, built with the real openline-claim-graph machinery
(see ~/workspace/openline-claim-graph): snapshots, content-addressed source
anchors, Ed25519-signed receipts, receiver-admitted impact policy, and
deterministic source-impact analysis.

Report A ("Harbor traffic study", on the desk) leans on the harbor log.
Report B ("Tide-table memo", nearby) is supported only by the harbor master
memo -- an independent source. A correction or withdrawal event against the
harbor log is admitted as a source-status event and the engine computes the
exact downstream exposure under the receiver's declared edge policy.

Honesty rules, enforced by construction:
  - Every claim, relation, anchor, and status shown comes from recorded
    backend data: the snapshots, the receipts, and the impact reports. The
    frontend never infers a dependency or invents a standing label.
  - analyze_source_impact never mutates the accepted snapshots: previous
    receipts stay inspectable and unchanged after every event.
  - The report does not decide truth: classifications are the backend's
    exact terms (QUARANTINE / SURVIVES / AFFECTED_UNRESOLVED / UNAFFECTED).
  - The graph is a bounded projection: only recorded dependencies are
    represented, and describe() says so.
"""
from __future__ import annotations

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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


CHAPTER_ID = "claim-graph"
ISSUER = "workshop:claim-graph-desk"
ISSUED_AT = "2026-09-25T20:00:00Z"

REPORT_A_ID = "report-harbor-traffic"
REPORT_B_ID = "report-tide-memo"

STATUS_CORRECTED = "CORRECTED"
STATUS_WITHDRAWN = "WITHDRAWN"
ALLOWED_EVENT_STATUSES = (STATUS_CORRECTED, STATUS_WITHDRAWN)

# -- the recorded sources -------------------------------------------------

HARBOR_LOG = (
    "HARBOR LOG \u2014 east berth, morning watch.\n"
    "Vessel \"Petrel\" cleared the outer buoy at 06:40.\n"
    "The tide gauge read 2.4 m at 06:35.\n"
    "Wind from the southwest at 12 knots.\n"
)

HARBOR_MEMO = (
    "HARBOR MASTER MEMO \u2014 evening rounds.\n"
    "The outer buoy was serviced on Tuesday.\n"
    "Channel markers were repainted last week.\n"
)

CORRECTION_NOTICE = (
    "CORRECTION NOTICE \u2014 harbor log, morning watch.\n"
    "The entry \"The tide gauge read 2.4 m at 06:35\" was misrecorded.\n"
    "The corrected reading is 2.1 m.\n"
)

WITHDRAWAL_NOTICE = (
    "WITHDRAWAL NOTICE \u2014 harbor log, morning watch.\n"
    "The whole morning-watch entry is withdrawn pending review.\n"
    "Do not rely on any reading from it.\n"
)

# Exact quotes the anchors cite (must occur verbatim in the sources above).
QUOTE_GAUGE = "The tide gauge read 2.4 m at 06:35."
QUOTE_BUOY = "The outer buoy was serviced on Tuesday."
CORRECTION_QUOTE = 'The entry "The tide gauge read 2.4 m at 06:35" was misrecorded.'
WITHDRAWAL_QUOTE = "The whole morning-watch entry is withdrawn pending review."

ACTOR = "workshop:claim-graph-fixture-v1"


def _quote_claim(source: dict, quote: str, *, kind: str, text: str) -> dict:
    return create_claim(
        kind=kind,
        text=text,
        asserted_by=ACTOR,
        provenance=[provenance_anchor(source, quote, mode="QUOTE", asserted_by=ACTOR)],
    )


class ClaimGraphChapter:
    """Two reports, signed receipts, and an append-only impact history."""

    def __init__(self) -> None:
        key = Ed25519PrivateKey.generate()
        self.public_key = public_key_hex(key)
        self._key = key

        self.sources: dict[str, dict[str, Any]] = {}
        for content, locator in (
            (HARBOR_LOG, "fixture://harbor-log.txt"),
            (HARBOR_MEMO, "fixture://harbor-memo.txt"),
            (CORRECTION_NOTICE, "fixture://correction-notice.txt"),
            (WITHDRAWAL_NOTICE, "fixture://withdrawal-notice.txt"),
        ):
            src = build_source(content, locator=locator)
            self.sources[src["source_id"]] = src
        self._log = self._source_by_quote(QUOTE_GAUGE)
        self._memo = self._source_by_quote(QUOTE_BUOY)
        self._correction_notice = self._source_by_quote(CORRECTION_QUOTE)
        self._withdrawal_notice = self._source_by_quote(WITHDRAWAL_QUOTE)
        self.source_labels = {
            self._log["source_id"]: "harbor log \u2014 morning watch",
            self._memo["source_id"]: "harbor master memo \u2014 evening rounds",
            self._correction_notice["source_id"]: "correction notice",
            self._withdrawal_notice["source_id"]: "withdrawal notice",
        }

        self.reports: list[dict[str, Any]] = []
        self._build_reports()

        # Append-only history: [{"event": ..., "reports": {report_id: impact_report}}].
        # Snapshots and receipts are never mutated by an event.
        self.history: list[dict[str, Any]] = []

    # -- construction ----------------------------------------------------

    def _source_by_quote(self, quote: str) -> dict[str, Any]:
        for src in self.sources.values():
            if quote in str(src["content"]):
                return src
        raise RuntimeError(f"fixture quote not found in any source: {quote!r}")

    def _build_reports(self) -> None:
        # Report A: the harbor traffic study, on the desk. Leans on the log.
        a1 = _quote_claim(
            self._log, QUOTE_GAUGE,
            kind="SOURCE_ASSERTION",
            text="The tide gauge read 2.4 m at 06:35.",
        )
        a2 = create_claim(
            kind="INFERENCE",
            text="The channel was deep enough for the morning sailing.",
            asserted_by=ACTOR,
        )
        a3 = create_claim(
            kind="ASSUMPTION",
            text="Approve the morning sailing schedule.",
            asserted_by=ACTOR,
        )
        a4 = create_claim(
            kind="UNRESOLVED_QUESTION",
            text="Should the sailing schedule be republished?",
            asserted_by=ACTOR,
        )
        r_a1_a2 = create_relation(
            source_claim_id=a1["claim_id"], target_claim_id=a2["claim_id"],
            relation="SUPPORTS", asserted_by=ACTOR)
        r_a2_a3 = create_relation(
            source_claim_id=a3["claim_id"], target_claim_id=a2["claim_id"],
            relation="DEPENDS_ON", asserted_by=ACTOR)
        # Advisory: recorded, but not admitted as a hard dependency.
        r_a1_a4 = create_relation(
            source_claim_id=a4["claim_id"], target_claim_id=a1["claim_id"],
            relation="DERIVED_FROM", asserted_by=ACTOR)
        snapshot_a = create_snapshot(
            claims=[a1, a2, a3, a4],
            relations=[r_a1_a2, r_a2_a3, r_a1_a4],
        )
        receipt_a = sign_snapshot(
            snapshot_a, self.sources,
            private_key=self._key, issuer=ISSUER, issued_at=ISSUED_AT,
            parent_snapshots=[],
        )
        policy_a = create_impact_policy(
            snapshot_a,
            hard_relation_ids=[r_a1_a2["relation_id"], r_a2_a3["relation_id"]],
            advisory_relation_ids=[r_a1_a4["relation_id"]],
            decision_claim_ids=[a3["claim_id"]],
        )

        # Report B: the tide-table memo, nearby. Supported only by the memo.
        b1 = _quote_claim(
            self._memo, QUOTE_BUOY,
            kind="SOURCE_ASSERTION",
            text="The outer buoy was serviced on Tuesday.",
        )
        b2 = create_claim(
            kind="INFERENCE",
            text="The channel markers were legible all week.",
            asserted_by=ACTOR,
        )
        b3 = create_claim(
            kind="ASSUMPTION",
            text="Keep the current channel map.",
            asserted_by=ACTOR,
        )
        r_b1_b2 = create_relation(
            source_claim_id=b1["claim_id"], target_claim_id=b2["claim_id"],
            relation="SUPPORTS", asserted_by=ACTOR)
        r_b2_b3 = create_relation(
            source_claim_id=b3["claim_id"], target_claim_id=b2["claim_id"],
            relation="DEPENDS_ON", asserted_by=ACTOR)
        snapshot_b = create_snapshot(
            claims=[b1, b2, b3],
            relations=[r_b1_b2, r_b2_b3],
        )
        receipt_b = sign_snapshot(
            snapshot_b, self.sources,
            private_key=self._key, issuer=ISSUER, issued_at=ISSUED_AT,
            parent_snapshots=[],
        )
        policy_b = create_impact_policy(
            snapshot_b,
            hard_relation_ids=[r_b1_b2["relation_id"], r_b2_b3["relation_id"]],
            decision_claim_ids=[b3["claim_id"]],
        )

        self.reports = [
            {
                "report_id": REPORT_A_ID,
                "title": "Harbor traffic study",
                "placement": "on the desk",
                "snapshot": snapshot_a,
                "receipt": receipt_a,
                "policy": policy_a,
            },
            {
                "report_id": REPORT_B_ID,
                "title": "Tide-table memo",
                "placement": "nearby, on the side table",
                "snapshot": snapshot_b,
                "receipt": receipt_b,
                "policy": policy_b,
            },
        ]

    # -- research packages: registering an accepted package's claim ----------

    def register_package_report(self, *, report_id: str, title: str,
                                claim_text: str, asserted_by: str) -> dict[str, Any]:
        """Register an accepted research package's claim as a new report in
        the graph, so later source-status events propagate to it under the
        existing engine. The report leans on the harbor log exactly like
        Report A does: a SOURCE_ASSERTION quote claim on the log (reusing
        QUOTE_GAUGE), an INFERENCE claim carrying the package's claim text,
        and a hard SUPPORTS relation between them.

        Idempotent by report_id: re-registering the same package returns
        the existing report, never a duplicate. Snapshots and receipts of
        existing reports are untouched.
        """
        for report in self.reports:
            if report["report_id"] == report_id:
                return report
        p1 = _quote_claim(
            self._log, QUOTE_GAUGE,
            kind="SOURCE_ASSERTION",
            text="The tide gauge read 2.4 m at 06:35.",
        )
        p2 = create_claim(
            kind="INFERENCE",
            text=claim_text,
            asserted_by=asserted_by,
        )
        r_p1_p2 = create_relation(
            source_claim_id=p1["claim_id"], target_claim_id=p2["claim_id"],
            relation="SUPPORTS", asserted_by=asserted_by)
        snapshot = create_snapshot(
            claims=[p1, p2],
            relations=[r_p1_p2],
        )
        receipt = sign_snapshot(
            snapshot, self.sources,
            private_key=self._key, issuer=ISSUER, issued_at=ISSUED_AT,
            parent_snapshots=[],
        )
        policy = create_impact_policy(
            snapshot,
            hard_relation_ids=[r_p1_p2["relation_id"]],
            decision_claim_ids=[],
        )
        report = {
            "report_id": report_id,
            "title": title,
            "placement": "newsroom commons — accepted research package",
            "snapshot": snapshot,
            "receipt": receipt,
            "policy": policy,
        }
        self.reports.append(report)
        return report

    # -- events ------------------------------------------------------------

    def _a1_anchor_span(self) -> dict[str, int]:
        report_a = self.reports[0]
        for claim in report_a["snapshot"]["claims"]:
            for anchor in claim.get("provenance", []):
                if anchor.get("source_id") == self._log["source_id"]:
                    return dict(anchor["span"])
        raise RuntimeError("fixture: gauge anchor missing from report A")

    def append_event(self, status: str, *, asserted_by: str) -> dict[str, Any]:
        """Admit one source-status event for the harbor log and compute the
        deterministic impact under each report's receiver-admitted policy.

        Returns the history entry: {"event", "reports": {report_id: report}}.
        The same correction is never recorded twice: if a non-replayed event
        with the same status for the same affected source is already on
        record, the existing entry is returned with replayed=True. (The
        event_id is content-addressed over the full body including the
        timestamp, so byte-identity can never recur -- the dedupe key is the
        semantic (status, affected sources) pair.)
        """
        if status not in ALLOWED_EVENT_STATUSES:
            raise ValueError(f"unsupported event status: {status!r}")
        affected_source_ids = sorted([self._log["source_id"]])
        for entry in self.history:
            if entry.get("replayed"):
                continue
            event = entry["event"]
            prior_sources = sorted(
                str(item.get("source_id")) for item in event.get("affected", []))
            if event.get("status") == status and prior_sources == affected_source_ids:
                return {**entry, "replayed": True}
        notice = self._correction_notice if status == STATUS_CORRECTED else self._withdrawal_notice
        notice_quote = CORRECTION_QUOTE if status == STATUS_CORRECTED else WITHDRAWAL_QUOTE
        reason = (
            "The harbor log correction explicitly reports the tide-gauge entry was misrecorded."
            if status == STATUS_CORRECTED
            else "The harbor log morning-watch entry was withdrawn pending review."
        )
        affected: list[dict[str, Any]] = (
            [{"source_id": self._log["source_id"], "spans": [self._a1_anchor_span()]}]
            if status == STATUS_CORRECTED
            else [{"source_id": self._log["source_id"]}]
        )
        event = create_source_status_event(
            status=status,
            affected=affected,
            evidence=[provenance_anchor(
                notice, notice_quote, mode="QUOTE", asserted_by=asserted_by)],
            asserted_by=asserted_by,
            effective_at=_utc_now_iso(),
            reason=reason,
        )
        reports: dict[str, dict[str, Any]] = {}
        for report in self.reports:
            impact = analyze_source_impact(
                report["snapshot"], self.sources, event, report["policy"])
            check = verify_impact_report(
                impact, report["snapshot"], self.sources, event, report["policy"])
            if not check["valid"]:
                raise RuntimeError(f"impact report failed self-verification: {check['errors']}")
            reports[report["report_id"]] = impact
        entry = {"event": event, "reports": reports, "replayed": False}
        self.history.append(entry)
        return entry

    def latest_impact(self) -> dict[str, dict[str, Any]] | None:
        if not self.history:
            return None
        return self.history[-1]["reports"]

    # -- inspection ----------------------------------------------------------

    def _classifications(self, impact: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
        """One deterministic classification per claim, from the latest impact
        report. Empty before any event: no standing is invented."""
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

    def describe(self) -> dict[str, Any]:
        """Everything the frontend may display, from recorded data only."""
        impacts = self.latest_impact()
        reports_out = []
        for report in self.reports:
            snapshot = report["snapshot"]
            impact = impacts.get(report["report_id"]) if impacts else None
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
                standing = standings.get(claim_id)
                claims_out.append({
                    "claim_id": claim_id,
                    "kind": str(claim.get("kind")),
                    "text": str(claim.get("text")),
                    "provenance": provenance,
                    # None before any event: the UI must say "not yet assessed".
                    "standing": standing,
                })
            relations_out = []
            hard = set(map(str, report["policy"].get("hard_relation_ids", [])))
            advisory = set(map(str, report["policy"].get("advisory_relation_ids", [])))
            for relation in snapshot.get("relations", []):
                relation_id = str(relation["relation_id"])
                authority = (
                    "hard" if relation_id in hard
                    else "advisory" if relation_id in advisory
                    else "unadmitted"
                )
                relations_out.append({
                    "relation_id": relation_id,
                    "from_claim_id": str(relation["source_claim_id"]),
                    "to_claim_id": str(relation["target_claim_id"]),
                    "relation": str(relation["relation"]),
                    "authority": authority,
                })
            reports_out.append({
                "report_id": report["report_id"],
                "title": report["title"],
                "placement": report["placement"],
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
                "receipt": self._public_receipt(report["receipt"]),
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
            })
        events_out = []
        for entry in self.history:
            event = entry["event"]
            affected = event.get("affected", [])
            events_out.append({
                "event_id": event.get("event_id"),
                "status": event.get("status"),
                "effective_at": event.get("effective_at"),
                "asserted_by": event.get("asserted_by"),
                "reason": event.get("reason"),
                "affected_source_labels": [
                    self.source_labels.get(str(item.get("source_id")), str(item.get("source_id")))
                    for item in affected
                ],
                "replayed": entry.get("replayed", False),
            })
        return {
            "chapter": {"id": CHAPTER_ID, "title": "Claim Graph \u2014 the reading desk"},
            "issuer": {"issuer": ISSUER, "public_key": self.public_key},
            "reports": reports_out,
            "events": events_out,
            "honesty": (
                "Only recorded dependencies are shown. This graph is a bounded projection: "
                "it does not claim every dependency is represented. A signature commits "
                "to one exact state; it does not certify truth. A correction proposes "
                "review; it does not undo a completed action and it does not rewrite a receipt."
            ),
        }

    def verify_all(self) -> dict[str, Any]:
        """Re-verify receipts and the latest impact reports, for tests."""
        receipt_checks = []
        for report in self.reports:
            receipt_checks.append(verify_receipt(
                report["receipt"], report["snapshot"], self.sources,
                pinned_public_key=self.public_key, parent_snapshots=[]))
        impact_checks = []
        if self.history:
            entry = self.history[-1]
            for report in self.reports:
                impact_checks.append(verify_impact_report(
                    entry["reports"][report["report_id"]],
                    report["snapshot"], self.sources,
                    entry["event"], report["policy"]))
        return {"receipts": receipt_checks, "impacts": impact_checks}
