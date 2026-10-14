# THE GLASS WALL — revised review cut

Separate revision of the finished film at
`64862a67be2f72661f94b8d4dd01589ef921e998`, on
`film/glass-wall-revision-002`. The original production/glass-wall-001 movie
and sources are preserved. This revision changes the service robot's voice,
speech timing and masking, supporting phrase graphics, and the controller
handoff. The 64-second story, cast designs, refusal and BONK timing remain.

Main export: `renders/the-glass-wall-revised.mp4`. Poster: `poster.png`.
`WATCH.html` is a local review/comparison player, not a downloadable endpoint.
See `SOURCED-VOICE-RESEARCH.md`, `AUDIO-PLAN.md`, `REVISION-NOTES.md`,
`QA-REPORT.md`, and `DELIVERY-CHECKSUMS.sha256` for the current cut's record.

## Reproduce in the prepared environment

Preserve the existing checkout, frontend dependencies, media venv and pinned
local model/voice assets. No worktree, new model download or product-code edit
is needed. From repository root:

```bash
/workspace/media-tools/venv/bin/python production/glass-wall-002/tools/audio.py
python production/glass-wall-002/tools/graphics.py
node production/glass-wall-002/tools/capture.mjs --preview
node production/glass-wall-002/tools/capture.mjs
python production/glass-wall-002/tools/render.py
/workspace/media-tools/venv/bin/python production/glass-wall-002/tools/contact.py --video production/glass-wall-002/review/the-glass-wall-animatic.mp4 --output production/glass-wall-002/review/animatic-contacts
node production/glass-wall-002/tools/playback.mjs --animatic
# Inspect the actual current animatic. Record its stage/timeline/graphics
# SHA256 values in review/ANIMATIC-REVIEW.json with status PASS.
node production/glass-wall-002/tools/capture.mjs --final
python production/glass-wall-002/tools/render.py --final
/workspace/media-tools/venv/bin/python production/glass-wall-002/tools/contact.py
node production/glass-wall-002/tools/playback.mjs
/workspace/media-tools/venv/bin/python production/glass-wall-002/tools/revision-verify.py
```

The capture refuses final rendering until current sources have passed animatic
review, and refuses source changes during capture. Speech source, model timing,
actual amplitude envelopes and final AAC alignment are distinct measurements.
Human auditory approval remains the user's review; machine tests cannot prove
that every word is intelligible on a first listen.

The film is review-only. No paid API, remote push, merge, publication, release,
deployment or replacement of the original is authorized by this package.
