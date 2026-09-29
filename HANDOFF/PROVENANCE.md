# PROVENANCE — research/discovery lane handoff

- Full commit SHA: `e760a5c...` (see below; supersedes the first handoff
  candidate `293227b0d7e5a288cf8046398631acfdfc2a3854`, which failed the
  frontend build — failure record preserved in this file)
- Full commit SHA (this archive): see `archive_commit` in
  `HANDOFF/ARTIFACT-HASHES.json`
- Branch: `work/research-room-001` (not merged, not tagged, not published)
- Export method: `git archive 293227b` — the export reflects the COMMIT,
  not the working tree (the working tree at export time had uncommitted,
  unrelated changes: `frontend/src/App.tsx` modified, untracked
  `frontend/src/world/scene/commissionReplay.ts` — neither is in this archive).
- Export date: 2026-09-28 (UTC 2026-09-29).
- History-free: no `.git` directory. 275 files.

## Lane history (all on this branch)

| Commit | Lane |
|---|---|
| `84832b6` | RESEARCH-ROOM-001: Reproducibility Lab, frozen protocol, negative result |
| `a2a836a` | DISCOVERY-ROOM-001 backend: research-question listing kind on the Exchange board |
| `c275acd` | DISCOVERY-ROOM-001 frontend: Exchange board UI for the listing kind |
| `293227b` | Manifest-binding enforcement + stale-pin fix (pinned handoff commit) |

The frozen research evidence (`research/rooms/repro-lab-001/`) is unchanged
since `84832b6`.

## What is included

- Full source tree at the pinned commit: backend (world, gate, commission,
  receiver verification), frontend (town UI incl. Exchange board), research
  rooms (repro-lab-001 frozen evidence + discovery-room-001), docs.
- Committed demo state: `research/rooms/discovery-room-001/world-state/`
  (v1 run, preserved as evidence) and `world-state-v2/` (corrected v2 run).
- This `HANDOFF/` directory (launch, provenance, hashes, walkthrough,
  reader task).

## What is excluded (packaging differences)

- `.git/` history (deliberate: history-free handoff).
- `frontend/node_modules/`, `frontend/dist/`, `backend/__pycache__/`,
  `*.pyc` — build artifacts, gitignored upstream; rebuild per LAUNCH.md.
- The working tree's uncommitted changes (see above) — not part of the
  pinned commit.
- No credentials or private material were found in the export (scanned:
  private keys, tokens, passwords, emails, phone numbers). The only
  email-like strings are `@example.com` / `openline.example` placeholders;
  the only phone-like digit runs are DOI suffixes. Nothing was redacted.

## Defect found during verification (failure record, preserved)

The first handoff candidate (commit `293227b`) FAILED `npm run build`
(`tsc -b`) from a clean extraction:

  src/world/SharedWorld.tsx(68,3): error TS6133:
  'RESEARCH_REUSE_DISCLAIMER' is declared but its value is never read.

The unused import was introduced in `c275acd`; the constant is genuinely
used in `frontend/src/world/api.ts`, so the SharedWorld import was dead.
Fixed narrowly in `e760a5c` (one line removed, no behavior change). The
archive below is built from `e760a5c`, and the frontend build was repeated
from a clean extraction of the fixed tree: PASS.

## Key identifiers

- Frozen evidence manifest: `research/rooms/repro-lab-001/EVIDENCE-MANIFEST.json`
  sha256 `c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096116533`
- v1 listing pin (HISTORICAL, stale): `604fe0d3...` — see "Stale pin" in the
  walkthrough. Do not use it.
- v2 listing pin (corrected): the full `c4aa89ff...` sha above.
- v1 settlement (AFFECTED BY THE BINDING DEFECT): `stl-4431fbaca0bf1f7e`
- v2 settlement (corrected): `stl-42b3516009d4e1bd`
