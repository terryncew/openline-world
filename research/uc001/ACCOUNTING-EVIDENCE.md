# UNATTENDED-COMMISSION-001 — accounting evidence (2026-09-27)

Produced by `research/uc001/demo_uc001.py` against a real `World` with real
joined custody clients (`_Client`: owner root key, worker key, bounded
mandate, proof-of-control ceremony), worker-signed presentations for the
gated actions, and owner root-key signatures over the frozen contract.
Per-scenario JSON in `research/uc001/evidence/`; frozen terms in
`research/uc001/evidence/CONTRACT-frozen.json`.

The demo job: buyer Alice commissions seller Bob's worker to summarize a
harbor log into a tide report. Frozen rates: `readings.scan` 5c/unit,
`summary.write` 20c/unit. Cap 1000c, success fee 500c, deadline +1h.
All amounts are integer cents of **simulated** funds. Cost events are never
presented as provider invoices.

## The six demonstrations

**1. Accepted.** Recorded 35c (3 scans + 1 write) → seller payout 535c
(35c costs + 500c fee), buyer released 965c. Payee: bob (frozen contract).

**2. Rejected.** Deliverable missing the required "2.43 m" → receiver
rejects. Seller payout 35c (recorded costs only, no fee), buyer released
1465c. The rejection path is the same settlement function with
`accepted=false`.

**3. Cost cap.** A 1000c event on top of 500c recorded → refused with
`COMMISSION_COST_CAP_EXCEEDED`; the commission transitions to
`stopped_cap` and settles costs-only: seller 500c, buyer released 1000c.
Further gated work refused (`COMMISSION_NOT_ACTIVE`).

**4. Revocation.** Buyer revokes with her owner root key after 15c of
authorized work is recorded. Next gated cost report → refused
`COMMISSION_REVOKED`. Settlement: seller 15c (incurred authorized costs
under the frozen contract), buyer released 1485c.

**5. Crash/retry.** Same idempotency keys replayed for a cost event, a
commission start, and a submit: `replayed: true`, one cost event, one
reservation, one settlement id — balances byte-identical before and after
the retries.

**6. Altered terms / payee / costs.** An authorization signature over a
different contract sha → `COMMISSION_AUTHORIZATION_INVALID`. A cost event
claiming 10000c for 15c of contract-priced work settles at 15c. The
settlement payee is the frozen contract's `seller_id` regardless of
message contents.

## Reconciliation

Actual costs, seller compensation, released funds, and net balances are
shown separately in each scenario's `accounting` block (see the JSON).
Final ledger: 13 entries (1 fund, 6 reserves, 6 settles), buyer balance
17850c, seller balance 2150c, from 20000c of simulated funding. Every
cent is traceable to a reservation or a recorded cost event.

## What this does not claim

- No submitted worker code executes (isolation verdict 2026-09-27):
  accounting is deterministic receiver arithmetic over frozen rates.
- The simulated cost events are not provider invoices and the reservation
  is not proof that real provider billing is capped.
- Two profiles on one machine ≠ independent adoption; physical phone
  untested.
