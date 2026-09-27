#!/usr/bin/env python3
"""Research & Explore — bounded external-agent demonstration harness.

The adapter runtime. Enforces ALL limits from the frozen
research/LIMITS.md in code (constants are asserted against the frozen
file at startup). The model is never told the limits.

One run:
  challenge -> join (fresh Ed25519 keypair, proof of control)
  -> delegate (owner bounds for the agent session)
  -> propose("notes.read")            [step 1: authorized proposal]
  -> retrieve the 5 permitted sources
  -> newsroom.import                  [research intake dispatch]
  -> model call 1: findings
  -> propose("notes.write")           [step 2 records notes]
  -> model call 2: draft report
  -> propose("draft.write")           [step 2 records report]
  -> evaluate.py (owner-side, deterministic)
  -> TEST CONTROL: propose("claimgraph.correct") must STOP
  -> revoke, then propose("notes.read") must STOP with MANDATE_REVOKED

Every consequential step goes through the participant's own receiver
gate; only an ALLOWED verdict permits the step. Abort cleanly with a
ledger entry on any limit breach or unexpected decision.

Usage: WORKSHOP_PORT=8479 python3 research/harness.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import typing
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RESEARCH = REPO / "research"
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
import dynamic_credentials as dc  # noqa: E402

# ---------------------------------------------------------------- limits ---
# Asserted against research/LIMITS.md at startup (frozen 2026-09-26).
MODEL = "gpt-4o-mini"
MAX_MODEL_CALLS = 4
MAX_RETRIEVALS = 6
MAX_RETRIEVAL_CHARS = 8000
RETRIEVAL_TIMEOUT_S = 20
MAX_OUTPUT_TOKENS = 2000
MAX_RUNTIME_S = 600
MAX_SPEND_USD = 1.00
COST_IN_PER_M = 0.15   # USD estimate, labeled as estimate in the ledger
COST_OUT_PER_M = 0.60  # USD estimate, labeled as estimate in the ledger

QUESTION = "What distinguishes an agent's identity from its authority to act?"
# Participant id is env-overridable so a trial can run against a backend
# that still holds an earlier demo session (the default is the demo id).
PARTICIPANT_ID = __import__("os").environ.get("RESEARCH_PARTICIPANT_ID", "research-desk")
PARTICIPANT_NAME = "Research Desk"
AGENT_ID = "atlas-1"
AGENT_NAME = "Atlas (external research agent)"
SCOPES = ["notes.read", "notes.write", "draft.write", "newsroom.review"]
CAPABILITIES = ["web.retrieve", "report.draft"]
DELEGATION = {
    "goal": QUESTION,
    "permitted_actions": ["summarize", "draft"],
    "permitted_resources": ["public-web"],
    "spending_limit": 10,
    "work_limit": 12,
    "review_conditions": {"over_spending": True},
}


def _parse_frozen_limits() -> None:
    """Assert code constants match the frozen research/LIMITS.md."""
    text = (RESEARCH / "LIMITS.md").read_text(encoding="utf-8")

    def table(name: str, raw: str) -> str:
        m = re.search(rf"\|\s*{re.escape(name)}\s*\|\s*(.*?)\s*\|", raw)
        assert m, f"LIMITS.md missing row: {name}"
        return m.group(1)

    m = re.search(r"`([^`]+)`", table("Model", text))
    assert m and m.group(1) == MODEL, "LIMITS.md model mismatch"
    assert int(table("Max model calls", text)) == MAX_MODEL_CALLS
    n_ret = table("Max source retrievals", text)
    assert int(n_ret.split()[0]) == MAX_RETRIEVALS
    assert int(table("Max retrieval size", text).replace(",", "").split()[0]) == MAX_RETRIEVAL_CHARS
    assert int(table("Retrieval timeout", text).split()[0]) == RETRIEVAL_TIMEOUT_S
    assert int(table("Max output tokens per call", text).replace(",", "")) == MAX_OUTPUT_TOKENS
    assert int(table("Max wall-clock runtime", text).split()[0]) == MAX_RUNTIME_S
    assert float(table("Max spend", text).split()[1]) == MAX_SPEND_USD
    # permitted sources: the numbered list in the frozen file
    urls = re.findall(r"https?://\S+", "\n".join(
        l for l in text.splitlines() if re.match(r"^\d+\.\s+https?://", l)))
    assert len(urls) == 5, f"expected 5 permitted sources, found {len(urls)}"
    global PERMITTED_URLS
    PERMITTED_URLS = urls
    # the harness must never be told a different question than the frozen one
    assert QUESTION in text


PERMITTED_URLS: list[str] = []
_parse_frozen_limits()


# ---------------------------------------------------------------- ledger ---
RUN_ID = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
START = time.monotonic()
LEDGER: dict = {
    "run_id": RUN_ID,
    "question": QUESTION,
    "limits_file": "research/LIMITS.md (frozen 2026-09-26, asserted at startup)",
    "steps": [],
    "model_calls": [],
    "retrievals": [],
    "receiver_decisions": [],
    "status": "running",
}
ABORTED = False


def log(step: str, **fields: object) -> None:
    rec = {"step": step, "at": datetime.now(timezone.utc).isoformat(), **fields}
    LEDGER["steps"].append(rec)
    print(f"[{rec['at'][11:19]}] {step}" +
          (f" — {fields.get('note')}" if fields.get("note") else ""), flush=True)


def check_runtime() -> None:
    elapsed = time.monotonic() - START
    if elapsed > MAX_RUNTIME_S:
        abort(f"wall-clock limit exceeded ({elapsed:.1f}s > {MAX_RUNTIME_S}s)")


def abort(reason: str) -> typing.NoReturn:
    LEDGER["status"] = "aborted"
    LEDGER["abort_reason"] = reason
    finalize()
    print(f"ABORTED: {reason}", flush=True)
    sys.exit(2)


TOKEN = ""  # set at join; bearer for this session only


def finalize() -> None:
    LEDGER["totals"] = {
        "runtime_s": round(time.monotonic() - START, 1),
        "model_calls": len(LEDGER["model_calls"]),
        "prompt_tokens": sum(c["prompt_tokens"] for c in LEDGER["model_calls"]),
        "completion_tokens": sum(c["completion_tokens"] for c in LEDGER["model_calls"]),
        "total_tokens": sum(c["total_tokens"] for c in LEDGER["model_calls"]),
        "est_cost_usd": round(sum(c["est_cost_usd"] for c in LEDGER["model_calls"]), 6),
        "cost_basis": "estimate: $0.15/1M input, $0.60/1M output tokens",
        "retrievals": len(LEDGER["retrievals"]),
    }
    if LEDGER["status"] == "running":
        LEDGER["status"] = "complete"
    (RESEARCH / f"run-{RUN_ID}.json").write_text(
        json.dumps(LEDGER, indent=2) + "\n", encoding="utf-8")
    print(f"ledger: research/run-{RUN_ID}.json", flush=True)


# ------------------------------------------------------------------ http ---
BASE = f"http://127.0.0.1:{__import__('os').environ.get('WORKSHOP_PORT', '8471')}/api/world"


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=30) as resp:
        return json.loads(resp.read().decode())


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style", "nav", "header", "footer"):
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "nav", "header", "footer") and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def retrieve(url: str, idx: int) -> dict:
    """Fetch one permitted source: 8000-char cap, 20s timeout, logged."""
    assert url in PERMITTED_URLS, f"URL not permitted: {url}"
    if len(LEDGER["retrievals"]) >= MAX_RETRIEVALS:
        abort(f"retrieval limit exceeded ({MAX_RETRIEVALS})")
    check_runtime()
    t0 = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": "openline-research-harness/1.0"})
    with urllib.request.urlopen(req, timeout=RETRIEVAL_TIMEOUT_S) as resp:
        raw = resp.read(2_000_000).decode("utf-8", errors="replace")
    ms = int((time.monotonic() - t0) * 1000)
    parser = _Text()
    parser.feed(raw)
    text = re.sub(r"\s+", " ", "".join(parser.parts)).strip()
    truncated = len(text) > MAX_RETRIEVAL_CHARS
    kept = text[:MAX_RETRIEVAL_CHARS]
    rec = {"index": idx, "url": url,
           "retrieved_at": datetime.now(timezone.utc).isoformat(),
           "bytes": len(raw.encode("utf-8")), "chars_kept": len(kept),
           "ms": ms, "truncated": truncated,
           "truncation_note": ("truncated to 8000 chars" if truncated else None)}
    LEDGER["retrievals"].append(rec)
    log("retrieve", note=f"[{idx}] {url} ({rec['bytes']} bytes, {ms} ms"
        + (", TRUNCATED at 8000 chars" if truncated else "") + ")")
    return {**rec, "text": kept}


# ----------------------------------------------------------------- model ---
def model_call(label: str, system: str, user: str) -> str:
    if len(LEDGER["model_calls"]) >= MAX_MODEL_CALLS:
        abort(f"model call limit exceeded ({MAX_MODEL_CALLS})")
    check_runtime()
    prompt_tokens_est = len((system + user)) // 4
    projected = (sum(c["est_cost_usd"] for c in LEDGER["model_calls"])
                 + (prompt_tokens_est * COST_IN_PER_M + MAX_OUTPUT_TOKENS * COST_OUT_PER_M) / 1e6)
    if projected > MAX_SPEND_USD:
        abort(f"projected spend ${projected:.4f} exceeds ${MAX_SPEND_USD:.2f} ceiling")
    payload = {"model": MODEL,
               "messages": [{"role": "system", "content": system},
                            {"role": "user", "content": user}],
               "max_tokens": MAX_OUTPUT_TOKENS, "temperature": 0.2}
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    dc.add_surrogate_to_request(req, "custom.openai", allowed_hosts=["api.openai.com"])
    with urllib.request.urlopen(req, timeout=120) as resp:
        out = dc.read_json_response(resp)  # never prints the key
    usage = out.get("usage", {})
    pt, ct = int(usage.get("prompt_tokens", 0)), int(usage.get("completion_tokens", 0))
    est = (pt * COST_IN_PER_M + ct * COST_OUT_PER_M) / 1e6
    LEDGER["model_calls"].append(
        {"label": label, "model": MODEL, "prompt_tokens": pt,
         "completion_tokens": ct, "total_tokens": pt + ct,
         "est_cost_usd": round(est, 6),
         "at": datetime.now(timezone.utc).isoformat()})
    log("model_call", note=f"{label}: {pt} in / {ct} out tokens (est ${est:.5f})")
    if sum(c["est_cost_usd"] for c in LEDGER["model_calls"]) > MAX_SPEND_USD:
        abort("spend ceiling exceeded")
    return out["choices"][0]["message"]["content"]


# ----------------------------------------------------------------- steps ---
def propose(action: str, label: str, key_slug: str | None = None) -> dict:
    """One action through the participant's OWN gate. Returns the decision."""
    check_runtime()
    res = _post("/propose", {"participant_id": PARTICIPANT_ID, "token": TOKEN,
                             "action": action,
                             "idempotency_key": f"{RUN_ID}:{key_slug or label}"})
    LEDGER["receiver_decisions"].append(
        {"step": label, "action": action, "decision": res["decision"],
         "receipt_id": res["receipt_id"],
         "reason_codes": res.get("reason_codes", []),
         "at": datetime.now(timezone.utc).isoformat()})
    log("propose", note=f"{action} -> {res['decision']} "
        f"(receipt {res['receipt_id'][:12]}…, reasons {res.get('reason_codes', [])})")
    return res


