<!-- AMENDMENT 2026-09-27 — K3 revised. research/COMMONS-CRITERIA.md (2026-09-26)
is the frozen original; this file amends only K3. K1, K2, K4, K5, K6, K7,
the scope note's structure, and the explicit non-claims are unchanged.
Implemented by backend/package_acceptance.py (K3) and
backend/package_sandbox.py (trust gate). -->

# COMMONS-CRITERIA-2026-09-27 — amendment: K3 is trusted-fixture reproduction

## Why

On 2026-09-27 a canary probe submitted through the genuine intake path
(`world.newsroom_submit_package` → `evaluate_package` → K3 →
`package_sandbox.run_study`, with a real joined participant and a
worker-signed presentation) proved the study process is **not confined**
(full evidence in research/ISOLATION-VERDICT-2026-09-27.md). The canary
study, running as uid 0 — the receiver's own OS identity — read a canary
file outside its permitted inputs, read repo files by absolute path, wrote
a file to `/tmp`, listed the receiver's data directory with read AND write
access, and opened a TCP connection to a controlled loopback listener. The
enforced boundary was only: a separate OS process, a stripped
environment, POSIX rlimits (10s CPU, 256MB address space, 1MB file size),
a 15s wall-clock timeout, DEVNULL stdin, and a 64KB stdout cap. Those
limits bound the **cost** of a run, not its **access**. There is no UID
separation, no filesystem restriction, no network namespace, no seccomp on
this box.

Per the precommitted fork in the work order, there is no "mostly
isolated" interpretation: arbitrary submitted-code execution is disabled,
and the claim is narrowed to trusted-fixture reproduction.

## Revised K3 — trusted-fixture reproduction

- **K3 — trusted-fixture reproduction.** The study executes **only** when
  the package's pinned sha256 (sha256 of the canonical package bytes, the
  same bytes the acceptance record names) is in the receiver's
  trusted-fixture set (`TRUSTED_FIXTURE_PINS` in
  `backend/package_sandbox.py`) — byte-pinned computations the receiver
  owner has explicitly trusted. The set is a closed frozenset in code;
  adding a pin is a receiver-owner code change, never a submitter action.
- If the pin is not trusted, the study is **not executed**: no submitted
  byte runs. The reproduction record carries
  `error: STUDY_EXECUTION_DISABLED`, `executed: false`, and K3 fails with
  the refusal reason. `evaluate_package` returns REJECTED and the receiver
  refuses the package (`STOPPED` + `PACKAGE_ACCEPTANCE_FAILED` +
  `CRITERION_FAILED_K3`); nothing is stored.
- A trusted fixture must exit 0 within the recorded resource limits and
  its stdout must equal `manifest.expected_result` byte-for-byte,
  exactly as before.

## What is preserved

The 9348110 results stand unchanged: the tide fixture's package pin
(`6081084e…4906`) is the first trusted-fixture pin, so its reproduction
still executes and still passes; the admission record, the byte binding,
the five demonstrated controls, and the correction propagation (source
`CORRECTED` → dependent claims `QUARANTINE`, originals byte-identical)
are historical facts and are not re-evaluated under the new K3. What
changes is only the claim about who may safely supply executable studies:
**no one new** — the runner reproduces declared computations of fixtures
the receiver already trusts; it does not make untrusted submitted code
safe to run.

## What "sandbox" now means in this lane

The word "sandbox" no longer appears as a security claim. Where the UI or
records show the reproduction limits, they are labeled as resource
limits for trusted-fixture reproduction: they bound cost, not access.
