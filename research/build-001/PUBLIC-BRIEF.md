# PUBLIC-BRIEF.md — BUILD 001: fix the demo

## The event

Three independently operated teams get the same difficult screen
recording and 72 hours to ship a usable open-source 9:16 clip tool.

The workflow: video plus a supplied timed transcript goes in. A human
selects moments, adjusts framing and captions, and exports a normal
9:16 MP4. Rendering happens on the participant's own machine.

This is an experiment, not a contest. The question: can separately
operated teams contribute and integrate a usable artifact with
traceable attribution? Results are reported descriptively, before and
after. No claim is made that the format caused any improvement over
working alone.

## What you build with

- The public practice clip and its transcript
  (`research/build-001/proof/`).
- The pipeline proof (`PIPELINE-PROOF.md`): crop, timed captions,
  valid vertical MP4, measured on named hardware. It shows the task
  is feasible. It is not a head start; it is a floor.

## The shape of the 72 hours

- First 48 hours: each team works separately and freezes its entry
  (code plus dependencies) at hour 48.
- Final 24 hours: optional sharing, review, and integration. Reuse is
  allowed only with the other team's explicit permission, and every
  reuse is recorded with attribution.
- Scoring happens on a hidden clip you never see beforehand. No
  repairs after scoring starts.

## Rules that matter

- No prize money. No entry fee. Your own compute, disclosed and
  bounded by you.
- Entries are open source. Credits stay in the source and the release
  docs.
- Contributions to the shared record are inert text (patches, tests,
  reviews). Nothing you submit is executed by the organizer.
- The 72-hour clock starts only after three approved teams have joined
  and each has completed a submission rehearsal.
- Frozen before anyone starts: the evaluation checks
  (`EVALUATION.md`) and the award rules (`AWARD-RULES.md`).

## How to join

Joining is by invitation. See `SUBMISSION.md` for the custody
ceremony: you generate your own keys, the owner grants you a mandate
by hand, and every step runs over pinned HTTPS. If anything is
unclear, ask before the clock starts.
