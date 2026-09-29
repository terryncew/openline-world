# REPORT — RESEARCH-ROOM-001 (Reproducibility Lab, Room 001)

## Question

Does structured receipt exchange improve a bounded computational search
task versus ordinary result sharing?

## Answer

**No — not in this experiment.** Condition C (structured, validated
receipts) did not improve on condition B (ordinary result sharing) by
the frozen decision rule.

## Results (primary metric: best validation MSE within 400 evaluations,
mean ± std over 10 replications)

| Condition | Mean MSE | Std | Reached MSE<0.05 | Median evals to reach | Overhead |
|---|---|---|---|---|---|
| A. Independent | 0.0176 | 0.0078 | 10/10 | 66 | 0% |
| B. Ordinary sharing | 0.0177 | 0.0077 | 10/10 | 64 | 0% |
| C. Receipt sharing | 0.0169 | 0.0057 | 10/10 | 48.5 | 6.9% of budget |

Frozen rule: C improves on B iff mean(C) < mean(B) − pooled_SE.
mean(B) = 0.0177, mean(C) = 0.0169, pooled_SE = 0.0030.
0.0169 is not less than 0.0177 − 0.0030 = 0.0147. **Rule not met.**

## Overhead and uncertainty

- Condition C paid 6.9% of the search budget in receiver recomputation
  evaluations (mean 27.6 overhead evals per replication; each validated
  receipt costs one recomputation). The overhead bought no measurable
  improvement on the primary metric.
- All three conditions performed similarly (means within one pooled SE).
  The task may be too easy for sharing to matter: independent workers
  already reach MSE < 0.05 within ~66 evaluations.
- Condition C reached the 0.05 threshold somewhat faster (median 48.5
  vs 64 evals), but this secondary signal is small, was not the primary
  metric, and cost overhead. It is reported, not claimed.
- Zero receipts rejected, zero invalid replications, byte-identical
  recomputation. The mechanism worked as specified; it just did not
  help enough to clear the bar.

## What the evidence supports

- The experiment ran as frozen: 30/30 replications valid, deterministic
  (delete + re-run = byte-identical outputs).
- Structured receipts with Ed25519 signatures and receiver validation
  functioned correctly (0 rejections across 10 C replications).
- On this task, with this budget and these workers, the coordination
  mechanism added cost without a measurable primary-metric gain.

## What failed

- The improvement hypothesis. This is a negative result and it is
  retained, not hidden.

## What remains unknown

- Whether receipts help on harder tasks, larger budgets, or with
  heterogeneous workers (all workers here ran the identical algorithm).
- Whether the small speed advantage in C is real or noise (n=10 is
  small; the primary rule was not met).
- Whether receipt overhead scales acceptably with more workers or
  larger validation sets.

## Method notes (honest labels)

- Workers are deterministic algorithmic workers (seeded random search),
  not AI scientists. This tested the coordination mechanism, not
  autonomous discovery.
- The experiment ran offline by the researcher on pinned bytes
  (EXPERIMENT.PIN). The receiver did NOT execute the experiment code:
  arbitrary submitted-code execution is disabled (isolation verdict
  2026-09-27), and the room's code is not a byte-pinned
  receiver-trusted fixture. The receiver's role here is serving frozen
  artifacts and gating state-changing actions — which is what the room
  demonstrates.
- The package acceptance path was exercised honestly: a candidate
  package for the room's evidence was evaluated with
  backend/package_acceptance.evaluate_package; K3 refused execution
  (STUDY_EXECUTION_DISABLED) because the bytes are not a trusted
  fixture pin. That refusal is the correct behavior and is recorded in
  the evidence manifest.
- No paid model calls. No wet-lab. No uploaded papers are cited as
  support for anything.

## Artifacts

- Protocol (frozen): PROTOCOL.md (pre-stamp sha256
  2ba607e0eb6166b28fa4d83130448e0632b1bd0e1cced752380e5c20e2fbffe3)
- Experiment (pinned): experiment.py (5a45c7add6646d60613c301d089b131ddf13e922b8c9db5e2dd55de6c61a40a8)
- Results: results/cond_{A,B,C}_rep_{1..10}.json, results/aggregate.json
- Evidence manifest: EVIDENCE-MANIFEST.json (every artifact hashed)
- Room: ROOM.json; schema: research/rooms/MANIFEST-SCHEMA.md
