# CHALLENGE-001

A small coding challenge run on an independent receiver. Fix a bug, write
a failing test, or review someone's work — as text. Nothing you submit is
ever executed on the server.

**Preparation is underway. Enrollment is not open.**

## The task

A deliberately broken toy app (`client/toy-app/ledger.py`) has exactly
three documented bugs: an off-by-one, wrong rounding, and mishandled
empty input. Contribute **one** of:

1. **patch** — a unified diff (as text) fixing one bug
2. **test** — one failing-test file (as text) demonstrating one bug
3. **review** — a text review of an existing contribution with a checkable finding

Frozen criteria: `client/CHALLENGE-CRITERIA-001.md` (2026-09-28). Machine
checks verify a submission's *shape*, not its truth. The challenge owner
accepts or declines with a checkable reason. Deadline: 2026-10-12.

## Board snapshot (2026-09-29)

| Contribution | Kind | Status |
|---|---|---|
| CHC-0001 | patch | declined (verification probe, not a real submission) |
| CHC-0002 | review | admitted — transport verification probe, awaiting evaluation |

Four refusal records on the board: RFS-0001 (live-verification probe,
malformed review, structural check K6) and RFS-0002…RFS-0004 (three K6
refusals from the trust-anchor migration probe's debugging, all labeled).
The board is public and credential-free.

## Participate

Participants connect to the receiver over TLS anchored at a
pilot-specific root certificate. **You do not install anything
system-wide**: the client trusts the published root for this one
connection only, and still checks the full certificate chain, the
certificate's validity period, and the exact server address.

The trust anchor is published as an **owner-signed announcement** —
verify its signature against the owner public key from your invitation
before trusting it.

[How to join & submit →](PARTICIPATE.md)

Reading this page required no private trust root and no account. Only
the submission path uses the pilot trust anchor.

## Separate tracks

ERROR HUNT is a separate challenge. It is pending its frozen preflight
verdict and is not open for participation.
