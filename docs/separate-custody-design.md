# Separate participant key custody — design contract

Branch: `separate-key-custody` (from `49f0b0a`). Goal: two participants interact
through the world without the world server holding their owner or agent private
keys. Reuse the vendored wallet/receiver machinery; no new protocol.

## Custody map (what each process holds)

- **World server**: exactly one Ed25519 key — its own receiver gate key
  (`world-receiver`). Per participant it holds ONLY: pinned owner principal id +
  root public key, the worker (agent) public key, the mandate id + scopes, the
  latest verified authority bundle (owner-signed), bearer tokens, and public
  world state. No owner private keys. No worker private keys. No wallets.
- **Participant client** (one isolated process + key dir per participant): the
  owner root private key, the worker private key, the owner wallet (grant /
  revoke / export), the latest exported bundle. It signs every authorization.
- The bearer token stays as session authentication / message carriage; gated
  actions additionally require a worker-signed presentation. The token is not
  authority.

## Backend changes (`backend/world.py`, `backend/server.py`)

- One server `EffectGate` (`gate_id="world-receiver"`), server key persisted in
  the snapshot. `pin_principal` per participant. `admit_bundle` per participant.
- `ParticipantSession` drops the WorkshopGate / owner wallet / helper keys /
  session dir. Fields: participant/agent ids + display names, token, kind,
  owner_principal_id, owner_root_public_key, worker_public_key, mandate_id,
  mandate_scopes, authority_bundle (latest verified), authority_head_hash,
  standing_checked_at, joined_at, presence, activity_mode, delegation, receipts.
- `join(profile)` requires: `owner: {principal_id, root_public_key}`,
  `mandate_bundle` (owner-signed wallet export), `mandate: {scopes}` matching
  the bundle's ACTIVE mandate for the subject, `agent.public_key` equal to that
  mandate's subject_public_key, `agent.id` equal to the mandate subject_id, and
  the existing worker proof-of-control (nonce signature, single-use, TTL).
  Server verifies the bundle signature (`verify_bundle`), checks the pinned
  principal/root, admits the head (monotonic; forks quarantine). Join proves
  key control; it grants no action permission.
- `POST /api/world/gate/challenge` `{participant_id, token, action}` ->
  `{challenge}`. Server calls `gate.issue_challenge(principal_id,
  subject_id=agent_id, action)`.
- Presentations: every gated call carries one. The world layer checks binding
  (`principal_id`, `subject_id`, `subject_public_key` match the session) and
  calls `gate.evaluate(presentation, expected_action=action)`; the receipt
  signature is verified against the server gate key. Missing presentation ->
  `WORLD_AUTHORIZATION_MISSING` (explicit, never silent allow).
- Authorization model: **each owner authorizes its own side at its explicit
  act; the receiver evaluates immediately and signs a receipt; execution
  re-checks that the authority head has not moved.**
  - `offer(..., authorization)`: poster's presentation evaluated at posting;
    ALLOWED receipt + presentation stored on the listing.
  - `need(...)`: no gate (a request, not an action). Auto-match attaches the
    need-poster's authorization evaluated at need time + the offer's stored
    receipt.
  - `propose_agreement(..., authorization)`: proposer's receipt stored.
  - `agree(..., authorization)`: counterpart's receipt stored. Agree stays
    consent; the stored receipt is the authorization artifact.
  - `accept_offer(..., authorization)`: acceptor's receipt evaluated now;
    poster's stored receipt reused.
  - `submit(...)`: no new presentation. Both stored receipts re-validated:
    each party's `authority_head_hash` must equal the head hash recorded at
    authorization time, else `WORLD_AUTHORITY_STALE` (re-authorize). Then the
    existing settlement runs.
  - `propose(..., presentation)`: generic single-action gate check, still
    available; used by claimgraph/newsroom paths and pre-checks.
