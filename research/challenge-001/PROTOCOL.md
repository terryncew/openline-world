# CHALLENGE-001 — participation protocol (frozen 2026-09-28)

The path every contribution walks: join → explicit authorization →
contribution → evaluation/acceptance record → visible attribution.

## 1. Join

`GET /api/world/challenge` returns a server nonce. The worker signs the
nonce bytes; `POST /api/world/join` carries `openline-join-profile/v1`
with the owner-signed mandate bundle (see `clients/participant.py` and
`clients/demo_custody.py` for the two-process key-dir pattern; note
`docs/joining.md` is STALE on the bundle shape — read the client code).

The mandate must grant the scopes the participant will use:
- `challenge.contribute` — submit patch/test/review contributions.
- `challenge.admin` — create challenges, record evaluations, and register
  claim-graph linkage. Owner only.
- `claimgraph.correct` — post authorized correction events. Evaluator only.

## 2. Explicit authorization (delegate bounds)

Before contributing, the owner records bounds via
`POST /api/world/delegate`: goal text, `permitted_actions` (a subset of
TASK_KINDS keys, e.g. `challenge-contribute`), `spending_limit`,
`work_limit`, `review_conditions`. The server records the delegation; it
does not run a worker loop. This is the owner's stated intent on record.

## 3. Contribution (gated)

Every gated act is two calls:
1. `POST /api/world/gate/challenge` with `action: "challenge.contribute"`.
   The server issues a single-use receiver challenge bound to this
   participant's principal and agent.
2. The worker signs a presentation over the challenge; `POST
   /api/world/challenge/contribute` carries the contribution, the
   presentation, and an idempotency key.

The receiver then: evaluates the presentation (ALLOWED/STOPPED, signed);
checks byte binding (declared sha256 = pinned sha256); runs the frozen
K1..K7 structural admission on the pinned bytes. Only an ALLOWED +
bound + ADMITTED contribution is stored. A contributor-carried
"self-approval" attestation is accepted on the wire but discarded: it
authorizes nothing and appears nowhere.

A contribution may declare explicit reuse links, `builds_on`: a list of
`{contribution_id, what_reused}` naming which recorded contributions it
builds on. The links are byte-bound the same way as the body: the
declared `builds_on_sha256` must equal the sha256 of the canonical
encoding of the stored links (sort_keys, compact separators —
`backend/world.py::_canonical_builds_on`; clients pin the same encoding).
A mismatch is refused with `CHALLENGE_BUILDS_ON_HASH_MISMATCH`; a link
naming an unknown contribution is refused with
`CHALLENGE_BUILDS_ON_UNKNOWN`. The links are wire/input validation, not
a new acceptance criterion: K1–K7 are frozen. The review may cite the
patch, but the reuse chain is what the contributor declares — nothing
is inferred.

## 4. Evaluation / acceptance record

Only the designated evaluator (the challenge owner) may evaluate:
`POST /api/world/challenge/evaluate` with `decision: ACCEPT` or
`DECLINE` and a checkable reason. The evaluator's identity is bound to the
challenge at creation. A non-evaluator's evaluate call is refused with
`EVALUATOR_NOT_OWNER` and changes nothing. The decision is recorded with
the evaluator's reason and a receiver-signed gate receipt.

## 5. Visible attribution

`GET /api/world/challenge/read` (no auth required) shows: the frozen
problem and criteria hash, every contribution with its authorship,
structural admission record, evaluator decisions with reasons, reviews
(including negative findings) with visible credit, and links to receipts.

## 6. Credit cascade (linkage, correction, reassessment)

Recorded attribution is never proof of ownership, never deserved
compensation, and never a claim of scientific truth. It is the
evaluator's public record of what was accepted and what was reused.

