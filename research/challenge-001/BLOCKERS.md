# CHALLENGE-001 — remaining blockers for an outside person joining

Honest list. Each is a real blocker, not a roadmap item.

1. **Loopback-only server.** The backend binds `127.0.0.1:8471` and the
   Vite proxy keeps everything same-machine. Two operators on different
   machines cannot reach the same server. An outside person cannot join
   from their own machine.

2. **Internet transport unimplemented.** `docs/transports.md` marks the
   internet transport as PLANNED, not implemented. There is no agreed
   envelope, no relay, no NAT traversal, no identity for remote
   participants.

3. **No hosted receiver.** No VPS, no container, no TLS endpoint, no
   always-on process holds the receiver key. The challenge board exists
   only while someone runs `./launch-preview.sh` locally.

4. **Browser signing needs a secure context.** Worker-signed presentations
   from a real browser require WebCrypto key storage and a secure origin
   (HTTPS or localhost). The current `CustodyClient` demo path is
   localhost-only; there is no reviewed browser signing flow for a remote
   participant.

5. **Newsroom still in-memory.** The challenge store is durable
   (`world-snapshot.json` save/load), but the newsroom/ClaimGraph chapters
   remain in-memory and are lost on restart/reset. A challenge workflow
   that also uses the newsroom desk inherits that fragility.

6. **No independent-operator run yet.** The Phase-1 verification used
   internally operated demo clients on one machine (see PROTOCOL.md).
   Nobody outside has successfully used the frozen interface without
   narration. That is the next milestone, and it is unmet.

7. **Key backup and recovery.** Participant keys live in local key dirs at
   0o600 with no backup, no recovery, no rotation ceremony. Losing the
   key dir loses the identity with no recourse (by design, for now —
   but an outside user must be told).

Until blockers 1–3 are resolved, CHALLENGE-001 is a local verification
fixture, not a public challenge. Say so wherever the challenge is
described.
