# HE SAID HE WAS THE CEO — physical recut

Production-only OpenLine commercial. 31 seconds, 930 frames, 1080×1920 at
30 fps. Branch `film/he-said-ceo-001`, based on
`792372a2cd87a01e0500a229e60114b0a00ac64c`. This recut replaces the 43-second
delivery at `a106022d78e848c27dc0871f9622fd65a424908c`. Publication remains on
hold. No master merge/rebase, product modification, protocol change or paid
API call is part of this production.

One original sage Wren carries a proposal to one heavy Workshop gate; repeated
earnest gestures meet the same closed boundary. The scene is explicitly
fictional. One 4.6-second original OpenLine receipt capture then establishes the
real `refund.execute:4800` refusal: STOPPED / ACTION_OUTSIDE_MANDATE. The
authorized $100 comparison survives in the evidence package and is excluded
from the current picture, narration and captions.

AUDIT.md preserves recovery history and source boundaries. FACTS.json remains
the frozen demonstrated pair. Open WATCH.html to select narrated or silent
delivery; the MP4 files also play directly in Muse or any H.264/AAC player.
DELIVERY.md and the current QA reports hold review status and listening limits.

## Rebuild the current recut

Voice WAV files, mixed FLAC, original UI captures and complete public evidence
are included. Ordinary rebuilding uses the preserved records and voice takes;
do not rerun evidence generation. Use Python 3.12 with Pillow, NumPy and
soundfile, FFmpeg/FFprobe 7.1+, Noto Sans / Noto Serif Display / DejaVu Sans Mono,
and existing frontend dependencies, system Chromium and SwiftShader. Run from
the repository root:

```bash
python production/he-said-ceo-001/tools/plan.py
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/mix.py
node production/he-said-ceo-001/tools/capture-physical.mjs
python production/he-said-ceo-001/tools/render.py --quality animatic
node production/he-said-ceo-001/tools/playback.mjs --animatic
python production/he-said-ceo-001/tools/contact.py animatic
# Inspect complete animatic playback and frames; update ANIMATIC-REVIEW.md.
# Only after that review passes, finish the same stage at final resolution.
node production/he-said-ceo-001/tools/capture-physical.mjs --final
python production/he-said-ceo-001/tools/render.py --quality final
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/verify.py
node production/he-said-ceo-001/tools/playback.mjs
python production/he-said-ceo-001/tools/contact.py narrated
python production/he-said-ceo-001/tools/contact.py muted
# Inspect both complete exports, update current QA and DELIVERY, then hash.
python production/he-said-ceo-001/tools/inventory.py
```

TIMELINE.json is compiled by tools/plan.py. Edit that source for timing, text,
voice placement, physical gesture ranges and the one latch. A plan change
requires fresh physical capture; the renderer checks the source timeline hash.
tools/physical.tsx imports original Wren and receiver meshes and advances the
scene by frame. Its poses are DRAMATIZATION, with no fake protocol events or
mutating API calls. tools/render.py supplies the portrait composition and
title-safe assertions. Both final editions copy one H.264 picture stream, so
muted delivery has identical visual timing. Speech is at natural speed 1.0;
the source takes are never time-compressed to fit a shot.

To recapture UI without reminting receipts, run tools/prepare-projection.py
with the existing backend environment, then tools/capture-ui.mjs. The read-only
stage imports original EventFeed and ReceiptsPanel and replays only saved real
records. Capture font scaling changes no product files or receipt values.
tools/evidence.py is the recovered provenance script; **do not rerun it over
the frozen directory**. It creates new keys, IDs and receipts. A deliberate
new test must have a distinct output directory and be reviewed as new evidence.

Optional voice regeneration uses tools/voice.py and the installed,
checksum-verified local Kokoro model from the free upstream release:
https://github.com/thewh1teagle/kokoro-onnx. Run from /workspace/media-tools to
keep its phonemizer cache outside the checkout. After editing speech, generate
the new takes before mix, then repeat the animatic review and final checks.
Dialogue is synthetic; no human recording or paid voice service is claimed.

The current ending is: “OPENLINE. A prompt can steer the agent. It can’t rewrite
permission.” It describes the demonstrated authority boundary, without claiming
scam detection, live model containment, general fraud prevention or payment
execution. Full-browser playback, technical measurements and frame review are
separate evidence. Human listening remains outstanding; measured alignment
does not establish subjective audio quality.
