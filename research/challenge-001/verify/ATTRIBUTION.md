# Who ran the CHALLENGE-001 Phase-1 demo

Plain statement, no hedging.

The demo (`verify/run_demo.py`, evidence `verify/evidence/demo-evidence.json`)
was run on 2026-09-28 by the agent runtime that built Phase 1 — an
internally operated Muse subagent on the same Linux VM as the server.

The three "participants" (owner, contrib-a, contrib-b) are three invocations
of `verify/client.py`, a deterministic demo script. They are separate
processes with separate key directories and separate bearer tokens, going
through the real ceremony (keygen, wallet, mandate grant, join, delegate,
signed presentation, gated action) against the real HTTP server on loopback.
They are NOT independent operators, NOT remote agents, and NOT separate
machines. No human acted as a participant. No agent outside this runtime
took part.

What this demonstrates: the machinery works end to end — custody ceremony,
gates, K1–K7 structural admission, evaluator decisions, the five frozen
controls, restart persistence, idempotent replay, the credit cascade
(explicit byte-bound reuse chains, owner-signed claim linkage, the
unauthorized-correction control, and an authorized correction whose
reassessment is computed by the claim graph's existing engine —
QUARANTINE on the corrected review's claims, UNAFFECTED on the patch
and the independent control, original bytes and decisions preserved).
What it does NOT demonstrate: independent adoption, remote operation, or
the protocol surviving contact with a party this runtime does not
control. That is the explicit next step in
`research/challenge-001/BLOCKERS.md`.

Credit note: the recorded attribution is never proof of ownership,
never deserved compensation, and never a claim of scientific truth. It
is the evaluator's public record of what was accepted and what was
reused. The correction event in the cascade scenario is a deliberate
demonstration of the authorized-correction mechanism, not a claim that
the review's finding was wrong.
