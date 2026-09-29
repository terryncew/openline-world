"""CHALLENGE-001 Phase-1 verification orchestrator.

Runs the frozen five-control demonstration plus the credit-cascade scenario
against a real server:

  owner (process 1, keydir .keys/owner): join -> create CHALLENGE-001
  A     (process 2, keydir .keys/a):     join -> delegate -> patch (BUG-1,
                                         explicit empty builds_on)
  B     (process 3, keydir .keys/b):     join -> delegate -> review of A's
                                         patch (explicit builds_on link to
                                         the patch) + test bundling two bugs
  owner: ACCEPT the patch, DECLINE the test (checkable reason),
         ACCEPT the review (visible credit)
  controls:
    - B evaluates -> STOPPED EVALUATOR_NOT_OWNER (self-approval changes nothing)
    - A contributes with a self-approval attestation -> ALLOWED, attestation
      discarded (appears nowhere in the stored record)
    - revoke B -> B contributes -> STOPPED MANDATE_REVOKED, refusal recorded
  durability:
    - server restart (same data dir, no wipe): board unchanged
    - duplicate contribute with the same idempotency key: replayed
  credit cascade (after the restart):
    - A contributes an independent control patch (BUG-2, no reuse links);
      owner ACCEPTs it
    - owner links the accepted patch + review as claim nodes with a
      dependency edge (the review's recorded builds_on, in graph form),
      and the control patch as an independent report
    - A attempts a correction without the scope -> STOPPED
      ACTION_OUTSIDE_MANDATE, nothing appended
    - owner posts an authorized CORRECTED event against the review's key
      finding -> the review's claims are reassessed (QUARANTINE), the patch
      and the control stay UNAFFECTED, original bytes and the ACCEPT
      decisions are preserved, refusals still on the record

Honest label: the client processes are deterministic demo scripts on the
same machine as the server — internally operated, NOT independent
operators and NOT remote agents. The correction event is a deliberate
demonstration of the authorized-correction mechanism, not a claim that the
review's finding was actually wrong. See PROTOCOL.md and ATTRIBUTION.md.

Usage: python run_demo.py [--port 8471] [--keep]
Writes: evidence/demo-evidence.json
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent.parent
CLIENT = HERE / "client.py"
EVIDENCE_DIR = HERE / "evidence"
DATA_DIR = HERE / ".data"
KEYS_DIR = HERE / ".keys"
SERVER_LOG = HERE / ".server.log"

checks: list[dict] = []
evidence: dict = {"steps": []}


def canonical(obj: object) -> str:
    # Must match backend/world.py _canonical_builds_on exactly.
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def check(name: str, cond: bool, detail: str = "") -> None:
    mark = "PASS" if cond else "FAIL"
    print(f"[{mark}] {name}" + (f" -- {detail}" if detail and not cond else ""))
    checks.append({"name": name, "pass": bool(cond), "detail": detail})


def run_client(*argv: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(CLIENT), *argv],
        cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=120)
    try:
        out = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:
        out = {"_raw_stdout": proc.stdout[-2000:], "_raw_stderr": proc.stderr[-2000:]}
    out["_exit"] = proc.returncode
    return out


def wait_for_health(base: str, timeout: float = 25.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base + "/api/health", timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"server at {base} did not become healthy")


def launch_server(port: int, wipe: bool) -> subprocess.Popen:
    if wipe:
        if DATA_DIR.exists():
            shutil.rmtree(DATA_DIR)
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["WORKSHOP_PORT"] = str(port)
    env["WORLD_DATA_DIR"] = str(DATA_DIR)
    log = open(SERVER_LOG, "a", encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "backend/server.py"], cwd=str(REPO_ROOT), env=env,
        stdout=log, stderr=subprocess.STDOUT)
    wait_for_health(f"http://127.0.0.1:{port}")
    return proc


def stop_server(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8471)
    ap.add_argument("--keep", action="store_true",
                    help="leave the server running at the end")
    args = ap.parse_args()
    base = f"http://127.0.0.1:{args.port}"
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    if KEYS_DIR.exists():
        shutil.rmtree(KEYS_DIR)
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    SERVER_LOG.write_text("", encoding="utf-8")

    server = launch_server(args.port, wipe=True)
    print(f"server pid={server.pid} port={args.port} data_dir={DATA_DIR}")
    try:
        # -- step 1: owner creates the challenge ---------------------------
        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"), "--cmd", "create",
                       "--idempotency-key", "owner-create-1")
        created = r.get("create", {})
        check("owner creates CHALLENGE-001",
              created.get("decision") == "ALLOWED",
              json.dumps(created)[:300])
        evidence["steps"].append({"create": created})
        check("create receipt recorded",
              bool(created.get("challenge", {}).get("create_receipt_id")))

        # -- step 2: A contributes a patch ----------------------------------
        r = run_client("--role", "contrib-a", "--server", base,
                       "--keydir", str(KEYS_DIR / "a"), "--cmd", "contribute",
                       "--kind", "patch",
                       "--file", str(HERE / "fixtures" / "patch-a.diff"),
                       "--title", "Fix rolling_sum off-by-one",
                       "--builds-on", "[]",
                       "--idempotency-key", "a-patch-1")
        c = r.get("contribute", {})
        check("A patch admitted", c.get("decision") == "ALLOWED",
              json.dumps(c)[:300])
        patch_id = c.get("contribution_id", "")
        evidence["steps"].append({"a_patch": c})
        check("A delegated before contributing",
              bool(r.get("delegation_id")))

        # -- step 3: B reviews A's patch and submits the two-bug test -------
        builds_on = canonical([{
            "contribution_id": patch_id,
            "what_reused": ("the one-line diff for BUG-1; the "
                            "range-gives-3-windows check"),
        }])
        r = run_client("--role", "contrib-b", "--server", base,
                       "--keydir", str(KEYS_DIR / "b"), "--cmd", "contribute",
                       "--kind", "review",
                       "--file", str(HERE / "fixtures" / "review-b.md"),
                       "--title", "Review of the rolling_sum off-by-one patch",
                       "--references", patch_id,
                       "--patch-id", patch_id,
                       "--builds-on", builds_on,
                       "--idempotency-key", "b-review-1")
        c = r.get("contribute", {})
        check("B review admitted", c.get("decision") == "ALLOWED",
              json.dumps(c)[:300])
        review_id = c.get("contribution_id", "")
        evidence["steps"].append({"b_review": c})

        r = run_client("--role", "contrib-b", "--server", base,
                       "--keydir", str(KEYS_DIR / "b"), "--cmd", "contribute",
                       "--kind", "test",
                       "--file", str(HERE / "fixtures" / "test-b.py"),
                       "--title", "Failing tests for BUG-1 and BUG-2",
                       "--idempotency-key", "b-test-1")
        c = r.get("contribute", {})
        check("B two-bug test structurally admitted (not machine-refused)",
              c.get("decision") == "ALLOWED", json.dumps(c)[:300])
        test_id = c.get("contribution_id", "")
        evidence["steps"].append({"b_test": c})

        # -- step 4: owner evaluates ----------------------------------------
        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"), "--cmd", "evaluate",
                       "--contribution-id", patch_id, "--decision", "ACCEPT",
                       "--reason", "diff is well-formed; the one-line change "
                       "matches EXPECTED.md for BUG-1 (range gives 3 windows)",
                       "--idempotency-key", "owner-eval-patch")
        ev = r.get("evaluate", {})
        check("owner ACCEPTs the patch", ev.get("decision") == "ALLOWED",
              json.dumps(ev)[:300])
        evidence["steps"].append({"eval_patch": ev})

        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"), "--cmd", "evaluate",
                       "--contribution-id", test_id, "--decision", "DECLINE",
                       "--reason", "bundles BUG-1 and BUG-2; one bug per test",
                       "--idempotency-key", "owner-eval-test")
        ev = r.get("evaluate", {})
        check("owner DECLINEs the two-bug test with checkable reason",
              ev.get("decision") == "ALLOWED"
              and "one bug per test" in (ev.get("evaluation", {})
                                         .get("reason", "")),
              json.dumps(ev)[:300])
        evidence["steps"].append({"eval_test": ev})

        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"), "--cmd", "evaluate",
                       "--contribution-id", review_id, "--decision", "ACCEPT",
                       "--reason", "checkable finding verified by reading: "
                       "range(3) is three windows, matching EXPECTED.md",
                       "--idempotency-key", "owner-eval-review")
        ev = r.get("evaluate", {})
        check("owner ACCEPTs the review (visible credit)",
              ev.get("decision") == "ALLOWED", json.dumps(ev)[:300])
        evidence["steps"].append({"eval_review": ev})

        # -- step 5: controls -------------------------------------------------
        # 5a: contributor self-approval changes nothing
        r = run_client("--role", "contrib-b", "--server", base,
                       "--keydir", str(KEYS_DIR / "b"), "--cmd", "evaluate",
                       "--contribution-id", review_id, "--decision", "ACCEPT",
                       "--reason", "I approve my own review")
        ev = r.get("evaluate", {})
        check("contributor evaluate refused EVALUATOR_NOT_OWNER",
              ev.get("decision") == "STOPPED"
              and "EVALUATOR_NOT_OWNER" in (ev.get("reason_codes") or []),
              json.dumps(ev)[:300])
        evidence["steps"].append({"control_self_approval": ev})

        # 5b: self-attestation carried in a contribution is discarded
        r = run_client("--role", "contrib-a", "--server", base,
                       "--keydir", str(KEYS_DIR / "a"), "--cmd", "contribute",
                       "--kind", "patch",
                       "--file", str(HERE / "fixtures" / "patch-a.diff"),
                       "--title", "Fix rolling_sum off-by-one (with attestation)",
                       "--with-attestation",
                       "--idempotency-key", "a-patch-attested")
        c = r.get("contribute", {})
        attested_id = c.get("contribution_id", "")
        check("contribution with self-attestation admitted on merits",
              c.get("decision") == "ALLOWED", json.dumps(c)[:300])
        board = run_client("--role", "owner", "--server", base,
                           "--keydir", str(KEYS_DIR / "owner"),
                           "--cmd", "board")["board"]
        stored = [x for x in board["contributions"]
                  if x["contribution_id"] == attested_id]
        check("attestation appears nowhere in the stored record",
              bool(stored) and "attestation" not in stored[0],
              json.dumps(list(stored[0].keys()) if stored else None))
        evidence["steps"].append({"control_attestation": c})

        # 5c: revoked participant refused with a named reason. Revoke and
        # contribute in ONE process so the presentation carries the revoked
        # mandate: the gate STOPs with MANDATE_REVOKED.
        r = run_client("--role", "contrib-b", "--server", base,
                       "--keydir", str(KEYS_DIR / "b"),
                       "--cmd", "revoke-then-contribute",
                       "--kind", "patch",
                       "--file", str(HERE / "fixtures" / "patch-a.diff"),
                       "--title", "Patch after revocation",
                       "--idempotency-key", "b-patch-revoked")
        check("B mandate revoked", r.get("revoked") is True,
              json.dumps({k: r.get(k) for k in ("revoked", "session")}))
        c = r.get("contribute", {})
        check("revoked contribution refused MANDATE_REVOKED",
              c.get("decision") == "STOPPED"
              and "MANDATE_REVOKED" in (c.get("reason_codes") or []),
              json.dumps(c)[:300])
        check("revoked refusal recorded in the refusal ledger",
              bool(c.get("refusal_id")))
        evidence["steps"].append({"control_revoked": c})

        # -- step 6: durability ----------------------------------------------
        # 6a: idempotent replay
        r = run_client("--role", "contrib-a", "--server", base,
                       "--keydir", str(KEYS_DIR / "a"), "--cmd", "contribute",
                       "--kind", "patch",
                       "--file", str(HERE / "fixtures" / "patch-a.diff"),
                       "--title", "Fix rolling_sum off-by-one",
                       "--idempotency-key", "a-patch-1")
        c = r.get("contribute", {})
        check("duplicate contribute replays (no double record)",
              c.get("replayed") is True
              and c.get("contribution_id") == patch_id,
              json.dumps(c)[:200])

        board_before = run_client(
            "--role", "owner", "--server", base,
            "--keydir", str(KEYS_DIR / "owner"), "--cmd", "board")["board"]
        stop_server(server)
        print("server stopped; restarting on the same data dir (no wipe)")
        server = launch_server(args.port, wipe=False)
        board_after = run_client(
            "--role", "owner", "--server", base,
            "--keydir", str(KEYS_DIR / "owner"), "--cmd", "board")["board"]
        check("contributions survive a server restart",
              [c["contribution_id"] for c in board_after["contributions"]]
              == [c["contribution_id"] for c in board_before["contributions"]])
        check("decisions survive a server restart",
              len(board_after["decisions"]) == len(board_before["decisions"])
              == 3)
        check("refusals survive a server restart",
              len(board_after["refusals"]) == len(board_before["refusals"])
              == 2)
        evidence["board_after_restart"] = board_after

        # 6b: unauthenticated read still works
        with urllib.request.urlopen(
                base + "/api/world/challenge/read", timeout=5) as resp:
            public = json.loads(resp.read().decode("utf-8"))
        check("unauthenticated GET of the board works",
              resp.status == 200
              and len(public["contributions"]) == 4)

        # -- step 7: credit cascade -----------------------------------------
        # 7a: the reuse chain is byte-bound on the stored record.
        board = run_client("--role", "owner", "--server", base,
                           "--keydir", str(KEYS_DIR / "owner"),
                           "--cmd", "board")["board"]
        by_id = {x["contribution_id"]: x for x in board["contributions"]}
        check("patch records an explicit empty reuse chain, byte-bound",
              by_id[patch_id]["builds_on"] == []
              and by_id[patch_id]["builds_on_sha256"]
              == hashlib.sha256(canonical([]).encode("utf-8")).hexdigest(),
              json.dumps(by_id[patch_id].get("builds_on")))
        check("review records the explicit builds_on link, byte-bound",
              by_id[review_id]["builds_on"]
              == json.loads(builds_on)
              and by_id[review_id]["builds_on_sha256"]
              == hashlib.sha256(builds_on.encode("utf-8")).hexdigest(),
              json.dumps(by_id[review_id].get("builds_on")))

        # 7b: independent control patch for BUG-2 (no reuse links).
        r = run_client("--role", "contrib-a", "--server", base,
                       "--keydir", str(KEYS_DIR / "a"), "--cmd", "contribute",
                       "--kind", "patch",
                       "--file", str(HERE / "fixtures" / "patch-c.diff"),
                       "--title", "Fix apply_discount banker's rounding",
                       "--builds-on", "[]",
                       "--idempotency-key", "a-patch-control")
        c = r.get("contribute", {})
        check("control patch (BUG-2) admitted", c.get("decision") == "ALLOWED",
              json.dumps(c)[:300])
        control_id = c.get("contribution_id", "")
        evidence["steps"].append({"control_patch": c})

        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"), "--cmd", "evaluate",
                       "--contribution-id", control_id, "--decision", "ACCEPT",
                       "--reason", "diff is well-formed; math.floor(x + 0.5) "
                       "is half-up, and EXPECTED.md requires "
                       "apply_discount(5, 50) == 3",
                       "--idempotency-key", "owner-eval-control")
        ev = r.get("evaluate", {})
        check("owner ACCEPTs the control patch",
              ev.get("decision") == "ALLOWED", json.dumps(ev)[:300])
        evidence["steps"].append({"eval_control": ev})

        # 7c: owner links the accepted contributions as claim nodes. The
        # review's dependency edge mirrors its recorded builds_on link; the
        # control patch gets its own independent report.
        review_body = (HERE / "fixtures" / "review-b.md").read_text(
            encoding="utf-8").replace("{{PATCH_ID}}", patch_id)
        patch_body = (HERE / "fixtures" / "patch-a.diff").read_text(
            encoding="utf-8")
        control_body = (HERE / "fixtures" / "patch-c.diff").read_text(
            encoding="utf-8")
        registration = {
            "challenge_id": "CHALLENGE-001",
            "report_id": "challenge-cascade:accepted-pair",
            "title": "Accepted patch + review, with the recorded reuse edge",
            "links": [
                {
                    "contribution_id": patch_id,
                    "finding_quote":
                        "for i in range(len(values) - window + 1):",
                    "finding_text":
                        "The accepted patch's recorded scope: one expression "
                        "changed, range(...) + 1.",
                    "claim_text":
                        f"{patch_id} fixes the rolling_sum off-by-one (BUG-1).",
                    "depends_on": None,
                },
                {
                    "contribution_id": review_id,
                    "finding_quote":
                        "Finding: the patch changes exactly one expression,",
                    "finding_text":
                        "The accepted review's key finding: range(3) is three "
                        "windows, matching EXPECTED.md.",
                    "claim_text":
                        f"{review_id} builds on {patch_id} and its conclusion "
                        "holds.",
                    "depends_on": patch_id,
                },
            ],
        }
        assert registration["links"][0]["finding_quote"] in patch_body
        assert registration["links"][1]["finding_quote"] in review_body
        reg_file = HERE / ".registration.json"
        reg_file.write_text(json.dumps(registration), encoding="utf-8")
        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"),
                       "--cmd", "register-cascade",
                       "--registration-file", str(reg_file),
                       "--idempotency-key", "owner-register-cascade")
        reg = r.get("register_cascade", {})
        check("owner links accepted patch+review as claim nodes",
              reg.get("decision") == "ALLOWED"
              and reg.get("report_id") == "challenge-cascade:accepted-pair",
              json.dumps(reg)[:300])
        review_source_id = (reg.get("sources") or {}).get(review_id, "")
        check("registration returns the review's source id",
              bool(review_source_id))
        evidence["steps"].append({"register_cascade": reg})

        control_registration = {
            "challenge_id": "CHALLENGE-001",
            "report_id": "challenge-cascade:control",
            "title": "Independent control: accepted BUG-2 patch",
            "links": [
                {
                    "contribution_id": control_id,
                    "finding_quote":
                        "return math.floor(price_cents * (100 - pct) / 100 + 0.5)",
                    "finding_text":
                        "The control patch's recorded scope: half-up rounding "
                        "for apply_discount.",
                    "claim_text":
                        f"{control_id} fixes the banker's-rounding bug (BUG-2), "
                        "independently supported.",
                    "depends_on": None,
                },
            ],
        }
        assert (control_registration["links"][0]["finding_quote"]
                in control_body)
        reg_file.write_text(json.dumps(control_registration),
                            encoding="utf-8")
        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"),
                       "--cmd", "register-cascade",
                       "--registration-file", str(reg_file),
                       "--idempotency-key", "owner-register-control")
        reg = r.get("register_cascade", {})
        check("owner links the control patch as an independent report",
              reg.get("decision") == "ALLOWED"
              and reg.get("report_id") == "challenge-cascade:control",
              json.dumps(reg)[:300])
        evidence["steps"].append({"register_control": reg})

        # Receipts before the correction, to prove they are not rewritten.
        board_before_correction = run_client(
            "--role", "owner", "--server", base,
            "--keydir", str(KEYS_DIR / "owner"), "--cmd", "board")["board"]
        receipts_before = {
            r["report_id"]: r["receipt"]
            for r in board_before_correction["cascade"]["reports"]
        }

        # 7d: an unauthorized correction attempt changes nothing.
        r = run_client("--role", "contrib-a", "--server", base,
                       "--keydir", str(KEYS_DIR / "a"), "--cmd", "correct",
                       "--status", "CORRECTED", "--source-id", review_source_id,
                       "--notice", "unauthorized attempt",
                       "--idempotency-key", "a-correct-unauthorized")
        bad = r.get("correct", {})
        check("correction without the scope is STOPPED",
              bad.get("decision") == "STOPPED"
              and "ACTION_OUTSIDE_MANDATE" in (bad.get("reason_codes") or [])
              and bad.get("event_id") is None,
              json.dumps(bad)[:300])
        board = run_client("--role", "owner", "--server", base,
                           "--keydir", str(KEYS_DIR / "owner"),
                           "--cmd", "board")["board"]
        check("stopped correction appends no event",
              board["cascade"]["events"] == [])

        # 7e: the evaluator's authorized correction. Deliberate
        # demonstration event: it tests the mechanism, not the finding.
        notice = (
            "DEMONSTRATION CORRECTION — CHALLENGE-001 credit-cascade "
            "scenario. The evaluator records a correction against the key "
            f"finding of accepted review {review_id} ('range(3) is three "
            "windows, matching EXPECTED.md'): treat the finding as needing "
            "re-verification. This is a deliberate test of the "
            "authorized-correction mechanism, not a claim that the finding "
            "was actually wrong.")
        r = run_client("--role", "owner", "--server", base,
                       "--keydir", str(KEYS_DIR / "owner"), "--cmd", "correct",
                       "--status", "CORRECTED", "--source-id", review_source_id,
                       "--notice", notice,
                       "--reason", "Evaluator-signed demonstration "
                       "correction: reassess the dependents of the review's "
                       "key finding under the receiver-admitted edge policy.",
                       "--idempotency-key", "owner-correct-review")
        good = r.get("correct", {})
        check("evaluator correction is ALLOWED with an event id",
              good.get("decision") == "ALLOWED"
              and bool(good.get("event_id")),
              json.dumps(good)[:300])
        evidence["steps"].append({"correction": good})

        # 7f: the propagation result, from the recorded board.
        board = run_client("--role", "owner", "--server", base,
                           "--keydir", str(KEYS_DIR / "owner"),
                           "--cmd", "board")["board"]
        cascade = board["cascade"]
        check("one correction event on the record",
              len(cascade["events"]) == 1
              and cascade["events"][0]["status"] == "CORRECTED"
              and cascade["events"][0]["asserted_by"]
              == "world:participant:challenge-owner",
              json.dumps(cascade["events"])[:300])
        check("event targets the review's source",
              [a.get("contribution_id")
               for a in cascade["events"][0]["affected"]] == [review_id])
        by_contribution: dict[str, list[dict]] = {}
        for r in cascade["reports"]:
            for c in r["claims"]:
                by_contribution.setdefault(
                    c["contribution_id"] or "", []).append(c)

        def standing(contribution_id: str, kind: str) -> dict:
            for c in by_contribution.get(contribution_id, []):
                if c["kind"] == kind:
                    return c["standing"] or {}
            return {}

        check("patch claims stay UNAFFECTED",
              standing(patch_id, "SOURCE_ASSERTION").get("classification")
              == "UNAFFECTED"
              and standing(patch_id, "INFERENCE").get("classification")
              == "UNAFFECTED",
              json.dumps(standing(patch_id, "SOURCE_ASSERTION")))
        check("review assertion claim QUARANTINE / SOURCE_BASIS_LOST",
              standing(review_id, "SOURCE_ASSERTION").get("classification")
              == "QUARANTINE"
              and standing(review_id, "SOURCE_ASSERTION").get("reason")
              == "SOURCE_BASIS_LOST",
              json.dumps(standing(review_id, "SOURCE_ASSERTION")))
        check("review inference claim QUARANTINE / "
              "ALL_ADMITTED_SUPPORT_PATHS_LOST",
              standing(review_id, "INFERENCE").get("classification")
              == "QUARANTINE"
              and standing(review_id, "INFERENCE").get("reason")
              == "ALL_ADMITTED_SUPPORT_PATHS_LOST",
              json.dumps(standing(review_id, "INFERENCE")))
        check("independent control claims stay UNAFFECTED",
              all(c.get("standing", {}).get("classification") == "UNAFFECTED"
                  for c in by_contribution.get(control_id, []))
              and len(by_contribution.get(control_id, [])) == 2,
              json.dumps([c.get("standing")
                          for c in by_contribution.get(control_id, [])]))

        # 7g: history is preserved, not rewritten.
        by_id = {x["contribution_id"]: x for x in board["contributions"]}
        check("original review bytes unchanged by the correction",
              by_id[review_id]["body"] == review_body)
        review_decisions = [d for d in board["decisions"]
                            if d["contribution_id"] == review_id]
        check("historical ACCEPT decision for the review still stands",
              len(review_decisions) == 1
              and review_decisions[0]["decision"] == "ACCEPT"
              and "range(3) is three windows" in review_decisions[0]["reason"])
        receipts_after = {r["report_id"]: r["receipt"]
                          for r in cascade["reports"]}
        check("claim-graph receipts byte-identical after the event",
              receipts_after == receipts_before)
        check("refusals still on the record alongside the correction",
              len(board["refusals"]) == 2
              and {r["refusal_id"] for r in board["refusals"]}
              == {r["refusal_id"] for r in board_before_correction["refusals"]})
        evidence["cascade_board"] = cascade
    finally:
        if not args.keep:
            stop_server(server)
            print("server stopped")
        else:
            print(f"server left running pid={server.pid}")

    evidence["checks"] = checks
    evidence["failed"] = [c for c in checks if not c["pass"]]
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    (EVIDENCE_DIR / "demo-evidence.json").write_text(
        json.dumps(evidence, indent=2), encoding="utf-8")
    n_fail = len(evidence["failed"])
    print(f"\n{len(checks) - n_fail}/{len(checks)} checks passed; "
          f"evidence: {EVIDENCE_DIR / 'demo-evidence.json'}")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
