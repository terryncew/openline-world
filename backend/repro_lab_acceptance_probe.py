"""Acceptance-path probe for RESEARCH-ROOM-001 (repro-lab-001).

WHY THE ROOM'S EXPERIMENT DOES NOT GO THROUGH THE RECEIVER'S STUDY RUNNER:
the isolation verdict of 2026-09-27 (research/ISOLATION-VERDICT-2026-09-27.md)
reclassified submitted-code execution as trusted-fixture reproduction under
receiver-owned acceptance -- the study runner is NOT a security sandbox, and
it executes submitted bytes ONLY for byte-pinned receiver-trusted fixtures.
The room's experiment is new code, not a receiver-trusted fixture pin, and
adding a pin is a receiver-owner code change (which this exercise is not
authorized to make). So the researcher froze the protocol and ran the pinned
experiment OFFLINE; the room serves those frozen artifacts from disk and the
receiver never executes the experiment code.

This script is the HONEST exercise of the same acceptance path: it builds a
minimal schema-valid candidate package, runs the frozen K1-K7 checks
(backend/package_acceptance.evaluate_package -- pure, same as the server
runs), and saves the acceptance record as evidence. The EXPECTED outcome is
REJECTED with K3 failing as STUDY_EXECUTION_DISABLED: the receiver refuses
to execute untrusted bytes, exactly as designed. This is not a bypass -- it
is proof the gate holds.
"""

import hashlib
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND))
# Vendored wallet, same as backend/world.py does at import time.
sys.path.insert(0, str(BACKEND / "vendor"))

from package_acceptance import canonical_package_bytes, evaluate_package  # noqa: E402

STUDY_PY = """\
# Acceptance-path probe: a minimal verifier (NOT executed -- the receiver
# refuses untrusted bytes; see module docstring). Kept as valid Python so
# the package is structurally honest about what a study file looks like.
import csv
import sys

with open("input.csv", newline="") as fh:
    rows = list(csv.DictReader(fh))
total = sum(int(r["n"]) for r in rows)
print("sum(n) =", total)
"""

INPUT_CSV = "n\n1\n2\n3\n4\n"


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_package() -> dict:
    files = {"study.py": STUDY_PY, "input.csv": INPUT_CSV}
    manifest = {
        "schema": "openline.research.package.v1",
        "title": "Repro-lab-001 acceptance-path probe",
        "claim": (
            "A minimal probe package built to exercise the frozen K1-K7 "
            "acceptance checks; it makes no claim about the room's "
            "experiment beyond what the frozen artifacts state."),
        "files": {name: {"sha256": sha256_hex(body)}
                  for name, body in files.items()},
        # If the study were executed (it is not -- see module docstring),
        # its stdout would be "sum(n) = 10".
        "expected_result": "sum(n) = 10\n",
        "limitations": (
            "This package is an exercise of the acceptance path only. It "
            "reproduces nothing from the room's experiment, was not run "
            "offline by the researcher, and its contents are illustrative. "
            "The frozen records are authoritative; this probe adds no "
            "evidence about the research question."),
        "producer_review": (
            "PRODUCER-SUPPLIED REVIEW: this review is supplied by the "
            "package producer and grants no acceptance authority. It is "
            "carried for display only and changes nothing about the "
            "receiver's evaluation."),
        "citations": [
            {"title": "Reproducibility Lab room 001 artifacts",
             "locator": "producer://repro-lab-001/ROOM.json",
             "note": "The frozen room manifest this probe references."},
            {"title": "Isolation verdict 2026-09-27",
             "locator": "producer://research/ISOLATION-VERDICT-2026-09-27.md",
             "note": "States why the study runner executes only trusted "
                     "fixture bytes."},
        ],
    }
    return {"manifest": manifest, "files": files}


def main() -> int:
    package = build_package()
    package_bytes = canonical_package_bytes(package)
    record = evaluate_package(package_bytes)

    room_dir = BACKEND.parent / "research" / "rooms" / "repro-lab-001"
    out_path = room_dir / "acceptance-probe.json"
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(record, fh, indent=2, sort_keys=True)
        fh.write("\n")

    results = {r["criterion"]: r for r in record["results"]}
    k3 = results.get("K3", {})
    k3_refused = (k3.get("result") == "fail"
                  and "STUDY_EXECUTION_DISABLED" in k3.get("detail", ""))
    rejected = record["verdict"] == "REJECTED"
    others_ok = all(results[c]["result"] == "pass"
                    for c in ("K1", "K2", "K4", "K5", "K6", "K7")
                    if c in results)

    print(f"verdict: {record['verdict']}")
    for crit in ("K1", "K2", "K3", "K4", "K5", "K6", "K7"):
        r = results.get(crit, {})
        print(f"  {crit}: {r.get('result')} -- {r.get('detail', '')[:90]}")
    print(f"record written: {out_path}")

    if rejected and k3_refused and others_ok:
        print("EXPECTED: K3 refused untrusted code")
        return 0
    print("UNEXPECTED: probe did not produce the expected refusal", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
