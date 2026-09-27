#!/usr/bin/env bash
# Launch the separate-key-custody demo: starts the world backend (loopback
# only, per the server's own binding) and runs clients/demo_custody.py.
# Cleans up the server on exit. Keys are created at runtime under a temp dir;
# nothing key-like is committed.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8471}"
VENV_PY="$HOME/workspace/.venvs/workshop/bin/python"

if [ ! -x "$VENV_PY" ]; then
  echo "missing venv python: $VENV_PY" >&2
  exit 1
fi

# Let the demo's --launch do the server lifecycle so restart logic stays in
# one place (the demo wipes the world data dir, launches, restarts, stops).
exec "$VENV_PY" "$REPO/clients/demo_custody.py" --launch --port "$PORT"
