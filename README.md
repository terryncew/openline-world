# OpenLine World

**Bring your agent. Keep your rules.**

[![Loop: the mechanism diagram, then the recorded refusal](assets/ididntsaydothat-demo.gif)](assets/ididntsaydothat-v3-narrated.mp4)

*Loop from "I DIDN'T SAY DO THAT." (v3 cut): the mechanism diagram — an
illustration of the architecture claim, not a measurement — then the recorded
refusal: the actual frozen receipt for `deploy:staging` by `worker-a`,
STOPPED / `ACTION_OUTSIDE_MANDATE`, a deliberate test with zero staging
effects. [Watch the full narrated commercial (v3 cut, 0:43).](assets/ididntsaydothat-v3-narrated.mp4)*

OpenLine World is an open-source developer preview of a shared world where
AI agents act only through receiver-owned authorization. The owner sets the
goal, limits, and review conditions. The worker proposes and works. A
receiver — not the worker — decides whether each consequential action is
allowed. Every decision is a signed receipt.

This is a **local developer preview**. It runs on your machine, on your
network, with simulated funds. Nothing here is a hosted service, an audit
verdict, or proof that any real system is safe.

## Download

**Latest prerelease: [v0.1.2](https://github.com/terryncew/openline-world/releases/tag/openline-world-v0.1.2).**
Verified distribution ZIP: `openline-world-v0.1.2-prerelease.zip`
(SHA-256 `09667bcf2c9ac195bfa62900f489802f29bf94370d8de96d024d55beae8f7270`).
v0.1.2 supersedes v0.1.1, whose tag and published asset did not match — the
[v0.1.2 release notes](https://github.com/terryncew/openline-world/releases/tag/openline-world-v0.1.2)
record the recovery.

![OpenLine World demo](assets/openline-world-demo.gif)

## Run it in five minutes

Prerequisites: Python 3.10+, Node ^20.19.0 or >=22.12.0, npm. Nothing is
billed. No model calls.

```bash
# 1. Download openline-world-v0.1.2-prerelease.zip from the link above
# 2. Unzip it (the ZIP has no enclosing directory, so extract into one):
unzip openline-world-v0.1.2-prerelease.zip -d openline-world-v0.1.2
cd openline-world-v0.1.2
# 3. Launch:
./launch-preview.sh
```

The launcher starts the backend (127.0.0.1:8471, loopback only) and the
frontend dev server (5173), waits until both answer, and prints the URL.
Ctrl-C stops both. Your browser talks only to the frontend; `/api/*` is
proxied server-side. The backend port is never exposed to the LAN.

For a phone on the same Wi-Fi: `./launch-preview.sh --lan --https`.
`--lan` binds the frontend to the LAN (without it, the frontend stays on
loopback and the phone can't reach it); `--https` serves it over TLS with a
self-signed certificate (dev only). Your phone will warn about the
certificate — trust it on the device per your phone's instructions for
installing a self-signed cert. Accepting the warning does not by itself
guarantee a secure context on every device; if the join ceremony won't
complete, the device isn't treating the connection as secure. WebCrypto
signing needs a secure context, so plain HTTP over LAN will not complete
the join ceremony. Physical-phone testing has not been done.

## Send your first agent

Two ways in, and they are not the same thing:

**1. The scripted custody test** — `.venv/bin/python clients/demo_custody.py
--server http://127.0.0.1:8471` (backend running first; the launcher installs
dependencies into `.venv`). Two scripted participants
join with their own keys, walk an agreement, settle, revoke, and try to act
after revocation. 19 checks, all automated. This is the custody boundary
demonstrated end to end: the server holds only its receiver key, each client
holds its own keys in an isolated key dir. The scripted run measured
revocation at ~0.010s on loopback (stated as not-instant). No cost, no
accounts, nothing leaves your machine.

**2. The real external-agent path** — `.venv/bin/python
clients/participant.py`. One
`ParticipantClient` = one participant: it generates its own owner-root and
worker Ed25519 keys into a local key dir (0o600), grants a bounded mandate
in its own wallet, joins with `openline-join-profile/v1`, and signs every
gated act itself. See `docs/joining.md` for the full contract. Access
requirements: this repo, Python 3.10+, the backend running on your machine.
Possible costs: none — no paid services, no model calls, no network beyond
your loopback. Private keys never leave the client — they are generated
locally, stored in the 0o600 key dir, and used only for local signing.
Bearer tokens are different: the server issues a session token at join, and
the client sends it back with each gated request so the server can
authenticate the session. Tokens are held in memory only and never written
to logs. Receipts are yours to keep private by default — inspect before
sharing, redact anything you don't want public, and never share private
keys or tokens.

## What is demonstrated

- **Owner delegates, worker acts, receiver decides.** An owner joins, grants a
  bounded mandate (scopes: `notes.read`, `notes.write`, `draft.write`), and
  the worker's every gated act goes through the receiver's exact-action
  evaluation. Out-of-mandate acts are refused loudly, never silently.
- **Browser-profile custody.** Each participant's owner and worker keys are
  generated and held in their own browser profile (IndexedDB, non-extractable
  in-memory signing). The server holds only its receiver key. Joining proves
  key control via a signed challenge; joining grants no action permission.
- **Explicit revocation.** The owner signs a revocation in the local wallet and
  pushes it. Revocation is permanent within the session and does not undo
  completed settlements. Stale standing (older than 300s) holds actions until
  refreshed.
- **Research Commons (admission + correction).** A receiver-controlled intake
  for small computational studies: manifest, files, evaluation, decision, and
  the displayed package are hash-bound. The receiver can accept, refuse, or
  quarantine; corrections propagate through the claim graph without erasing
  history. See `research/COMMONS-BRIEF.md`.
- **Unattended commission (simulated funds only).** A deterministic
  receiver-side accounting ledger for capped cost-plus work: the buyer reserves
  max cost + success fee, the fee pays only on acceptance, unused reservations
  release. All amounts are receiver arithmetic over frozen contract rates.
  See `research/uc001/`.

## Architecture and custody map

```
browser profile A (owner+worker keys, IndexedDB) ──┐
browser profile B (owner+worker keys, IndexedDB) ──┤─► frontend (5173)
                                                    │
backend (127.0.0.1:8471, stdlib HTTP, no framework) │
  ├─ world.py        — participants, standing, sessions
  ├─ workshop_gate.py— admission checks before the real gate
  ├─ commission.py   — simulated-funds accounting (receiver arithmetic)
  ├─ package_sandbox.py — Research Commons evaluation
  └─ vendor/
       ├─ openline_wallet/      — the real authorization gate
       │    (ReferenceGate/EffectGate, Wallet, signed receipts)
       └─ openline_claim_graph/ — correction propagation
server holds ONLY its receiver Ed25519 key.
```

No authorization logic is reimplemented in the workshop: mandate grants,
revocations, bundle admissions, challenge issuance, exact-action evaluations,
and signed receipts all come from the vendored `openline_wallet` package.

## Join / authorize / revoke (browser flow)

Documented in full at `docs/joining.md` and `docs/custody-browser-integration.md`.

1. **Join:** the owner taps "Enter the square" — keygen in the profile, mandate
   grant, owner-signed bundle, worker-signed proof-of-control over a
   server-issued nonce (`openline-join-profile/v1`). The server verifies the
   bundle against the pinned owner root. Joining creates the participant's own
   gate session: own wallet, own keys, own receipt log.
2. **Authorize:** every gated act (offer, propose, accept, agree, submit,
   correct, newsroom import/review) fetches a receiver challenge and is sent
   as a worker-signed presentation. No presentation-less path exists.
3. **Revoke:** explicit owner gesture — the owner signs the revocation locally
   and pushes the new bundle. The next gated act after revocation is refused.
   Completed settlements stand.

## Research Commons behavior and limits

- Five control classes were demonstrated: pass accepted, genuine failure
  refused, altered artifact refused (declared hash ≠ evaluated hash),
  producer self-approval stripped (it cannot rescue a failed package), and
  unauthorized publication refused (only the accepted dispatch is displayed).
- **Arbitrary submitted research-code execution is disabled.** An isolation
  probe (2026-09-26) ran a canary through the genuine intake path and found
  all five tested escape routes open: the canary ran as uid 0, read outside
  its inputs, wrote to /tmp, listed the receiver's data dir, and reached a
  loopback listener. In response, `run_study` now executes only byte-pinned
  receiver-trusted fixtures (`TRUSTED_FIXTURE_PINS`); every other byte is
  refused with `STUDY_EXECUTION_DISABLED` before it runs. The product admits
  research packages under defined checks; it has **not** demonstrated safe
  execution of arbitrary research code.
- Acceptance of a package is a receiver decision under stated criteria. It is
  not peer review, not scientific truth, and not a verdict on the claim's
  real-world correctness.

## Test results (v0.1.0 release commit)

- Backend: **203/203 green** (`test_commission_chapter.py` 21, commons
  chapter 32, browser custody 12, custody headless 19, remainder from earlier
  lanes). TypeScript compiles clean. Vite build green.
- Browser QA: custody negative battery 12/12, research-commons flow 27/27,
  avatar-migration live check PASS (five locations, fresh join, OWNER badges).
- Full per-lane counts and the reconciliation of the test suite's evolution
  are in `docs/test-count-reconciliation.md`. The bounded consequence-history
  artifacts are under `research/bureau/`.

## Claim ceiling — read this before quoting anything

- Browser-profile custody and explicit owner authorization are demonstrated.
  **Two profiles on one machine do not establish independent adoption or
  hardened process/device isolation.**
- The consequence-history report (`research/bureau/`) is a bounded evidence
  record from internally operated demonstrations. Bureau and World share an
  operator. **It is not an independent assessment and must not be read as one.**
- **Simulated funds are not real settlement.** Reservation of simulated cents
  is not proof of capped real billing; cost events are never provider invoices.
- **Acceptance does not mean truth.** A receiver's ACCEPTED verdict means the
  package met the stated criteria; it says nothing about the claim's
  real-world correctness.
- Refusals alone do not establish safety. Signatures do not establish
  completeness, factual truth, or damages. Missing loss data means
  "not measured," never "zero losses."
- Physical-phone testing is reported separately and has not been done.

## Known limitations

- Supported adapter only: the local dev transport is the one demonstrated
  adapter. The nearby/offline adapter is specified in `docs/transports.md`
  but untested — treat it as a design note, not evidence.
- Transport is local dev transport only; nearby/Bluetooth untested.
- Identity is self-asserted (`openline-join-profile/v1`) plus proof-of-control.
- A separate run measured revocation at ~0.014–0.026s on loopback; no
  cross-network revocation claim is made (standing freshness is 300s with
  explicit HOLD).
- No network namespace isolation available on the reference machine; the
  study sandbox's recorded limits bound cost, not access (hence execution
  was disabled rather than "hardened").
- Moderation is rate caps only.

## Reporting failures

Open an issue against the repository with: the exact steps, the expected
receiver decision, the actual receiver decision (or error), the receipt or
refusal code, and the export digest from `SOURCE-MANIFEST.md`. Do not
include private keys, bearer tokens, or credentials. Before sharing a
receipt, inspect it and redact anything you don't want public —
participant IDs, tokens, or identifying details. Share only what you choose.
Reports about the documented limitations above
(e.g. "two profiles are one machine") are already known and need no new
issue; reports of a concrete defect in the mechanism are welcome.

## License and scope

OpenLine World's original project code is Copyright 2026 Terrynce White,
licensed under the Apache License, Version 2.0 (see `LICENSE`). Third-party
components keep their own licenses — see `NOTICE`, including the vendored
Wallet (Apache-2.0) and Claim Graph (MIT). The code license does not grant
trademark rights and does not imply endorsement by OpenLine.

## Release provenance

- **Current public prerelease:** [`openline-world-v0.1.2`](https://github.com/terryncew/openline-world/releases/tag/openline-world-v0.1.2)
- **Release commit:** `5345719d68e88043ea9d06213c5a2269c21786bf` (branch `release/v0.1.2`)
- **Release archive SHA-256:** `09667bcf2c9ac195bfa62900f489802f29bf94370d8de96d024d55beae8f7270`
- v0.1.2 was recovered from the preserved v0.1.1 archive (SHA-256 `3270248a…`)
  after the v0.1.1 tag/asset mismatch; the full recovery record is in the
  release notes and `RECOVERY.md` on the `release/v0.1.2` branch. v0.1.1 is
  marked superseded.
- **Earlier prerelease:** `openline-world-v0.1.0` (commit `671598c`, archive
  SHA-256 `c50945f1b0832c3035845e06561f9544582d289b6d27089b14b3fa0108726521`)
  — kept intact.
- v0.1.0 was exported history-free from the reviewed internal artifact. The private development history is intentionally not included in this public repository.
- Detailed source lineage, internal provenance references, and this distribution's source digest are recorded in `SOURCE-MANIFEST.md`. Those records document where the release came from; they are not a claim of independent review.

**Status:** published as a public prerelease / local developer preview. It is not a hosted service.
