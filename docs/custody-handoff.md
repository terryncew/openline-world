# Separate participant key custody — handoff

Branch `separate-key-custody`. The world server no longer holds any owner or
agent private keys. Two isolated Python participant clients drive a full
exchange through the existing world, including revocation and refusal.

## What each process can access

- **World server** (`backend/server.py`): exactly one Ed25519 key — its own
  receiver gate key (`world-receiver`), persisted in `backend/data/world/`
  (git-ignored). Per participant it holds ONLY: pinned owner principal id +
  root public key, worker public key, mandate id + scopes, the latest verified
  owner-signed authority bundle, Bearer <redacted>, public world state.
- **Participant client A / B** (`clients/participant.py`, one process + key
  dir each): owner root private key, worker private key, owner wallet
  (grant/revoke/export), latest exported bundle, Bearer <redacted> (memory
  only). Every authorization is signed client-side.
- Bearer <redacted> are session authentication, not authority: every gated
  action additionally requires a worker-signed presentation.

## Launch

Requires Python 3.12, no new dependencies (stdlib + vendored wallet).

Terminal 1 — server (loopback only):
  WORLD_DATA_DIR=/tmp/custody-data python3 backend/server.py
  # port via WORKSHOP_PORT (default 8471)

Terminal 2 and 3 — the two clients (separate key dirs):
  python3 clients/demo_custody.py --server http://127.0.0.1:8471
  # or all-in-one: clients/launch-custody-demo.sh [port]
  # keys go to temp dirs (demo) or clients/keys/<participant>/ (manual)

The scripted demo (`clients/demo_custody.py --launch`) does everything:
join ceremonies, offer -> agreement -> settle, negative checks, revoke-A,
restart durability, custody map. 19/19 checks. Transcript:
`captures/custody-demo-transcript.txt`.

## Test results

- Backend: 126/126 green (`python -m pytest tests/` in `backend/`).
  Pre-change 142 included 16 tests for the deleted in-process worker; the
  custody regression class covers: cross-participant binding refusal, altered
  bindings, missing authorization (explicit, never silent), replay refusal,
  revocation isolates the revoked worker (B unaffected), restart preserves
  revocation + transactions, idempotent settlement, stale-authority submit.
- Demo: 19/19 checks green, verified from a clean history-free extraction.

## Measured, not claimed

- Revocation-propagation interval (local `wallet.revoke` -> admitted
  `authority/refresh`): ~0.014-0.026s on loopback in the demo runs.
  Revocation is NOT instant across a network: the owner's refresh must reach
  and be admitted by the world. No cross-network measurement was made.
- Disclosure: all processes ran on one machine for developer-preview
  purposes. Custody separation is by process + key dir, not by machine.
  Independent outside adoption is untested.

## Boundaries honored

- Join proves key control (worker-signed nonce + owner-signed bundle); it
  grants no action permission.
- Each owner authorizes its own side at its explicit act (offer /
  propose_agreement / agree); the receiver evaluates immediately and signs a
  receipt; submit re-checks the authority head hasn't moved.
- Standing freshness: 300s, stale -> HOLD, never assumed.
- The browser town is NOT migrated in this lane
  (`docs/custody-migration-note.md`). `launch-preview.sh` is the prior lane's
  artifact. No new scenery, ranking, payments, public hosting, or publication.
