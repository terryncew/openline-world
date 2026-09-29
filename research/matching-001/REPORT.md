# MATCHING-001 — Terminal Report

**Question:** Can evidence-informed helper selection improve buyer
outcomes after failed attempts and matching costs, while leaving
capable sellers with positive net earnings?

**Verdict: NO IMPROVEMENT (negative result, preserved).**
Policy B (evidence-informed) accepted the same number of jobs as
policy A (34/48 each) at a slightly higher cost per accepted result
(399.9c vs 393.3c). The per-block cost-per-accepted difference
(A minus B) was -6.7c +/- 1.1c across all 8 matched blocks: B was
consistently, slightly more expensive. The predeclared rule
(accepted_B >= accepted_A AND lower cost per accepted) is not met.

## Metric table (both policies, 48 offered jobs each)

| metric | A: cheapest-eligible-first | B: evidence-informed |
|---|---|---|
| accepted jobs | 34 / 48 (70.8%, CI95 56.8-81.8%) | 34 / 48 (70.8%, CI95 56.8-81.8%) |
| declined jobs | 0 | 0 |
| unfinished jobs | 14 | 14 |
| unresolved jobs | 0 | 0 |
| total buyer spending | 13,373c | 13,598c |
| cost per accepted result | 393.3c | 399.9c |
| buyer spending on jobs never accepted | 1,298c | 1,228c |
| matching overhead (5c/selection) | 485c (97 selections) | 390c (78 selections) |
| selections | 97 | 78 |

Task-level spend reconciles exactly with the world ledger
(buyer balance movement + matching fees); the analysis asserts this.

## Seller accounting (per policy)

| worker | A: att/acc | A: revenue | A: exec cost | A: net | B: att/acc | B: revenue | B: exec cost | B: net |
|---|---|---|---|---|---|---|---|---|
| mw-s1 | 27/5 | 2,580c | 810c | +1,770c | 35/5 | 2,900c | 1,050c | +1,850c |
| mw-s2 | 31/21 | 7,044c | 558c | +6,486c | 31/21 | 7,044c | 558c | +6,486c |
| mw-s3 | 12/8 | 3,264c | 480c | +2,784c | 12/8 | 3,264c | 480c | +2,784c |
| mw-s4 | 0/0 | 0 | 0 | 0 | 0/0 | 0 | 0 | 0 |
| mw-s5 | 0/0 | 0 | 0 | 0 | 0/0 | 0 | 0 | 0 |
| mw-s6 | 0 attempts (27 declines) | 0 | 0 | 0 | never selected | 0 | 0 | 0 |

Capable sellers (>= 3 accepted evaluation tasks): mw-s1, mw-s2, mw-s3.
All finished with positive net earnings under both policies. Note the
other side of the same coin: mw-s4 and mw-s5, the two most expensive
workers, received zero selections under either policy -- their coverage
overlapped cheaper workers everywhere, so the market never reached them.

## Why B did not win (observed, not tuned)

1. **History was thin.** With 4 recorded attempts per worker, the Wilson
   95% lower bound compresses hard (2/4 -> 0.15, 3/4 -> 0.30), so B's
   expected-cost ranking could barely separate the cheap-but-stale
   workers from the accurate ones.
2. **B over-weighted mw-s1.** B selected mw-s1 35 times (vs A's 27) on
   its 3/4 history; mw-s1's held-out accuracy disappointed (5/35),
   erasing B's matching-fee advantage.
3. **A's failure mode was cheap.** A burned 27 selections on mw-s6's
   declines (135c of its 485c overhead) but its retry fell through to
   workers that were cheap enough that failures cost little.
4. **Coverage dominated.** For most tasks only 2-3 workers had entries;
   both policies usually chose among the same small set.

## Sensitivity

The verdict flips only when the matching fee is high (20c/selection):
B makes fewer selections (78 vs 97), so expensive matching favors B.

| matching fee | success fee | A cpa | B cpa | B-wins holds |
|---|---|---|---|---|
| 0c | 150c | 229.1c | 238.5c | no |
| 0c | 600c | 679.1c | 688.5c | no |
| 20c | 150c | 286.1c | 284.4c | **yes** |
| 20c | 600c | 736.1c | 734.4c | **yes** |

Execution costs x2 would halve seller nets but leave every capable
seller positive; it does not affect the buyer verdict.

## Controls

- **C1 missing history:** mw-s6 (0 tide-report records) was labeled
  `insufficient history` in every B candidate row and never selected
  by B. A selected it 27 times; all 27 declined.
- **C2 irrelevant history:** mw-s6's 2 accepted weather-report
  commissions exist in the record; B's evidence rows show
  `other_class_history_n: 2` with the tide-report count at 0 and the
  exclusion reason `insufficient history (...); other-class history
  ignored`.
- **C3 repeated failures:** the seeded draw gave cheap workers ~50%
  stale entries; B's Wilson bounds (e.g. mw-s2 2/4 -> 0.15) reflect the
  recorded rejects.
- **C4 no affordable suitable offer:** 10c-budget sessions for both
  policies declined with reason and spent 0c. PASS.
- **C5 budget enforcement:** inline reserve checks held for every
  selection; all buyer balances non-negative; the 40,000c ceiling was
  never breached. PASS.
- **C6 frozen criteria:** a relaxed-acceptance contract for the same
  task produced a different contract_id; tampered authorization was
  refused (COMMISSION_AUTHORIZATION_INVALID); the original rejected
  commission's acceptance record is immutable. PASS.
- **C7 no duplicate settlement:** resubmission with the same
  idempotency key and identical text replayed the single recorded
  settlement; exactly one settle ledger entry per commission. (A
  resubmission with *different* text under the same key is correctly a
  WORLD_IDEMPOTENCY_CONFLICT.) PASS.

## Deviations from the frozen protocol

Two bugs were found and fixed in the *control harness* (not in the
frozen selectors, fixtures, or evaluation path); the evaluation was
re-run from scratch with identical seeds and reproduced the same
outcomes bit-for-bit before the fix was accepted:

1. `control_c4` double-funded the buyer (10c directly + 10c via
   `run_policy` under different idempotency keys). Removed the direct
   funding.
2. `control_c7` resubmitted different deliverable text under the same
   idempotency key (correctly a conflict, not a replay). Changed to
   resubmit the recorded text.

No selector, fixture, task-list, or protocol logic changed after the
freeze commit 5dfa2a4.

## Artifacts

- Frozen protocol: `research/matching-001/PROTOCOL.md`
- Fixtures: `fixtures.json` (seed 20260928), `eval_tasks.json`
- Code: `m1_selectors.py`, `runner.py`, `run_all.py`, `main.py`,
  `analyze.py` (frozen at 5dfa2a4; `main.py` has the two control-harness
  fixes above, committed separately)
- Data: `research/matching-001/data/` (world snapshot with all 22
  history + evaluation commissions), `history/manifest.json`
- Reasons: `selection_reasons.jsonl` (one row per selection with
  evidence/uncertainty or exclusion reason)
- Results: `results.json`, `analysis.json`

## Claim ceiling

Internal simulated market evidence only. This does not establish real
demand, independent counterparties, sustainable seller income, or
profitable arbitrage. Workers are deterministic simulated fixtures;
funds are simulated; there is no real marketplace or payment system.