- `POST /api/world/authority/refresh` `{participant_id, token, bundle}`: the
  owner submits an updated bundle after local grant/revoke/narrow. Server
  verifies the signature, requires principal+root to match the pinned values
  (`WORLD_AUTHORITY_PRINCIPAL_MISMATCH` otherwise), admits the new head
  (monotonic; `BUNDLE_HEAD_STALE` / `BUNDLE_FORK_QUARANTINED` surface as
  errors). Updates the session's bundle/head/mandate fields. If the mandate for
  the subject is now REVOKED (or absent), the session is marked revoked, the
  delegation status flips to "revoked", and a revocation envelope/event is
  emitted (same shape as the old server-side revoke). This is the revocation
  propagation path. **Revocation is not instant across the network: the owner
  revokes locally, then the refresh must reach and be admitted by the world.
  The demo measures this interval and states it.**
- `world.revoke` (server-side wallet revoke) is REMOVED. The deterministic
  in-process `AgentWorker` is REMOVED from the server (it cannot sign without
  custody). Track-A owner acts that the worker loop consumed (`delegate`,
  `set_paused`, `set_activity_mode`, `resolve_escalation`, presence) stay as
  bearer-authenticated config records — they are owner control-plane writes,
  not gated actions.
- Standing freshness: unchanged (`MAX_STANDING_AGE_SECONDS = 300`; stale ->
  HOLD, never assumed).
- Persistence: `World.save()` writes `data_root/world-snapshot.json` (server
  gate private key hex, per-session authority records + tokens + metadata,
  transactions, agreements, offers, needs, idempotency ledger, delegations,
  escalations). Saved after mutating calls. Loaded at `__init__`: gate key
  restored, principals re-pinned, bundle heads re-admitted. `reset()` clears
  state AND removes the snapshot. Restart preserves revocations (admitted
  revoked heads) and transaction state (ledger + idempotency).
- New explicit errors: `WORLD_AUTHORIZATION_MISSING`,
  `WORLD_PRESENTATION_BINDING`, `WORLD_AUTHORITY_PRINCIPAL_MISMATCH`,
  `WORLD_AUTHORITY_STALE`. All refusal paths raise; nothing is silently allowed.

## Client (`clients/participant.py`)

One `ParticipantClient` per participant, pointed at an isolated key dir:
- Key ceremony: generate owner root key + worker key (Ed25519, via the
  vendored `crypto` module), `Wallet.create`, `grant(scopes)`,
  `export_bundle()`. Keys never leave the key dir / process.
- `join(server)`: challenge -> worker proof-of-control -> join profile with
  owner block + mandate bundle.
- `authorize(action)`: `gate/challenge` -> `create_presentation(bundle,
  mandate_id, subject_id=agent_id, subject_key=worker_key, action, challenge)`.
- Owner acts: `post_offer(task)` (+authorization), `post_need(task)`,
  `propose_agreement(listing_id)` (+authorization), `agree(agreement_id)`
  (+authorization), `submit(agreement_id)`, `revoke()` (local wallet revoke ->
  `export_bundle` -> `authority/refresh`, returns the measured latency),
  `refresh()`.
- HTTP: stdlib `urllib`, no new dependencies. Bearer tokens stay in memory;
  never written to disk or logs.

## Demo (`clients/demo_custody.py`)

Two clients (separate key dirs), one world:
1. A and B join (proof-of-control + bundles).
2. A posts offer with A's authorization; B proposes agreement with B's
   authorization; A agrees with A's authorization; A submits -> settled once
   (receipt ids captured).
3. Negative: altered binding (A's presentation with B's principal) refused;
   missing authorization refused; replayed presentation refused
   (`PRESENTATION_REPLAYED`).
4. A revokes its worker locally -> refresh admitted (measure latency); A's next
   gated action -> STOPPED `MANDATE_REVOKED`; B's actions still ALLOWED.
5. Restart the server: revocation still enforced; settled transaction still
   recorded; duplicate submit returns the recorded settlement (idempotent).
6. Print the custody map (process -> keys/records held) and the
   operated-on-one-machine disclosure.

## Frontend

Out of scope for functional migration in this lane. The browser town's owner
flow depends on server-side key generation; migrating it to browser-held keys
is a defined follow-up, not claimed here. `docs/custody-migration-note.md`
records this.

## Tests

Update the 142 to the client-side ceremony; add custody regressions:
cross-participant action refused, altered bindings refused, missing
authorization refused (never silent), replay refused, revocation refuses only
the revoked worker (B unaffected), restart preserves revocation + transactions,
idempotent settlement, stale-authority submit refused.