The owner links accepted contributions as claim nodes:
`POST /api/world/challenge/cascade/register` with `challenge.admin`.
Each link names an ACCEPTED contribution, a `finding_quote` that must
occur verbatim in the recorded body, and an optional `depends_on`
naming another linked contribution. Non-accepted links are refused with
`CHALLENGE_CASCADE_LINK_NOT_ACCEPTED`; non-verbatim quotes with
`CHALLENGE_CASCADE_QUOTE_MISMATCH`; unknown dependencies with
`CHALLENGE_CASCADE_DEPENDENCY_UNKNOWN`. Registration is an explicit
owner-signed act — nothing is inferred from text similarity.

Correction is authorized, not destructive:
`POST /api/world/claimgraph/correct` with `claimgraph.correct`, naming
the source of a linked contribution. A contributor without the scope is
refused with `ACTION_OUTSIDE_MANDATE`; nothing is appended. An
authorized event (CORRECTED / WITHDRAWN) runs the claim graph's existing
propagation over the receiver-admitted edge policy: the corrected
source's assertion claims are exposed (QUARANTINE / SOURCE_BASIS_LOST),
dependents are reassessed (QUARANTINE /
ALL_ADMITTED_SUPPORT_PATHS_LOST), independent reports stay UNAFFECTED.

A correction never rewrites history. The original contribution bytes
stay pinned, the ACCEPT/DECLINE decisions stand, every snapshot and
receipt stays byte-identical and inspectable. The event is one
continuous record: correction plus reassessment, not deletion.

The extended demo runs this as a deliberate demonstration event: the
evaluator corrects the accepted review's key finding to test the
mechanism. It is not a claim the finding was wrong. The review's claims
reassess to QUARANTINE, the patch and the independent control stay
UNAFFECTED, the original bytes and decisions are preserved.

## The refused-unauthorized path

- Revoked mandate → gate STOPPED, reason `MANDATE_REVOKED`. Nothing stored;
  the refusal is recorded in the refusal ledger with the signed receipt.
- Missing scope → `ACTION_OUTSIDE_MANDATE`.
- Non-evaluator evaluate → `EVALUATOR_NOT_OWNER`.
- Wrong byte binding → `CHALLENGE_HASH_MISMATCH`.
- Reuse-link byte binding wrong → `CHALLENGE_BUILDS_ON_HASH_MISMATCH`;
  reuse link naming an unknown contribution →
  `CHALLENGE_BUILDS_ON_UNKNOWN`.
- Cascade registration: non-evaluator → `EVALUATOR_NOT_OWNER`;
  non-accepted contribution → `CHALLENGE_CASCADE_LINK_NOT_ACCEPTED`;
  non-verbatim quote → `CHALLENGE_CASCADE_QUOTE_MISMATCH`;
  unknown dependency → `CHALLENGE_CASCADE_DEPENDENCY_UNKNOWN`.
- Correction without `claimgraph.correct` → `ACTION_OUTSIDE_MANDATE`;
  nothing is appended.
- Failed structural admission → `CHALLENGE_ADMISSION_FAILED` naming the
  failed K rule.
- After the deadline → `CHALLENGE_CLOSED`.

## What closing the browser does and doesn't erase

Nothing. The browser is a viewer: it holds no keys, no tokens, no
contributions. Closing it erases nothing on the server; reopening it shows
the same durable board. Contributions live in the server's durable store
(`world-snapshot.json`), not in the page.

## What continued agent work requires

The server does not run workers. Continued agent work requires the
participant's own host to keep running: their own keys in their own key
dir, their own process issuing presentations. If the participant's host
stops, their agent stops contributing; everything already recorded stays
recorded.

## Which agent runtime the demo actually used

Honest label: the Phase-1 verification was run by demo script clients
(`research/challenge-001/verify/`), one process per participant, separate
key dirs, same loopback server on the same machine — NOT independent
operators, NOT remote agents. The clients are deterministic scripts
written for this verification, not autonomous agents. `SEND-YOUR-AGENT.md`
describes how an outside person could run their own orchestrator against
the same endpoints; no outside run has happened yet.
