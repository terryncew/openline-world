# Evidence redaction record

## What was removed

Two revoked local-demo bearer tokens were removed from distributable
evidence files. The tokens were captured for a capture session's
ResearchInspector and are local-demo credentials only — never production,
never separately billed.

1. `research/correction-20260927T000442Z.json` → `/participant_token`
   (correction demo, participant `research-desk-correction` / agent `atlas-1`)
2. `research/run-20260926T233916Z.json` → `/session/token`
   (original demo run, participant session token)

Both values were replaced with the string:
`REDACTED — bearer removed from the distributable copy; original preserved privately (see research/EVIDENCE-REDACTION.md)`

## Why

Distributable evidence must not carry credentials, even revoked local-demo
ones. The originals are preserved privately for audit.

## Credential-dead confirmation

- The correction demo's own step 4 revoked the mandate; the next proposal
  returned `STOPPED` / `MANDATE_REVOKED` (signed receipt in the evidence).
- The demo session's backend data directory was wiped after the run.
- Probed 2026-09-26 against a fresh backend (127.0.0.1:8471):
  `POST /api/world/newsroom/submit-report` with the old token returned
  `403 WORLD_AUTH_MISMATCH`. The token authenticates nothing.

## Where the originals live

`~/workspace/private-research-evidence/` — marked
`PRIVATE-DO-NOT-DISTRIBUTE.txt`. Never place this directory in a handoff
ZIP, a public repo, or any distributable archive.

## Hashes

Originals (private, unredacted):
- correction-20260927T000442Z.json: `c2f4769be97e0d1e0e877fa599add56231bf35ace30f1ef0e62299c24c8f166b`
- run-20260926T233916Z.json: `cf228fb567001720a71fdea3737a9a480dd1c3d9468724111856b50edf10255d`

Sanitized copies (in this tree):
- correction-20260927T000442Z.json: `0ee6933c8f5a1611dbb4562502523232991943c4d1aeebcbab93a58f997fbeb2`
- run-20260926T233916Z.json: `c7ae307fc4dfcb8fcc6879d2eb084da0dbff2447480b8cd95993d8e160303e11`

## What differs from the historical record

This redaction is a NEW commit on top of `3ed7234`. The historical
commits (`b6bd4b79`, `3ed7234`) keep the original bytes untouched. The
sanitized files are NOT byte-identical to the historical originals: the
only change is the token value → redaction string. Nothing else in either
file was altered.

## Git history and distribution

A redaction commit removes the tokens from current files only — NOT from
earlier commits. The git history still contains the original tokens in the
historical commits. That history stays private: it is NEVER pushed to a
public remote, NEVER cloned into a distributable artifact, and NEVER
shipped as part of the handoff.

The DISTRIBUTABLE TREE (what leaves this machine) is the sanitized
working tree only:
- exported with `git archive <sanitized-commit>` — a single commit, NO
  `.git` directory, NO history, NO reflog, NO packed objects;
- scanned for credential patterns before packing (see below);
- the only evidence files included are the sanitized copies (sha256s in
  "Hashes"); the originals and their private directory are outside the
  tree and excluded by explicit rule, not by `.gitignore` alone.

Verify after export: unzip in a fresh directory, confirm no `.git`
directory exists, re-run the credential scan on the exported tree.

## Credential scan

Scanned the distributable tree (py/ts/tsx/json/md/sh/txt) for API keys,
secrets, private keys, and bearer tokens. One false positive (a key-format
constant string inside the vendored `cryptography` package source); no
other credentials found. `backend/data/` (git-ignored, session state) was
excluded from distribution by `.gitignore`.
