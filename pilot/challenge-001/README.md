# pilot/challenge-001 — CHALLENGE-001 pilot arrival directory

Public home for the CHALLENGE-001 pilot's arrival materials. Preparation
is underway; enrollment is not open.

- [INTRO.md](INTRO.md) — public introduction. No trust root needed to read.
- [PARTICIPATE.md](PARTICIPATE.md) — standalone participant bundle:
  vendored client sources, dependencies, exact commands, the endpoint,
  trust-verification steps, and the existing mandate process.
- `root-ca.crt` — the pilot root CA certificate (public trust material).
- `trust-anchor-announcement-SIGNED.json` — the owner-signed trust-anchor
  announcement (`openline.trust_anchor_announcement.v1`).
- `client/` — the vendored participant client (see
  [VENDORING.md](client/VENDORING.md) for sources), the challenge
  documents (`PROBLEM.md`, frozen `CHALLENGE-CRITERIA-001.md`,
  `toy-app/`), and `requirements.txt`.

Trust model: the client trusts `root-ca.crt` per-connection only — full
chain validation, certificate validity, and exact server IP
(`188.245.66.128`) are checked on every connection. Never install the
root system-wide. Verify the announcement's Ed25519 signature against
the owner public key before trusting the root (PARTICIPATE.md step 1).

No private keys or credentials are published here. ERROR HUNT is
pending its frozen preflight verdict and is not open for participation.
