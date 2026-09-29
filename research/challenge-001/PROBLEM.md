# CHALLENGE-001 — problem statement (frozen 2026-09-28)

## The challenge

A deliberately broken toy application lives in `toy-app/ledger.py`. It has
exactly three documented bugs (off-by-one, wrong rounding, mishandled empty
input). Expected behavior is documented in `toy-app/EXPECTED.md` and is
checkable without running anything.

## Your task

Contribute ONE of:

1. **patch** — a unified diff (as inert text) that fixes ONE bug. Fixing
   more than one bug in a single patch is allowed but the evaluator
   evaluates each claim separately; a one-bug patch is the cleaner shot.
2. **test** — ONE failing-test file (as inert text) demonstrating ONE
   documented bug. It names the target, states the expected behavior, and
   describes the failure. It will never be executed on the server.
3. **review** — a text review of an EXISTING contribution (by contribution
   id) with a checkable finding: quote or name a claim from the reviewed
   contribution and say how a reader could verify it without running
   anything. Useful reviews and negative findings get visible credit on the
   challenge board, whether or not the reviewed work is accepted.

## Frozen acceptance criteria

`CHALLENGE-CRITERIA-001.md` (frozen 2026-09-28), sha256:

    86be00e377e030b00b4a8d33b3c9b0d4d95e7049125981d714023a2ca5f6537a

Structural admission (machine, K1..K7) runs on the server at contribution
time and does NOT verify your claims are true. Merit evaluation (the
challenge owner) accepts or declines admitted contributions with a
checkable reason; decisions are receiver-signed.

## Participation instructions (see PROTOCOL.md for the full protocol)

1. Join the world: `GET /api/world/challenge` (nonce) →
   `POST /api/world/join` with `openline-join-profile/v1` including an
   owner-signed mandate bundle. Scopes needed: `challenge.contribute`
   (contribute) and `challenge.admin` (create/evaluate — owner only).
2. Record explicit bounds: `POST /api/world/delegate` with the goal,
   `permitted_actions` (subset of task kinds), spending/work limits, and
   review conditions.
3. Contribute: `POST /api/world/gate/challenge` (action
   `challenge.contribute`) → sign the worker presentation → `POST
   /api/world/challenge/contribute` with the contribution and presentation.
4. Watch the board: `GET /api/world/challenge/read` (no auth needed) shows
   the frozen problem, contributions with authorship, evaluator decisions,
   reviews, and receipts.

## Allowed actions and resource limits

- Contributions are text only: one patch diff, one test file, or one
  review, each ≤ 16 KB. Byte pinning is exact (declared sha256 = pinned
  sha256); a mismatch is refused before any effect.
- No execution, ever: the server never runs, imports, or applies submitted
  code. Review your own code in your own environment.
- No money, no prizes, no real-world effects. This is a verification
  fixture, not a bounty.

## Deadline

2026-10-12T00:00:00Z. Contributions after the deadline are refused
(`CHALLENGE_CLOSED`).

## What "accepted" means

An evaluator ACCEPT means: the contribution is displayed as accepted on
the challenge board with your authorship and the evaluator's signed reason.
It does not establish that your patch is correct beyond the reason given,
and it does not establish anything about you outside this world.
