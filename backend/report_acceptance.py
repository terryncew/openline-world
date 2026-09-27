"""Research-report acceptance: the receiver-owned structural checks.

Mechanical port of the frozen research/CRITERIA.md (2026-09-26) C1-C5,
implemented here so the backend's newsroom submit-report path can run the
declared acceptance checks server-side, on the pinned bytes, at admission
time.

WHAT THESE CHECKS ARE AND ARE NOT:
- They are STRUCTURAL checks: section presence, citation formatting,
  scope conformance, byte binding. They verify the artifact's shape.
- They are NOT factual verification: a report that passes C1-C5 may still
  make false claims. Nothing in the acceptance record, the UI, or the
  capture may present these checks as verifying that any claim in the
  report is true. The acceptance record carries this scope note verbatim.

The canonical criteria live in research/CRITERIA.md and their reference
implementation in research/evaluate.py. This module ports that logic
exactly (same regexes, same section parsing, same overclaim handling);
backend/tests/test_report_acceptance.py cross-checks the backend verdict
against research/evaluate.py on the same bytes.
"""

from __future__ import annotations

import hashlib
import re

# The 5 permitted source URLs, frozen in research/LIMITS.md (2026-09-26).
# Hardcoded here so the backend stays self-contained; the test asserts this
# list matches the frozen file.
PERMITTED_SOURCES = [
    "https://github.com/terryncew/openline-wallet/blob/main/APPROVED_JOB_LIVE_001.md",
    "https://github.com/terryncew/openline-wallet",
    "https://www.w3.org/TR/did-core/",
    "https://datatracker.ietf.org/doc/html/rfc6749",
    "https://openid.net/specs/openid-connect-core-1_0.html",
]

URL_RE = re.compile(r"https?://[^\s)>\]\"'<>]+")
ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
# "RSI" as a word (case-insensitive) — not a substring. "self-improv" is
# intentionally a prefix fragment (catches "self-improvement").
OVERCLAIM_PATTERNS = [r"self-improv", r"fiduciary", r"\brsi\b", r"recursive self"]
NEGATION_RE = re.compile(r"\b(not|no|never|without|none|didn'?t|doesn'?t|wasn'?t|weren'?t)\b", re.I)

SCOPE_NOTE = (
    "Structural checks only: they verify the report's shape (required "
    "sections present, citations formatted, URLs within the permitted list, "
    "no overclaim phrases, bytes bound to the pinned hash). They do NOT "
    "verify that any claim in the report is true. Acceptance admits the "
    "artifact for display; it is not factual verification."
)


def sections(text: str) -> dict[str, str]:
    """Map '## Heading' -> section body (exact heading text preserved)."""
    out: dict[str, str] = {}
    current: str | None = None
    buf: list[str] = []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            if current is not None:
                out[current] = "\n".join(buf).strip()
            current = m.group(1).strip()
            buf = []
        elif current is not None:
            buf.append(line)
    if current is not None:
        out[current] = "\n".join(buf).strip()
    return out


def entries(body: str) -> list[str]:
    """Bullet/numbered list entries (with continuation lines) in a body."""
    items: list[str] = []
    cur: list[str] = []
    for line in body.splitlines():
        if re.match(r"^\s*(?:[-*]|\d+[.)])\s+", line):
            if cur:
                items.append("\n".join(cur).strip())
            cur = [line]
        elif cur and line.strip():
            cur.append(line)
        elif cur and not line.strip():
            pass
    if cur:
        items.append("\n".join(cur).strip())
    return items


def strip_url_trailing(url: str) -> str:
    return url.rstrip(".,;:!?")


def check_c1(secs: dict[str, str]) -> tuple[str, str]:
    body = secs.get("Sources")
    if body is None:
        return "fail", "no '## Sources' section found"
    items = entries(body)
    if not items:
        items = [line.strip() for line in body.splitlines() if line.strip()]
    bad = [e for e in items
           if not URL_RE.search(e) or not re.search(r"retrieved:\s*\S*" + ISO_DATE_RE.pattern, e, re.I)]
    if len(items) < 3:
        return "fail", f"only {len(items)} source entries (need >= 3)"
    if bad:
        return "fail", f"{len(bad)} of {len(items)} entries lack a URL or a retrieved: ISO timestamp"
    return "pass", f"{len(items)} entries, each with URL and retrieved: ISO timestamp"


