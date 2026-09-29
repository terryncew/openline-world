"""CHALLENGE-001 Phase-1 verification orchestrator.

Runs the frozen five-control demonstration against a real server:

  owner (process 1, keydir .keys/owner): join -> create CHALLENGE-001
  A     (process 2, keydir .keys/a):     join -> delegate -> patch (BUG-1)
  B     (process 3, keydir .keys/b):     join -> delegate -> review of A's
                                         patch + test bundling two bugs
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

Honest label: the three client processes are deterministic demo scripts on
the same machine as the server — internally operated, NOT independent
operators and NOT remote agents. See PROTOCOL.md.

Usage: python run_demo.py [--port 8471] [--keep]
Writes: evidence/demo-evidence.json
"""
from __future__ import annotations

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
                       "--idempotency-key", "a-patch-1")
        c = r.get("contribute", {})
        check("A patch admitted", c.get("decision") == "ALLOWED",
              json.dumps(c)[:300])
        patch_id = c.get("contribution_id", "")
        evidence["steps"].append({"a_patch": c})
        check("A delegated before contributing",
              bool(r.get("delegation_id")))

        # -- step 3: B reviews A's patch and submits the two-bug test -------
        r = run_client("--role", "contrib-b", "--server", base,
                       "--keydir", str(KEYS_DIR / "b"), "--cmd", "contribute",
                       "--kind", "review",
                       "--file", str(HERE / "fixtures" / "review-b.md"),
                       "--title", "Review of the rolling_sum off-by-one patch",
                       "--references", patch_id,
                       "--patch-id", patch_id,
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
