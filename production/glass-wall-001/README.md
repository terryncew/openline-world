# THE GLASS WALL

Open `WATCH.html` with a local static server, or play
`renders/the-glass-wall.mp4` directly. The canonical edition is a 64-second,
1920×1080, 30fps H.264/AAC widescreen commercial. A picture-only edition is
retained as `renders/the-glass-wall-muted.mp4`.

`poster.png`, `opening-frame.png` and `final-title-card.png` are extracted
from the delivered movie. Optional external captions are `captions.srt` and
`captions.vtt`; dialogue captions are not burned into the picture.

The current production/validation record is `QA-REPORT.md`. `AUDIT.md` and
`CLAIM-SHOT-MAP.json` describe the fictional mechanism and its limits.
`ENVIRONMENT-QA.md` preserves the earlier onboarding checkpoint.

The imported Muse handoff is frozen under `preproduction/` at Git commit
`6c7c58b76833e3b6e64da44e1eeb86f80ed32edf`. The user's updated visual direction
supersedes its concept designs; all final characters and architecture are new
matte geometric models. The art uses angular adult caricatures, distinct
mechanical robots and late-modern cream/orange/avocado/blue corporate design.

## Reproduce

Use the existing isolated checkout; do not create another worktree. Preserve
the prepared `/workspace/media-tools/venv`, pinned models and frontend
dependencies. All commands below run from the repository root unless stated.
No old production or frozen experimental evidence is regenerated.

```bash
# Only when refreshing dependencies:
bash /workspace/media-tools/setup.sh

# Full audio regeneration reuses matching complete local voice takes:
cd /workspace/media-tools
/workspace/media-tools/venv/bin/python /workspace/openline-world/production/glass-wall-001/tools/audio.py
cd /workspace/openline-world
/workspace/media-tools/venv/bin/python production/glass-wall-001/tools/artwork.py
node production/glass-wall-001/tools/capture.mjs --preview
node production/glass-wall-001/tools/capture.mjs
/workspace/media-tools/venv/bin/python production/glass-wall-001/tools/render.py
/workspace/media-tools/venv/bin/python production/glass-wall-001/tools/contact.py --video production/glass-wall-001/review/the-glass-wall-animatic.mp4 --output production/glass-wall-001/review/animatic-contacts
node production/glass-wall-001/tools/playback.mjs --animatic
# Inspect the current animatic before issuing ANIMATIC-REVIEW.json with
# status PASS and its capture-time stage_sha256/timeline_sha256.
node production/glass-wall-001/tools/capture.mjs --final
/workspace/media-tools/venv/bin/python production/glass-wall-001/tools/render.py --final
/workspace/media-tools/venv/bin/python production/glass-wall-001/tools/verify.py
/workspace/media-tools/venv/bin/python production/glass-wall-001/tools/contact.py
node production/glass-wall-001/tools/playback.mjs
```

Every scene frame evaluates time `frame / 30`. Source and timeline hashes are
captured and checked throughout rendering, and final capture requires a current
animatic review. Voices follow measured amplitude envelopes, with simplified
mouth animation. Independent human listening and audience response remain
distinct from technical playback and timing validation.

No merge, push, deployment, publication or paid API use is part of this delivery.
