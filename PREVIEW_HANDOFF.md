# Handoff: iPhone static preview of OpenLine World Square

## State
- `viz/world-visualization-v0` @ 55751ef — pushed to GitHub. FROZEN (iPhone merge gate pending).
- `world/world-square-001` @ 03b12a8 — pushed to GitHub. FROZEN (combined merge gate pending).
- This branch `preview/iphone-static-work` — UNCOMMITTED-FROZEN-BRANCHES policy: the two
  branches above are untouched. This branch holds ONLY the static-preview shim (below).
  Do not merge any of these branches.

## Why this exists
The sandbox running this work has no route to expose a live backend to a phone
(egress proxy blocks cloudflared/bore/SSH tunnels; no inbound). So the iPhone
preview is a STATIC export: the frontend plays a RECORDED real demo run from
bundled JSON. No backend. Every event in the recording was captured from an
actual backend run (23 events: 5 proposals, 5 decisions — 3 allowed / 2 stopped,
5 receipts, 3 mandates, 2 notes, 2 activity, 1 connection). The reducer, paced
reveal, and choreography downstream are identical to the live build.

## What the shim does (all in this branch, none of it on the frozen branches)
- `frontend/src/viz/source.ts`: `isStaticDemo()` (?static=1), `staticUrl()`;
  `subscribeLive` / `fetchSnapshot` / `fetchReceipts` serve
  `demo-static/{events,state,receipts}.json` in static mode. Still GET-only —
  the readonly static test passes.
- `frontend/src/viz/VizView.tsx`: `runDemo` skips the POST-driving director in
  static mode (nothing to drive; the recording streams on mount).
- `frontend/src/viz/Timeline.tsx`: `staticMode` prop — the demo button becomes
  "↺ Replay recorded demo" (honest labeling, fully functional offline).
- `frontend/src/hooks.ts`: app-shell `useWorkshop` serves the static snapshot
  in static mode (the App gates every view on `snap`; without this the Square
  never renders offline).
- `frontend/public/demo-static/`: the recorded run (events.json, state.json,
  receipts.json), captured 2026-10-02 from the real backend.
- `frontend/e2e/static-check.mjs`: blocks ALL /api/* requests, asserts the full
  23-event story plays with zero backend hits and zero page errors.
- `frontend/e2e/static-dist-check.mjs`: same against the production build.

## Verified
- `npx tsc -b` clean; `npm test` 17/17 (13 viz + 4 square boundary).
- static-check: PASS (23 events, 0 apiHits, 0 page errors).
- dist check at 390x844 (iPhone viewport): PASS, screenshots reviewed —
  Square legible, workshop transition works.

## Remaining: deploy it
1. `cd frontend && npx vite build --base=/openline-world/`
2. Push `dist/` to an orphan branch (e.g. `preview/iphone-dist`).
3. Enable GitHub Pages on terryncew/openline-world from that branch
   (`gh api -X POST repos/terryncew/openline-world/pages -f build_type=branch -f source[branch]=preview/iphone-dist -f source[path]=/` —
   check current API shape).
4. Open `https://terryncew.github.io/openline-world/?static=1` on the iPhone.
   The Square is the home screen; "Enter the workshop" auto-plays the recording.
5. Run the five gate checks: Square clean/readable, transition works, custody
   legible, stranger 3/3 custody questions, stranger gets the fourth thing
   (town broader than proven machinery; workshop = where the real rules live).
6. On pass: merge `world/world-square-001` (NOT 55751ef separately).
   Then tear down the preview (disable Pages, delete preview branches).

## Constraints (his orders — do not bend)
- Do not merge anything without his explicit verdict.
- No release, no tag, no public announcement of the preview.
- The static export is a RECORDING, never present it as live. The in-app
  label ("Replay recorded demo") must stay.
- The square boundary test (`src/square/square.boundary.test.ts`) must keep
  passing: speculation cannot manufacture receipts, as an enforced property.
