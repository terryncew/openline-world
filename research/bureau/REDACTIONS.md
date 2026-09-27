# Bureau redaction record

The report's export is a sanitized, read-only view of preserved records.
Original evidence is preserved; what was changed for distribution is
documented here.

## 1. Pre-existing redactions (inherited, not made by this lane)

Documented in `research/EVIDENCE-REDACTION.md`:

- `research/correction-20260927T000442Z.json` → `/participant_token`:
  revoked local-demo Bearer <redacted> replaced with the redaction string.
- `research/run-20260926T233916Z.json` → `/session/token`: same treatment.

Both tokens were local-demo credentials, confirmed dead (old token →
`403 WORLD_AUTH_MISMATCH` against a fresh backend, 2026-09-26). Originals
preserved privately at `~/workspace/private-research-evidence/` (never in
a distributable archive). Original-vs-redacted hashes are in
`research/EVIDENCE-REDACTION.md`.

## 2. Redactions made by this lane

None. The Bureau lane redacts nothing further:

- The UC-001 evidence JSONs contain no bearer tokens or private keys
  (verified by scan: no `bearer`/`token`/`secret`/`private_key` matches
  except the already-redacted correction record).
- `research/bureau/records/canary-evidence.json` and
  `research/bureau/records/canary-probe2.py` were copied byte-for-byte
  from `/tmp/canary-probe/` (ephemeral) into the repo as read-only
  preservation copies. They contain no credentials: the canary's stdout
  carries only canary marker strings (`CANARY-OUTSIDE-READ-ME`,
  `CANARY-HELLO`), file-name listings (never file contents of credential
  or state files), and the observed uid. No real secrets were probed and
  no external service was contacted, per the isolation verdict.

## 3. Excluded from the export

- `~/workspace/private-research-evidence/` — private originals, never
  distributed.
- Live backend data directories (`backend/data/`) — session state, not
  evidence; excluded from the report's source set.
- The QA captures are referenced by hash in SOURCE-MANIFEST.md but are
  not bundled into any archive this lane produces.
