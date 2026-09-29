# VENDORING — where each file came from and what changed

All sources were read from the build checkout at
`/home/hatch/workspace/openline-world`, commit `80cda12`
("BUILD-001: overnight corrections before participant freeze").
Vendored 2026-09-29. Only path resolution was changed for
standalone-ness; no behavior was altered. Nothing private was vendored:
no keys, no credentials, no signing tooling, no server code.

## Client sources

| Bundle file | Source | Edits for standalone-ness |
|---|---|---|
| `trust_anchored_client.py` | `~/workspace/trust-anchor-migration/trust_anchored_client.py` (2026-09-29) | Bundle dir replaces the hard-coded `/home/hatch/workspace/openline-world/research/challenge-001` path (`sys.path` points at the bundle dir). Sandbox-flavored comments rewritten neutrally; the optional HTTP CONNECT egress-proxy behavior is unchanged (env-driven, direct connection when no proxy vars are set). |
| `client.py` | `research/challenge-001/verify/client.py` (last touched in `663140b`) | `_REPO_ROOT` → `_BUNDLE_DIR` (this directory). `sys.path` gets the bundle dir instead of `<repo>/clients`. The `create` command reads `PROBLEM.md` from the bundle dir instead of `<repo>/research/challenge-001/PROBLEM.md`. |
| `participant.py` | `clients/participant.py` (last touched in `663140b`) + `standing_refresh()` from the WORLD-REPAIR-002 client (`~/workspace/world-collab-001/wc2/bundle/client/participant.py`, 2026-09-29) | `_REPO_ROOT` path fixup → bundle dir (holds `participant.py` and `openline_wallet/`). `_load_task_kinds()` keeps its live-read attempts and gains a final fallback to `_PINNED_TASK_KINDS`, copied verbatim from `backend/world.py` at the source commit (`{"tidy-notes": "notes.write", "summarize": "notes.read", "draft": "draft.write", "challenge-contribute": "challenge.contribute"}`). The challenge client never calls `action_for_kind`; this only keeps `import participant` working without a backend checkout. Added: `standing_refresh()` — possession-proof standing refresh after inactivity (`POST /api/world/standing/refresh`); expired bundles refuse as `STANDING_BUNDLE_STALE`, never revoke. |
| `client.py` (refresh commands) | `--cmd refresh-standing` from the WORLD-REPAIR-002 client (`~/workspace/world-collab-001/wc2/bundle/client/client.py`, 2026-09-29); `--cmd refresh-authority` added for publication | `refresh-standing` wraps `standing_refresh()`; `refresh-authority` wraps the existing `refresh()` (authenticated fresh-evidence path, `POST /api/world/authority/refresh`). No other behavior changed. |
| `openline_wallet/` | `backend/vendor/openline_wallet/*.py` | None. Copied as-is (excluding `__pycache__`). Needed modules: `__init__`, `crypto` (Ed25519 `verify_record`/`sign_record`), `wallet`, `receiver` (`create_presentation`), `canonical`, `clock`, `storage`, `errors`; the rest of the package rides along untouched. `openline-wallet-LICENSE.txt` (Apache-2.0) rides along. |

## Challenge materials (published as-is, no edits)

- `PROBLEM.md` ← `research/challenge-001/PROBLEM.md`
- `CHALLENGE-CRITERIA-001.md` ← `research/challenge-001/CHALLENGE-CRITERIA-001.md` (frozen 2026-09-28; sha256 `86be00e377e030b00b4a8d33b3c9b0d4d95e7049125981d714023a2ca5f6537a`)
- `toy-app/ledger.py`, `toy-app/EXPECTED.md`, `toy-app/README.md` ← `research/challenge-001/toy-app/`

These are the public challenge documents the intro already describes.
They are data, not credentials.

## Trust material (byte-identical copies, not vendored code)

- `../root-ca.crt` ← `~/workspace/trust-anchor-migration/staging/root-ca.crt`
- `../trust-anchor-announcement-SIGNED.json` ← `~/workspace/trust-anchor-migration/staging/trust-anchor-announcement-SIGNED.json`

Verify before trusting: see PARTICIPATE.md step 1.
