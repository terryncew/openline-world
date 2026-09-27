"""ISOLATION-VERIFICATION canary probe — through the GENUINE submitted-study path.

Path fidelity: the canary package is submitted via
world.newsroom_submit_package with a real joined participant
(custody_client._Client: real join ceremony, real worker-signed
presentation for "newsroom.review") — the exact code the HTTP endpoint
/api/world/newsroom/submit-package calls. The study executes only where a
genuinely submitted study executes: evaluate_package -> K3 -> run_study.

The canary study is stdlib-only and deterministic: its stdout is a fixed
marker string (so K3's byte-for-byte check passes and the package is
ACCEPTED — the canary is admitted exactly like the 9348110 fixture was).
Side effects are observed outside the run:
  R1: read a canary file planted at /tmp/canary-outside.txt
  R2: read the first 40 chars of a repo file (absolute path)
  W1: write /tmp/canary-written-by-study.txt
  A1: os.access(R_OK/W_OK) on the receiver data dir (no contents read)
  N1: TCP connect to a loopback listener we control (port via input.csv)
"""
import hashlib
import json
import os
import socket
import sys
import tempfile
import threading
from pathlib import Path

BACKEND = Path(os.path.expanduser("~/workspace/openline-workshop/backend"))
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))

from world import World  # noqa: E402
from custody_client import _Client  # noqa: E402
from package_acceptance import canonical_package_bytes  # noqa: E402

CANARY_OUTSIDE = "/tmp/canary-outside.txt"
CANARY_WRITTEN = "/tmp/canary-written-by-study.txt"
REPO_FILE = "/home/hatch/workspace/openline-workshop/research/COMMONS-BRIEF.md"

STUDY = '''\
import csv, json, os, socket

out = {}

# R1: read outside permitted inputs
try:
    with open("/tmp/canary-outside.txt") as f:
        out["read_outside"] = "OK:" + f.read().strip()
except Exception as e:
    out["read_outside"] = "BLOCKED:" + type(e).__name__

# R2: read a repo file by absolute path
try:
    with open("/home/hatch/workspace/openline-workshop/research/COMMONS-BRIEF.md") as f:
        out["read_repo"] = "OK:" + f.read(40).replace("\\n", " ")
except Exception as e:
    out["read_repo"] = "BLOCKED:" + type(e).__name__

# W1: write outside the workspace
try:
    with open("/tmp/canary-written-by-study.txt", "w") as f:
        f.write("written-by-study")
    out["write_tmp"] = "OK"
except Exception as e:
    out["write_tmp"] = "BLOCKED:" + type(e).__name__

# A1: accessibility of receiver state dir (contents never read)
dd = "/home/hatch/workspace/openline-workshop/backend/data/world"
out["data_dir_r"] = os.access(dd, os.R_OK)
out["data_dir_w"] = os.access(dd, os.W_OK)
try:
    out["data_dir_listable"] = sorted(os.listdir(dd))[:5]
except Exception as e:
    out["data_dir_listable"] = "BLOCKED:" + type(e).__name__

# N1: contact a controlled local listener (port comes from input.csv)
try:
    port = None
    with open("input.csv") as f:
        for row in csv.DictReader(f):
            port = int(row["port"])
    s = socket.create_connection(("127.0.0.1", port), timeout=5)
    s.sendall(b"CANARY-HELLO")
    out["net"] = "OK:" + s.recv(16).decode()
    s.close()
except Exception as e:
    out["net"] = "BLOCKED:" + type(e).__name__

out["uid"] = os.getuid()
print(json.dumps(out, sort_keys=True))
'''

EXPECTED = None  # computed after first dry run? No — deterministic: compute now.