def check_c2(secs: dict[str, str]) -> tuple[str, str]:
    body = secs.get("Uncertainties")
    if body is None:
        return "fail", "no '## Uncertainties' section found"
    items = entries(body)
    if not items:
        items = [line.strip() for line in body.splitlines() if line.strip()]
    if len(items) < 1:
        return "fail", "Uncertainties section has no items"
    return "pass", f"{len(items)} uncertainty item(s) stated"


def check_c3(secs: dict[str, str]) -> tuple[str, str]:
    obs = secs.get("Sourced observations")
    interp = secs.get("Interpretation")
    missing = [n for n, v in (("Sourced observations", obs), ("Interpretation", interp)) if v is None]
    if missing:
        return "fail", f"missing section(s): {', '.join(missing)}"
    sentence = "The following is model interpretation, not sourced fact."
    if sentence not in (interp or ""):
        return "fail", "Interpretation section lacks the required separation sentence"
    return "pass", "both sections present; separation sentence present"


def check_c4(secs: dict[str, str], full: str) -> tuple[str, str]:
    unc = secs.get("Uncertainties")
    outside = full
    if unc is not None:
        outside = outside.replace("## Uncertainties\n" + unc, "## Uncertainties")
    for pattern in OVERCLAIM_PATTERNS:
        m = re.search(pattern, outside, re.I)
        if m:
            return "fail", f"overclaim match {m.group(0)!r} found outside Uncertainties"
    if unc:
        for pattern in OVERCLAIM_PATTERNS:
            for m in re.finditer(pattern, unc, re.I):
                line_start = unc.rfind("\n", 0, m.start()) + 1
                line_end = unc.find("\n", m.end())
                line = unc[line_start:line_end if line_end != -1 else len(unc)]
                if not NEGATION_RE.search(line):
                    return "fail", (
                        f"overclaim match {m.group(0)!r} inside Uncertainties without "
                        f"a negation ('not demonstrated' required)")
    return "pass", "no self-improvement/fiduciary/RSI claims"


def check_c5(full: str) -> tuple[str, str]:
    found = [strip_url_trailing(u) for u in URL_RE.findall(full)]
    norm = lambda u: u.rstrip("/")
    allowed_n = {norm(u) for u in PERMITTED_SOURCES}
    bad = sorted({u for u in found if norm(u) not in allowed_n})
    if bad:
        return "fail", f"URL(s) outside the permitted list: {', '.join(bad[:5])}"
    return "pass", f"{len(found)} URL(s) in report, all on the permitted list"


def evaluate_report(body: str) -> dict:
    """Run C1-C5 on the exact bytes given. Returns the acceptance record.

    The record is computed from `body` and binds itself to those bytes via
    evaluated_sha256. It is a structural assessment, not factual
    verification (see SCOPE_NOTE).
    """
    evaluated_sha256 = hashlib.sha256(body.encode("utf-8")).hexdigest()
    secs = sections(body)
    results: list[dict[str, str]] = []

    def record(criterion: str, check: str, outcome: tuple[str, str]) -> None:
        result, detail = outcome
        results.append({"criterion": criterion, "check_performed": check,
                        "result": result, "detail": detail})

    record("C1", "Sources section: >=3 entries, each with URL and retrieved: ISO timestamp",
           check_c1(secs))
    record("C2", "Uncertainties section: >=1 item", check_c2(secs))
    record("C3", "Sourced observations + Interpretation sections; separation sentence present",
           check_c3(secs))
    record("C4", "No overclaim phrases outside a negated Uncertainties mention",
           check_c4(secs, body))
    record("C5", "Every URL in the report is on the LIMITS.md permitted list",
           check_c5(body))

    return {
        "criteria_frozen": "research/CRITERIA.md (2026-09-26)",
        "evaluator": "backend/report_acceptance.py (deterministic; no model, no network; "
                     "mechanical port of research/evaluate.py)",
        "evaluated_sha256": evaluated_sha256,
        "scope_note": SCOPE_NOTE,
        "results": results,
        "verdict": "ACCEPTED" if all(r["result"] == "pass" for r in results) else "REJECTED",
    }
