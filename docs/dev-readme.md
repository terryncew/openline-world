# OpenLine Workshop

A small walkable 3D workshop showing agent work and receiver-owned decisions.
The human owns the workshop. Helpers can change. Rules and records remain.

## Launch

One command, from this directory:

```
./launch-preview.sh
```

It creates the Python venv (with `cryptography` for the real gate), installs
frontend dependencies, starts the backend on `http://127.0.0.1:8471` and the
frontend on `http://127.0.0.1:5173`, and prints both URLs. Press Ctrl-C to stop
everything. Nothing leaves localhost; demo mode needs no keys and no network
services.

## What it is

- **Workbench** — the current task and observed helper activity.
- **Review station** — each proposed action, the rule that applies, and the
  receiver's signed result. One allowed action, one refused action, each with a
  plain-English reason.
- **Records cabinet** — the signed receipts behind every decision. Inspectable.

The first visit walks the whole story: select a helper and read its bounded
mandate, follow a proposal to the review station, see an allowed and a refused
action, inspect the record, watch the old helper's authority revoked and its
next request refused, then see a replacement onboarded under the same owner
rules while the history stays in the cabinet.

Two modes, clearly labeled:

1. **DEMO** — deterministic synthetic events. No paid calls, no model calls.
   Ambient helper movement is decorative and is labeled as such; it is never
   presented as productive work.
2. **CONNECTED** — accepts documented Claude Code lifecycle hook payloads at
   `POST /api/adapter/hooks`. Hook events become *agent-reported activity only*;
   they can never mint receipts. If telemetry goes stale the room shows
   UNKNOWN/DISCONNECTED instead of pretending work continues.

This is a **trusted-operator local preview**: it does not authenticate
separate people.

## Architecture

```
browser (React + Three.js)  →  workshop backend (Python, stdlib HTTP)
                                        ↓ localhost
                              real OpenLine EffectGate
                              (openline_wallet, see NOTICE)
```

Rendering, execution, and authorization are separate layers. The frontend
never decides anything: every allow/refuse comes back as a gate-signed
receipt, verified by the backend before it is stored or shown. An agent
saying "done" emits an activity event; it cannot create an accepted-work
receipt.

Event stream: every event carries `event_id`, `task_id`, `source`, `kind`,
`timestamp`, and `provenance` (`agent-reported`, `receiver-signed`,
`owner-signed`, `adapter-mapped`). Duplicates by `event_id` are dropped;
clients can replay from any sequence number.

## The CONNECTED adapter: supported / unsupported

Supported hook events (per the documented Claude Code hooks reference):
`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PostToolUseFailure`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification`,
`PermissionRequest`.

- Supported: mapping hook events to agent-activity entries in the room.
- Supported: payload validation, size limits, redaction of prompts, tool
  inputs, transcripts, commands, and working directories at the boundary.
- Unsupported: hook events never produce receipts or decisions.
- Unsupported: blocking or steering the hooked session (the adapter is
  observe-only; it returns no hook decisions).
- Unsupported: any event name outside the documented set.
- Live operation against a real Claude Code session is **unverified** — the
  adapter contract is tested with fixtures (see `backend/tests/`). Wire your
  hooks to `POST http://127.0.0.1:8471/api/adapter/hooks` with
  `{"hook_event_name": ..., "tool_name": ..., "session_id": ...}` to try it.

## Tests

```
cd backend
~/workspace/.venvs/workshop/bin/python -m unittest discover -s tests -v
```

Covers event replay/deduplication, disconnect/stale state, and the
activity-vs-acceptance distinction (agent "done" mints nothing; only the
gate's signed decisions become receipts; revocation stops later requests).

## Closing line

Change your AI. Keep your rules.
