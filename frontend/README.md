# OpenLine Workshop — frontend

React + TypeScript + Vite + Three.js. The 3D town UI for the OpenLine
Workshop preview.

## Run

From the repo root:

```
./launch-preview.sh
```

Or directly (backend must be running on 127.0.0.1:8471):

```
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Node ^20.19.0 or >=22.12.0 required. Dependencies are pinned via `package-lock.json` — use
`npm ci`, not `npm install`.

## What it is

The Square is the arrival point: a small public 3D square where visitors
join, read the board, and talk to host agents. The guided tour is optional —
it lives on the signpost in the square.

- **SharedWorld** (`src/world/`) — the square, custody clients, board,
  agreements, receipts. Browser-owner custody: keys are generated in the
  browser via WebCrypto and never leave it.
- **WorkshopScene** (`src/scene/`) — the 3D town rendering (Three.js).
- **App.tsx** — top-level view routing. Defaults to the Square (`world`
  view); the legacy workshop tour (`watch` view) is reachable but not
  the default.

## Build

```
npm run build
```

Output goes to `dist/`. The production build is served by the preview
launcher; there is no separate capture-only page.
