# LAUNCH — research/discovery lane handoff (commit 293227b)

Sanitized, history-free export. No `.git`. Frozen research evidence included read-only.

## Prerequisites

- Python 3.12 (system site-packages are ephemeral across VM reboots — always use a venv under `~/workspace/.venvs/`).
- Node 24 + npm 10 (frontend only).
- No network needed for backend; `npm ci` needs network once for the frontend.

## 1. Backend tests

```bash
python3 -m venv ~/workspace/.venvs/handoff
~/workspace/.venvs/handoff/bin/pip install -r backend/requirements.txt
cd backend
~/workspace/.venvs/handoff/bin/python -m unittest discover -s tests
```

Expected: all tests pass (215 at handoff time, including 12+ discovery-room tests).

## 2. Discovery loop demo (v2, fresh state)

```bash
cd <extract-root>
~/workspace/.venvs/handoff/bin/python research/rooms/discovery-room-001/seed_discovery_v2.py
```

Writes `research/rooms/discovery-room-001/loop-transcript-v2.json` and a fresh
`research/rooms/discovery-room-001/world-state-v2/`. The committed
`world-state/` (v1) is preserved as evidence — the script does not touch it.

## 3. World UI (Exchange board with the research-question listing)

Terminal A (backend, fresh state):

```bash
cd <extract-root>
WORLD_DATA_DIR=$PWD/research/rooms/discovery-room-001/world-state-v2 \
  PYTHONPATH=$PWD/backend \
  ~/workspace/.venvs/handoff/bin/python backend/server.py
```

Backend serves at `http://127.0.0.1:8471` (loopback only).

Terminal B (frontend):

```bash
cd frontend
npm ci
npm run dev
```

Open the printed local URL, go to the Public Square → Exchange board. The
research-question listing appears with its 12-field disclosure set.

## What each step proves

- The listing carries the question, the test spec, the required contribution,
  the resource ceiling (simulated-compute-units), and the acceptance criteria.
- The receiver verifies the frozen evidence manifest itself (40/40 hashes),
  binds the listing's declared pin to the evaluated manifest, and refuses
  before any effect on mismatch (`RESEARCH_MANIFEST_PIN_MISMATCH`).
- Settlement moves simulated funds on the existing commission ledger only.
