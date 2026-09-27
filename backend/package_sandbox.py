"""Trusted-fixture reproduction runner for submitted research studies
(RESEARCH-COMMONS-001).

ISOLATION VERDICT 2026-09-27 (research/ISOLATION-VERDICT-2026-09-27.md):
a canary probe through the genuine intake path
(world.newsroom_submit_package -> evaluate_package -> K3 -> run_study)
proved the study process is NOT confined. The canary study, running as
uid 0 (the same identity as the receiver), read a canary file outside its
inputs, read repo files by absolute path, wrote a file to /tmp, listed
the receiver's data dir (read AND write access), and opened a TCP
connection to a loopback listener we controlled. The enforced boundary
was and is only: a separate OS process, a stripped environment, POSIX
rlimits (CPU 10s, 256MB address space, 1MB file size), a 15s wall-clock
timeout, DEVNULL stdin, and a 64KB stdout cap. Those limits bound COST,
not ACCESS. There is no UID separation, no filesystem restriction, no
network namespace, no seccomp on this box.

Consequence (precommitted): arbitrary submitted-code execution is
DISABLED. The study runs only when the submitted package's pinned sha256
is in the receiver's trusted-fixture set — byte-pinned computations the
receiver owner has explicitly trusted. Everything else is refused without
executing a single byte of submitted code. What remains is
trusted-fixture reproduction under receiver-owned acceptance: the 9348110
tide fixture reproduces its declared output deterministically; nothing
about that result claimed the runner was a security sandbox, and nothing
about this change alters the earned admission, binding, or correction
results.

This module is a resource-limited reproduction runner, not a sandbox.
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from typing import Any

# Receiver-trusted fixture pins: sha256 of the canonical package bytes
# (canonical_package_bytes), exactly as evaluate_package pins them. Only
# these byte-identical packages may have their study executed. Everything
# else is refused before any submitted code runs.
TRUSTED_FIXTURE_PINS: frozenset[str] = frozenset({
    # 9348110 tide fixture: "mean tide height at the harbor in Q3 2026 is
    # 2.43 m", research/commons/package/. Admitted 2026-09-26; the
    # admission, binding, and correction results stand.
    "6081084e3631b2700bc4de87642cf8400f8542fbc886227fbc93a14d23de4906",
})

# The limits actually applied when a trusted fixture runs. They bound the
# cost of reproduction (CPU, memory, file size, wall time, output size).
# They do NOT confine the study: see the module docstring.
SANDBOX_LIMITS: dict[str, Any] = {
    "cpu_seconds": 10,
    "memory_bytes": 256 * 1024 * 1024,
    "max_file_bytes": 1024 * 1024,
    "wall_timeout_seconds": 15,
    "stdout_cap_bytes": 65536,
    "stderr_tail_bytes": 2048,
    "stdin": "DEVNULL",
    "cwd": "fresh temp dir containing only study.py + input.csv",
    "env": {"PATH": "/usr/bin:/bin", "PYTHONNOUSERSITE": "1",
            "PYTHONDONTWRITEBYTECODE": "1"},
    "network": "shared host namespace (no network namespace on this box)",
    "execution_policy": ("trusted-fixture reproduction only: the study "
                         "executes only for receiver-trusted fixture pins; "
                         "resource limits bound cost, not access"),
}

_REQUIRED_FILES = ("study.py", "input.csv")


def _apply_limits() -> None:
    """preexec_fn: install the rlimits in the child before exec."""
    import resource
    resource.setrlimit(resource.RLIMIT_CPU,
                       (SANDBOX_LIMITS["cpu_seconds"], SANDBOX_LIMITS["cpu_seconds"]))
    resource.setrlimit(resource.RLIMIT_AS,
                       (SANDBOX_LIMITS["memory_bytes"], SANDBOX_LIMITS["memory_bytes"]))
    resource.setrlimit(resource.RLIMIT_FSIZE,
                       (SANDBOX_LIMITS["max_file_bytes"], SANDBOX_LIMITS["max_file_bytes"]))


def _refused_record(reason: str) -> dict[str, Any]:
    return {"limits": dict(SANDBOX_LIMITS), "executed": False,
            "error": reason, "exit_code": None, "stdout": "",
            "stdout_truncated": False, "stderr_tail": "", "timed_out": False}


def is_trusted_fixture(package_sha256: str | None) -> bool:
    """True iff these exact bytes are a receiver-trusted fixture."""
    return package_sha256 in TRUSTED_FIXTURE_PINS


def run_study(files: dict[str, str],
              package_sha256: str | None = None) -> dict[str, Any]:
    """Reproduce a trusted fixture's study in a fresh OS process.

    `files` maps filename -> utf-8 text; exactly study.py + input.csv are
    written. `package_sha256` must be the sha256 of the canonical package
    bytes the files came from. If it is not in TRUSTED_FIXTURE_PINS the
    study is NOT executed: the returned record carries
    error=STUDY_EXECUTION_DISABLED and executed=False. This is the
    mechanical enforcement of trusted-fixture reproduction — no submitted
    byte runs unless the receiver owner pinned exactly these bytes.

    Returns the reproduction record (never raises on study failure: a
    crashing trusted fixture is a K3 failure, not a runner error).
    """
    record: dict[str, Any] = {"limits": dict(SANDBOX_LIMITS)}
    names = set(files)
    if names != set(_REQUIRED_FILES):
        record.update(_refused_record(
            f"reproduction requires exactly {list(_REQUIRED_FILES)}"))
        return record
    if not is_trusted_fixture(package_sha256):
        record.update(_refused_record(
            "STUDY_EXECUTION_DISABLED: package sha256 "
            f"{package_sha256!r} is not a receiver-trusted fixture pin; "
            "the study was not executed (trusted-fixture reproduction "
            "only; see research/ISOLATION-VERDICT-2026-09-27.md)"))
        return record
    record["executed"] = True
    try:
        with tempfile.TemporaryDirectory(prefix="commons-study-") as tmp:
            for name in _REQUIRED_FILES:
                with open(os.path.join(tmp, name), "w", encoding="utf-8") as f:
                    f.write(files[name])
            proc = subprocess.Popen(
                [sys.executable, "study.py"],
                cwd=tmp,
                env={"PATH": "/usr/bin:/bin", "PYTHONNOUSERSITE": "1",
                     "PYTHONDONTWRITEBYTECODE": "1"},
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=_apply_limits,
            )
            try:
                out, err = proc.communicate(
                    timeout=SANDBOX_LIMITS["wall_timeout_seconds"])
                timed_out = False
            except subprocess.TimeoutExpired:
                proc.kill()
                out, err = proc.communicate()
                timed_out = True
            cap = SANDBOX_LIMITS["stdout_cap_bytes"]
            stdout_truncated = len(out) > cap
            record.update({
                "exit_code": proc.returncode,
                "stdout": out[:cap].decode("utf-8", errors="replace"),
                "stdout_truncated": stdout_truncated,
                "stderr_tail": err[-SANDBOX_LIMITS["stderr_tail_bytes"]:].decode(
                    "utf-8", errors="replace"),
                "timed_out": timed_out,
            })
    except Exception as exc:  # runner setup failure, not a study failure
        record.update({"error": f"reproduction setup failed: {type(exc).__name__}",
                       "exit_code": None, "stdout": "", "stdout_truncated": False,
                       "stderr_tail": "", "timed_out": False})
    return record
