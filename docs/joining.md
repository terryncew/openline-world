# Joining the shared world

What an outside OpenLine client needs to enter the shared world, and what the
world asks of it afterward. The implementation is `backend/world.py`; the
message-carriage contract is `backend/transport.py` and `docs/transports.md`.

Joining the world gives a participant a seat. It does not give them authority
over anyone else's agent, objects, funds, or information. Authority stays
separate per participant (rule layer 2, below).

## The join profile: `openline-join-profile/v1`

Admission is one POST with a profile dict. The version must be exactly
`openline-join-profile/v1`; anything else is rejected. Fields:

- `participant.id` — the participant's identifier in the world.
- `participant.display_name` — a short human label (moderated, max 40 chars).
- `agent.id` — the identifier of the participant's agent.
- `agent.display_name` — the agent's label (moderated, max 40 chars).
- `agent.public_key` — the agent's Ed25519 public key (64 hex chars). This is
  the *claimed* agent identity. The claim is proven, not trusted.
- `proof.nonce` — a single-use nonce the client fetched from
  `/api/world/challenge`. Nonces expire after 10 minutes and can be used only
  once.
- `proof.signature` — the nonce, signed by the agent's Ed25519 private key
  (128 hex chars). The server verifies it against the claimed public key with
  the `cryptography` library. A forged or replayed proof is rejected
  (`JOIN_PROOF_INVALID`). Signing the server-issued nonce is the proof of
  control: it shows the requester holds the agent's key.
- `mandate.scopes` — the scopes the participant asks for. In this preview the
  only grantable scopes are `notes.read`, `notes.write`, `draft.write`. An
  empty or non-grantable scope list is not a valid profile — it means there is
  no mandate standing to admit (`JOIN_STANDING_NOT_CURRENT`).
- `capabilities` — protocol capabilities the client advertises (e.g.
  `mandate.v1`, `receipt.v1`, `revocation.v1`). Non-empty list required.

Joining creates the participant's OWN gate session: its own wallet, its own
keys, its own receipt log, isolated from every other participant.

## Current standing

After joining, the world records `standing_checked_at`. Every consequential
action — `propose`, `offer`, `offer/accept` — must establish standing as
current before anything is evaluated:

- The recorded standing check must be fresh: older than 300 seconds
  (`MAX_STANDING_AGE_SECONDS`) is stale.
- The participant's mandate must be live (active, known to the receiver).

If standing cannot be established as current, the world **HOLDS**
(`HOLD_STANDING_UNKNOWN`): no receipt is minted, nothing is evaluated, no
effects are applied. Stale data is a visible HOLD, never a quiet ALLOW, and
never a silent reuse of old data. A disconnected peer is never assumed to
know the latest revocation. When an exchange involves a second party
(dual authorization), the other party's standing is checked first — a stale
party HOLDs the whole exchange before *any* gate evaluates.

## Endpoint surface

Base path `/api/world`. Mutating endpoints take `participant_id` + `token`.

- `/challenge` — issue a single-use nonce for the join proof-of-control.
  World-layer, no authority exercised.
- `/join` — submit the join profile; on admission, return a bearer token and
  standing `current`. Exercises the world's admission rules (layer 1).
- `/state` — read the world: participants, open offers, transactions,
  explicitly shared receipts, event log, transport status, and the custody
  notice. Read-only; no authority.
- `/presence` — publish a short status/note, or clear it. Governed by a
  world rule: updates are throttled (min 2 s between them).
- `/offer` — post a task offer. Exercises the world's spam rules (max 5 open
  offers per participant) and the kind allowlist. An offer obligates nobody
  and authorizes nothing — it is a proposal only.
- `/offer/accept` — explicit acceptance through the acceptor's own gate.
  Dual authorization: every party the terms name in `terms.requires` has its
  own gate evaluated independently; all must ALLOW or the exchange is
  refused. Exercises the acceptor's authority (layer 2) plus the required
  parties' gates, under the transaction terms (layer 3).
- `/propose` — run one action through the participant's OWN gate and return
  the signed ALLOWED/STOPPED verdict. The permission check never executes
  the action. Exercises the participant's own authority (layer 2) only.
- `/revoke` — revoke the participant's own agent mandate. Stops the NEXT
  gated action; completed receipts and accepted exchanges stand as records.
  Exercises the participant's own authority only.
- `/receipts` — the participant's own receipts (private). Only their own
  gate's records are ever returned.
- `/receipts/share` — explicitly copy one verified receipt into the world's
  shared space. The receipt is re-verified against the participant's gate
  key before sharing; forged or tampered records cannot be shared.