def require_allowed(res: dict, step: str) -> None:
    if res["decision"] != "ALLOWED":
        abort(f"{step}: expected ALLOWED, got {res['decision']} "
              f"(reasons {res.get('reason_codes', [])})")


def main() -> None:
    global TOKEN
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    # (a) challenge -> keypair -> sign -> join
    nonce = _post("/challenge", {})["nonce"]
    priv = Ed25519PrivateKey.generate()
    pub_hex = priv.public_key().public_bytes_raw().hex()
    sig_hex = priv.sign(nonce.encode("utf-8")).hex()
    join = _post("/join", {"profile": {
        "version": "openline-join-profile/v1",
        "participant": {"id": PARTICIPANT_ID, "display_name": PARTICIPANT_NAME},
        "agent": {"id": AGENT_ID, "display_name": AGENT_NAME, "public_key": pub_hex},
        "proof": {"nonce": nonce, "signature": sig_hex},
        "mandate": {"scopes": SCOPES},
        "capabilities": CAPABILITIES}})
    TOKEN = join["token"]
    LEDGER["session"] = {"participant_id": join["participant_id"],
                         "agent_id": join["agent_id"],
                         "scopes": join.get("scopes", SCOPES),
                         "token": TOKEN}
    log("join", note=f"{PARTICIPANT_NAME} / {AGENT_NAME}; scopes {join.get('scopes', SCOPES)}")

    # (b) delegate: owner bounds for the agent session
    dlg = _post("/delegate", {"participant_id": PARTICIPANT_ID, "token": TOKEN,
                              "delegation": DELEGATION})
    bounds = _get(f"/delegation?participant_id={PARTICIPANT_ID}&token={urllib.parse.quote(TOKEN)}")
    LEDGER["delegation"] = bounds["delegation"]
    log("delegate", note=f"delegation {dlg['delegation_id']}: goal set, "
        f"spend<={DELEGATION['spending_limit']}, work<={DELEGATION['work_limit']}")

    # (c) step 1: the authorized research proposal goes through the receiver
    require_allowed(propose("notes.read", "research-proposal"), "research proposal")

    # (d) retrieve the permitted sources
    sources = [retrieve(url, i + 1) for i, url in enumerate(PERMITTED_URLS)]

    # (l) newsroom intake: the research becomes visible in the world's newsroom.
    # HONEST CONSTRAINT (verified 2026-09-26): the desk's frozen rule admits
    # only its fixture article's bytes (newsroom_chapter._article_source
    # raises ValueError "unregistered import" for anything else, surfacing
    # as a 500). So the harness imports the fixture article verbatim — the
    # same bytes the UI's own import button uses — and labels it exactly
    # for what it is. The specified "Research intake: <question>" text is
    # NOT importable under the frozen backend semantics; it is not faked.
    fixture = _get("/newsroom")["fixture_article"]
    imp = _post("/newsroom/import",
                {"participant_id": PARTICIPANT_ID, "token": TOKEN,
                 "article": fixture, "idempotency_key": f"{RUN_ID}:intake"})
    LEDGER["receiver_decisions"].append(
        {"step": "newsroom-import (fixture bytes: the desk admits only these)",
         "action": "newsroom.review",
         "decision": imp["decision"], "receipt_id": imp["receipt_id"],
         "reason_codes": imp.get("reason_codes", []),
         "dispatch_id": imp.get("dispatch_id"),
         "dispatch_title": fixture.get("title"),
         "imported_by": f"world:participant:{PARTICIPANT_ID}",
         "honest_note": ("Imported the desk's fixture article verbatim; "
                         "arbitrary intake text is refused by the frozen "
                         "backend rule (unregistered bytes -> 500)."),
         "at": datetime.now(timezone.utc).isoformat()})
    log("newsroom_import",
        note=f"{imp['decision']} (dispatch {imp.get('dispatch_id')})")
    if imp["decision"] != "ALLOWED":
        abort(f"newsroom import: expected ALLOWED, got {imp['decision']}")
    LEDGER["intake_dispatch_id"] = imp["dispatch_id"]

    # (e) model call 1: findings from the retrieved texts
    src_block = "\n\n".join(
        f"[SOURCE {s['index']}] {s['url']} (retrieved: {s['retrieved_at']})\n{s['text']}"
        for s in sources)
    findings = model_call(
        "findings",
        ("You are a careful research reader. Answer only from the provided "
         "source texts. Distinguish what the sources say from your own "
         "interpretation, and say plainly what is unresolved."),
        ("Research question: " + QUESTION + "\n\nSource texts:\n" + src_block +
         "\n\nWrite:\n1. Sourced observations — each with a short quote and "
         "its [SOURCE n] label.\n2. Model interpretations — your own reading, "
         "clearly labeled as interpretation.\n3. Unresolved questions — what "
         "the sources do not settle."))

    # (f) step 2 records the notes (receiver decides)
    require_allowed(propose("notes.write", "record-notes"), "record notes")
    notes_path = RESEARCH / f"notes-{RUN_ID}.md"
    notes_path.write_text(
        f"# Research notes — {RUN_ID}\n\nQuestion: {QUESTION}\n\n"
        "The following are the agent's working notes (model output, unverified).\n\n"
        + findings + "\n", encoding="utf-8")
    log("write_notes", note=str(notes_path))

    # (g) model call 2: draft the report with the required sections
    permitted_list = "\n".join(f"- {u} (retrieved: <ISO timestamp from the source texts above>)"
                               for u in PERMITTED_URLS)
    draft_system = (
        "You write a short private research report. Use EXACTLY these four "
        "sections, in this order, with these exact headings:\n"
        "## Sourced observations\n## Interpretation\n## Sources\n## Uncertainties\n\n"
        "Rules: In ## Interpretation include the sentence "
        "\"The following is model interpretation, not sourced fact.\" verbatim. "
        "In ## Sources give at least 3 entries; each entry must contain the "
        "source URL and the text \"retrieved: \" followed by the ISO timestamp "
        "given with that source. Cite ONLY URLs from this permitted list:\n"
        + permitted_list + "\n"
        "In ## Uncertainties list at least one genuine uncertainty. State in "
        "plain words that this run did not demonstrate self-improvement, that "
        "no recursive-self-improvement claim is made, and that no fiduciary "
        "status is claimed. Do not claim self-improvement, RSI, or fiduciary "
        "status anywhere else.")
    report = model_call(
        "report-draft", draft_system,
        ("Research question: " + QUESTION +
         "\n\nYour findings to work from:\n" + findings +
         "\n\nSource retrieval timestamps:\n" +
         "\n".join(f"[SOURCE {s['index']}] retrieved: {s['retrieved_at']}"
                   for s in sources)))
    if ("The following is model interpretation, not sourced fact." not in report
            or "## Sourced observations" not in report
            or "## Interpretation" not in report
            or "## Sources" not in report
            or "## Uncertainties" not in report):
        # one corrective retry (still within the model-call budget)
        log("draft_retry", note="structure check failed; one corrective retry")
        report = model_call(
            "report-draft-retry", draft_system,
            ("The previous draft missed a required section or the verbatim "
             "separation sentence. Redo the full report now, following the "
             "format rules exactly.\n\nResearch question: " + QUESTION +
             "\n\nFindings:\n" + findings))

    # (h) step 2 records the report (receiver decides)
    require_allowed(propose("draft.write", "record-report"), "record report")
    report_path = RESEARCH / f"report-{RUN_ID}.md"
    report_path.write_text(
        f"# Research report — {RUN_ID}\n\nQuestion: {QUESTION}\n\n"
        "_Agent-submitted content: model output, unverified. Acceptance is "
        "decided by the receiver-owned criteria (research/evaluate.py), not "
        "by this file._\n\n" + report + "\n", encoding="utf-8")
    log("write_report", note=str(report_path))

    # (i) owner-side deterministic evaluation
    eval_path = RESEARCH / f"evaluation-{RUN_ID}.json"
    proc = subprocess.run(
        [sys.executable, str(RESEARCH / "evaluate.py"), str(report_path), RUN_ID],
        capture_output=True, text=True, timeout=60)
    log("evaluate", note=f"exit {proc.returncode}; {proc.stdout.strip()[:200]}")
    if proc.returncode not in (0, 1):
        abort(f"evaluate.py failed: {proc.stderr.strip()[:300]}")
    LEDGER["evaluation"] = json.loads(eval_path.read_text(encoding="utf-8"))
    LEDGER["evaluation_path"] = str(eval_path)

    # (j) TEST CONTROL: out-of-scope proposal must be refused before any effect
    tc = propose("claimgraph.correct", "TEST CONTROL", key_slug="test-control")
    if not (tc["decision"] == "STOPPED"
            and "ACTION_OUTSIDE_MANDATE" in tc.get("reason_codes", [])):
        abort(f"TEST CONTROL failed: decision={tc['decision']} "
              f"reasons={tc.get('reason_codes', [])}")
    log("test_control", note="TEST CONTROL STOPPED with ACTION_OUTSIDE_MANDATE — refused before any effect")

    # (k) revocation stops the NEXT gated action
    rev = _post("/revoke", {"participant_id": PARTICIPANT_ID, "token": TOKEN})
    log("revoke", note=f"owner-initiated via participant session; mandate {rev['mandate_id']} revoked")
    after = propose("notes.read", "post-revocation")
    if not (after["decision"] == "STOPPED"
            and "MANDATE_REVOKED" in after.get("reason_codes", [])):
        abort(f"post-revocation propose: expected STOPPED/MANDATE_REVOKED, "
              f"got {after['decision']} {after.get('reason_codes', [])}")
    log("post_revocation", note="STOPPED with MANDATE_REVOKED — revocation prevents the next gated action")

    # full private receipt set for the inspector (owner's demo view)
    LEDGER["receipts"] = _get(
        f"/receipts?participant_id={PARTICIPANT_ID}&token={urllib.parse.quote(TOKEN)}")["receipts"]
    log("receipts", note=f"{len(LEDGER['receipts'])} signed receipts on record")
    finalize()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — abort cleanly, ledger entry
        if LEDGER["status"] == "running":
            LEDGER["status"] = "aborted"
            LEDGER["abort_reason"] = f"{type(exc).__name__}: {exc}"
            finalize()
        print(f"ABORTED: {type(exc).__name__}: {exc}", flush=True)
        sys.exit(2)
