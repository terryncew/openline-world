# EVAL-ENV.md — BUILD 001 evaluation environment (prepared 2026-09-29)

Prepared on the existing machine. No new compute, no new spend.

## What it is

A sealed per-entry sandbox, not a shared machine:

- `~/workspace/build-001-eval/` — durable tooling (this file,
  `run-sandbox.sh`, `run-checks.py`). Root-owned, 0700.
- `/var/tmp/build-001-runs/<entry-id>/` — one disposable run dir per
  entry, with `entry/` (the frozen code), `work/`, `out/`. Owned by
  the unprivileged `b001eval` user, shredded after scoring.
- The hidden clip lives at `~/workspace/build-001-private/` (0700
  root). It is copied into a run dir as read-only (0400) only for the
  scoring step, and shredded with the run dir immediately after.

## The sealed run

`run-sandbox.sh <run-dir> <command>` runs the entry as `b001eval`
inside a network namespace with no usable network, a scrubbed
environment (`env -i`, minimal PATH), and HOME pointed at the run dir.

Verified 2026-09-29 (smoke test): unprivileged user, network
unreachable, pilot tree and backup key unreadable, ffmpeg renders
720x1280 output into the run dir.

## Staging order (what stays away from what, and until when)

1. The evaluator fetches the entry's stated dependencies with network
   access, outside the sandbox, from the entry's stated sources only.
2. The frozen entry is placed in the run dir. The sealed run builds
   and operates it with no network. A sealed run that needs the
   network fails, by design.
3. Rehearsal runs use the public practice clip only.
4. At scoring, the hidden clip is staged read-only into the run dir.
   The evaluator operates each frozen entry on it using the fixed
   usability task. Teams never see the hidden clip and cannot patch
   entries after submission.
5. `run-checks.py` runs the frozen objective checks against the
   output. Then the run dir — including the hidden clip copy — is
   shredded.

## What it does not do

- It does not review entry code. Entries are untrusted code; the
  sandbox contains their effects, it does not audit them.
- It is not a separate machine. Network isolation is per-run via
  network namespace; filesystem isolation is via Unix permissions.
  The live receiver is additionally protected because scoring never
  uses participant credentials or the pilot network path.

## Usability task

After the objective checks, the evaluator performs the fixed
usability task on each passing entry: load the hidden clip and its
transcript, select a moment, adjust framing and captions, export.
Pass/fail recorded per EVALUATION.md. This is the only human judgment
in scoring; everything else is the frozen checks.
