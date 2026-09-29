# CHALLENGE-001 hosted receiver — ops runbook (proposal; not deployed)

The smallest operation that keeps one hosted receiver alive, backed up,
and honestly labeled. Everything here assumes the kit in this directory
(`Caddyfile`, `openline-world.service`, `openline-world.env`).

## Layout on the host

| Path | What |
|---|---|
| `/opt/openline-world` | checkout of the repo (branch with CHALLENGE-001) |
| `/etc/openline-world/env` | `openline-world.env` — WORKSHOP_HOST stays 127.0.0.1 |
| `/var/lib/openline-world` | WORLD_DATA_DIR — `world-snapshot.json` lives here |
| `/var/log/caddy/challenge-access.log` | proxy access log (metadata only) |

## Access controls (enforced by the receiver, not the proxy)

- Public without auth: exactly one route —
  `GET /api/world/challenge/read` (the public challenge board).
- The join path (`POST /api/world/challenge` nonce,
  `POST /api/world/join`) is unauthenticated by design: custody comes
  from the owner-signed mandate bundle the participant presents, not
  from a proxy ACL.
- Everything else requires an active bearer session, and every gated
  action (`challenge.contribute`, `challenge.evaluate`,
  `claimgraph.correct`, …) additionally requires a worker-signed
  presentation over a single-use receiver challenge. The proxy adds rate
  limits and the 1 MB body cap; it never issues, checks, or replays
  authority. No IP allow-listing is needed for correctness.

## Nightly backup

One cron line on the host (run as the `openline` user), shipping the
snapshot off the machine. The snapshot is written on every mutation
(`World.save()` after each accepted/rejected state change), so a
plain copy is always current — no lock, no quiesce needed beyond the
normal snapshot write.

```
0 3 * * * rsync -a --delete /var/lib/openline-world/ backup@backup-store:/backups/challenge-receiver/$(date +\%F)/ --log-file=/var/log/challenge-backup.log
```

Keep 14 daily copies on the store. Verify one restore per month (see below).

## Two-command restore

```
systemctl stop openline-world.service
rsync -a backup@backup-store:/backups/challenge-receiver/2026-09-27/ /var/lib/openline-world/ && systemctl start openline-world.service
```

The snapshot includes the receiver gate's private key, the pinned
owner principals, admitted bundle heads, sessions, the challenge
chapter, and the refusal ledger. What is NOT restored (by design): the
in-memory nonces, the newsroom/ClaimGraph session chapters, and any
work participants' own hosts were doing. After restore, stale bearer
sessions fail closed with WORLD_AUTH_MISMATCH and re-join.

## Receiver-key backup and rotation

The receiver gate key is the single most sensitive object on the host.
It lives inside the snapshot as `gate_private_key_hex` (32 bytes,
hex). It is backed up wherever the snapshot is backed up; there is no
separate key file. Treat the backup store with the same care as the
host itself: no keys in Caddy access logs, no keys in chat, no keys
in this runbook.

Rotation is a deliberate event with a public notice, never silent:

1. `systemctl stop openline-world.service`
2. Copy the current snapshot aside: the gate key and receipts it signed
   stay inspectable under the OLD public key.
3. Generate a fresh 32-byte key and write it into a copy of the
   snapshot's `gate_private_key_hex` field (python, local, one-shot —
   the key never travels over the network).
4. `systemctl start openline-world.service`
5. Publish the notice on the challenge board channel: rotation date,
   old gate public key, new gate public key, and the reason. Receipts
   signed before the cut stay valid under the old key; receipts after,
   under the new one. History is preserved, not rewritten.

A silent key swap is the one operation that would break the trust the
whole protocol is built on. If in doubt, announce first, rotate second.

## Graceful shutdown

`systemctl stop openline-world.service` — SIGTERM, 30s grace. Because
every mutation persists synchronously, shutdown mid-ceremony loses at
most the in-flight request, never committed state. On restart the
snapshot reloads; interrupted participants re-join and re-run their
gate challenge (idempotency keys make replays safe).

## If the host dies

Provision a fresh VPS, install Caddy + the backend (same kit), restore
the latest snapshot with the two-command procedure, point DNS back.
No participant data lives on their machines except their own keys —
their recorded contributions are all in the snapshot.

## What this runbook does not cover

No uptime SLA, no status page, no monitoring beyond the Caddy access
log and the systemd journal, no second operator. If this receiver
needs to outlive one host, that is a new decision, not an extension
of this file.
