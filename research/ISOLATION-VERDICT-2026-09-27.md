# ISOLATION-VERDICT-2026-09-27 — the study runner is not a security boundary

## The question

RESEARCH-COMMONS-001 ran submitted study code in "the sandbox":
`backend/package_sandbox.py` — a separate OS process with a stripped
environment, POSIX rlimits, a wall-clock timeout, DEVNULL stdin, and a
stdout cap. The frozen brief (research/COMMONS-BRIEF.md, 2026-09-26)
defined "real isolation" mechanically, including "execution separation"
as a separate OS process with recorded limits. The work order required
closing the question with canaries: can submitted code read outside its
permitted inputs, write outside its workspace, or contact a controlled
local listener?

## Path fidelity

The canaries executed through exactly the path a genuinely submitted
study uses. No shell-side probe, no privileged harness. The probe script
(`/tmp/canary-probe/probe2.py`, evidence at
`/tmp/canary-probe/evidence.json`) built a canary package (manifest +
`study.py` + `input.csv`, K1/K2/K4–K7 conforming), joined a fresh world
with a real custody client (`_Client`: owner root key, worker key,
bounded mandate, proof-of-control ceremony), and called
`world.newsroom_submit_package` with a worker-signed presentation for
`newsroom.review` — the exact function the HTTP endpoint
`/api/world/newsroom/submit-package` calls. The study executed where a
genuine study executes: `evaluate_package` → K3 →
`package_sandbox.run_study`. The canary's stdout was captured in the
acceptance record's `sandbox` section, exactly as the 9348110 fixture's
was.

## The enforced boundary, identified

Reading `backend/package_sandbox.py` at `9348110`, the enforced boundary
around study execution was:

- **OS identity:** none separated. The study ran as uid 0 / euid 0 — the
  receiver's own identity. (Observed: `"uid": 0` in the canary's stdout.)
- **Filesystem:** no restriction. The study's working directory was a
  fresh temp dir, but nothing confined it there: it could read and write
  anywhere the receiver's unix permissions allow.
- **Mounts:** all of the host's mounts visible (no mount namespace).
- **Network:** full host network namespace (documented in the code, but
  its consequence was untested until now).
- **Receiver credentials/state:** reachable. The receiver's data dir was
  listable, readable, and writable by the study.
- **What WAS enforced:** separate OS process; stripped environment
  (`PATH=/usr/bin:/bin`, no user site-packages); `RLIMIT_CPU=10s`,
  `RLIMIT_AS=256MB`, `RLIMIT_FSIZE=1MB`; 15s wall-clock timeout; DEVNULL
  stdin; 64KB stdout cap. All real, all recorded in every evaluation
  record — and all bounding **cost**, not **access**.

## Canary evidence (2026-09-27, genuine intake path)

The canary study was stdlib-only and deterministic. Observed:

| Canary | Result |
|---|---|
| R1 read `/tmp/canary-outside.txt` (planted outside inputs) | **OK** — `"read_outside": "OK:CANARY-OUTSIDE-READ-ME"` |
| R2 read repo file `/home/hatch/workspace/openline-workshop/research/COMMONS-BRIEF.md` | **OK** — first 40 chars returned |
| W1 write `/tmp/canary-written-by-study.txt` | **OK** — file existed afterward with the study's bytes |
| A1 `os.access` on receiver data dir `backend/data/world` | **R_OK true, W_OK true**; `listdir` returned `["world-snapshot.json"]` (names only — no secret contents read) |
| N1 TCP connect to a controlled loopback listener (port via `input.csv`) | **OK** — listener received `b'CANARY-HELLO'` and the study received the `CANARY-ACK` reply |
| uid/euid | 0 / 0 — same identity as the receiver |

No real secrets were probed (only file names listed, never contents of
credential or state files) and no external service was contacted (only
the loopback listener we controlled).

## Verdict

**The study runner was not a security boundary.** Every escape route
tested was open. Per the precommitted fork there is no "mostly isolated"
interpretation.

## Reclassification (what changes, what stands)

- **Changes:** arbitrary submitted-code execution is disabled
  (`TRUSTED_FIXTURE_PINS` gate in `backend/package_sandbox.py`; K3 is now
  trusted-fixture reproduction per
  research/COMMONS-CRITERIA-2026-09-27.md). The claim is narrowed:
  **deterministic reproduction of a fixture's declared computation**,
  not safe execution of untrusted code. The resource limits are still
  real and still recorded — they bound cost, not access — and are labeled
  as such everywhere the old "sandbox" wording implied containment.
- **Stands (9348110 preserved):** receiver-owned acceptance (K1–K7 as
  demonstrated), exact artifact binding (declared = pinned = evaluated =
  displayed), the five frozen controls and their verdicts, and correction
  propagation with history preserved (source `CORRECTED` → dependent
  claims `QUARANTINE`, original bytes and acceptance record byte-identical).
  Those results never depended on the runner being a security boundary;
  the fixture's computation was the receiver's own declared fixture, and
  it remains reproducible under the trust gate.
- **Who may supply executable studies now:** no one new. A study executes
  only if its exact package bytes are in the receiver owner's
  trusted-fixture set. Adding a pin is a receiver-owner code change.
