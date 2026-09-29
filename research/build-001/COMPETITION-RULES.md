# COMPETITION-RULES.md — BUILD 001 competition rules

## Eligibility

Three independently operated teams. "Independently operated" means
separate people, separate machines, separate accounts. The organizer
does not operate a team.

## The 72 hours

- The clock starts only after three approved teams have joined and
  each has completed a submission rehearsal (`SUBMISSION.md`).
- Hours 0-48: separate work. At hour 48 each team's entry (code plus
  dependencies) freezes. The frozen commit hash and dependency list
  are the entry.
- Hours 48-72: optional sharing, review, and integration. Reuse needs
  the other team's explicit permission and is recorded with
  attribution (`builds_on`). No permission, no reuse. Scoring uses
  only the frozen hour-48 entries: any post-freeze integration is a
  separate released build, not a re-scored entry, and does not change
  acceptance.
- After hour 72: scoring on the hidden clip, no participant repairs.
  The hidden clip stays private through evaluation: only the
  evaluator operates entries on it, using the fixed usability task.
  Teams never inspect it and cannot patch their entries.

## Conduct

- Entries are open source with a stated license (`LICENSES.md`).
- Contributions to the shared record are inert text. The organizer
  never executes submissions.
- Refusals (bad scope, late entry, bad hash) land on the public board
  with reason codes. There is no silent drop.
- Participant compute is disclosed and bounded by each owner. The
  organizer spends nothing beyond the already-running hosting pilot.

## Changes

`EVALUATION.md` and `AWARD-RULES.md` are frozen and do not change
after the clock starts. Anything else ambiguous is resolved against
the frozen text, in public, before scoring.
