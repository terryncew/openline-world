# Bureau consequence-history report — bounded evidence, 2026-09-26/27

**Status: reported reconciled, pending record review.** Figures below
are reconciled against the preserved records by
`research/bureau/recalculate.py`; the records themselves await his
review.

**Bureau is a downstream consumer of World's existing evidence.** It reads
records; it grants nothing, assesses nothing, and insures nothing. This
report is a bounded evidence summary, not an insurance product: no agent
score, no ranking, no premium estimate, no coverage badge, no insurer
integration.

**Operator disclosure.** These are internally operated demonstrations.
Bureau and World share an operator. Nothing here is an independent
assessment, and nothing here should be read as one.

**Simulated funds.** Every monetary figure in this report is simulated
(labeled `simulated: true` in the records). Simulated exposure is kept
separate from real money throughout. No real money moved.

## 1. Scope

Observation period: 2026-09-26 through 2026-09-27 (UTC), four lanes:

| Lane | Commit | Receiver(s) | What ran |
|---|---|---|---|
| separate-key-custody | `24f664d` | World receiver (gate key) | Headless two-client custody demo, 19/19 checks |
| browser-owner-custody | `58a05a2` + `190487d` | Same receiver, town UI | Two-profile browser flow; 12/12 negative battery |
| research-commons-001 | `9348110` | Newsroom/receiver admission gate | 5 frozen controls; 27/27 browser QA battery |
| isolation-verification | `f3b934b` | Same gate (canary intake) | 5 canary probes through the genuine intake path |
| unattended-commission-001 | `1a424d8` | Commission accounting in World | 6 demonstrations, frozen contract |

Receivers: one World receiver (Ed25519 gate key) throughout; the newsroom
admission gate for research packages; the commission settlement path for
accounting. All runs local; all clients operated by the same operator on
one machine.

## 2. Outcome counts (each with its denominator; categories not merged)

### Custody — headless demo (`captures/custody-demo-transcript.txt`, 19 checks)

| Outcome | Count | Denominator |
|---|---|---|
| Proposed (offer + agreement submitted) | 2 | 2 submission attempts |
| Allowed (gated presentations admitted) | 7 | 12 evaluated presentations |
| Refused (STOPPED / rejected presentations) | 5 | 12 evaluated presentations |
| Settled (settlement records; 1 settlement, confirmed 4× with no duplicates) | 4 | 4 settlement queries |
| Accepted / Rejected (admission verdicts) | 0 | 0 admission evaluations in this lane |
| Unresolved | 0 | 19 checks |

Refusal verdicts observed: altered binding refused; missing authorization
refused (`WORLD_AUTHORIZATION_MISSING`); replayed presentation refused;
A's post-revocation action `STOPPED`/`MANDATE_REVOKED`; same after restart.

### Custody — browser two-profile flow (real town UI, real receiver)

