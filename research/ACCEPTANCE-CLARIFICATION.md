# Acceptance clarification — what the bounded research run actually accepted

Frozen facts about commit `b6bd4b79` (branch `research-explore-demo`), which
is preserved unchanged. This document is part of the correction commit on
top of it.

## The two separate acceptances at b6bd4b79

**1. The research report — evaluated by the owner's deterministic criteria.**

- The artifact: Atlas's actual generated report,
  `research/report-20260926T233916Z.md`,
  sha256 `d80eed02cabf6e331e96258e8bb61d75d1dc1499447de99112ba2cb123b1f558`.
- Evaluated owner-side by `research/evaluate.py` against the frozen
  `research/CRITERIA.md` (2026-09-26), criteria C1–C5. Verdict: ACCEPTED.
- These checks are STRUCTURAL: required sections present, citations
  formatted, scope conformance, no overclaim phrases. They verify the
  report's shape. They do not verify that any claim in the report is true.
- The receiver's gate never saw the report at `b6bd4b79`. The only
  receiver decision touching the report was `draft.write` → ALLOWED — a
  gate recording that the draft file was stored, not an assessment of it.

**2. The newsroom fixture — admitted for display only.**

- The bytes: the chapter's fixed fixture
  (`fixture://harbor-gazette/correction-slip`).
- Admitted via `newsroom/import`, gated on `newsroom.review` → ALLOWED.
- That ALLOWED admitted a dispatch for display. It said nothing about the
  report. Nothing at `b6bd4b79` should ever be described as the newsroom
  accepting the research report.

Two separate paths, two separate artifacts, two separate verdicts. Fixture
acceptance is not report acceptance, and neither acceptance verifies the
report's claims as true.

## The correction: a receiver-owned path for the actual report

On top of `b6bd4b79`, the backend gains `newsroom/submit-report`
(`backend/report_acceptance.py`, `World.newsroom_submit_report`), a narrow
receiver-owned acceptance path for the actual research artifact:

- The submitted report, the evaluation, the acceptance, and the displayed
  dispatch are bound to the SAME exact bytes: the submitter declares
  `report_sha256`, the server pins the sha256 of the exact body bytes
  received, and the gate consults only when the two match.
- The pinned bytes are pinned exactly as submitted — no stripping, no
  normalization — because any alteration would break the byte-binding the
  path rests on.
- Which checks run, in order: (1) the participant's own receiver gate
  evaluates `newsroom.review`; (2) byte binding (mismatch → STOPPED with
  `REPORT_HASH_MISMATCH`, nothing recorded); (3) the frozen C1–C5 checks,
  ported mechanically to the backend and run server-side on the pinned
  bytes (failure → STOPPED with `REPORT_ACCEPTANCE_FAILED`, nothing
  recorded). Only a gate-ALLOWED, byte-bound, criteria-ACCEPTED submission
  is stored, and the stored dispatch carries the body, the pinned sha, and
  the acceptance record — all naming the same bytes.
- The acceptance record carries a scope note: structural checks only,
  never factual verification. Displayed as authored; not verified as true.
- The original fixture import path is untouched: `import_dispatch` still
  admits only registered fixture bytes and raises otherwise.

Observed behavior, ported exactly (not improved): the frozen C4 check
strips the `## Uncertainties` section by exact string match, so a blank
line between the heading and the section content would defeat it. The
real report has no such blank line; the backend port behaves identically
to `research/evaluate.py`, which the tests cross-check on the same bytes.

## Spending reconciliation

The `$0.002176` figure from the bounded run was an ESTIMATE, not a billed
amount.

- The harness constants are `COST_IN_PER_M = 0.15` and
  `COST_OUT_PER_M = 0.60`, each commented in the code as "USD estimate,
  labeled as estimate in the ledger". The ledger's `spend_usd` is a
  projection from those constants, not a billing record.
- Model access went through the `dynamic_credentials` surrogate to the
  existing connected credential ("custom.openai") — included access, not
  a separately billed key. No key was provisioned or charged for this run.
- The `$1.00` ceiling is the frozen `research/LIMITS.md` table row:
  "Max spend | USD 1.00 (tracked from API `usage`; abort if projected
  over)". It is enforced in the harness code: asserted from the limits
  table at startup, and the run aborts if projected spend would exceed it.
- No further paid contact of any kind is authorized by this correction.
  The correction demo reuses the existing report bytes and performs no
  model calls and no retrievals.
