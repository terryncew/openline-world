#!/usr/bin/env bash
# launch-preview.sh — one launcher for the integrated-town preview.
#
# Starts the backend (127.0.0.1:8471, loopback only) and the frontend dev
# server (0.0.0.0:5173), waits until both answer, then prints the exact URL
# to open on a phone.
#
# PREREQUISITES (install once, on your own computer):
#   - python3 (3.10+)          python3 -m venv .venv
#                              .venv/bin/pip install -r backend/requirements.txt
#   - node + npm               cd frontend && npm install
#   - to run the backend tests: .venv/bin/pip install -r backend/requirements-test.txt
# Nothing is downloaded beyond those installs. Nothing is billed. Nothing is
# published or exposed to the internet.
#
# WHAT THIS IS:
#   - Source delivery: this repo runs on YOUR machine. Nothing leaves your network.
#   - Phone-accessible preview: open the printed LAN URL on your phone while it
#     is on the SAME Wi-Fi as this computer.
#   - The browser only ever talks to the frontend dev server (one origin);
#     /api/* is proxied server-side to the backend, which stays on loopback.
#     The backend port is never exposed to the LAN.
#   - LAN access is NOT independent participant authentication. This demo
#     holds both participants' keys in one process, uses local transport
#     only, and simulated funds.
#
# PHONE + SIGNING: the signed join needs WebCrypto, which browsers only
# expose in secure contexts. Plain http://<LAN-IP> is NOT a secure context,
# so for the phone use:  ./launch-preview.sh --https
# This serves a self-signed certificate (dev only). Your phone will warn
# about the untrusted certificate once — that warning is expected; accept
# it explicitly on the device, then signing works.
#
# Ctrl-C stops both services cleanly.
set -euo pipefail
cd "$(dirname "$0")"

BACKEND_PORT=8471
FRONTEND_PORT=5173
TIMEOUT_SECS=90
USE_HTTPS=0

for arg in "$@"; do
  case "$arg" in
    --https) USE_HTTPS=1 ;;
    -h|--help)
      sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --https, --help)" >&2; exit 1 ;;
  esac
done

if [ "$USE_HTTPS" = 1 ]; then
  SCHEME="https"; export PREVIEW_HTTPS=1
else
  SCHEME="http"
fi

# --- prerequisites -----------------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Install Python 3.10+, then:" >&2
  echo "  python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found. Install Node.js (which includes npm), then:" >&2
  echo "  cd frontend && npm install" >&2
  exit 1
fi

# --- python env ---------------------------------------------------------------
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  echo "No .venv found; creating one and installing backend requirements..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r backend/requirements.txt
  PY=".venv/bin/python"
fi

# --- frontend deps -------------------------------------------------------------
if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies (one-time)..."
  (cd frontend && npm install -q)
fi

# --- LAN IP detection (macOS and Linux) ----------------------------------------
lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null && return 0
    ipconfig getifaddr en1 2>/dev/null && return 0
  fi
  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | grep -oP '(?<=src )\S+' && return 0
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}' && return 0
  fi
  return 1
}

# --- start services -------------------------------------------------------------
echo "== starting backend on 127.0.0.1:${BACKEND_PORT} (loopback only) =="
"$PY" backend/server.py &
BACKEND_PID=$!

if [ "$USE_HTTPS" = 1 ]; then
  echo "== starting frontend with self-signed HTTPS on :${FRONTEND_PORT} =="
else
  echo "== starting frontend on :${FRONTEND_PORT} =="
fi
(cd frontend && npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" >/tmp/workshop-frontend.log 2>&1) &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "== stopping preview =="
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM

# --- readiness ------------------------------------------------------------------
wait_for() { # url, label
  local url="$1" label="$2" i=0
  local curl_opts="-sf"
  [ "$SCHEME" = "https" ] && curl_opts="-skf"
  while [ "$i" -lt "$TIMEOUT_SECS" ]; do
    # shellcheck disable=SC2086
    if curl $curl_opts -o /dev/null "$url" 2>/dev/null; then
      echo "   ok: $label"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "ERROR: $label did not answer at $url within ${TIMEOUT_SECS}s." >&2
  echo "See /tmp/workshop-frontend.log for frontend output." >&2
  cleanup
  exit 1
}

echo "== waiting for services (up to ${TIMEOUT_SECS}s) =="
wait_for "http://127.0.0.1:${BACKEND_PORT}/api/health" "backend"
wait_for "${SCHEME}://127.0.0.1:${FRONTEND_PORT}/" "frontend"
# same-origin API path check: /api must proxy to the backend
if [ "$SCHEME" = "https" ]; then
  curl -skf -o /dev/null "${SCHEME}://127.0.0.1:${FRONTEND_PORT}/api/health" \
    && echo "   ok: same-origin /api proxy" \
    || { echo "ERROR: /api proxy check failed" >&2; cleanup; exit 1; }
else
  curl -sf -o /dev/null "${SCHEME}://127.0.0.1:${FRONTEND_PORT}/api/health" \
    && echo "   ok: same-origin /api proxy" \
    || { echo "ERROR: /api proxy check failed" >&2; cleanup; exit 1; }
fi

# --- print the URL ----------------------------------------------------------------
echo ""
if LAN="$(lan_ip)" && [ -n "$LAN" ]; then
  echo "=============================================================="
  echo "  Open this on your phone (same Wi-Fi as this computer):"
  echo ""
  echo "      ${SCHEME}://${LAN}:${FRONTEND_PORT}"
  echo ""
  echo "=============================================================="
  if [ "$USE_HTTPS" = 1 ]; then
    echo "  Your phone will warn about the self-signed certificate once."
    echo "  That warning is expected — accept it on the device, then the"
    echo "  signed join works."
  else
    echo "  NOTE: plain HTTP over a LAN address is not a secure context,"
    echo "  so the signed join cannot work from the phone in this mode."
    echo "  For phone signing, restart with: ./launch-preview.sh --https"
  fi
  echo "  On this computer you can also use: ${SCHEME}://127.0.0.1:${FRONTEND_PORT}"
else
  echo "WARNING: could not detect a LAN IP. On this computer use:"
  echo "  ${SCHEME}://127.0.0.1:${FRONTEND_PORT}"
  echo "Find your computer's Wi-Fi address and open ${SCHEME}://<it>:${FRONTEND_PORT} on your phone."
fi
echo ""
echo "Walkthrough: enter the square -> Owner console -> set a goal with limits ->"
echo "watch the worker -> inspect the work and its receipt -> pause or revoke."
echo "Press Ctrl-C to stop both services."
echo ""

wait
