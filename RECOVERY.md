# RECOVERY.md — v0.1.2 recovery record

## What happened

The `openline-world-v0.1.1` release was published with a tag/asset mismatch:

- The tag `openline-world-v0.1.1` points at commit `e22712c` — a README-only
  commit on the v0.1.0 tree (194 files). It does not contain the patch.
- The published release asset (`openline-world-v0.1.1-prerelease.zip`,
  SHA-256 `3270248ad2b17868af76b10061673f68bd926526a8740a553fcdf9953e30c945`)
  is the full 213-file patch tree.
- The release was flagged as a full release, not a prerelease.
- The patch commit `e7b879b` is absent from every reachable repository
  (`git cat-file -t e7b879b` fails). It cannot be recovered from git.

So the tag did not describe the asset, and the commit the asset was reported
to come from is gone. v0.1.1 is superseded by this release. v0.1.0 is untouched.

## Provenance of this release

v0.1.2 was recovered from the preserved archive
`openline-world-v0.1.1-prerelease.zip`
(SHA-256 `3270248ad2b17868af76b10061673f68bd926526a8740a553fcdf9953e30c945`).
The original archive was verified byte-identical, set read-only, and left
unchanged; all recovery work ran against a copy.

That archive was historically reported as an export of internal commit
`e7b879b`. That ancestry cannot now be independently verified. **The missing
commit is not claimed recovered.** What is claimed: this tree is the verified
content of that archive, plus the documented exclusions, sanitizations, and
distribution records below.

## What was verified (observed, not inherited)

Against a clean extraction of the preserved archive, on 2026-09-27:

- Square as default arrival; approved robot hosts Wren and Juniper.
- Backend admin reset requires `X-Admin-Token` matching `WORLD_ADMIN_TOKEN`
  (403 `ADMIN_TOKEN_REQUIRED` unauthenticated; 200 with the token); the
  frontend `reset()` path was removed; the Vite proxy routes `/api` to
  `http://127.0.0.1:8471`.
- Launcher binds loopback by default (`127.0.0.1:8471` backend,
  `127.0.0.1:5173` frontend) with an opt-in `--lan` flag.
- Node `^20.19.0 || >=22.12.0` enforced by the launcher and stated in READMEs.
- Custody: vendored Wallet (Apache-2.0) and Claim Graph (MIT) under
  `backend/vendor/` with `VENDOR.md`; browser-profile owner/worker custody
  documented in `docs/joining.md`.
- Docs: browser title "OpenLine World — Bring your agent. Keep your rules.",
  rewritten frontend README, `docs/joining.md` rewritten for admin reset,
  receipt redaction, and browser-owner custody.
- Backend tests: **207/207 green** (`python -m unittest discover`,
  `backend/tests/`). Frontend: `npm ci` exit 0, `npm run build` exit 0, no
  TypeScript errors. Custody demo: 19/19 checks pass, revocation latency
  0.083s, keys held in separate key dirs, server held no owner/worker keys.
- First-run browser flow against the extraction: page title correct, WebGL
  canvas present, "Enter the square" arrival card, Wren/Juniper listed as
  hosts, zero console errors. Screenshot verified.

## Credential and private-artifact scan (2026-09-27)

No private keys, secrets, tokens, `.env` files, email addresses, or phone
numbers found. `clients/keys/` is key-free. `captures/` (37MB dev QA) contains
no personal data and is excluded from the distribution regardless.

## Excluded from the archive (deliberate, documented)

- `captures/` — 37MB of dev QA captures; excluded per the v0.1.0 distribution
  convention.
- `assets/` — demo promo media (poster, gif, mp4); excluded per the v0.1.0
  distribution convention. Nothing in this tree references it.
- `frontend/dist/` — build output; regenerable with `npm run build`.
- `frontend/src/assets/hero.png` — unreferenced by any source file, unknown
  origin; excluded per the v0.1.0 export precedent.
- Root `README-QUICKSTART.md` — byte-identical to `docs/README-QUICKSTART.md`;
  the docs copy is kept.

## Added from the archive (not present at e22712c)

- `frontend/patches/@react-three+drei+10.7.9.patch` — required; the
  `postinstall` script applies it via patch-package and the build fails
  without it.

## Kept from the distribution tree (not the archive's working-tree variants)

- `README.md` — the e22712c distribution README (Terrynce-approved), with the
  Node requirement corrected to `^20.19.0 or >=22.12.0`, test results updated
  to the observed 207/207, and the release provenance section rewritten for
  v0.1.2. The archive's README was a stale working-tree variant
  ("# OpenLine Workshop", unverified test claims, `assets/` references).
- `NOTICE` — the complete distribution attributions (Claim Graph MIT
  attribution, copyright line). The archive's NOTICE dropped both.

## Sanitized

Absolute dev-machine paths (`/home/hatch/workspace/openline-workshop`,
redacted to `<repo>`) in 4 research records:

- `research/ISOLATION-VERDICT-2026-09-27.md`
- `research/evaluation-20260926T233916Z.json`
- `research/run-20260926T233916Z.json`
- `research/bureau/records/canary-probe2.py` (a historical probe record, not
  part of the test suite; its redacted paths are no longer runnable as-is)

No semantic content was altered.

## Release record

- Branch: `release/v0.1.2`, cut from `e22712c` (the v0.1.1 tag base — the last
  verified distribution tree).
- Tag: `openline-world-v0.1.2`.
- The release ZIP is built from the exact tagged commit; its SHA-256 is in the
  GitHub release notes.
- Published as a **prerelease** (v0.1.1 was incorrectly flagged full).
