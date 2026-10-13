# THE GLASS WALL — delivered production and QA

The finished commercial is **64.000 seconds, 1920×1080, 30 fps, 1,920 frames**, with synchronized local dialogue, original music and effects. Canonical file: `renders/the-glass-wall.mp4`; review player: `WATCH.html`. Poster: `poster.png` (exact first-contact frame at 38.000s). Opening and final title frames, external SRT/VTT captions, and a picture-only edition are also included.

Branch: `film/glass-wall-001`. Prepared base: `b14c893a5e7a970ff4098bf514680c27b86e275d`. Final delivery commit is reported with the delivery message. No merge, push, deployment, publication, or paid API use occurred; external API spend **$0**. Other OpenLine repositories and existing product files are unchanged.

## Actual-export checks

| Check | Result |
|---|---|
| Automated production checks | **19 passed; 0 failed; 0 skipped/unrun** |
| Full decode | All 1,920 picture frames and audio decoded without error |
| Format | H.264, yuv420p, limited-range BT.709; AAC stereo 48 kHz |
| Full native-speed browser playback | 64.095s wall time; 1,920 video frames; zero dropped/corrupted frames; audio decoded |
| Dialogue synchronization | All twelve speech anchors: **0 samples of offset**; source/mixed AAC correlation 0.999942 |
| Impacts | 38.000, 41.500, 45.000, 56.500s; sound peaks remain on their exact picture-impact frames |
| Silence | Five complete-mix windows verified; first BONK followed by 38.5–40.0s digital silence; AAC interiors remain zero |
| Music under BONKs | None; all four score-stem windows are digitally zero |
| Final measured audio | **−16.10 LUFS integrated; −1.82 dBTP**, below −1.5 dBTP ceiling |
| Visual review | Actual encoded frames every second, dense confrontation/lawyer sequences, exact cue frames, poster/opening/title reviewed; no remaining visual blocker |

The human owner visibly touches the tablet; the protected electronic door refuses a later request. Margaret remains mobile, protests and strikes a separate physical pane. The receipt is fictional: `door.open — REFUSED`. This film demonstrates no real building integration and makes no claim of unbreakable glass, stopped thought, control of unrelated actions, or rollback. Scope and disclosures are in `AUDIT.md` and `CLAIM-SHOT-MAP.json`.

## Exact sources and tools

- Muse foundation: Git commit `6c7c58b76833e3b6e64da44e1eeb86f80ed32edf`, `preproduction/`; all 15 listed SHA-256 checksums verified before and after import. Reference PNGs retained but not used as final footage.
- All characters, architecture, rigs and camera choreography: original `tools/stage.js`. All receipt/title artwork: original `tools/artwork.py`; installed Noto Serif Display, Noto Sans and Noto Sans Mono (SIL Open Font License).
- All music, humming and foley: original deterministic `tools/audio.py`, with retained stems. Speech: twelve full local Kokoro preset takes. Exact presets, speeds, model URLs/checksums and license snapshots are in `AUDIO-PLAN.md` and `audio/`.
- Rendering: Node 24.19.0, Three.js 0.186.1, Vite 8.3.1, Playwright 1.63.0, Chromium 154.0.8037.57, FFmpeg/FFprobe 7.1.5. Audio/artwork: Python 3.12.14, Kokoro-ONNX 0.6.1, ONNX Runtime 1.31.0, NumPy 2.4.6, SciPy 1.16.3, SoundFile 0.13.1, Pillow 12.2.0.

## Limits and reuse

This is stylized geometric animation with amplitude-driven mouth motion, not detailed phoneme lip sync. **Independent human listening and audience comedy approval remain unverified.** Optional PocketSphinx 5.0.4 recognition matched seven of twelve mixed lines exactly (13.1% aggregate word error rate); its errors do not establish actual speech defects. Voice-archive licensing was not independently established beyond retained upstream model/engine metadata; no broad publication clearance is claimed. Music and effects use no third-party recordings. No vertical cut was produced.

Reusable `install_script` and `start_skill` were saved in the environment draft, including SciPy and the completed production startup/QA commands. The save did not execute scripts or publish. To activate that reusable configuration, review/save it in environment settings, then publish the **environment snapshot**. The film remains unpushed and unpublished. Fresh-task restoration has not been independently tested.

Evidence: `review/automated-qa.json`, `PLAYBACK-final.json`, `VISUAL-QA.json`, `contact-manifest.json`, `source/CAPTURE-final.json`, `audio/QA.json` and `audio/ASR-QA.json`. Reproduction commands: `README.md`.

Canonical MP4 SHA-256: `8a554b7f025a2c14fb50388fbdb86371bdafa2656a27dd596911bd515f810df2`.