| Outcome | Count | Denominator |
|---|---|---|
| Proposed (offer + agreement) | 2 | 2 |
| Allowed (join A, join B, offer, propose, agree) | 5 | 6 gated actions |
| Refused (A's post-revocation action, `STOPPED`/`MANDATE_REVOKED`) | 1 | 6 gated actions |
| Settled | 1 | 1 agreement |
| Receipt inspected | 1 | 1 settlement |

Behavior checks green in both viewports (mobile 11/11, desktop 12/12);
one pre-existing React DOM race failed in both viewports, confirmed present
on the base commit — not custody-related.

### Custody — negative battery (`negative-battery.py`, 12/12, real town UI)

| Outcome | Count | Denominator |
|---|---|---|
| Refused (N1a partial key loss; N1b full key loss `JOIN_STANDING_NOT_CURRENT`; N2a token-only offer 409; N2b foreign presentation binding mismatch; N2c keygen endpoints 404; N3 post-reload `STOPPED`/`MANDATE_UNKNOWN`; N3 UI loud failure) | 7 | 12 checks |
| Allowed (N2d worker-signed offer still allowed — not a blanket ban) | 1 | 12 checks |
| Informational (setup joins; N3 identity restored, same participant) | 4 | 12 checks |

Post-reload nuance preserved: pre-reload refusal is
`STOPPED`/`MANDATE_REVOKED`; post-reload is `STOPPED`/`MANDATE_UNKNOWN`
(the reloaded wallet presents no mandate id). Both are the receiver's
explicit refusal.

### Research commons — five frozen controls

| Control | Verdict | State |
|---|---|---|
| C1 pass (conforming package) | `ALLOWED`, 7/7 criteria, `ACCEPTED` | 1 accepted / 1 submitted |
| C2 genuine failure (1 byte in expected_result) | `STOPPED` / `PACKAGE_ACCEPTANCE_FAILED` / `CRITERION_FAILED_K3` | 1 rejected / 1 submitted |
| C3 altered artifact (1 byte flipped, declared hash = original pin) | `STOPPED` / `ARTIFACT_HASH_MISMATCH` (declared ≠ pinned) | 1 refused / 1 submitted |
| C4 producer self-approval | conforming package `ALLOWED` on its merits; the attestation is stripped before evaluation and appears in no record; a failing package + attestation is `STOPPED` / `PACKAGE_ACCEPTANCE_FAILED` (cannot rescue) | 1 accepted / 1 submitted |
| C5 unauthorized publication | only the accepted dispatch displayed | 1 refused / 1 submitted |

Totals: proposed 5, accepted 2 (C1, C4), rejected 1 (C2), refused 2 (C3 binding mismatch, C5 unauthorized publication), unresolved 0.
Browser QA battery: 27/27 green (28 check calls, one in an if/else branch).

### Correction history

Receiver owner posted `CORRECTED` on the harbor-log source via gated
`claimgraph.correct`: the package's inference claim and the gauge quote
claim went to `QUARANTINE` (engine's term for support-path loss); the
independent control Report B stayed `UNAFFECTED`. Original package bytes
and the acceptance record are byte-identical before and after — history
re-assessed, never rewritten.

### Isolation canaries (genuine intake path, `research/bureau/records/`)

| Canary | Result |
|---|---|
| R1 read file outside permitted inputs | Escaped — read succeeded |
| R2 read repo file outside inputs | Escaped — read succeeded |
| W1 write outside workspace (`/tmp`) | Escaped — file written |
| A1 receiver data dir | Escaped — listable, readable, writable |
| N1 controlled loopback listener | Escaped — listener received `CANARY-HELLO` |

5 of 5 escape routes open. The study ran as uid 0 — the receiver's own
identity. (One early network attempt hit `ConnectionRefused` on listener
timing; the controlled-listener run succeeded and is the recorded result.)
Both canary packages were `STOPPED` at intake (`PACKAGE_ACCEPTANCE_FAILED`
/ `CRITERION_FAILED_K3`) — the canary's stdout was still captured in the
acceptance record's `sandbox` section, which is how the escape was
observed.

Verdict applied per the precommitted fork: arbitrary submitted-code
execution disabled (`STUDY_EXECUTION_DISABLED`; `TRUSTED_FIXTURE_PINS`
gate). The verdict was decisive: all five escape routes open, so
disabling arbitrary submitted-code execution was the right response.
The product can admit research packages under defined checks but has
not demonstrated safe execution of arbitrary research code. K3 is
trusted-fixture reproduction. The limits (CPU 10s, mem 256MB, wall 15s,
stdout cap) are real and recorded — they bound cost, not
access. `9348110`'s admission, binding, controls, and correction results
stand unchanged; only the claim about who may supply executable studies
changed.

### Unattended commission — six demonstrations (frozen contract:
max_cost 1000c, success fee 500c, reservation 1500c per commission)

| Demo | Deliverable | Settlement |
|---|---|---|
| 1 accepted | accepted | seller 535c (35 + 500 fee), buyer released 965c |
| 2 rejected | rejected | seller 35c (costs only), buyer released 1465c |
| 3 cost cap | n/a (`stopped_cap`) | cost event refused `COMMISSION_COST_CAP_EXCEEDED`; seller 500c, buyer released 1000c |
| 4 revocation | n/a (`revoked`) | next op refused `COMMISSION_REVOKED`; seller 15c incurred, buyer released 1485c |
| 5 crash/retry | accepted | 3 replays `replayed: true`; balances byte-identical |
| 6 altered | accepted | bad-sha authorization refused `COMMISSION_AUTHORIZATION_INVALID`; 10000c claim settles at 15c; payee immutable (frozen `seller_id`) |

Totals: proposed 6, deliverables submitted 6, terminal outcomes accepted 3
(demos 1, 5, 6), rejected 1 (demo 2), `stopped_cap` 1 (demo 3,
`COMMISSION_COST_CAP_EXCEEDED` → costs-only settlement), `revoked` 1
(demo 4, `COMMISSION_REVOKED` → 15c incurred costs accounted).
Settled 6, refused gated ops 3, unresolved 0. "Settled" is the ledger
state — every demonstration reached a settle entry — not a success
verdict. The `on_unknown_outcome` rule exists in the frozen contract but
no unknown outcome occurred.

## 3. Authorized limits, simulated costs, payments, released reservations

All figures simulated cents, from `research/uc001/evidence/`:

- Simulated funding: 20,000c (1 fund entry, alice).
- Reserved: 6 × 1,500c = 9,000c (6 reserve entries).
- Recorded simulated execution costs: 650c total (35 + 35 + 500 + 15 + 50 + 15).
- Seller payouts: 2,150c total (535 + 35 + 500 + 15 + 550 + 515). This
  total INCLUDES the 650c execution-cost reimbursement: 650c recorded
  costs reimbursed + 1,500c seller compensation (3 accepted
  deliverables × 500c success fees). Fees check: payouts − costs =
  500 + 0 + 0 + 0 + 500 + 500 = 1,500c.
- Released to buyer: 6,850c total (965 + 1,465 + 1,000 + 1,485 + 950 + 985).
- Final balances: buyer 17,850c, seller 2,150c. Conservation check:
  17,850 + 2,150 = 20,000c. Every cent traces to a reservation or a
  recorded cost event (13 ledger entries: 1 fund, 6 reserves, 6 settles).
- No dev-allowance expenditure records exist in this lineage's preserved
  records; authorized limits are drawn from the UC-001 frozen contracts.

Cost events are never provider invoices; the reservation is not proof that
real provider billing is capped. Both statements appear in the code, the
UI, and the evidence doc.

## 4. Revocation timing, correction history, missing/incomplete records

- **Revocation timing:** custody headless demo measured 0.014s from local
  wallet revoke to server admission of `authority/refresh` on loopback —
  stated as NOT instant, no cross-network claim. The browser lane observed
  the same order of magnitude. No cross-device or cross-network timing was
  measured.
- **Correction history:** one `CORRECTED` posted (research commons, above);
  two claims `QUARANTINE`, one control `UNAFFECTED`, originals
  byte-identical.
- **Missing or incomplete records:**
  - No physical-phone testing was done (desktop browser emulation only).
  - Two browser profiles on one machine: not independent adoption, not
    hardened process/device isolation.
  - No unknown-outcome case occurred: the `on_unknown_outcome` rule
    ("unresolved until reconciled; never repeat an effect or charge") is
    specified in the frozen contract but untested in practice.
  - Loss data: not measured. No losses occurred in simulated funds; this
    is "not measured," never "zero losses."
  - The canary probe scripts and raw evidence lived in `/tmp` (ephemeral)
    and are preserved as read-only copies in `research/bureau/records/`.
  - The negative battery's evidence is its script plus the documented
    verdict table; no separate machine-readable run log was kept.

## 5. Trace and reproducible calculation

Every number above is recomputed from the preserved records by
`research/bureau/recalculate.py`:

```
python3 research/bureau/recalculate.py
```

The script is read-only over the source records and exits non-zero if any
asserted figure does not match. It covers: the 19-check custody
transcript (outcome classification by keyword, auditable in the script),
the 0.014s revocation timing, the 12 negative-battery checks, the 27
executed commons-battery checks, the canary escape evidence (5/5), the
13-entry ledger (1 fund / 6 reserves / 6 settles), per-demo accounting
(650c recorded, 2,150c payouts, 6,850c released, 17,850c/2,150c finals,
20,000c conservation), the frozen contract terms (1000c cap, 500c fee),
and the `simulated: true` flag on every demo's accounting.

Trace index (measurement → record):

| Measurement | Record |
|---|---|
| Custody outcomes, 0.014s revocation | `captures/custody-demo-transcript.txt` |
| Two-profile flow outcomes | `docs/custody-browser-integration.md` + `qa/custody-browser/two-profile-flow.py` |
| Negative battery 12/12, verdict codes | `docs/custody-browser-integration.md` + `qa/custody-browser/negative-battery.py` |
| Five controls, verdicts | `research/COMMONS-BRIEF.md`, `research/evaluation-20260926T233916Z.json`, `qa/research-commons/qa-battery.py` |
| Correction propagation | `research/correction-20260927T000442Z.json`, `research/ISOLATION-VERDICT-2026-09-27.md` |
| Canary escapes | `research/bureau/records/canary-evidence.json`, `research/bureau/records/canary-probe2.py` |
| Commission accounting | `research/uc001/evidence/CONTRACT-frozen.json`, `balances.json`, `demo1-6*.json`, `research/uc001/ACCOUNTING-EVIDENCE.md` |
| Test reconciliation | `docs/test-count-reconciliation.md` |
| Captures | `qa/custody-browser/custody-browser-take-450x800.mp4`, `qa/research-commons/research-commons-take-450x800.mp4`, `qa/uc001/uc001-take-450x800.mp4` |

## 6. Standing limits (stated in the report itself)

- Refusals alone do not establish safety. The lanes demonstrate that
  specific refused paths returned specific verdict codes in single runs;
  they do not show what an untested path would do.
- Signatures do not establish completeness, factual truth, or damages. A
  signed receipt proves a receiver made a decision on pinned bytes; it
  does not prove the bytes are true, the record set is complete, or any
  loss figure.
- Missing loss data means "not measured," never "zero losses."
- Acceptance under K1–K7 means "passed these named checks under these
  conditions" — structural checks only, not scientific truth, not peer
  review, not RSI.

## 7. Questions the available evidence cannot answer

1. Would revocation propagate in time across a real network? Only
   loopback timing (0.014s) was measured; cross-network behavior is
   untested.
2. Would the receiver's refusal behavior hold under adversarial load or
   concurrent conflicting presentations? All demonstrations were
   sequential single runs.
3. What happens on a genuinely unknown outcome (crash mid-settlement with
   no replay key)? The frozen rule is specified; no such case occurred.
4. Would an independent operator's receiver reach the same verdicts?
   Bureau and World share an operator; no independent assessment exists.
5. Are there loss or cost events outside the recorded ledger? No
   independent ledger exists; "not measured," not zero.
6. Does browser-profile key custody resist a malicious same-origin script
   or device compromise? Not tested; two profiles shared one machine.
7. Do the K1–K7 structural checks correlate with claim truth? By design
   they do not verify truth; no evidence here addresses the correlation.
