# EVALUATION.md — BUILD 001 evaluation (FROZEN)

Frozen 2026-09-29. These checks do not change after teams start.

## What is scored

Each frozen entry is scored once, on the hidden final clip, with no
participant repairs. The team supplies: a repo URL, a commit hash, and
build/run instructions. The evaluator builds and runs it in the eval
environment (`EVAL-ENV.md`).

## Objective checks

The tool must take the hidden clip and its transcript and export a
9:16 MP4 meeting all of these:

1. Frame size exactly 720x1280.
2. Video codec h264, pixel format yuv420p.
3. Audio present, AAC.
4. Duration within 0.5s of the source segment.
5. Audio/video start offset within 40ms.
6. Captions burned in and readable: a caption glyph band of at least
   24px at sampled timestamps inside caption windows.
7. No caption pixels inside the bottom 100px protected band.
8. Caption timing: captions visible during their transcript windows
   and absent outside them, at 10 sample points across the clip.

Checks 1-5 and 8 are machine-run. Checks 6-7 are machine-measured on
rendered frames. A single failed check fails functional acceptance.

## Usability task

A short task performed by an operator who did not build the tool,
using the tool as documented:

1. Load the hidden clip and its transcript.
2. Select one moment (trim to a sub-segment).
3. Adjust the framing (reposition the vertical crop).
4. Adjust one caption's timing or text.
5. Export a valid 9:16 MP4.

Pass if all five steps complete and the export passes checks 1-7
above. The operator records time taken and any step that needed
undocumented work. This is reported alongside the score, not folded
into it.

## Reporting

Per entry: pass/fail per check, the usability-task record, and the
frozen commit hash evaluated. Before/after is reported descriptively
for integrated entries: what changed, who it is attributed to. No
ranking claim beyond the checks.

## What the evaluator is not

The evaluator does not fix entries, does not re-run failed builds
with different dependencies, and does not judge code quality. Merit
judgment beyond these checks is out of scope by design.
