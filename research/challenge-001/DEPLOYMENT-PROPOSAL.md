# CHALLENGE-001 — deployment decision document (proposal only; nothing deployed)

Rewritten 2026-09-28 (track 1: remote participation path). The hosting
kit in `host/` is concrete. This document is the decision surface for
the owner. Nothing here is provisioned, bought, or registered.

## The exact configuration being proposed

- One small VPS (1 vCPU, 1–2 GB RAM), region the owner chooses.
- Caddy on the edge, TLS terminated there, reverse-proxying to
  `127.0.0.1:8471`. The backend keeps binding loopback-only
  (WORKSHOP_HOST=127.0.0.1 in `host/openline-world.env`) — this is
  posture, not a placeholder: loopback-only stays by design, and
  remote reachability comes from the proxy.
- Backend as one systemd unit (`host/openline-world.service`);
  Caddy via its own distro unit. No docker-compose. Smallest path.
- `WORLD_DATA_DIR=/var/lib/openline-world` on a persistent volume.
  The snapshot (`world-snapshot.json`) holds the receiver gate's
  private key, pinned principals, sessions, the challenge chapter, and
  the refusal ledger.
- Proxy edge policy (`host/Caddyfile`): 1 MB request body cap,
  per-IP rate limit (120 req/min), access log recording method, path,
  status, latency, request id only — no Authorization headers, no
  request/response bodies, no keys, no tokens, no contribution bytes.
- One receiver key, generated on the host at first start, backed up
  with the snapshot. Rotation = deliberate event with public notice,
  never silent (procedure in `host/ops-runbook.md`).

## Access controls

- Public without auth: exactly `GET /api/world/challenge/read`
  (the public board).
- Join path (`POST /api/world/challenge` nonce, `POST /api/world/join`)
  unauthenticated by design: custody comes from the owner-signed
  mandate bundle, not from a proxy ACL.
- Everything else requires an active bearer session; every gated
  action additionally requires a worker-signed presentation over a
  single-use receiver challenge. The proxy enforces rate/body limits
  only — it never issues or checks authority.

## Operating cost (estimates, not quotes — checked 2026-09-28)

| Provider | Smallest suitable tier | Observed price |
|---|---|---|
| Hetzner | CX22 (2 shared vCPU, 2 GB RAM) | ~€3.29–4.59/mo (post-2026 increase) |
| Hetzner | CAX11 ARM (2 vCPU, 4 GB RAM) | ~€3.29/mo |
| DigitalOcean | Basic $6 (1 vCPU, 1 GB RAM, 25 GB SSD) | $6/mo |
| DigitalOcean | Basic $12 (1 vCPU, 2 GB RAM, 50 GB SSD) | $12/mo |

Expected: $4–12/mo for the box plus the owner's time for grants,
backups, and the occasional rotation. No bandwidth surprises at this
scale; no paid services in the loop. Prices move — recheck at the
moment of decision.

## Shutdown procedure

- Ordinary: `systemctl stop openline-world.service` (SIGTERM, 30s
  grace; every mutation is persisted synchronously, so shutdown loses
  at most the in-flight request).
- Full stop: also `systemctl stop caddy`, then destroy or shelf the
  VPS. Snapshots already shipped off-host remain restorable by the
  two-command procedure in `host/ops-runbook.md`.
- A shutdown is announced on the challenge channel before it happens.
  The board stays readable from the last shipped snapshot; nothing
  new is accepted while the receiver is down.

## What the owner must decide

1. Host at all? The local verification fixture is sufficient for
   internal work; hosting buys exactly one thing: a reachable receiver
   for an outside cold-start attempt.
2. Provider and region (see the estimate table).
3. Domain, and who holds the TLS credentials (Let's Encrypt via Caddy
   is the default; no wildcard needed).
4. Receiver-key backup store and who may run the rotation procedure.
5. Is the local verification (loopback + HTTPS proxy path, same
   custody, byte-identical records) sufficient evidence to invite one
   outside cold-start attempt — the documented next milestone?
6. Who is the invited participant, and is the invitation centered on
   what the two of them accomplish together (credit-cascade lens)?

No provisioning, no DNS, no purchase happens without the owner's
explicit word on each of 1–5.
