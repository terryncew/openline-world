# Distribution launch QA — clean extraction

Date: 2026-09-27. Distribution: openline-world (history-free export of
openline-workshop @ b8f49b6), fresh git clone, fresh Python venv
(`backend/requirements.txt` = cryptography only), fresh `npm install`.

## Backend

`backend/server.py` from the extraction: `/api/health` → `{"status":"ok","mode":"demo"}`.

## External-agent path (documented in docs/joining.md)

`clients/demo_custody.py --server http://127.0.0.1:8471` against the extracted
backend: **19/19 checks passed** — join with own keys, offer, agreement,
settlement, altered-binding refusal, replay refusal, revocation (measured
0.010s local-revoke → admitted refresh, stated as NOT instant), post-revoke
refusal, restart persistence, idempotent duplicate submit. The server held
only its receiver key; both clients held their own keys in isolated key dirs.

## Town UI

Frontend from the extraction (`npm run dev`, 5173): town loads, join ceremony
completes in-browser, host robots and visitor robots render. Screenshot:
`/tmp/dist-smoke.png` (green host robot + periwinkle visitor robot, name tags
on selection).

Observed, non-blocking: two `Node.removeChild: The node to be removed is not
a child of this node` page errors during the enter flow. This is pre-existing
in the exported commit (the distribution's frontend/src is byte-identical to
b8f49b6 apart from the removed unreferenced hero.png) — a React/drei Html
unmount artifact, not introduced by the export. The scene renders and the
join completes despite it.
