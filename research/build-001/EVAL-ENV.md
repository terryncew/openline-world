# EVAL-ENV.md — BUILD 001 evaluation environment (definition only)

This defines the environment. It is not provisioned yet.

## Purpose

One disposable machine per scoring run. The evaluator builds each
frozen entry here and runs the frozen checks. Nothing from a team's
entry runs anywhere else.

## Definition

- Disposable Linux VM or container, destroyed after scoring.
- 2 vCPU, 8 GiB RAM (matches the pipeline proof's class of machine).
- Ubuntu 24.04 or equivalent, with: ffmpeg (with libx264), python3,
  a C compiler, git. No other toolchain preinstalled.
- No network access during build and scoring, except fetching the
  entry's stated dependencies. If a dependency cannot be fetched, the
  entry fails; the evaluator does not improvise.
- No production credentials, no receiver keys, no participant data.
  The hidden clip and transcript are the only non-public inputs, and
  they are deleted with the environment.

## Notes

- Entries must build from the frozen commit hash plus the frozen
  dependency list, with only the tools above. Anything else the entry
  needs must be vendored or fetched from a stated source.
- The pipeline proof (`PIPELINE-PROOF.md`) names its own hardware;
  this environment is defined to be no more generous, so a proof that
  passes there is meaningful here.
