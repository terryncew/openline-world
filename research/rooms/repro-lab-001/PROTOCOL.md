# PROTOCOL — RESEARCH-ROOM-001 (Reproducibility Lab, Room 001)

## Research question

Does structured receipt exchange improve a bounded computational search
task versus ordinary result sharing?

## Task: hidden-parameter recovery (synthetic)

A fixed 4-dimensional parameter vector θ* is hidden. Workers observe
noisy function values and must recover θ*.

- θ* = [1.5, -2.0, 0.75, 3.25] (fixed, frozen).
- Basis: φ(x) = [1, x, x², sin(2πx)].
- Observations: y_i = θ* · φ(x_i) + ε_i, ε_i ~ Normal(0, 0.1),
  x_i on a fixed grid of 40 points in [0, 1], RNG seeded (seed 777001).
- Validation set: 100 points on a fixed grid in [0, 1], observations
  generated with the same θ* and σ=0.1, RNG seeded (seed 777002).
  The validation inputs and outputs are FROZEN and identical for every
  worker, condition, and replication.
- A worker proposes a candidate θ̂. Score = mean squared error of
  θ̂ · φ(x) against y on the frozen validation set. Lower is better.
- One "evaluation" = one score computation on the validation set.

## Worker algorithm (identical across conditions)

Deterministic seeded random search with local refinement. All workers
run the SAME algorithm; only the sharing mechanism differs between
conditions.

For worker w ∈ {0,1,2,3}, replication r, condition c:
- rng = Python stdlib `random.Random` seeded with
  seed = 1_000_000·master_seed[r] + 10_000·cond_code(c) + 100·w + 7,
  where cond_code(A)=1, cond_code(B)=2, cond_code(C)=3.
  (Seeds differ by condition so that any shared-state interaction is
  the only cross-condition difference; the algorithm is identical.)
- best ← [0, 0, 0, 0]; best_mse ← evaluate(best) (evaluation #1).
- step ← 0.5.
- For iteration i in 1..99 (99 further evaluations; 100 per worker):
  - In conditions B and C only: read the shared best. If the shared
    best_mse < best_mse, adopt the shared (theta, mse) as best.
  - proposal ← best + [rng.gauss(0, step) for each of 4 dims].
  - mse ← evaluate(proposal).
  - If mse < best_mse: best ← proposal; best_mse ← mse; publish
    (condition-dependent, see below).
  - step ← step × 0.98.
- Each worker performs exactly 100 evaluations. Total per replication:
  4 workers × 100 = 400 evaluations (budget B = 400), matched across
  conditions.

Publishing:
- A (independent): no publishing, no shared state.
- B (ordinary sharing): on improvement, write (theta, mse) to the shared
  best-so-far slot (plain values, no provenance, no validation).
- C (receipt sharing): on improvement, build a structured receipt
  {worker_id, iteration, theta, mse, validation_input_hash,
  prev_receipt_hash, signature}. The signature is Ed25519 (PyNaCl) over
  the canonical JSON of the receipt body, using the worker's key.
  A receiver validates each receipt BEFORE it enters the shared log:
  (1) schema fields present and well-typed; (2) signature verifies
  against the worker's public key; (3) mse recomputes correctly against
  the frozen validation set (this recomputation costs 1 evaluation and
  is counted as OVERHEAD, not against the B=400 search budget);
  (4) prev_receipt_hash chains to the current log head (genesis hash
  for the first receipt). Only validated receipts enter the shared log.
  Rejected receipts are counted and retained in the run record.

Workers are deterministic algorithmic workers, clearly labeled as such.
No model calls, no network, no wet-lab. This tests the coordination
mechanism, not autonomous scientific discovery.

## Conditions

- A. Independent: 4 workers × 100 evals, no communication.
  Result = min over workers of best_mse.
- B. Ordinary sharing: shared best-so-far (plain θ̂ + score).
  Result = shared best_mse at end.
- C. Receipt sharing: shared log of validated structured receipts.
  Result = shared log's best_mse at end.
  Overhead = number of receiver recomputation evaluations, reported
  separately and as % of B.

## Replications

R = 10 independent replications. Frozen master seeds:

    [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010]

## Metrics

- Primary: best validation MSE achieved within budget, per replication;
  report mean ± sample standard deviation per condition (n=10).
- Secondary: evaluations used to first reach MSE < 0.05 (per
  replication; report median and count reached); overhead in C as %
  of B=400.
- "Improved" decision rule (frozen): C is said to improve on B iff
  mean_MSE(C) < mean_MSE(B) − pooled_SE, where pooled_SE =
  sqrt(sd_B²/10 + sd_C²/10). If not met, the report states plainly
  "structured receipts did not improve on ordinary sharing in this
  experiment." The same rule applies to B vs A for the secondary
  comparison, reported without the "improved" label.

## Failure criteria (frozen)

A replication run is INVALID if any of:
- (a) a recomputed score hash mismatches the recorded value;
- (b) in condition C, more than 20% of submitted receipts are rejected
      by the receiver (indicates an implementation bug, not science);
- (c) any condition uses more than its 400-evaluation budget
      (overhead excluded from the budget but must be reported).

Invalid replications are reported as invalid, not silently dropped.

## What this does and does not test

- Tests: whether the coordination mechanism (structured, validated
  receipts vs plain shared best) changes search outcomes under a fixed
  budget.
- Does NOT test: autonomous scientific discovery, model capability,
  real-world hyperparameter tuning, or whether receipts are useful in
  general. The workers are fixed algorithms; the task is synthetic.
- Deterministic: same seeds → same outputs, byte-identical. Verified
  by deleting results/ and re-running.

## Pre-registration note

This protocol (question, task, algorithm, conditions, budgets, seeds,
metrics, failure criteria, decision rule) was frozen BEFORE any
experiment code ran. The freeze hash below covers the content above.

---
## FREEZE STAMP

FROZEN 2026-09-28. This protocol was frozen before any experiment code
ran. Content hash (sha256 of PROTOCOL.md before this stamp):
`2ba607e0eb6166b28fa4d83130448e0632b1bd0e1cced752380e5c20e2fbffe3`
Amend only by explicit owner authorization, as a new dated revision.
