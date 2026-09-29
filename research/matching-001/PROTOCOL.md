# MATCHING-001 — Frozen Protocol

**Status: FROZEN 2026-09-28 (before any history was recorded or any
evaluation outcome existed). This document must not be edited after the
freeze commit. Corrections after the freeze go into the terminal report
as deviations, never into this file.**

## 1. Question

Can evidence-informed helper selection improve buyer outcomes after
failed attempts and matching costs, while leaving capable sellers with
positive net earnings?

## 2. Design summary

- **Job class (one, narrow):** `tide-report`. Task text:
  `[tide-report] Summarize the {harbor} harbor log into a tide report.`
  Deliverable: short text report. Acceptance (frozen per contract,
  mechanically checkable by the receiver):
  `required_substrings = [harbor name, "{height} m"]`,
  `forbidden_substrings = []`, `max_bytes = 4096`.
- **Workers:** 6 deterministic simulated workers (labeled
  `deterministic-simulated` everywhere). Each has a fixed fact table
  (harbor -> height string or absent), a posted per-unit rate, a fixed
  execution cost per attempt, and honest self-reported coverage
  (harbors with table entries), EXCEPT mw-s6 (see below).
  A worker passes a task iff its table entry equals the true height
  exactly. A worker with no entry for a task's harbor declines the
  contract (refuses authorization) and explains why.
- **mw-s6 (adversarial controls in one worker):** posts tide-report
  offers at the second-cheapest rate claiming coverage of all harbors,
  but holds zero tide-report fact entries and declines every
  tide-report contract. It has 2 recorded ACCEPTED commissions in job
  class `weather-report` (irrelevant-history control).
- **Fixtures:** generated once from seed `20260928` (generator:
  `fixtures.py`, output: `fixtures.json`). The draw was not tuned to
  favor either selector; the seed was fixed before any outcome existed.

### 2.1 Harbor pool (true heights, fixed)

| # | harbor | true height | pool |
|---|--------|-------------|------|
| 1 | harbor | 2.43 m | history |
| 2 | marina | 1.87 m | history |
| 3 | cove | 3.12 m | history |
| 4 | inlet | 0.95 m | history |
| 5 | bay | 4.20 m | history |
| 6 | quay | 2.05 m | history |
| 7 | dock | 1.44 m | history |
| 8 | pier | 3.66 m | history |
| 9 | jetty | 2.78 m | history |
| 10 | wharf | 1.19 m | history |
| 11 | anchorage | 5.02 m | history |
| 12 | lagoon | 0.61 m | history |
| 13 | roads | 3.35 m | evaluation |
| 14 | haven | 2.90 m | evaluation |
| 15 | sound | 4.47 m | evaluation |
| 16 | strait | 1.58 m | evaluation |
| 17 | channel | 2.21 m | evaluation |
| 18 | basin | 3.83 m | evaluation |
| 19 | pool | 0.84 m | evaluation |
| 20 | reach | 2.67 m | evaluation |
| 21 | arm | 4.95 m | evaluation |
| 22 | bight | 1.32 m | evaluation |
| 23 | firth | 3.08 m | evaluation |
| 24 | gulf | 2.14 m | evaluation |

### 2.2 Worker population (from the seeded draw)

| worker | posted rate (c/unit) | units | attempt price (c) | exec cost (c/attempt) | fact entries | correct | stale |
|--------|----------------------|-------|-------------------|-----------------------|--------------|---------|-------|
| mw-s1 | 10 | 4 | 40 | 30 | 18 | 9 | 9 |
| mw-s2 | 6 | 4 | 24 | 18 | 17 | 9 | 8 |
| mw-s3 | 18 | 4 | 72 | 40 | 20 | 16 | 4 |
| mw-s4 | 30 | 4 | 120 | 60 | 14 | 11 | 3 |
| mw-s5 | 45 | 4 | 180 | 90 | 18 | 12 | 6 |
| mw-s6 | 8 | 4 | 32 | 20 | 0 | 0 | 0 |

