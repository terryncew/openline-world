# THE GLASS WALL — Reusable Asset Inventory

Read-only survey. Nothing changed, published, or spent.
Repo state: this repository (`terryncew/openline-world`), HEAD `05250b5` ("Recut HE-SAID-CEO
with room for silent performance"), detached HEAD,
origin `https://github.com/terryncew/openline-world.git`.

## Characters (reference only — Margaret and the calm robot are new builds)

- **Wren (sage) + Juniper (blue/terracotta)** — canonical robot actors. Stills:
  `openline-world/frontend/public/hero/` (`wren-working.png`, `wren-stopped.png`,
  `juniper-continuation.png`, `juniper-pregrant.png`, `final-portrait.png`).
  Design reference for the calm robot if he is built in the Wren family.
- **Robot palette** — terracotta / cobalt / sage / cream, in the working copy
  at `~/workspace/robot-town-commercial/checkout/` (clone of openline-workshop,
  HEAD `e7b879b`). Reference only.
- **Character close-up QA** — `~/workspace/qa/chardesign/` (closeup scripts,
  `ch-journey-450x800.mp4`) and `~/workspace/qa/robot-pass/` — directing
  reference for expressive mechanical-limb shots.
- **New keyframes for this film (v2, current)** — `keyframes/v2-near-future/`:
  `margaret-charming.png`, `margaret-furious.png`, `calm-robot.png`,
  `office-environment.png`. Near-future world; v1 wooden-miniature keyframes
  archived in `keyframes/v1-miniature/` (superseded).

## Environments / scenes

- **The Square / Workshop town** — `openline-world/frontend/` (live 3D). No
  boardroom and no glass partition exist; both are new sets.
- **HE-SAID-CEO set** — `openline-world/production/he-said-ceo-001/`: workshop
  bench + receiver shutter gate. The shutter is the closest existing "barrier"
  asset and the visual ancestor of the glass door's lock indicator.
- **"Someone Else's Door" scene** — `~/workspace/agent-video-tool/film/src/scene.html`
  (repo HEAD `5873472`, branch `creative/receiver-door-film`, local-only): warm
  cream/ink/terracotta town with a receiver door. Prior receiver-door visual;
  not directly reusable (faceless figures, not robots).

## Animation / capture techniques

- **Deterministic frame rendering (recommended):** `window.__renderAt(t)` per
  frame — pure function of time, zero clock drift — parallel Chromium workers +
  ffmpeg assembly (`~/workspace/agent-video-tool/film/src/capture.py`;
  graded 14/16 in its PRODUCTION-RECEIPT.md).
- **Browser capture:** Playwright + headful Firefox under Xvfb `:99`; 450×800
  viewports record clean, scale 1.6× → 720×1280 (`~/workspace/film/CAPTURE_NOTES.md`).
- **Wall-clock drift correction (verified in scripts):** linear
  `setpts=(PTS-b/TB)/a` correction in `~/workspace/openline-film/workyours/finalize.sh`
  (also `ballnoauthority/finalize.py`, `didntsaydothat/finalize.py`,
  `~/workspace/qa/wc-reversed-build.sh`). Confirms the AGENTS.md 2026-09-28 entry.
- **Film-beat capture logging:** `~/workspace/qa/ow_film.py` → `film_raw/*.webm` +
  `film_beats.json` (named scenes with absolute start times). Reusable shot-log
  convention for Margaret's beats.
- **Editing:** ffmpeg pipelines, `.ass` burned captions, SRT, poster frames;
  finished commercials in `~/workspace/film/`.

## Audio ($0)

- **Voices, local:** kokoro-onnx 0.6.1 — flagship-001 used voice `af_heart`
  (`production/flagship-001/tools/narrate.py`, SHAs pinned in
  `audio/VOICE-SOURCES.json`); he-said-ceo-001 used `am_michael`. Fallback:
  bundled `tts` CLI (`tts synthesize-script`, multi-speaker).
  ⚠️ `/workspace/media-tools/venv` (kokoro env) is **not present** on this VM —
  Codex must verify/rebuild or use the `tts` CLI.
- **Music/SFX:** no royalty-free library anywhere; all original deterministic
  synthesis. Templates: `~/workspace/agent-video-tool/film/src/audio.py`
  (numpy 48kHz: motif, footsteps, thuds, slides) and
  `~/workspace/openline-film/workyours/synth.py` (music bed + SFX stems).
- **Sonic signature (reuse):** D–A–E soft resonant mallets + mechanical latch +
  complete STOP silence (`production/flagship-001/BRAND-CANON.md`).

## Production scripts (templates)

- **Full package template:** `openline-world/production/flagship-001/`
  (SCREENPLAY.md, SHOTS.json, EDITS.json, STORYBOARD.md, TREATMENT.md,
  AUDIO-PLAN.md, NARRATION.json, ASSET-INVENTORY.json, AUDIT.md, CLAIMS.md,
  WATCH.html, tools/{capture, narrate, render, mix, plan-shots, stage}).
- **Single-commercial template (closest model):** `openline-world/production/he-said-ceo-001/`
  — 36s physical-comedy commercial, silent performance, narration-free holds,
  TIMELINE.json, CLAIM-SHOT-MAP.json, TECHNICAL-QA.json, PLAYBACK-QA.json.
- **Animatic pipeline:** `tools/plan.py` → `tools/render.py` → `tools/playback.mjs`
  → `tools/contact.py`; `ANIMATIC-REVIEW.md` gates final capture.
- **Prior scripts for tone:** `~/workspace/film/openline-hiring-help-main-script.md`,
  `~/workspace/film/openline-unattended-explore-script.txt`.
- **Voiceover canon:** `openline-world/frontend/public/hero/VOICEOVER-CANONICAL.txt`
  (frozen; tone reference only — not this film's text).

## Visual style canon

`openline-world/production/flagship-001/BRAND-CANON.md`: cream `#f3ead9`,
ink `#3d3428`, gold authority, restrained red refusal; Noto Serif Display +
Noto Sans; name at final reveal only. Reference reels:
`frontend/public/hero/` (`visual-canon-review.mp4`, `openline-hero.mp4`,
`town-demo-vo.mp4`).

## Gaps — what does NOT exist yet

1. Margaret, the calm robot, the executives, the lawyer — new characters.
2. Boardroom set; glass partition + transparent security door — new sets.
3. Charging/bonk impact animation — new rig (only STOP/latch sound patterns exist).
4. Multi-character dialogue voices — only single-narrator TTS proven locally.
5. Dialogue-driven comedy — prior films are narration-led.
6. End-card line "The AI can ignore STOP. The consequence can't." — new.
