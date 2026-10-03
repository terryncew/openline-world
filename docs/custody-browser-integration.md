# Browser-owner custody integration

Branch `browser-owner-custody` (from `separate-key-custody` @ `24f664d`).
The demonstrated headless custody result is unchanged; this lane migrates the
town UI's owner flow onto the same proven custody interface.

## What changed

The browser town flow previously depended on server-generated participant
keys. Now each participant's keys are generated and held in their own browser
profile:

- **Owner vault** (owner-root + epoch keys) and **worker vault** (worker key):
  Ed25519 keys persisted as JWK in separate IndexedDB records per browser
  profile, re-imported non-extractable for in-memory signing. (This Firefox
  build's `structuredClone` cannot clone Ed25519 CryptoKeys — observed in the
  2026-09-26 two-profile run, so keys are persisted as JWK rather than as
  non-extractable stored CryptoKeys. The profile boundary is the isolation;
  same-origin script in the profile is one trust domain; enforcement is
  server-side and cryptographic.)
- **Join ceremony** = the owner tap: keygen, mandate grant, owner-signed
  bundle, worker-signed proof-of-control. The server verifies the bundle
  against the pinned owner root and the presentation against the worker key.
- **Every gated act** (offer, propose, accept, agree, submit, correct,
  newsroom import/review) goes through `CustodyClient`: fetch a receiver
  challenge, worker-sign the presentation, send. No presentation-less path
  remains in `api.ts` — the dead methods were removed.
- **Revocation** is an explicit owner gesture: the owner signs the revocation
  in the local wallet, then pushes the new bundle. Permanent within the
  session; completed settlements are not undone.

The server holds exactly one Ed25519 key: its own receiver gate key.

## Isolation actually achieved

Same-origin JavaScript is one trust domain, stated plainly. The boundaries
that hold are cryptographic and server-enforced, not DOM-enforced:

- The worker path can only reach `exportBundle()` — a root-signed attestation
  of already-committed state (bundles travel to the server in the clear
  anyway). `grant`, `narrow`, and `revoke` are wired only to explicit
  owner-gesture click handlers and are never called by worker-path code.
- Bundles verify only against the owner root key; presentations only against
  the worker key; mandate changes only via root/epoch-signed events. A
  compromised worker key cannot mint a mandate; a stolen bundle cannot act.
- Keys are held per browser profile in IndexedDB (JWK) and never appear in
  logs, receipts, captures, or exports. In-memory signing keys are imported
  non-extractable.

Two browser profiles on one machine hold fully separate key stores (separate
IndexedDB). That is process-and-store separation, not machine separation,
and does not establish independent outside adoption.

## Key persistence and loss

- Keys persist across reloads in IndexedDB. A reload re-runs the join
  ceremony against the existing keys (fast path, no new identity) and takes a
  fresh token.
- `crypto.subtle` requires a secure context. On plain `http://` LAN origins
  (not a secure context) the module throws `SECURE_CONTEXT_REQUIRED` — there
  is deliberately **no server-side fallback**. The preview launcher documents
  the `--https` path for the phone.
- **Lost keys are not recoverable and are never silently replaced.** If the
  wallet record exists but the keys are gone, join fails loudly and the UI
  shows the failure. A new identity requires an explicit fresh ceremony.
- Session tokens live in `sessionStorage` and die with the tab; keys live in
  IndexedDB and survive it.

## Freshness

The 300s standing-freshness rule is retained. When freshness cannot be
established the UI shows HOLD through the existing `holdOrError` path —
`CustodyError` carries the backend's reason codes (`HOLD_STANDING_UNKNOWN`,
`WORLD_AUTHORITY_STALE`, `MANDATE_REVOKED`, `WORLD_AUTHORIZATION_MISSING`).

## Custody / access map

| Process / store | Holds | Never holds |
|---|---|---|
| World server (one process) | Its own receiver-gate Ed25519 key; per participant only the pinned owner principal id + root public key, worker public key, mandate id + scopes, latest verified authority bundle, Bearer `<redacted>`, public world state | Any owner private key, any worker private key, any wallet |
| Browser profile A (IndexedDB `openline-custody` + sessionStorage) | A's owner-root + epoch private keys (JWK), A's worker private key (JWK), A's wallet state, A's session bearer (tab lifetime) | B's keys, the server's gate key |
| Browser profile B | B's keys + wallet + bearer, same shape | A's keys, the server's gate key |