Full fact tables are in `fixtures.json` (frozen). mw-s6 advertises
tide-report coverage of all 24 harbors but holds none and declines all
tide-report contracts.

## 3. Phases

### Phase 1 — History (recorded attempts, separate jobs)

Buyer `mw-buyer-hist` commissions each of mw-s1..mw-s5 on 4 history-pool
tasks each (harbors drawn from the worker's advertised coverage with
seed 20260928, disjoint from evaluation). mw-s6 completes 2
`weather-report` commissions (accepted). All 22 commissions run through
the real World commission machinery (propose -> authorize -> fund ->
start -> report costs -> submit deliverable -> settle). Outcomes are
recorded; nothing is invented.

### Phase 2 — Evaluation (held-out, matched trials)

- 8 blocks x 6 tasks = 48 tasks per policy. Each block's 6 tasks are
  drawn (seed 20260928, fixed list in `eval_tasks.json`) from the
  evaluation pool. Both policies face the SAME task list in the SAME
  order (matched).
- Buyers `mw-buyer-A` and `mw-buyer-B` each get an identical session:
  ceiling 40000c simulated, funded up front.
- The evidence cutoff is the timestamp when history recording ended.
  Selector B may only use commissions with `started_at` before the
  cutoff and job class `tide-report`.
- Retry limit: 2 contract attempts per task. A selection that ends in
  worker decline costs the matching fee but not an attempt.
- Any unexpected exception during an attempt -> task recorded
  `unresolved`; the effect is never repeated (idempotency keys make
  retries safe).

## 4. Contract and loss boundaries (frozen before work)

- **Who pays for rejected attempts:** the buyer. Settlement is
  costs-only on rejection: the seller keeps recorded authorized costs,
  the success fee is not paid, the buyer is released the remainder.
- **Terms per attempt:** `permitted_operations = [{op: "report.write",
  rate_cents: worker's posted rate}]`, 4 units -> reimbursement =
  4 x rate, capped by `max_cost_cents = 4 x rate`.
  `success_fee_cents = 300` payable ONLY on acceptance.
- **Matching fee:** 5c per selection decision, explicitly simulated,
  recorded in the session ledger (not in the commission). Charged even
  when the worker declines.
- **Session ceiling:** 40000c per policy session covering attempts,
  retries, reservations, and matching fees. The runner reserves
  (attempt price + success fee + matching fee) before each selection
  and refuses the selection if the reserve would breach the ceiling.
- **Stop conditions:** reserve breach, buyer revocation, or task
  deadline -> stop, record reason.
- **Frozen acceptance:** the acceptance criteria are part of the frozen
  dual-signed contract. Neither worker nor buyer may rewrite them
  after seeing the result (control C6 tests this).

## 5. Selectors (frozen code in `selectors.py`)

### Policy A — cheapest-eligible-first

