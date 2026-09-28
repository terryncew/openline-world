# DIAGNOSIS-S11 — REPLACE-WORKER-002 settlement reconciliation

Failing run preserved: `evidence/run-002-20260928T064102Z.json`
(terminal_verdict FAIL-other, failure "AssertionError: 565").
Date: 2026-09-28. The run is preserved as-is; nothing in it was re-edited.

## What failed

S11 asserted `bal_seller == 2565`; the actual seller balance was 565.
(The assert message "565" is the observed balance.)

## Ledger-derived reconciliation (from `backend/world.py`, not from expectations)

Opening state: `simulated_balances = {}` (world.py). No opening balances.

| # | Ledger event | Effect | Buyer | Seller |
|---|---|---|---|---|
| 1 | `fund` (S3) | buyer +2000 | 2000 | 0 |
| 2 | `reserve` (S3 `commission_start`: max_cost 1000 + fee 500 = 1500) | buyer −1500 | 500 | 0 |
| 3 | cost events (S4: 35c, S10: 30c) | accounting only, no balance moves (`commission_report_cost`) | 500 | 0 |
| 4 | `settle` (S10, accepted; `settle_amounts`: payout = 65+500 = 565, release = 1500−565 = 935) | seller +565, buyer +935 | 1435 | 565 |
| 5 | replayed submit (S11) | idempotent, no new entries | 1435 | 565 |

Checks the contract requires:
- Conservation: 1435 + 565 = 2000 = total funded. No money created or destroyed.
- Reserve split: 565 + 935 = 1500 = reserved.
- Payout composition: 65 recorded (35 A + 30 B, none omitted) + 500 success fee = 565.
- Single settlement: replay returned `replayed=True` with the same settlement id;
  `_commission_settle` is idempotent, so no duplicate credit is possible.

## Root cause: script arithmetic, not a mechanism defect

The demo funds **only the buyer** (S3: `fund_simulated("buyer", …, 2000)`).
The seller's opening balance is therefore 0, and the correct final seller
balance is 0 + 565 = 565. The script's 2565 (and the same figure in the
frozen PROTOCOL-002.md accounting line) assumed a 2000 opening seller
balance that this run never created.

## Correction applied (demo2.py only)

- S11/S12: expect `bal_seller == 565`, with the ledger derivation in a
  comment, plus an explicit conservation assert
  (`bal_buyer + bal_seller == 2000`).
- The buyer's 1435 expectation was already correct and is unchanged.
- PROTOCOL-002.md stays frozen; this file documents the correction to its
  derived accounting line. The protocol's mechanism assertions P1–P11 are
  unaffected.

## Also added on rerun (per review)

- S10 `S10-checkpoint-used`: B's completion must share ≥2 distinctive
  content words with A's checkpoint partial, proving incorporation rather
  than fresh generation on the same topic. Both texts are recorded in
  evidence on PASS.
- Failure handler now captures a traceback and pre-S11 balances/ledger
  into the evidence file.
