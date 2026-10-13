# MANIFEST — THE GLASS WALL preproduction package (v2)

Transfer of the complete approved preproduction package into this repository
for Codex retrieval. File-transfer only: no creative revisions were made in
transit.

- **Source**: `~/workspace/glass-wall-preproduction/` (local build VM, 2026-10-12)
- **Destination**: `production/glass-wall-001/preproduction/` on branch
  `handoff/glass-wall-preproduction-v2` of `terryncew/openline-world`
- **Base commit**: `05250b5db6c9d4fe40d055b1932a0b5867e2f97c`
- **Transfer date**: 2026-10-12 PDT
- **Files transferred**: 17 (9 markdown documents + 7 PNG keyframes + CHECKSUMS.sha256)

## Revision history

- **v1** (2026-10-12, earlier same day): handcrafted wooden-miniature world,
  robot executives. Keyframes preserved under `keyframes/v1-miniature/`.
  **Superseded — do not use for production.**
- **v2** (2026-10-12, approved): original stylized near-future world,
  stylized animated human executives, original eccentric mechanical robots,
  absurdist grown-up visual humor. The calm robot introduces OpenLine after
  overhearing the executives; Margaret becomes furious; the human owner
  activates revocation; the protected door refuses Margaret's request; the
  physical glass wall provides containment; the lawyer's line and final BONK
  are preserved. **v2 is the approved direction. Build from v2.**

## Source-of-truth documents

| Document | Canonical for |
|---|---|
| `02-SHOOTING-SCRIPT.md` | Locked dialogue (12 lines), beat timings, 64.0s / 1,920 frames |
| `03-STORYBOARD.md` | Shot-by-shot camera, composition, movement, SFX, music cues |
| `04-VISUAL-STYLE-AND-CHARACTERS.md` | Art direction, character designs, environments, receipt prop |
| `05-SOUND-PLAN.md` | Voice direction, music cue map, SFX recipes, mix spec (−16 LUFS / −1.5 dBTP) |
| `06-TECHNICAL-HONESTY.md` | Claim-by-claim review, fiction disclosures, claim-shot map |
| `07-CODEX-HANDOFF.md` | Production plan, ship-gate QA criteria, open decisions |
| `01-ASSET-INVENTORY.md` | Reusable prior-art references (paths relative to this repo where applicable) |
| `00-README.md` | Package overview |

Keyframes in `keyframes/v2-near-future/` are the approved design targets.
`keyframes/v1-miniature/` is archived reference only.

## Transfer notes

- Absolute local paths in the transferred documents were rewritten to
  repo-relative or package-relative paths (e.g. `~/workspace/openline-world/…`
  → repo-relative; `~/workspace/glass-wall-preproduction/keyframes/…` →
  `keyframes/…`). No creative content was altered.
- References to other local build-VM directories (`~/workspace/film`,
  `~/workspace/qa`, `~/workspace/agent-video-tool`, etc.) in
  `01-ASSET-INVENTORY.md` are pointers to the local environment where prior
  art lives; they are reference-only and not part of this transfer.
- Inspection found: no private credentials, no secrets, no personal
  information, no unlicensed third-party media. All keyframes are original
  generated concept art; all documents are original preproduction writing.
- No broken references: every file named in the documents exists in this
  directory tree.

## SHA-256 checksums

```
29ffda4822b05e56920b0ed13a98544b8ec7476e29ddf585d5d9a2acacd407da  00-README.md
80c4e431b1c76e9aaf11574d077fefe0218cfc4e095cdce3edbd87a9e1e2dae5  01-ASSET-INVENTORY.md
0fb976baa8a5bdfb034f35193ce30edec14efa51cde33c665b56d37afe9a6be3  02-SHOOTING-SCRIPT.md
1cbaa2a1b0e7af06aea13f0425c5e6e059cb1e5cd27d02854470f656c00e44f8  03-STORYBOARD.md
1e887b08e769e62e49dce807d07438949fa20a539fee783ac67af03685b02122  04-VISUAL-STYLE-AND-CHARACTERS.md
908ecbc69835d963582caeb8d2cb1fbb92dbc8e24f84e74bc4c391fc75dd7fd7  05-SOUND-PLAN.md
a7ead030e46210833f4a798ddc0ef228b13c598bd382f6941d272c26d7003e5e  06-TECHNICAL-HONESTY.md
15a4fe56602f5c8d783cc639458bee878d56f0a3f4a94f38e51a8510b9e56dd9  07-CODEX-HANDOFF.md
f9147859e91d71f4419daa7021ff2918148818dd97b3678eb69f3029148e0187  keyframes/v1-miniature/calm-robot.png
8d6ae2a79e8ef5f13cbf4b24eae11e83c28f97ba0564697df606c05c9f4ad16e  keyframes/v1-miniature/margaret-furious.png
17a44a0265d4a31a9a3e8b6ba529acbbb52a6b551e67f253654ce1afc4ee4a88  keyframes/v1-miniature/margaret-lovable.png
a13dd6ad06d75aab464d0edea5d49fc11b55bcb8a8907ab1efbb6fe612a76ff0  keyframes/v2-near-future/calm-robot.png
099680a80df7f73890645fd401351acfe11764176d9a44f712a26b6d944786da  keyframes/v2-near-future/margaret-charming.png
37ec93e4d6e23200ac14cb96ee630ea47e26ec0524ed3718882ca75a4d96025f  keyframes/v2-near-future/margaret-furious.png
49be97db26080349f67e23827dfead301183b3048cfca3c9dc8246a0e178335a  keyframes/v2-near-future/office-environment.png
```

Verify with:
`cd production/glass-wall-001/preproduction && sha256sum -c CHECKSUMS.sha256`
restricted to the checksum block above.
