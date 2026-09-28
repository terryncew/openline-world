# REPLACE-WORKER-001 — "Replace the worker. Keep the job."

**Status: PROTOCOL FROZEN.** Frozen at 2026-09-27T23:45:00-07:00 (recorded in
`PROTOCOL.freeze.json` with sha256). The run has not been executed. Nothing
below may change after the freeze except to record the outcome.

## Question

Can one World commission survive replacement of the seller-side worker —
revoked mid-job, succeeded by a disjoint worker identity — with the frozen
contract, the recorded checkpoint, and a single settlement intact, through
the public World API only?

## Composition

APPROVED_JOB_LIVE_001 (checkpoint → revoke → successor under the same
agreement → independent acceptance) × UNATTENDED-COMMISSION-001 (simulated-
funds settlement from frozen contract + recorded events). New here: the whole
composition runs inside one World commission.

## Actors

- Buyer: participant `buyer` (owner root key B).
- Seller: participant `seller` (owner root key S).
- Worker A: agent `seller-worker-a`, worker key A. Modeled as "provider A".
- Worker B: agent `seller-worker-b`, worker key B. Modeled as "provider B".
- Worker B shares the seller owner's wallet/root key (same owner, new
  worker). A and B have disjoint worker keys, disjoint agent ids, no shared
  worker state.

Provider difference is modeled as disjoint worker identity as far as the
receiver is concerned. Live-provider substitution was already proved in
APPROVED_JOB_LIVE_001; this demonstration tests the World-side continuity
composition, not providers.

## Steps

- S1. Buyer and seller join via the public join path (real bundles, real
  proof-of-control).
- S2. Buyer proposes the commission contract (job: harbor tide report;
  acceptance: required substrings "2.43 m", "harbor"; rates; max_cost 1000c;
  success fee 500c). Both owners authorize with root keys → frozen. Record
  digest D0.
- S3. Buyer funds 2000c simulated, starts the commission → 1500c reserved.
  Record commission_id C.
- S4. Worker A reports partial costs (readings.scan x3, summary.write x1 =
  35c recorded) via real `commission_report_cost` with real presentations.
  Record checkpoint: cost_events, recorded_cost_cents.
- S5. Seller owner revokes A's mandate in its own wallet and submits the
  bundle via `authority_refresh`. Assert the refresh reports revoked=True.
- S6. Worker A attempts one more `commission_report_cost`. Must be refused.
  Record the exact refusal code.
- S7. Seller owner grants a new mandate (same scopes) to Worker B in its own
  wallet.
- S8. Worker B attempts to join as participant `seller` through the PUBLIC
  join path (fresh nonce, proof-of-control, owner-signed bundle). No session
  surgery, no private APIs.
- S9. If S8 admits B: B reads C via `commission_describe`, verifies digest ==
  D0, verifies recorded events equal the S4 checkpoint, computes remaining
  budget = 1000 − recorded. B reports the remaining work within budget and
  submits the deliverable. The receiver evaluates against the frozen
  acceptance criteria and settles.
- S10. Collect: settlement record(s), final balances, full event log.

## Pre-registered assertions

- P1. contract_sha256 is identical at S2, S4, S9, and settlement.
- P2. The buyer authorizes exactly once. Any second authorization path is
  absent or a no-op.
- P3. The cost events B sees at S9 equal the S4 checkpoint exactly.
- P4. Total recorded costs never exceed max_cost_cents; B spends only from
  the remaining budget.
- P5. A's S6 action is refused. The refusal code is recorded verbatim.
- P6. B's S8 join goes through the public path (this step is the
  discriminating observation; see terminal verdicts).
- P7. Exactly one settlement exists for C; its amounts equal receiver
  arithmetic over the frozen contract + recorded costs; payee is seller_id.
- P8. A's post-revocation recorded spend is 0c.

## Terminal verdicts

- **PASS**: P1–P8 all hold. Earned claim: "The worker changed mid-
  commission. The frozen contract, the recorded checkpoint, and the single
  settlement survived; the buyer authorized once."
- **FAIL (mechanism gap)**: P6 fails — the public join path refuses B while
  A's revoked session exists (e.g. JOIN_STANDING_NOT_CURRENT). Then: the
  commission layer preserves everything replacement needs, but the session
  layer has no rejoin path. No mechanism change is made in this run; the gap
  is reported, not fixed.
- **FAIL (other)**: any other assertion fails. The failing assertion is
  named; the run earns no claim.

## Claim boundary (pre-registered)

Scripted workers; simulated funds; one in-process World; no production
effects; no network. This run does not claim live-provider substitution
(proved in APPROVED_JOB_LIVE_001), production deployment safety, or
cross-machine revocation propagation.

## What this run does not do

No changes to the world mechanism, no new marketplace, no release assets,
no commits to any repo. The demo imports the backend as a library exactly
as the unit tests do. Launch assets are untouched.
