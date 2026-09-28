# REPLACE-WORKER-002 — Protocol (frozen before the run)

Replace the worker. Keep the job. Take two.

## Question

Can an owner replace a revoked worker with a worker from a different
provider — same participant, same frozen contract, same checkpoint, same
budget — through an explicit owner-authorized path, without weakening
ordinary join, restoring the old worker's authority, or duplicating
payment?

## Pre-registered stop condition

Q0. If the frozen commission contract binds the specific worker key
(not just the participant id), STOP and report that constraint. Do not
proceed.

## Mechanism assertions (the new path)

P1. `replace_worker` succeeds through the public interface with the
owner's root-key signature over the replacement intent plus the new
worker's proof of key control. The new worker's session standing is
current; the old worker's session no longer exists.

P2. The old worker stays revoked: its mandate is not ACTIVE in the
bundle the replacement binds to. The new worker's mandate is a new
grant carrying exactly the explicitly delegated scopes — never the old
mandate.

P3. Unauthorized replacement (owner signature forged or absent) is
refused; world state is unchanged.

P4. Stale replacement (intent bound to a superseded authority head) is
refused.

P5. Replay of the completed replacement request is refused.

P6. `join()` is not weakened: a plain rejoin while a standing exists is
still refused (JOIN_STANDING_NOT_CURRENT), and the old worker's bearer
token no longer authenticates.

P7. Restart after replacement: the new worker's session authenticates
and can act; the old token fails; the worker_replacements record
persists; the commission (35c recorded, frozen digest) is intact.

## Continuity assertions (the job survives)

P8. The new worker inspects the checkpoint through the public
`commission_describe`: contract digest unchanged, recorded 35c intact.

P9. The new worker — a different provider (meta/llama-4-scout via the
Vercel AI Gateway; the first worker is openai/gpt-4o-mini) — completes
the work from the checkpoint. Its deliverable passes the frozen
acceptance criteria (receiver ALLOWED) and the buyer's independent
verification confirms the required facts.

P10. Settlement occurs exactly once: no duplicate spending, settlement,
or restored authority across the submit retry and the restart.

P11. Accounting reconciles: recorded 65c + 500c success fee = 565c
seller payout; buyer release 935c; final balances buyer 1435c / seller
2565c; reservations released exactly once.

## Provider terms (included access)

Both workers are real provider-backed agents called through the stored
Vercel AI Gateway credential. One retry per generation call. Persistent
provider failure is recorded as an access blocker: the mechanism
assertions stand or fall on their own evidence, and continuity is not
claimed without P9.

## Terminal verdicts

- PASS: P1–P11 all held.
- FAIL-mechanism-gap: a pre-registered mechanism assertion failed for a
  reason in the mechanism, not the demo.
- FAIL-other: anything else (including a provider access blocker that
  prevents P9).

## Boundaries

No mechanism changes during the run. No repo commits during the run.
No release or commercial assets touched. Scripted harness, simulated
funds, real provider text generation for the work product only.
