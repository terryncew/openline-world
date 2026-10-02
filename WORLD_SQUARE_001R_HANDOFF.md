# WORLD-SQUARE-001R — Codex execution handoff

## 0. Read this first
This document was prepared by Muse (a separate environment) because the Codex
executor's GitHub integration is read-only and could not push. Nothing in this
file establishes Codex write access. See §7.

The rebuilt town is the next iPhone candidate. The older static preview
(`preview/iphone-static-work`, `?static=1` recorded-demo shim) is reference
material only — do not build on it.

## 1. Base and branch
- Repo: `terryncew/openline-world`
  (https://github.com/terryncew/openline-world)
- Base branch: `world/world-square-001`
- Required base SHA: `03b12a894f3b632f744ce278aa501ae00f1b4756` — VERIFIED
  (local `git rev-parse` and `git ls-remote origin` agree, 2026-10-02).
- Work branch: `world/world-square-001-state-of-art`
  (https://github.com/terryncew/openline-world/tree/world/world-square-001-state-of-art)
  — created and pushed by Muse after Codex's create-reference call was
  rejected (403). At handoff time it points at the base SHA exactly.
  Inspected, not reset. No rebuild commits exist on it yet.
- Frozen — DO NOT TOUCH: `viz/world-visualization-v0` @ 55751ef,
  `world/world-square-001` @ 03b12a8.
- Do not merge, tag, release, deploy, or open a PR. Ever, on this task.

## 2. WORLD-SQUARE-001R specification
STATUS: NOT PROVIDED. Muse searched the workspace; no WORLD-SQUARE-001R
specification exists in any file available to this environment. The section
below is therefore NOT the spec verbatim — it is the nearest binding
material, which is the WORLD-SQUARE-001 work order as given by the user.
Codex must obtain the actual 001R specification from the user before
treating any requirement below as authoritative for 001R.

### 2a. WORLD-SQUARE-001 order (nearest binding material, his words)
Build the next OpenLine World layer. Start from viz/world-visualization-v0
at 55751ef. Do not alter the protocol, backend event model, reducer semantics,
receipt logic, or the existing nine-step custody visualization except where
required to enter/exit it cleanly.

Goal: restore the original Richard Scarry-style OpenLine World as the
explorable outer world, while keeping every consequential claim inside spaces
backed by actual OpenLine evidence.

The Square is the home screen: a small working robot town, not a dashboard —
streets, buildings, workers moving around, visible activity, places suggesting
an emerging agent economy. Playful is allowed. Fake protocol behavior is not.

The first real destination is the workshop / receiving gate. Entering it
transitions into the existing proven custody visualization: owner authority,
worker proposal, receiver decision, STOP, receipts, revocation, replacement.
That sequence remains evidence-backed and mechanically faithful.

Other buildings may exist visually as future places — exchange,
library/research house, courier depot, repair shop, etc. — but they must not
simulate capabilities or economic activity OpenLine has not demonstrated. They
can be scenery, locked doors, ambient characters, or clearly unfinished
spaces. Do not invent transactions, markets, payments, reputation systems,
autonomous commerce, or agent behavior merely to make the town feel alive.

Editorial rule: the world may imagine what this ecosystem could feel like.
Any interaction presented as something OpenLine does must descend from real
state/events/receipts.

Keep the existing visual language: colorful authored town, simple forms,
robots with character, no cyberpunk, no enterprise dashboard aesthetic. The
town should make someone want to poke around.

Architecture: keep speculative world-state completely separate from
protocol/replay state. Decorative movement may use local animation state, but
it must never generate protocol facts. Proven scenes continue to derive from
the canonical replay path.

First build only: Square + navigable path into the workshop + return to
Square. Do not build the whole town.

Preserve the current custody choreography unchanged unless integration
exposes an actual defect.

Tests: existing 13/13 reducer tests, existing real-backend e2e replay,
TypeScript clean, plus tests proving the Square cannot manufacture protocol
events or receipts.

Comprehension test: a cold viewer should understand within roughly 20 seconds
that this is a town where agents work, and that entering the workshop reveals
the real rules governing consequential work.

Stop conditions: stop rather than invent behavior if the town requires
unsupported economic mechanics, fake protocol events, or changes to OpenLine
semantics.

### 2b. Binding art direction and four physical stories
STATUS: NOT PROVIDED. No art-direction document and no "four physical
stories" exist in any file available to this environment. Do not invent them.
Obtain them from the user before building.

### 2c. Binding editorial invariant (his words, verbatim)
"No scene may require explanatory prose to distinguish speculation from
proof; that distinction must be legible from place, staging, and behavior."

## 3. Source-review findings — fix and test these in the rebuild
All three were verified against the code at 03b12a8 by Muse (file:line
cited). They are real defects, not suspicions.

### 3a. The Square mounts backend subscriptions
`frontend/src/App.tsx` calls `useWorkshop()` (`src/hooks.ts`) at the top
level for EVERY view. The hook opens an SSE `EventSource` to `/api/events`
and fetches `/api/state` on mount, and the `if (!snap)` boot gate
(`App.tsx:127`) renders "Starting the workshop…" instead of ANY view —
including the Square — until the backend answers. So the "explorable outer
world" cannot mount without live backend subscriptions, and a dead backend
bricks the whole town. The Square must be able to mount, render, and be
explored with zero backend contact; backend-dependent views should degrade
to honest locked/empty states, never a global boot gate.

### 3b. Exiting the workshop does not cancel remaining demo advances
`frontend/src/viz/VizView.tsx`: `runDemo` starts `runDemoScript` with
`shouldStop: () => stopDemoRef.current` (line 259), but `stopDemoRef.current`
is NEVER set to `true` anywhere in the file. Exiting via `onExit`
("Back to the Square", line 371) unmounts VizView without stopping the
director: the async loop keeps POSTing `/api/demo/advance` to the backend
after the user has left, mutating the shared event log from a demo nobody is
watching. Fix: cancel the director on unmount and on exit (set the flag,
abort in-flight work), and prove it with a test.

### 3c. vizbench query inputs can introduce synthetic workshop facts
`frontend/src/viz/VizView.tsx:35-80`: `?vizbench=N` builds N fully synthetic
events (`benchEvents`) — mandates, proposals, decisions, RECEIPTS — carrying
real provenance labels (`owner-signed`, `receiver-signed`) and feeds them
through the same reducer and scene as proven events
(`events = bench > 0 ? benchEvents(bench) : revealed`, line 151-154). Anyone
opening `?view=viz&vizbench=100` sees 100 fake workers, fake receiver
decisions, and fake receipt tablets rendered with the full visual authority
of the proven demo. This is a speculation/proof contamination vector in a
public URL parameter. Fix: gate it behind a non-default build flag or remove
it from any public-facing build; it must not be reachable by URL alone.

## 4. Setup and verification commands
Environment used for the 001 build (verified working):
- Node 24, npm; Python 3 with stdlib only for the backend
  (venv used here: `~/workspace/.venvs/workshop`, not required — any
  Python 3 runs `backend/server.py`).
- Frontend deps: `cd frontend && npm install` (or `npm ci`).

Bring-up (two terminals, repo root = the checkout):
```
# terminal 1 — backend (in-memory event log; WORKSHOP_PORT default 8471)
WORKSHOP_PORT=8471 python3 backend/server.py
# terminal 2 — frontend (proxies /api to the backend; one origin)
cd frontend && WORKSHOP_PORT=8471 npx vite --port 5173 --strictPort --host 127.0.0.1
# open http://127.0.0.1:5173/  (Square is the home screen)
```

Verification (all must pass; run from `frontend/`):
```
npm test            # 17/17 expected (13 viz reducer + 4 square boundary)
npx tsc -b          # must be clean
npm run test:e2e    # real-backend viz replay: 5 proposals, 3 allowed, 2 stopped, 5 receipts
node e2e/square-smoke.mjs   # home -> workshop entry (auto-run) -> return, no page errors
```
Playwright: this environment used Chromium
(`/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome` with
`--use-angle=swiftshader --enable-unsafe-swiftshader`). WebKit was NOT
available here — install with `npx playwright install webkit` if needed and
re-run the smoke checks there. Do not describe WebKit results as verified
unless actually run.

Screenshots live in `frontend/src/viz/screenshots/` and
`frontend/src/square/screenshots/`; re-capture after any visual change and
look at them before claiming done.

## 5. Workspace / task / status
- Codex task link: not available to Muse — fill in from the Codex session.
- GitHub branch: https://github.com/terryncew/openline-world/tree/world/world-square-001-state-of-art
- Branch SHA at handoff: `03b12a894f3b632f744ce278aa501ae00f1b4756`
  (identical to base; no rebuild commits yet).
- Working tree where this was written: clean (tracked files at 03b12a8
  before this file was added; this file is the only new commit).

## 6. What Muse could and could not do
- DONE: verified base SHA locally and remotely; created and pushed the work
  branch; inspected it (not reset); verified all three §3 findings against
  code; wrote this handoff; committed it to the work branch.
- NOT DONE (cannot be done from this environment): provision a Codex local or
  Cloud execution environment; install the Codex executor's Git credentials;
  establish Codex write access (see §7); run WebKit checks.

## 7. Write-access verification (exact outputs)
Muse's own write access (separate environment — does NOT establish Codex
write access):
```
$ git push origin world/world-square-001:world/world-square-001-state-of-art
To https://github.com/terryncew/openline-world.git
 * [new branch]      world/world-square-001 -> world/world-square-001-state-of-art
$ git ls-remote origin world/world-square-001-state-of-art
03b12a894f3b632f744ce278aa501ae00f1b4756  refs/heads/world/world-square-001-state-of-art
```
Codex executor's write access: NOT ESTABLISHED. Its attempts returned:
```
GitHub API error 403: {"message":"Resource not accessible by integration",
"documentation_url":"https://docs.github.com/rest/git/refs#create-a-reference","status":"403"}
```
(create-a-reference) and the same 403 on update-a-reference. The connected
GitHub integration needs Contents read/write on `terryncew/openline-world`
before Codex can push. Until then, Codex cannot commit to this branch.
