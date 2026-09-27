# External-agent adapter — documented interface

How one external agent connects to the shared world for the bounded
Research & Explore demonstration. One adapter, one agent; nothing here
claims other agents or models will work the same way.

## 1. Join (proof of control, no permission)

- `POST /api/world/challenge` → `{nonce}` (single-use, 10-minute TTL).
- Generate a fresh Ed25519 keypair locally. Sign the nonce bytes.
- `POST /api/world/join` with the join profile:
  - `version: "openline-join-profile/v1"`
  - `participant: {id, display_name}` — the human/owner side identity
  - `agent: {id, display_name, public_key}` — the external agent identity
  - `proof: {nonce, signature}` — hex signature over the nonce
  - `mandate: {scopes}` — requested scopes, subset of:
    `notes.read`, `notes.write`, `draft.write`, `claimgraph.correct`,
    `newsroom.review`
  - `capabilities: [...]` — e.g. `["web.retrieve", "report.draft"]`
- Response: `{participant_id, token, mandate_id, scopes, ...}`.
  The token is a bearer secret for this session only.

Joining verifies control of the agent key. It grants no action
permission: every consequential step below is decided separately by
the participant's own receiver gate.

## 2. Read the delegation (owner-set bounds)

- `GET /api/world/delegation?participant_id=…&token=…`
- The owner records goal, permitted task kinds, spending limit,
  work limit, and review conditions. The adapter must stay inside
  these bounds; they are not advisory.

## 3. Propose an action (the receiver decides)

- `POST /api/world/propose` with `{participant_id, token, action,
  idempotency_key}`.
- `action` is a scope-like action id (e.g. `notes.read`).
- The participant's OWN gate evaluates the exact action against the
  live mandate: scope membership, standing freshness, revocation.
- Response: `{decision: ALLOWED|STOPPED|HOLD, receipt_id,
  reason_codes}`. The full signed receipt is inspectable via
  `GET /api/world/receipts`.
- A permission check never executes the action. Only an ALLOWED
  verdict authorizes the adapter to perform the corresponding step,
  and the adapter records what it actually did.

## 4. Newsroom intake (research becomes visible)

- `POST /api/world/newsroom/import` with `{participant_id, token,
  article: {title, text, source_url}, idempotency_key}`.
- Gated on the `newsroom.review` scope. Imported text is quoted,
  untrusted data: never executed, never fetched because of it.
- On ALLOWED, the dispatch appears in the world's newsroom.

## 5. Revocation (stops the next gated action)

- `POST /api/world/revoke` with `{participant_id, token}`.
- In this demonstration the owner initiates revocation through the
  participant session. Completed receipts stand; the NEXT
  `propose` returns STOPPED with `MANDATE_REVOKED`.

## 6. Inspect

- `GET /api/world/receipts?participant_id=…&token=…` — the
  participant's signed gate receipts (private to the session).
- `GET /api/world/state` — public world state, events, delegations.

## Isolation actually achieved

The adapter runs as a separate OS process and speaks only HTTP to
the backend plus HTTPS to its model provider and the permitted
sources. It never reads the backend data directory, signing keys,
or policy files; its only credential is its session token.

Honest limit: this is one machine and one backend process. The
backend holds every participant's keys (including the stand-in
helper keys the server generates at join). Key custody is NOT
independent and the operators are NOT independent. What is real:
the agent process has no key access, and every one of its actions
was permitted or refused by a signed receiver decision.
