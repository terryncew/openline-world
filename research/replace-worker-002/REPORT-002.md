# REPLACE-WORKER-002 — Report

Take two. The worker was replaced. The job was kept.

## Verdict: PASS

P1–P11 all held on the passing run
(`evidence/run-002-20260928T070343Z.json`).
001 stays FAIL; this run does not rewrite it.

## What happened

One commission, one frozen contract, two workers from two providers.
Worker A (openai/gpt-4o-mini) wrote the first half of a harbor tide
report and recorded 35c. The owner revoked A, then replaced A with
Worker B (meta/llama-4-scout) through the new public
`World.replace_worker` path: owner root-key signature over the
replacement intent (binding participant, old worker, old mandate, new
worker key, authority head sequence, delegated scopes) plus B's
proof of key control over a server-issued nonce.

B inspected the checkpoint through `commission_describe` (digest
unchanged, 35c intact), finished the report from A's partial, and
submitted. The receiver evaluated the deliverable against the frozen
acceptance criteria: accepted. The buyer's independent verification
confirmed the required facts.

Checkpoint incorporation is measured, not assumed: B's completion
shares 20 distinctive content words with A's partial
(`S10-checkpoint-used`). Same commission id, same frozen contract
sha, cumulative recorded costs 65c = 35c + 30c.

## Adversarial results

- Unauthorized replacement (forged owner signature): refused,
  `REPLACEMENT_OWNER_SIGNATURE_INVALID`, state unchanged.
- Stale replacement (intent bound to a superseded authority head):
  refused, `REPLACEMENT_HEAD_STALE`.
- Replay of the completed replacement: refused,
  `REPLACEMENT_UNKNOWN_WORKER`.
- A returns: old bearer token fails (`WORLD_AUTH_MISMATCH`); plain
  rejoin still refused (`JOIN_STANDING_NOT_CURRENT`) — join not weakened.
- Restart after replacement: new session authenticates, old token
  fails, replacement record persists, commission intact.
- Submit retry after settlement: replayed, same settlement id, no
  second settlement. Restart after settlement: balances unchanged,
  one settle ledger entry.

## Accounting reconciliation

From the recorded ledger (simulated funds; `settle_amounts` from the
frozen contract):

| Event | Buyer | Seller |
|---|---|---|
| Fund (buyer only, 2000c) | 2000 | 0 |
| Reserve (max_cost 1000 + fee 500) | 500 | 0 |
| Recorded costs 35c (A) + 30c (B) | 500 | 0 |
| Settle, accepted: payout 65+500=565, release 1500−565=935 | 1435 | 565 |

Conservation: 1435 + 565 = 2000 = total funded. Reserve split:
565 + 935 = 1500. No omitted costs, no duplicate settlement.

Correction: the first run failed S11 on the seller balance (actual
565, script expected 2565). Diagnosis in
`evidence/DIAGNOSIS-S11.md`: the script assumed a 2000c opening seller
balance; the demo funds only the buyer, so the seller opens at 0 and
the contract payout (565c) is the whole final balance. The mechanism
followed the contract exactly; the expectation was wrong. The failing
run is preserved (`run-002-20260928T064102Z.json`). This corrects the
derived accounting line in PROTOCOL-002.md (P11); the protocol's
mechanism assertions are unaffected and the protocol file itself stays
frozen.

## Signed decision records

In the passing evidence file under `signed_decision_records`:
seller session receipts (action, decision, signature prefix),
the `worker_replacements[0]` record (old/new agent, mandate ids,
owner signature prefix, head sequence 3), and the settlement
(`stl-5e91e103a9bc7375`, payout 565c, release 935c, payee seller).

## Limitations

- Simulated funds, not real settlement. One scripted commission, one
  contract shape, one receiver.
- Provider text generation only: the providers wrote the report text;
  all authority, money, and acceptance decisions stayed in the local
  mechanism.
- The checkpoint-incorporation check is textual overlap (20 shared
  distinctive words), not a semantic proof of continuation.
- `replace_worker` is exercised through the Python API on this
  branch; the HTTP route is added but the run did not go through it.
- No claim about other contracts, other scopes, or concurrent
  replacements.

## Commit

TBD — mechanism (`backend/world.py`, `backend/server.py`) plus
`research/replace-worker-002/` (protocol, report, demo, both evidence
runs, S11 diagnosis) on branch `work/replace-worker-002`.
Release and commercial assets untouched.
