# Integrated Town — Quickstart

Source: openline-workshop, branch `shared-world`.
Historical milestone candidate: `bc17a55` (integrated town — preserved as-is).
This package was built from a later correction commit; the exact commit SHA
is in the ZIP filename. Modified source is never labeled `bc17a55`.

Backend tests: 134/134 green at the packaged commit. Nothing here has been
published or exposed to the internet.

## Source delivery vs phone-accessible preview

- **Source delivery** is this ZIP: a complete, runnable copy of the source.
  You run it on your own computer. Nothing leaves your network.
- **Phone-accessible preview** is the LAN URL the launcher prints
  (e.g. `https://192.168.1.42:5173`). Your phone opens that address while on
  the **same Wi-Fi** as your computer. This is still your own machine
  serving your own network — not public hosting.

## Honest boundaries of this demo

- **LAN access is not independent participant authentication.** This demo
  holds **both participants' keys in one process** (shared-process key
  custody) — it does not demonstrate separate custody.
- Local transport only. Simulated funds/units only — no real payments.
- No model calls, no Bluetooth, no public networking.

## 1. Unzip and install (on your computer)

The ZIP extracts to a single folder, e.g. `integrated-town-preview/`:

```bash
cd integrated-town-preview
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
```

Or simply run the launcher — it creates the venv and installs what is
missing automatically.

## 2. Launch

```bash
./launch-preview.sh           # desktop / same-machine use (plain HTTP)
./launch-preview.sh --https   # phone use: self-signed HTTPS (see below)
```

The launcher starts the backend (127.0.0.1:8471, loopback only — never
exposed to the LAN) and the frontend dev server, waits until both answer
and the same-origin `/api` proxy is verified, then prints the exact URL.
Ctrl-C stops both services cleanly.

Your browser only ever talks to the frontend dev server (one origin);
`/api/*` is proxied server-side to the backend.

## 3. Open it on your phone

1. Put your phone on the same Wi-Fi network as your computer.
2. Run `./launch-preview.sh --https` and open the printed URL on your phone.
3. Your phone will warn about the self-signed certificate **once**. That
   warning is expected (the certificate is generated on your machine for
   development only) — accept it explicitly on the device.

Why HTTPS: the signed join needs WebCrypto, which browsers only expose in
secure contexts. Plain `http://<LAN-IP>` is not a secure context, so
signing cannot work there. With `--https` the join signs a real Ed25519
challenge proof exactly as on desktop. Signing is never skipped or faked.

## 4. The walkthrough (on your phone)

1. **Enter the square.** The world opens in the public square.
2. **Open the Owner console** (bottom of the screen).
3. **Set a goal with limits** — what the agent should work on, a hard
   spending limit, and what needs your review. The delegation is recorded.
4. **Watch the worker.** It discovers a matching offer within its
   delegation, travels between the locations, and performs the work.
   Follow it in the world, or switch to the list view.
5. **Inspect the outcome.** Open the work and its separate signed receipt.
   The receiver's actual decision (ALLOWED / refused) is shown from real
   backend state — settlement only happens when its conditions are met.
6. **Intervene.** Pause or revoke from anywhere. An out-of-scope request
   waits quietly for your clarification — it never proceeds without you.

The top strip always shows mode (DETERMINISTIC AUTOMATION), connection
status, and your owner controls.

## 5. Run the tests

```bash
.venv/bin/pip install -r backend/requirements-test.txt
cd backend && ../.venv/bin/python -m pytest -q
```

Expect: 134 passed.

## Testing labels

- **Desktop testing:** full owner flow exercised end-to-end against a real
  backend in a desktop browser (join → delegate → need → offer → agree →
  submit → ALLOWED → settled → receipts → escalation → deny → pause →
  return-to-manual → revoke). PASS.
- **Mobile-viewport testing:** layout verified at 450×800 emulation —
  bottom sheets, list view, place legend, owner controls reachable without
  covering the characters. PASS.
- **Actual phone testing:** NOT done. Never tested on a physical phone.
  The phone path (LAN URL + HTTPS + signed join) is verified in a desktop
  browser against a simulated phone-like origin only.

## Screenshots (in `screenshots/`)

- `kiosk-finish-at-rest-390x844.png` — the receiving-counter scene at rest
- `handoff-fix-toast.png`, `handoff-fix-fab.png` — the two fixed phone-size overlaps
