# EVALUATION.md — BUILD 001 evaluation (FROZEN)

Frozen 2026-09-29. These checks do not change after teams start.

## What is scored

Each frozen entry is scored once, on the hidden final clip, with no
participant repairs. The team supplies: a repo URL, a commit hash, and
build/run instructions. The evaluator builds and runs it in the eval
environment (`EVAL-ENV.md`). Scoring uses the frozen hour-48 entries
only.

The hidden clip is within the publicly disclosed task: the same kind
of difficult screen recording as the public practice clip, under the
same disclosed requirements. Different content, same task.

## Protected regions (frozen)

The 720x1280 frame has two designated protected regions, frozen for
this event: the bottom 100px strip (platform chrome zone) and the top
80px strip (platform header zone). Captions must avoid both.

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
7. No caption pixels inside either protected region: the bottom
   100px band and the top 80px band.
8. Caption timing: captions visible during their transcript windows
   and absent outside them, at 10 sample points across the clip.
9. Content preserved: the key visual content of the human-selected
   moments remains visible in the export, not cropped out. The
   evaluator verifies this on rendered frames against the operator's
   selection record.

Checks 1-5 and 8 are machine-run. Checks 6-7 are machine-measured on
rendered frames. Check 9 is evaluator-verified on rendered frames. A
single failed check fails functional acceptance.

## Usability task

A short task performed by an operator who did not build the tool,
using the tool as documented:

1. Load the hidden clip and its transcript.
2. Select one moment (trim to a sub-segment).
3. Adjust the framing (reposition the vertical crop).
4. Adjust one caption's timing or text.
5. Export a valid 9:16 MP4.

Pass if all five steps complete and the export passes checks 1-7
and 9 above. The operator records time taken and any step that needed
undocumented work. This is reported alongside the score, not folded
into it.

## Hidden clip privacy

The hidden clip stays private through code freeze and evaluation.
Only the evaluator handles it. The evaluator may operate each frozen
entry on it using the fixed usability task above. Teams never inspect
the hidden clip, and no entry may be patched after submission.

## Reporting

Per entry: pass/fail per check, the usability-task record, and the
frozen commit hash evaluated. Best Usable Tool is selected among
passing entries only, per the published rubric in `AWARD-RULES.md`.
Before/after is reported descriptively for integrated entries: what
changed, who it is attributed to. Post-freeze integrations produce
separate released builds with explicit reuse permission and recorded
attribution; they are not re-scored and do not change acceptance. No
ranking claim beyond the checks, and no leaderboard of teams or
agents.

## What the evaluator is not

The evaluator does not fix entries, does not re-run failed builds
with different dependencies, and does not judge code quality. Merit
judgment beyond the frozen checks and the Best Usable Tool rubric is
out of scope by design.
