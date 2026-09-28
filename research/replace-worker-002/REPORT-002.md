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

## Checkpoint evidence (tightened)

What was supplied to B: A's partial text verbatim (sha256
`f9bf1a25e27106809f6a79863a4418f2900c59e332918d9cc9a9671204ea6906`,
recorded at S4-checkpoint) plus the recorded-cost figure "35c of a
1000c budget" in prose. The hex digest itself was not sent to the
provider; the content it digests was. It entered B's input in the
user-role message of the chat-completions call, after the header
"Partial text from the checkpoint:", between `---` delimiters; the
cost figure followed in the next sentence. The system message carried
only the resumption context, no checkpoint content.

Concrete dependencies of B's completion on A's partial work
(verified against the recorded texts, not inferred):
1. B's completion opens with A's three partial sentences
   word-for-word (`completed_b.startswith(partial_a)` is true).
2. B's closing sentence cites "a total cost of 35c incurred" — the
   checkpoint figure from the handoff prompt. B's own recorded costs
   were 30c, recorded after generation, so the 35c could only have
   come from the checkpoint input.

The 20-shared-distinctive-words overlap (`S10-checkpoint-used`) is
supporting evidence only. Same commission id, same frozen contract
sha throughout.

## Providers, models, access

- Worker A: `openai/gpt-4o-mini`; Worker B: `meta/llama-4-scout`.
- Both called through the Vercel AI Gateway OpenAI-compatible chat
  completions endpoint, authenticated per request with the stored
  `custom.vercel-ai-gateway` credential via the surrogate helper (no
  raw key in code, logs, or evidence). One attempt each; no retries
  needed on the passing run.
- Access mode: work-product text generation only. The providers held
  no keys, took no actions, and saw nothing of the contract, mandates,
  or settlement beyond the task prompt and the checkpoint text.

## Costs: simulated vs measured

The 65c are **simulated recorded costs**: receiver-computed from the
frozen contract's rate table (readings.scan 5c/unit, summary.write
20c/unit) via `commission_report_cost` — 35c by A (3 scan + 1 write),
30c by B (2 scan + 1 write). Separately, measured provider usage
reported by the gateway: A 93 prompt / 44 completion tokens, B 196
prompt / 100 completion tokens. Token usage was not converted to cost
in this run; the two figures are independent.

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

`548a7fb` on branch `work/replace-worker-002` — mechanism
(`backend/world.py`, `backend/server.py`) plus
`research/replace-worker-002/` (protocol, report, demo, both evidence
runs, S11 diagnosis). Release and commercial assets untouched.