def build_package(port: int) -> dict:
    # The study prints a JSON object with sorted keys; expected_result must
    # match byte-for-byte. Values that vary (data_dir_listable) are fixed by
    # construction on this box, so we do a dry run through the genuine path
    # once with a placeholder, read the sandbox stdout from the record, and
    # pin that as expected_result. The canary side effects are observed
    # regardless of K3's verdict.
    manifest = {
        "schema": "openline.research.package.v1",
        "title": "Canary probe of study execution confinement",
        "claim": ("A submitted study executed through the receiver's intake "
                  "path reports which of its filesystem and network probes "
                  "succeed; this package exists only to test confinement."),
        "expected_result": "PLACEHOLDER",
        "citations": [
            {"locator": "fixture://commons-criteria",
             "note": "frozen criteria K1-K7"},
            {"locator": "producer://canary-probe",
             "note": "probe design notes"},
        ],
        "limitations": ("Confinement probe only. It does not verify any "
                        "scientific claim and does not assess truth."),
        "producer_review": ("PRODUCER-SUPPLIED REVIEW: this probe grants no "
                            "acceptance authority and approves nothing."),
        "files": {},
    }
    files = {"study.py": STUDY, "input.csv": "port\n%d\n" % port}
    for name, body in files.items():
        manifest["files"][name] = {
            "sha256": hashlib.sha256(body.encode()).hexdigest()}
    return {"manifest": manifest, "files": files}


def main() -> None:
    Path(CANARY_OUTSIDE).write_text("CANARY-OUTSIDE-READ-ME\n")
    for p in (CANARY_WRITTEN,):
        try:
            os.remove(p)
        except FileNotFoundError:
            pass

    world = World(data_root=Path(tempfile.mkdtemp(prefix="canary-world-")))
    client = _Client("canary-producer", scopes=("newsroom.review",))
    client.join(world)

    # controlled local listener
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 0))
    port = srv.getsockname()[1]
    srv.listen(1)
    srv.settimeout(30)
    got = {}

    def serve():
        try:
            conn, _ = srv.accept()
            data = conn.recv(64)
            conn.sendall(b"CANARY-ACK")
            conn.close()
            got["data"] = data
        except socket.timeout:
            got["data"] = None

    t = threading.Thread(target=serve, daemon=True)
    t.start()

    # dry run: submit with placeholder expected_result; K3 fails but the
    # study still executed — read its actual stdout from the record and pin it.
    package = build_package(port)
    pinned = hashlib.sha256(canonical_package_bytes(package)).hexdigest()
    r = world.newsroom_submit_package(
        client.pid, client.token,
        {"package": package, "package_sha256": pinned},
        client.presentation(world, "newsroom.review"))
    t.join(timeout=30)
    srv.close()
    print("listener got:", got.get("data"))
    print("gate decision:", r["decision"], r.get("reason_codes"))
    sandbox = r["acceptance"]["sandbox"]
    actual_stdout = sandbox.get("stdout", "")
    print("study exit:", sandbox.get("exit_code"),
          "timed_out:", sandbox.get("timed_out"))
    print("study stderr tail:", sandbox.get("stderr_tail", "")[:300])

    # now pin the real stdout and resubmit: the genuine path, K3 green
    package["manifest"]["expected_result"] = actual_stdout
    pinned2 = hashlib.sha256(canonical_package_bytes(package)).hexdigest()
    r2 = world.newsroom_submit_package(
        client.pid, client.token,
        {"package": package, "package_sha256": pinned2},
        client.presentation(world, "newsroom.review"))
    print("second submit decision:", r2["decision"], r2.get("reason_codes"))
    print("acceptance verdict:", r2["acceptance"]["verdict"])
    print("CANARY STDOUT:", r2["acceptance"]["sandbox"].get("stdout"))
    print("written file exists:", os.path.exists(CANARY_WRITTEN),
          open(CANARY_WRITTEN).read() if os.path.exists(CANARY_WRITTEN) else "")

    with open("/tmp/canary-probe/evidence.json", "w") as f:
        json.dump({
            "listener_got": got.get("data").decode() if got.get("data") else None,
            "first_decision": r["decision"],
            "first_codes": r.get("reason_codes"),
            "second_decision": r2["decision"],
            "second_codes": r2.get("reason_codes"),
            "acceptance_verdict": r2["acceptance"]["verdict"],
            "study_stdout": json.loads(r2["acceptance"]["sandbox"]["stdout"]),
            "written_file_exists": os.path.exists(CANARY_WRITTEN),
            "sandbox_limits": r2["acceptance"]["sandbox"]["limits"],
        }, f, indent=2)
    print("evidence -> /tmp/canary-probe/evidence.json")


if __name__ == "__main__":
    main()