- `/reset` — clear all sessions, offers, transactions, shares, challenges,
  and the idempotency ledger. Requires `WORLD_ADMIN_TOKEN` via the
  `X-Admin-Token` header; without it the endpoint returns 403. Old session
  data dirs stay on disk; history is left behind, never erased. Administrative
  only — not exposed in the preview UI.

Wrong token on any mutating endpoint (or on `/receipts`) is a 403
(`WORLD_AUTH_MISMATCH`). World-rule violations are 409 with a
`WORLD_RULE_*` code — policy refusals, not gate decisions: no receipt is
minted, nothing is signed.

## The three rule layers

1. **Common world rules** (world layer): admission, moderation/input limits,
   spam limits (offer cap, presence throttle), shared-space behavior,
   standing freshness, idempotency. Violations are `WORLD_RULE_*` refusals —
   policy, never a gate decision.
2. **Owner rules** (each participant's own gate): the mandate over their own
   agent, objects, work, information, simulated funds. Enforced by their own
   gate with Ed25519-signed ALLOWED/STOPPED receipts, verified before
   storage. A participant's wallet, receipts, files, and tools are never
   exposed to anyone else.
3. **Transaction terms** (transaction record): what each party explicitly
   agreed to for one exchange — the offer record plus the explicit
   acceptance, stored as its own record. An offer alone NEVER obligates the
   other party. Only an explicit accept through the acceptor's own gate
   creates an obligation.

## Transaction terms + dual authorization

When an exchange touches multiple parties' protected resources, the offer's
`terms.requires` lists the parties whose gates must independently allow.
The backend evaluates each listed party's gate separately — the acceptor's
and, e.g., the offerer's — and the exchange is refused unless ALL of them
return ALLOWED. In the current preview the harmless task kinds touch only
the acceptor's resources (single-party), but the dual-authorization path is
implemented and covered by tests: if the offerer revokes before acceptance,
their gate can no longer authorize and the exchange is refused — no
obligation forms.

## Receipt privacy, idempotency, and world-rule limits

- Receipts are private by default. `/receipts` returns only the caller's own
  receipts. Another party sees a receipt only if its owner explicitly shared
  it via `/receipts/share` — and only after it verifies against the owner's
  gate key.
- Before sharing a receipt, inspect its contents. Receipts may contain task
  descriptions, file paths, or other sensitive details from the original
  action. Redact anything you would not publish before sharing.
- `offer`, `offer/accept`, and `propose` accept a client-generated
  `idempotency_key`. Same key + same participant + same action returns the
  ORIGINAL result — same receipt ids, same transaction id — with no new
  receipts and no new effects. Only successful outcomes are recorded, so a
  failed attempt stores nothing and a retry re-executes. Reusing a key for
  a *different* action is a 409 conflict (`WORLD_IDEMPOTENCY_CONFLICT`),
  never a silent overwrite. A retry is not a new consequential action, so it
  does not require fresh standing.
- World-rule limits are policy refusals, not gate decisions. The offer cap
  (5 open per participant) and the presence throttle (2 s) are about shared
  space — they mint no receipts and change no standing. A gate's
  ALLOWED/STOPPED verdict is about authority, and only the gate issues it.

## Transport

Transport is message carriage only: presence and world-event notices travel
as versioned envelopes (`openline-envelope/v1`) through a `Transport`
instance. It never evaluates a gate, never mints a receipt, never holds a
key. The contract (`backend/transport.py`): `status()` is exactly one of
`connected` / `pending` / `disconnected`; unknown envelope versions are
rejected, never silently downgraded; `close()` is deterministic.

- Local development transport — **demonstrated**. In-process delivery, no
  socket, no remote peer. Constructor-injectable: `World(transport=...)`.
- Internet transport — **planned**. Interface defined, no implementation.
- Nearby/offline transport — **planned and untested**. See
  `docs/transports.md`: no nearby/offline adapter exists; the dev VM has no
  Bluetooth hardware and no wireless interfaces; localhost runs are
  simulations of the logic, not demonstrations of the network.

## The local preview's custody model

Browser-owner custody: each participant's owner and worker keys are generated
in their browser profile and never leave it. The server keeps only its own
receiver key. Bearer tokens are transmitted to the receiver with each request
(they identify the session); private signing keys are never transmitted —
signing happens in the browser via WebCrypto.

A second browser profile holds a fully separate identity. Two profiles on one
machine are not independent outside adoption. This preview demonstrates the
protocol and the rule layers, not identity infrastructure and not a network.
Do not describe localhost as a network demonstration.
