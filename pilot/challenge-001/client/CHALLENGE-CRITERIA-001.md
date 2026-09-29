<!-- FROZEN 2026-09-28 — CHALLENGE-001 acceptance criteria.
Frozen before any contribution existed. Do not edit; amend only by explicit
owner authorization as a new dated revision. The criteria hash (sha256 of
this file's exact bytes) is bound into PROBLEM.md and into every
contribution and evaluation record.

AMENDED 2026-09-28 (pre-contribution): K5's "exactly one documented bug"
moved from structural admission to evaluator merit, resolving an
inconsistency with frozen control 2 (which requires the two-bug test to be
admitted and evaluator-DECLINED, not machine-refused). The hash below is
the amended file's. No contribution existed at amendment time. -->

# CHALLENGE-CRITERIA-001 — frozen acceptance criteria

Challenge: CHALLENGE-001. Receiver-owned, deterministic, server-side.

Two distinct stages. Do not blur them.

**Stage 1 — structural admission (machine).** `backend/challenge_acceptance.py`
runs K1..K7 on the pinned bytes at contribution time. A passing contribution
is ADMITTED — it may be evaluated. An ADMITTED contribution is displayed as
authored. These checks are structural: section presence, binding, format,
authorship match. They do NOT verify that a patch actually fixes anything,
that a test actually fails, or that a review's finding is correct. The
acceptance record carries this scope note verbatim.

**Stage 2 — merit evaluation (designated evaluator, human).** The challenge
owner evaluates admitted contributions against the problem statement in
PROBLEM.md and records ACCEPT or DECLINE with a checkable reason. The
record is receiver-signed (gate receipt for the evaluate action). Merit
includes: one documented bug per test (a test bundling two documented bugs
is DECLINED with the named reason, e.g. "bundles BUG-1 and BUG-2; one bug
per test"); a patch that does not change the buggy behavior is DECLINED
with the checkable reason; a review whose finding does not check out is
DECLINED with the reason. Acceptance means "the evaluator accepted this
contribution under the frozen criteria." It does not establish general
correctness beyond the reason given.

## K1 — kind

The contribution's `kind` is exactly one of: `patch`, `test`, `review`.
`patch` = a unified diff as inert text. `test` = one failing-test file as
inert text. `review` = a text review of an existing contribution. Any other
kind is refused (K1).

## K2 — challenge binding

The contribution references `challenge_id` "CHALLENGE-001" and
`criteria_hash` equal to the frozen sha256 of THIS file. The bytes pinned by
the server must equal the submitter's declared sha256
(`declared == pinned`), else refused (K2). The byte pinning is exact: no
normalization.

## K3 — authorship

The contribution's declared `participant_id` must equal the presenting
session's participant_id. A contribution naming any other participant is
refused (K3). Authorship is not transferable in this challenge.

## K4 — patch well-formedness

A `patch` contribution is unified-diff text: it contains `---` and `+++`
headers and at least one `@@` hunk, and it touches `toy-app/ledger.py`.
Patches are INERT TEXT: they are stored, displayed, and reviewed, but never
executed, imported, or applied on the World server. Any execution happens
only in the challenge owner's own reviewed environment at the owner's
discretion — never on the server.

## K5 — test well-formedness

A `test` contribution is a failing-test file as inert text: it names the
toy-app target, states the expected behavior (citing `EXPECTED.md`), and
contains an assertion. A test that does not name the target, does not cite
EXPECTED.md, or contains no assertion is refused (K5). Whether the test
demonstrates exactly one documented bug is a MERIT judgment for the
evaluator (Stage 2), not a structural refusal: an admitted two-bug test is
declined by the evaluator with the checkable reason "bundles BUG-1 and
BUG-2; one bug per test", not refused by the machine. The test is never
executed on the server.

## K6 — review well-formedness

A `review` contribution references one existing contribution id (it must be
present in the challenge store at contribution time — peer review of another
contribution, which the newsroom intake does not record). The review states
a checkable finding: it quotes or names a claim from the referenced
contribution and says how a reader could verify it, without running
anything. A review without a checkable finding is refused (K6). A review
of a non-existent contribution is refused (K6).

## K7 — reuse and originality

Work is declared `original: true` or lists its sources. Non-original work
must name each source (a URL or a contribution id in this challenge);
otherwise refused (K7). Useful reviews and negative findings receive visible
credit on the challenge board regardless of the merit decision on the work
they review.

## Governance rules

- References: every contribution and every decision references the frozen
  challenge id and criteria hash.
- Evaluator only: ACCEPT/DECLINE decisions are recorded only by the
  designated evaluator (the challenge owner). Decisions carry a reason and
  are receiver-signed. A contributor's self-approval, or any attestation
  carried in a contribution payload, is discarded on the wire and changes
  nothing.
- Unauthorized contributions are refused with a named reason
  (e.g. `MANDATE_REVOKED`, `ACTION_OUTSIDE_MANDATE`, `EVALUATOR_NOT_OWNER`).
  Refusals are recorded in the refusal ledger.
- NO server-side execution of submitted code, ever. This is not a policy
  preference; it is the isolation verdict of
  research/ISOLATION-VERDICT-2026-09-27.md: "The study runner was not a
  security boundary. Every escape route tested was open." Submitted
  patches and tests are inert text on the server.

## Controls (frozen; implement exactly these)

| # | Control | Attempt | Expected verdict | Resulting state | Receiver-produced record |
|---|---|---|---|---|---|
| 1 | Pass | well-formed patch, bound + authored, gate ALLOWED | contribution ADMITTED; evaluator ACCEPT with reason | contribution stored with acceptance record; displayed with visible attribution | gate receipt (ALLOWED, contribute) + signed acceptance record + signed evaluation record |
| 2 | Genuine failure | test bundling two bugs (well-formed, so structurally admitted) | evaluator `DECLINE` with a checkable reason | contribution stored as admitted, displayed as declined | signed evaluation record naming the merit reason ("bundles BUG-1 and BUG-2; one bug per test") |
| 3 | Unauthorized | contribution from a revoked participant | gate STOPPED, reason `MANDATE_REVOKED` | nothing stored; refusal recorded in the refusal ledger | signed refusal receipt naming the reason code |
| 4 | Self-approval | contributor evaluates own or another's contribution, or carries a self-approval attestation | refused `EVALUATOR_NOT_OWNER`; attestation discarded | no state change from the attestation; nothing appears in any acceptance record | signed refusal for the evaluate attempt |
| 5 | Unauthenticated read | GET the challenge board with no auth | 200, full read | no state change | none required |

Scope note (structural checks only): the K-checks verify the
contribution's shape (kind present, binding exact, format well-formed,
authorship matches, references exist). They do NOT verify that any claim
in the contribution is true. Admission admits the artifact for evaluation;
it is not factual verification.
