#!/usr/bin/env bash
# Bounded local preview. Processes restart; files and receipts persist.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ] || [ ! -d .venv/component-sources/bureau ] || [ ! -d frontend/node_modules ]; then
  bash bounty/install.sh
fi
export BOUNTY_ENABLED=1 WORKSHOP_HOST=127.0.0.1
export BOUNTY_DATA_DIR="${BOUNTY_DATA_DIR:-$PWD/backend/data/bounty}"
export WORKSHOP_PORT="${WORKSHOP_PORT:-8471}"
.venv/bin/python backend/server.py &
backend_pid=$!
(cd frontend && exec node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort) &
frontend_pid=$!
cleanup() {
  kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
.venv/bin/python - <<'PY'
import json, os, time
from urllib.request import urlopen
for _ in range(90):
    try:
        with urlopen('http://127.0.0.1:5173/api/bounty/state', timeout=1) as r:
            data = json.load(r)
        if data['terms']['currency'] != 'SIM_USD (simulated)':
            raise SystemExit('Unexpected currency')
        print('Bounty browser workflow: open the local frontend and choose ?scenario=bounty')
        break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit('Bounty API proxy did not become ready')
PY
wait -n "$backend_pid" "$frontend_pid"