The worker code path can reach exactly one owner-side operation:
`exportBundle()` — a root-signed attestation of already-committed state.
Grant, narrow, and revoke are wired only to explicit owner-gesture click
handlers. Server-side cryptography is the enforcement: bundles verify only
against the pinned owner root, presentations only against the worker key,
mandate changes only via root/epoch-signed events.

## Running it

Backend (from the repo root): `python3 backend/server.py --port 8471`
Frontend: `cd frontend && npm exec vite -- --port 5173 --host 127.0.0.1`
Two-profile flow (needs Xvfb on :99):
`DISPLAY=:99 ~/workspace/.venvs/workshop/bin/python ~/workspace/qa/custody-browser/two-profile-flow.py`
Backend tests: `cd backend && ~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests`

## Verification

- Byte-compatibility: the TypeScript canonical-JSON / Ed25519 port was
  verified byte-for-byte against Python's `canonical_json` (8 vectors,
  including astral/unicode/control chars), and a TS-made signature verifies
  under Python's `verify_record`.
- Backend: existing custody tests untouched and green; no new backend
  behavior was needed — the browser speaks the same protocol the headless
  clients proved.
- Two-profile user flow (Playwright, two isolated contexts):
  `~/workspace/qa/custody-browser/two-profile-flow.py` — join → authorize →
  exchange → settle → receipt → revoke → refused post-revocation action →
  other profile continues → reload persistence (keys survive; agreements and
  settlement unchanged, no duplicate effects). **Mobile viewport (450×800):
  11/12 green; desktop viewport (1280×800): 12/13 green (2026-09-26,
  verified by rerun)**: A joins, B joins, distinct participants server-side,
  A's offer posts, B proposes, A agrees, receiver settles, receipt visible,
  A's post-revocation `proposeAction` returns STOPPED/MANDATE_REVOKED
  (matching the 24f664d headless demo's "gated action" check), B unaffected,
  B's IndexedDB `openline-custody` persists across reload with agreements
  and settlement unchanged. The one failure is a pre-existing React DOM race
  (`Node.removeChild: The node to be removed is not a child of this node`),
  confirmed present on the base commit `24f664d` without this lane — not
  introduced here; all custody behavior checks pass.
- Negative battery (the primary acceptance criterion),
  `~/workspace/qa/custody-browser/negative-battery.py`, real town UI, real
  receiver, **12/12 green (2026-09-26)**:
  - **N1 — silent identity recreation: refused loudly in the tested flow.**
    Partial key loss (keys wiped, wallet survives): re-entry refused in the
    UI ("Could not enter … will not be silently replaced"), server
    participant set unchanged. Full key loss (whole `openline-custody`
    DB gone): the fresh ceremony reuses the stored participant id and the
    server rejects the rejoin with `JOIN_STANDING_NOT_CURRENT` — no
    replacement identity was minted in the tested flow. Scope: two Firefox
    contexts, one machine, single run 2026-09-26.
  - **N2 — presence-inferred authority: no presentation-less path succeeded
    in the tested flow.** A live session + presence with no worker-signed
    presentation: token-only offer refused (409, no listing created). B's
    worker-signed presentation submitted under A's participant: refused as
    a binding mismatch. No server key-creation/fallback endpoint exists
    (`/api/world/keygen`, `/api/world/keys` → 404). A properly worker-signed
    offer is still allowed — the check is not a blanket ban. Scope: two
    Firefox contexts, one machine, single run 2026-09-26.
  - **N3 — post-reload revocation bypass: refused by the real receiver in the
    tested flow.** After owner A's explicit revocation: full page reload,
    re-enter with the same browser-held keys restores the SAME participant
    (no replacement identity); the next gated act is refused by the real
    receiver (`STOPPED` — `MANDATE_REVOKED` pre-reload; `MANDATE_UNKNOWN`
    post-reload, because the reloaded wallet presents no mandate id. Both
    are the receiver's explicit refusal, never a bypass). The UI form path
    fails loudly ("Posting failed"), creating no listing, no identity, no
    mandate. Scope: two Firefox contexts, one machine, single run
    2026-09-26.
- Headless custody demo preserved and rerun unchanged:
  `clients/demo_custody.py --launch` — **19/19 checks green**.

## Session restoration across reload

The visitor's participant id persists in `localStorage`
(`world-visitor-participant-id`) and is reused on re-entry — a reload no
longer orphans the identity's listings and agreements with a fresh random
id. If the server still holds the session (same tab, token in
`sessionStorage`), the client reuses the bearer token instead of failing
on `JOIN_STANDING_NOT_CURRENT`. Leaving the square forgets the id. If the
keys are gone from IndexedDB, join fails loudly (`keys-missing`) — the
identity is never silently replaced.
