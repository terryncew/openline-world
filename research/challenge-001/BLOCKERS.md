# CHALLENGE-001 — remaining blockers for an outside person joining

Honest list, updated 2026-09-28 (track 1: remote participation path).
Each is a real blocker, not a roadmap item.

## What this track resolved

- **Remote path specified and locally verified.** The HTTPS path
  (TLS-terminating reverse proxy → loopback-only backend) was tested
  with the existing ceremony end to end: join → delegate bounds →
  contribute → evaluate, with TLS fingerprint pinning on the client
  side. No backend change; custody byte-identical. See the track-1
  verification note at the end.
- **Hosting kit exists.** `host/` has the Caddyfile (TLS termination,
  1 MB body cap, per-IP rate limits, metadata-only access log), the
  systemd unit (no docker-compose), the env template
  (WORKSHOP_HOST stays 127.0.0.1), the owner grant script
  (`grant-mandate.py` — exact command shape for manual per-participant
  issuance), and the ops runbook (nightly rsync backup, two-command
  restore, key backup + announced rotation, access controls, shutdown).
- **Transport question settled.** The "internet transport" of
  `docs/transports.md` stays unstarted design — deliberately. Remote
  participants join over HTTPS with the existing JSON API; no new
  envelope, relay, or NAT traversal is needed for the challenge. It
  is no longer a joiner blocker.

## What still blocks an outside joiner

1. **No deployed receiver.** The backend is loopback-only by design
   (unchanged — that is posture, not a limitation), and remote
   reachability comes from the proxy. The proxy is specified and
   locally verified but NOT deployed: no VPS, no domain, no TLS
   certificate, no always-on process. Until the owner decides
   (see DEPLOYMENT-PROPOSAL.md, decisions 1–5), two operators on
   different machines cannot reach the same server.

2. **Browser signing needs a secure context.** Worker-signed
   presentations from a real browser require WebCrypto key storage
   and a secure origin (HTTPS or localhost). The verified path is a
   script client over HTTPS; there is no reviewed browser signing
   flow for a remote participant.

3. **Newsroom still in-memory.** The challenge store is durable
   (`world-snapshot.json` save/load), but the newsroom/ClaimGraph
   chapters remain in-memory and are lost on restart/reset. A
   challenge workflow that also uses the newsroom desk inherits that
   fragility.

4. **No independent-operator run yet.** Track-1's local proxy test was
   still internally operated on one machine. Nobody outside has
   successfully used the frozen interface without narration. That is
   the next milestone, and it is unmet.

5. **Key backup and recovery.** Participant keys live in local key
   dirs at 0o600 with no backup, no recovery, no rotation ceremony.
   Losing the key dir loses the identity with no recourse (by design,
   for now — but an outside user must be told).

Until blocker 1 is resolved, CHALLENGE-001 is a local verification
fixture with a concrete deployment plan, not a public challenge.
Say so wherever the challenge is described.
