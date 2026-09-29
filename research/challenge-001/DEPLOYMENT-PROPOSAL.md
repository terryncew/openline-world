# CHALLENGE-001 — deployment proposal (proposal only; nothing deployed)

The smallest concrete hosted receiver that would let an outside person
join, for owner review. This document proposes; it does not authorize.
Nothing here has been provisioned.

## Proposal

- One small VPS (1 vCPU, 1–2 GB RAM) or equivalent container, in a region
  the owner chooses.
- TLS reverse proxy (e.g. Caddy) terminating HTTPS; the backend continues
  to bind loopback-only behind it. No direct backend exposure.
- One receiver key, generated on the host, backed up once to the owner's
  offline storage. Key rotation = deliberate event with a public notice,
  not silent.
- Durable store: `backend/data/world/world-snapshot.json` on a persistent
  volume, plus a nightly copy to the owner's own storage (rsync). Restore
  is a documented two-command procedure.
- Rate limits and payload ceilings at the proxy (small: 1 MB bodies,
  modest per-IP rate). The world server already enforces 16 KB per
  contribution and exact byte pinning.
- Logging: HTTP access log + receipt ids only. No keys, no tokens, no
  contribution bytes in logs.

## Cost estimate

Roughly $6–12/month for the VPS (e.g. a small instance at current list
prices) plus the owner's time. No bandwidth surprises expected at this
scale. This is an estimate, not a quote; the owner picks the provider.

## Explicitly out of scope

- No real-money rails, no prizes, no payments of any kind.
- No internet transport protocol design beyond HTTPS + the existing JSON
  API. Remote participants join over HTTPS; the "internet transport" of
  `docs/transports.md` remains a separate, unstarted design.
- No uptime SLA, no status page, no multi-operator hosting.
- No change to the frozen criteria, the toy app, or the demo record.

## What the owner must decide

1. Whether to host at all, and under whose name the endpoint operates.
2. The domain and who holds the TLS credentials.
3. The receiver-key backup and rotation procedure.
4. Whether the Phase-1 local verification is sufficient evidence to
   invite one outside cold-start attempt (the documented next milestone).

No provisioning, no DNS, no purchase happens without the owner's explicit
word.