Eligible offers: workers advertising coverage of the task's harbor
(self-reported; includes mw-s6's unverifiable claim) whose reserve
(price + 300 + 5) fits the remaining session budget. Rank by attempt
price ascending. Attempt the cheapest; on rejection or decline, move
to the next cheapest untried worker for that task (within the 2-attempt
limit). If none eligible -> decline the task with reason.

### Policy B — evidence-informed

For each worker with >= 3 recorded `tide-report` attempts before the
cutoff: `p = Wilson lower bound (95%)` of accepted/attempts.
`expected_cost_per_accepted = (price + 5) / p + 300`. Rank ascending.
Workers with < 3 tide-report attempts, or with history only in other
job classes, are labeled `insufficient history` and are NEVER selected
by B in this run (predeclared rule). B selects the top-ranked worker
whose reserve fits the remaining budget. If no evidence-ranked worker
is defensible within the budget -> B declines the task and records the
reason. On rejection/decline, B re-ranks excluding tried workers
(within the 2-attempt limit). B has no access to evaluation outcomes;
its history query is cut off before evaluation starts.

### What B shows per selection (inspectable reasons)

`selection_reasons.jsonl`: task id, policy, candidate workers, for each:
price, n_attempts, n_accepted (tide-report, pre-cutoff), Wilson lower
bound, expected cost per accepted, rank position or exclusion reason
(`insufficient history`, `irrelevant class history`, `over budget`,
`already tried`, `declined before`), chosen worker, reserve made,
reason text.

## 6. Verdict rule (predeclared, before any outcome)

B improves buyer outcomes IFF:

    accepted_B >= accepted_A
    AND (total_buyer_spending_B / accepted_B) < (total_buyer_spending_A / accepted_A)

- `total_buyer_spending` = recorded attempt costs kept by sellers +
  success fees paid + matching fees. (Reserve releases are not spending.)
- If `accepted_B < accepted_A` -> verdict is NO IMPROVEMENT regardless
  of cost (declining everything is not rewarded).
- Tie on both -> NO DIFFERENCE.
- Reported on pooled totals across the 8 blocks, with per-block
  mean +/- spread of the cost-per-accepted difference as the
  uncertainty statement. Sensitivity: recompute the verdict under
  matching fee {0, 20c} and success fee {150, 600c}; execution costs
  x2 for the seller-net question. Report whether the verdict flips.

## 7. Measurements (both policies)

Per policy: offered jobs; accepted jobs; acceptance rate (Wilson CI);
total buyer spending (c); cost per accepted result (c); buyer spending
on jobs that never produced an accepted result (c); matching overhead
(c); simulated fees (c); declined tasks; unfinished tasks.
Per worker per policy: attempts, accepted, revenue (c), execution
costs (c), net earnings (c).
Question answered from the seller table: did capable sellers (those
with >= 3 accepted evaluation tasks) finish with positive net earnings?

## 8. Controls

- C1 missing history: mw-s6 (0 tide-report records) -> B must label
  `insufficient history` and never select it; A's interaction with it
  is recorded.
- C2 irrelevant history: mw-s6's 2 weather-report accepts exist in the
  record; assert B's evidence query excludes them.
- C3 repeated failures: the seeded draw gives cheap workers substantial
  stale entries; B's Wilson bound must reflect the recorded rejects.
- C4 no affordable suitable offer: micro-budget control session
  (ceiling 10c, below any attempt cost): both selectors must decline
  with reason and spend 0c.
- C5 budget enforcement: the runner asserts reserved+spent never
  exceeds the session ceiling; any breach aborts the run as a failure.
- C6 frozen criteria: after a rejection, a new contract with relaxed
  acceptance gets a different contract_id; the original commission's
  acceptance record is immutable; the deliverable cannot be
  re-adjudicated under the new criteria.
- C7 no duplicate settlement: re-submitting with the same idempotency
  key replays the single recorded settlement; the ledger holds exactly
  one settle entry per commission.

## 9. Claim ceiling (on every output)

Internal simulated market evidence only. This does not establish real
demand, independent counterparties, sustainable seller income, or
profitable arbitrage. Workers are deterministic simulated fixtures;
funds are simulated; there is no real marketplace or payment system.

## 10. Freeze record

- Fixture seed: 20260928. Fixture tables: `fixtures.json`
  (sha256 93e5d37826df0b38f315c66964e43858ca397d7142a02025292b714274f514c5).
- Evaluation task list: `eval_tasks.json`
  (sha256 5e2696fd902cbbbb05b84585c14853a16797201a713054dbf8af91965056543a).
- Selector + runner code: `m1_selectors.py`, `runner.py`, `run_all.py`,
  `main.py`, `analyze.py` (frozen at the freeze commit; no logic changes
  after).
- History cutoff timestamp recorded in `history/manifest.json`.
- Freeze commit:  (filled at commit time).
