"""Research-package acceptance: the receiver-owned structural checks.

Deterministic port of the frozen research/COMMONS-CRITERIA.md (2026-09-26)
as amended by research/COMMONS-CRITERIA-2026-09-27.md (K3 is now
trusted-fixture reproduction), implemented here so the backend's newsroom
submit-package path can run the declared acceptance checks server-side, on
the pinned bytes, at admission time. Mirrors the structure of
backend/report_acceptance.py.

WHAT THESE CHECKS ARE AND ARE NOT:
- They are STRUCTURAL + MECHANICAL checks: manifest integrity, required
  files, trusted-fixture reproduction, citation presence, limitations,
  labeled producer review, no overclaim phrases. They verify the
  artifact's shape and, for receiver-trusted fixture bytes only, its
  reproducibility under the recorded resource limits.
- They are NOT factual verification: a package that passes K1-K7 may still
  make a false claim. Nothing in the acceptance record, the UI, or the
  capture may present these checks as verifying that the package's claim
  is true. The acceptance record carries the scope note verbatim.
- The study runner is NOT a security sandbox (see
  research/ISOLATION-VERDICT-2026-09-27.md): a 2026-09-27 canary through
  the genuine intake path proved the study process runs as the receiver's
  own OS identity with full filesystem and loopback-network access. The
  recorded limits bound the cost of reproduction, not access. Submitted
  code executes ONLY for byte-pinned receiver-trusted fixtures; all other
  bytes are refused without executing anything.

evaluate_package is a PURE function: same bytes in -> same record out.
It performs no signing (the receiver signs the record with the gate key
in world.py, after evaluation). The study code is executed only via
backend/package_sandbox.py in a separate OS process — it is never
imported here or anywhere in the receiver path, and only when the
package's pinned sha256 is a receiver-trusted fixture pin.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from package_sandbox import SANDBOX_LIMITS, run_study

PACKAGE_SCHEMA = "openline.research.package.v1"
REQUIRED_FILES = ("study.py", "input.csv")

OVERCLAIM_PATTERNS = [
    r"self-improv",
    r"\brsi\b",
    r"peer[\s-]?review",
    r"scientifically proven",
    r"ground truth",
    r"fiduciary",
]
NEGATION_RE = re.compile(
    r"\b(not|no|never|without|none|didn'?t|doesn'?t|wasn'?t|weren'?t|isn'?t)\b", re.I)
URL_RE = re.compile(r"https?://[^\s)>\]\"'<>]+")

SCOPE_NOTE = (
    "\"Passed these named checks under these conditions\" is not scientific "
    "truth. The checks verify: the manifest is intact and bound to its "
    "files (K1), the required files exist (K2), the study reproduces its "
    "declared output for receiver-trusted fixture bytes (K3), citations "
    "are present -- not that they support the claim (K4), limitations are "
    "stated (K5), the producer's review is labeled as granting nothing "
    "(K6), and no overclaim phrases appear (K7). The study runner is not a "
    "security sandbox: the recorded limits bound the cost of reproduction, "
    "not access, and submitted code executes only for byte-pinned "
    "receiver-trusted fixtures. Nothing here verifies that the package's "
    "claim is true. This lane does not claim automated peer review, "
    "scientific truth, RSI, or outside adoption."
)

CHECK_DESCRIPTIONS = {
    "K1": "Manifest integrity: parses as JSON, schema matches, named files + sha256s match the carried bytes",
    "K2": "Required files present and non-empty: study.py, input.csv",
    "K3": ("Trusted-fixture reproduction: the study executes only when the "
           "package's pinned sha256 is a receiver-trusted fixture pin; "
           "otherwise the study is not executed and K3 fails "
           "(STUDY_EXECUTION_DISABLED). A trusted fixture must exit 0 and "
           "its stdout must equal expected_result byte-for-byte"),
    "K4": "Citations present: >= 2, each with a URL or fixture/producer locator (presence is not support)",
    "K5": "Limitations stated: non-empty limitations string",
    "K6": "Producer review labeled: starts with 'PRODUCER-SUPPLIED REVIEW' and states it grants no acceptance authority",
    "K7": "No overclaim phrases in claim, title, limitations, producer review, or citation notes",
}


def canonical_package_bytes(package: Any) -> bytes:
    """The pinned byte form of a research package: canonical JSON of
    exactly {manifest, files}. The attestation (if the submitter sent one)
    is never part of the pinned bytes: it is not canonicalized, not
    hashed, not stored, and not evaluated.

    Uses the wallet's strict canonical JSON (sorted keys, ASCII), so the
    browser client can compute the identical bytes before submitting.
    """
    from openline_wallet.canonical import canonical_json
    if not isinstance(package, dict):
        raise ValueError("package must be an object")
    manifest = package.get("manifest")
    files = package.get("files")
    if not isinstance(manifest, dict) or not isinstance(files, dict):
        raise ValueError("package needs a manifest object and a files object")
    return canonical_json({"manifest": manifest, "files": files})


def _sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _check_k1(package: Any) -> tuple[str, str]:
    if not isinstance(package, dict):
        return "fail", "package bytes do not parse as a JSON object"
    manifest = package.get("manifest")
    files = package.get("files")
    if not isinstance(manifest, dict):
        return "fail", "no 'manifest' object"
    if manifest.get("schema") != PACKAGE_SCHEMA:
        return "fail", f"schema is {manifest.get('schema')!r}, want {PACKAGE_SCHEMA!r}"
    if not isinstance(files, dict):
        return "fail", "no 'files' object"
    declared = manifest.get("files")
    if not isinstance(declared, dict):
        return "fail", "manifest has no 'files' map"
    if set(declared) != set(files):
        return "fail", (
            f"manifest names {sorted(declared)} but package carries {sorted(files)}")
    for name, entry in declared.items():
        if not isinstance(entry, dict) or not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256") or "")):
            return "fail", f"file {name!r}: manifest entry lacks a sha256 hex digest"
        body = files.get(name)
        if not isinstance(body, str):
            return "fail", f"file {name!r}: carried bytes are not text"
        if _sha256_hex(body) != entry["sha256"]:
            return "fail", f"file {name!r}: manifest sha256 does not match carried bytes"
    return "pass", f"schema ok; {len(files)} file(s) bound by matching sha256"


def _check_k2(package: dict) -> tuple[str, str]:
    files = package.get("files") or {}
    missing = [n for n in REQUIRED_FILES if not isinstance(files.get(n), str)
               or not files[n].strip()]
    if missing:
        return "fail", f"missing or empty required file(s): {', '.join(missing)}"
    return "pass", "study.py and input.csv present and non-empty"


def _check_k3(package: dict, package_sha256: str) -> tuple[str, str, dict[str, Any]]:
    files = package.get("files") or {}
    manifest = package.get("manifest") or {}
    expected = manifest.get("expected_result")
    sandbox = run_study({"study.py": files.get("study.py", ""),
                         "input.csv": files.get("input.csv", "")},
                        package_sha256=package_sha256)
    detail_base = (
        f"executed={sandbox.get('executed')} "
        f"exit={sandbox.get('exit_code')} timed_out={sandbox.get('timed_out')} "
        f"truncated={sandbox.get('stdout_truncated')}")
    if sandbox.get("error"):
        return "fail", f"reproduction refused: {sandbox['error']}", sandbox
    if not isinstance(expected, str):
        return "fail", f"manifest expected_result is not a string; {detail_base}", sandbox
    if sandbox.get("timed_out"):
        return "fail", f"study exceeded the wall-clock limit; {detail_base}", sandbox
    if sandbox.get("exit_code") != 0:
        return "fail", (
            f"study exited {sandbox.get('exit_code')}; {detail_base}; "
            f"stderr_tail={sandbox.get('stderr_tail', '')[:200]!r}"), sandbox
    if sandbox.get("stdout") != expected:
        return "fail", (
            f"stdout != expected_result "
            f"(got {len(sandbox.get('stdout', ''))} chars, want {len(expected)}); "
            f"{detail_base}"), sandbox
    return "pass", f"exit 0, stdout matches expected_result ({len(expected)} chars); {detail_base}", sandbox


def _check_k4(package: dict) -> tuple[str, str]:
    citations = (package.get("manifest") or {}).get("citations")
    if not isinstance(citations, list) or len(citations) < 2:
        count = len(citations) if isinstance(citations, list) else 0
        return "fail", f"only {count} citation(s), need >= 2"
    bad = []
    for i, cite in enumerate(citations):
        locator = cite.get("locator") if isinstance(cite, dict) else None
        if (not isinstance(locator, str) or not locator.strip()
                or not (URL_RE.match(locator) or locator.startswith("fixture://")
                        or locator.startswith("producer://"))):
            bad.append(i)
    if bad:
        return "fail", f"citation(s) {bad} lack a URL or fixture/producer locator"
    return "pass", f"{len(citations)} citation(s), each with a locator (presence is not support)"


def _check_k5(package: dict) -> tuple[str, str]:
    limitations = (package.get("manifest") or {}).get("limitations")
    if not isinstance(limitations, str) or not limitations.strip():
        return "fail", "limitations is missing or empty"
    return "pass", f"limitations stated ({len(limitations.strip())} chars)"


def _check_k6(package: dict) -> tuple[str, str]:
    review = (package.get("manifest") or {}).get("producer_review")
    if not isinstance(review, str) or not review.strip():
        return "fail", "producer_review is missing or empty"
    if not review.startswith("PRODUCER-SUPPLIED REVIEW"):
        return "fail", "producer_review lacks the exact 'PRODUCER-SUPPLIED REVIEW' header"
    if "grants no acceptance authority" not in review.lower():
        return "fail", "producer_review does not state it grants no acceptance authority"
    return "pass", "labeled producer review present; self-review grants nothing (stated)"


def _check_k7(package: dict) -> tuple[str, str]:
    manifest = package.get("manifest") or {}
    scanned = {
        "claim": str(manifest.get("claim", "")),
        "title": str(manifest.get("title", "")),
        "producer_review": str(manifest.get("producer_review", "")),
        "citations": " ".join(
            str((c or {}).get("note", "")) for c in (manifest.get("citations") or [])
            if isinstance(c, dict)),
    }
    limitations = str(manifest.get("limitations", ""))
    for field, text in scanned.items():
        for pattern in OVERCLAIM_PATTERNS:
            m = re.search(pattern, text, re.I)
            if m:
                return "fail", (
                    f"overclaim match {m.group(0)!r} in manifest.{field}")
    for pattern in OVERCLAIM_PATTERNS:
        for m in re.finditer(pattern, limitations, re.I):
            line_start = limitations.rfind("\n", 0, m.start()) + 1
            line_end = limitations.find("\n", m.end())
            line = limitations[line_start:line_end if line_end != -1 else len(limitations)]
            if not NEGATION_RE.search(line):
                return "fail", (
                    f"overclaim match {m.group(0)!r} in limitations without a negation")
    return "pass", "no overclaim phrases (negated mentions in limitations permitted)"


def evaluate_package(package_bytes: bytes) -> dict[str, Any]:
    """Run K1-K7 on the exact bytes given. Returns the acceptance record.

    PURE: same bytes in -> same record out. No signing here; the receiver
    (world.py) signs the record with the gate key after evaluation. The
    study is executed only via package_sandbox.run_study in a separate OS
    process — never imported.
    """
    package_sha256 = hashlib.sha256(package_bytes).hexdigest()
    try:
        package = json.loads(package_bytes.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        package = None
    results: list[dict[str, str]] = []
    sandbox_record: dict[str, Any] = {"limits": dict(SANDBOX_LIMITS),
                                      "error": "K1/K2 failed: study not executed",
                                      "exit_code": None, "stdout": "",
                                      "stdout_truncated": False,
                                      "stderr_tail": "", "timed_out": False}

    def record(criterion: str, outcome: tuple[str, str]) -> None:
        result, detail = outcome
        results.append({"criterion": criterion,
                        "check_performed": CHECK_DESCRIPTIONS[criterion],
                        "result": result, "detail": detail})

    record("K1", _check_k1(package))
    k1_ok = results[-1]["result"] == "pass"
    if k1_ok and isinstance(package, dict):
        record("K2", _check_k2(package))
    else:
        record("K2", ("fail", "skipped: K1 failed"))
    k2_ok = results[-1]["result"] == "pass"
    if k1_ok and k2_ok and isinstance(package, dict):
        outcome_k3 = _check_k3(package, package_sha256)
        sandbox_record = outcome_k3[2]
        record("K3", (outcome_k3[0], outcome_k3[1]))
    else:
        record("K3", ("fail", "skipped: K1/K2 failed, study not executed"))
    if isinstance(package, dict):
        record("K4", _check_k4(package))
        record("K5", _check_k5(package))
        record("K6", _check_k6(package))
        record("K7", _check_k7(package))
    else:
        for crit in ("K4", "K5", "K6", "K7"):
            record(crit, ("fail", "skipped: package does not parse"))

    return {
        "criteria_frozen": ("research/COMMONS-CRITERIA.md (2026-09-26) as "
                            "amended by research/COMMONS-CRITERIA-2026-09-27.md "
                            "(K3: trusted-fixture reproduction)"),
        "evaluator": ("backend/package_acceptance.py (deterministic; no model, "
                      "no network; study executed only in a separate OS "
                      "process for receiver-trusted fixture pins, never "
                      "imported)"),
        "evaluated_sha256": package_sha256,
        "scope_note": SCOPE_NOTE,
        "sandbox": sandbox_record,
        "results": results,
        "verdict": "ACCEPTED" if all(r["result"] == "pass" for r in results) else "REJECTED",
    }
