#!/usr/bin/env python3
"""Correction demo: receiver-owned acceptance of the actual research report.

Reuses the existing report bytes from b6bd4b79 — no model calls, no
retrievals, no paid contact of any kind. Drives the real HTTP API of a
fresh backend:

  1. join (participant research-desk-correction, agent atlas-1, scope
     newsroom.review)
  2. submit the ACTUAL report bytes, hash-pinned at submit -> ALLOWED;
     the displayed dispatch body binds to the same bytes
  3. submit ALTERED bytes under the original pinned hash -> STOPPED with
     REPORT_HASH_MISMATCH, before any effect, no dispatch recorded
  4. revoke the mandate -> submit -> STOPPED with MANDATE_REVOKED
  5. cross-check the backend verdict against research/evaluate.py on the
     same bytes

Writes research/correction-<ts>.json with signed receipts and bindings.

Usage: correction_demo.py <backend-port>
"""
import hashlib
import json
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = ROOT / "research"
REPORT = RESEARCH / "report-20260926T233916Z.md"
REAL_SHA = "d80eed02cabf6e331e96258e8bb61d75d1dc1499447de99112ba2cb123b1f558"


def post(base, path, payload):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get(base, path):
    with urllib.request.urlopen(base + path, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    port = sys.argv[1]
    base = f"http://127.0.0.1:{port}/api/world"
    evidence: dict = {"demo": "receiver-owned acceptance of the actual research report",
                      "no_model_calls": True, "no_retrievals": True,
                      "no_paid_contact": True, "steps": []}

    body = REPORT.read_text(encoding="utf-8")
    pinned = hashlib.sha256(body.encode("utf-8")).hexdigest()
    assert pinned == REAL_SHA, f"report bytes changed: {pinned}"

    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    # Vendored wallet on sys.path the same way the backend does it.
    sys.path.insert(0, str(ROOT / "backend" / "vendor"))
    from openline_wallet.crypto import public_key_hex

    key = Ed25519PrivateKey.generate()
    nonce = post(base, "/challenge", {})["nonce"]
    join = post(base, "/join", {"profile": {
        "version": "openline-join-profile/v1",
        "participant": {"id": "research-desk-correction",
                        "display_name": "Research Desk (correction)"},
        "agent": {"id": "atlas-1", "display_name": "Atlas",
                  "public_key": public_key_hex(key)},
        "proof": {"nonce": nonce,
                  "signature": key.sign(nonce.encode("utf-8")).hex()},
        "mandate": {"scopes": ["newsroom.review"]},
        "capabilities": ["mandate.v1", "receipt.v1", "revocation.v1"],
    }})
    token = join["token"]
    # Local demo bearer token, kept for the capture session's ResearchInspector.
    evidence["participant_token"] = token
    evidence["steps"].append({"step": "join", "participant_id": "research-desk-correction",
                              "agent_id": "atlas-1", "receipt_id": join.get("receipt_id")})

    submission = {"title": "What distinguishes an agent's identity from its authority to act?",
                  "source_url": "agent-submission://atlas-1/report-20260926T233916Z",
                  "published_at": "2026-09-26T23:39:16Z",
                  "body": body, "report_sha256": REAL_SHA}

    # 2. The actual report, hash-pinned.
    allowed = post(base, "/newsroom/submit-report",
                   {"participant_id": "research-desk-correction", "token": token,
                    "report": submission, "idempotency_key": "correction-accept"})
    assert allowed["decision"] == "ALLOWED", allowed
    assert allowed["binding"]["match"] is True
    assert allowed["binding"]["declared_sha256"] == REAL_SHA
    assert allowed["binding"]["pinned_sha256"] == REAL_SHA
    assert allowed["acceptance"]["verdict"] == "ACCEPTED"
    assert allowed["acceptance"]["evaluated_sha256"] == REAL_SHA
    evidence["steps"].append({"step": "submit actual report",
                              "decision": allowed["decision"],
                              "receipt_id": allowed["receipt_id"],
                              "reason_codes": allowed["reason_codes"],
                              "binding": allowed["binding"],
                              "acceptance_verdict": allowed["acceptance"]["verdict"],
                              "dispatch_id": allowed["dispatch_id"]})

    # The displayed artifact is the same bytes.
    desc = get(base, "/newsroom")
    disp = next(d for d in desc["dispatches"]
                if d["dispatch_id"] == allowed["dispatch_id"])
    assert disp["research_report"] is True
    assert disp["report_sha256"] == REAL_SHA
    assert hashlib.sha256(disp["body"].encode("utf-8")).hexdigest() == REAL_SHA
    assert disp["body"] == body
    assert disp["acceptance"]["verdict"] == "ACCEPTED"
    evidence["steps"].append({"step": "verify displayed artifact",
                              "displayed_sha256": hashlib.sha256(
                                  disp["body"].encode("utf-8")).hexdigest(),
                              "all_identical": True})

    # 3. Altered bytes under the original pinned hash: refused before effect.
    flipped = body.replace("agent's identity", "agent's IDENTIFY", 1)
    assert flipped != body
    sub2 = dict(submission, body=flipped)
    refused = post(base, "/newsroom/submit-report",
                   {"participant_id": "research-desk-correction", "token": token,
                    "report": sub2, "idempotency_key": "correction-flip"})
    assert refused["decision"] == "STOPPED", refused
    assert "REPORT_HASH_MISMATCH" in refused["reason_codes"]
    assert refused["dispatch_id"] is None
    assert len(get(base, "/newsroom")["dispatches"]) == 1
    evidence["steps"].append({"step": "submit altered bytes",
                              "decision": refused["decision"],
                              "receipt_id": refused["receipt_id"],
                              "reason_codes": refused["reason_codes"],
                              "binding_match": refused["binding"]["match"],
                              "dispatches_after": 1})

    # 4. Revocation: the next gated submit stops.
    post(base, "/revoke", {"participant_id": "research-desk-correction",
                           "token": token})
    revoked = post(base, "/newsroom/submit-report",
                   {"participant_id": "research-desk-correction", "token": token,
                    "report": submission, "idempotency_key": "correction-revoked"})
    assert revoked["decision"] == "STOPPED", revoked
    assert "MANDATE_REVOKED" in revoked["reason_codes"]
    assert revoked["dispatch_id"] is None
    evidence["steps"].append({"step": "submit after revocation",
                              "decision": revoked["decision"],
                              "receipt_id": revoked["receipt_id"],
                              "reason_codes": revoked["reason_codes"],
                              "dispatches_after": 1})

    # 5. Cross-check: backend verdict matches research/evaluate.py.
    import importlib.util
    spec = importlib.util.spec_from_file_location("evaluate", RESEARCH / "evaluate.py")
    evaluate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(evaluate)
    secs = evaluate.sections(body)
    ref_results = [
        ("C1", evaluate.check_c1(secs)[0]),
        ("C2", evaluate.check_c2(secs)[0]),
        ("C3", evaluate.check_c3(secs)[0]),
        ("C4", evaluate.check_c4(secs, body)[0]),
        ("C5", evaluate.check_c5(secs, body, evaluate.permitted_sources())[0]),
    ]
    backend_results = [(c["criterion"], c["result"])
                       for c in allowed["acceptance"]["results"]]
    assert backend_results == ref_results, (backend_results, ref_results)
    evidence["steps"].append({"step": "cross-check backend vs research/evaluate.py",
                              "agree": True})

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RESEARCH / f"correction-{ts}.json"
    out.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print("evidence:", out)
    print("accepted dispatch:", allowed["dispatch_id"])
    print("all bindings identical:", REAL_SHA)


if __name__ == "__main__":
    main()
