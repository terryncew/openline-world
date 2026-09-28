# REPLACE-WORKER-001 — report

**Terminal verdict: FAIL (mechanism gap)** — pre-registered in the frozen
protocol. Evidence: `evidence/run-20260928T063448Z.json`. Protocol sha:
`8565fe14d73c6af9aa15116434db7a9aa8590c0e9b439109c931285abe176164`.

## What the run did

One World commission (harbor tide report, max 1000c, 500c success fee,
simulated funds). Buyer + seller authorized the frozen contract once.
Worker A (agent `seller-worker-a`) reported 35c of partial work — the
checkpoint. The seller owner revoked A's mandate; A's next report-cost was
refused. The owner granted Worker B (agent `seller-worker-b`, disjoint keys)
the same scopes. Worker B attempted the public join path as `seller`.

## Assertion results

| # | Assertion | Result |
|---|-----------|--------|
| P1 | Contract digest stable throughout | **held** (`9019774e…`) |
| P2 | Buyer authorized exactly once; duplicate authorize is a no-op | **held** |
| P3 | Checkpoint events preserved for B | not reached |
| P4 | Recorded costs stayed within budget | **held** (35c ≤ 1000c) |
| P5 | A's post-revocation action refused | **held** — `WORLD_AUTHORIZATION_REFUSED: MANDATE_REVOKED`, 0c spent |
| P6 | B joins as seller via the public path | **failed** — `JOIN_STANDING_NOT_CURRENT: participant already holds a current standing` |
| P7 | Exactly one settlement, receiver arithmetic | not reached |
| P8 | A's post-revocation spend is 0c | **held** |

## The gap, precisely

`backend/world.py`, `join()`: `if pid in self.sessions: raise
JOIN_STANDING_NOT_CURRENT`. A revoked session still occupies the
participant slot, and no public API retires it. The owner can revoke the
worker and mandate a successor, but the successor can never take the
participant's seat — so the same commission cannot continue under a new
worker.

The commission layer is replacement-ready (frozen terms, recorded
checkpoint, single-settlement arithmetic, one buyer authorization). The
revocation path works (MANDATE_REVOKED refusal, zero post-revocation
spend). The session layer is where replacement dies.

Note: the onboarding tour's "only the helper changed" line describes the
scripted workshop tour, not the real participant flow. In the real flow,
the helper cannot change.

## What this means

The control half of "change AI providers while keeping control of the
work" is proved inside World. The change half is not — it needs a rejoin
path for a revoked participant, which is a mechanism change and was not
made here.

## Boundaries honored

No mechanism changes. No new marketplace. No repo commits. No release or
commercial assets touched. The demo imported the backend as a library, the
way the unit tests do. Scripted workers; provider difference modeled as
disjoint identity (live-provider substitution already proved in
APPROVED_JOB_LIVE_001). Simulated funds; no production effects.
