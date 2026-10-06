# HE SAID HE WAS THE CEO — final visual-comedy pass

Production-only OpenLine commercial. 31 seconds, 930 frames, 1080×1920 at
30 fps. Branch `film/he-said-ceo-001`, based on
`792372a2cd87a01e0500a229e60114b0a00ac64c`. This recut replaces the 43-second
delivery at `a106022d78e848c27dc0871f9622fd65a424908c`. The final visual pass
continues from reviewed HEAD `f671cb04d265414cbb48d1a78e4886e43a4fa72e`, preserving
its story, physical performance, voice takes, captions and 31-second timing.
Publication remains on
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

The three presentation changes are an eased 1.62× crop after the first STOP,
a smaller, quieter fictional-scene disclosure in the same position, and a
four-field proof hierarchy above the secondary unchanged receipt capture.
No source choreography, gate behavior, dialogue, evidence or ending changes.

## Rebuild the current presentation

Voice WAV files, mixed FLAC, original UI captures and complete public evidence
are included. Ordinary rebuilding uses the preserved records and voice takes;
do not rerun evidence generation. Use Python 3.12 with Pillow, NumPy and
soundfile, FFmpeg/FFprobe 7.1+, Noto Sans / Noto Serif Display / DejaVu Sans Mono,
and existing frontend dependencies, system Chromium and SwiftShader. Run from
the repository root:

```bash
python production/he-said-ceo-001/tools/plan.py
python production/he-said-ceo-001/tools/render.py --quality animatic
node production/he-said-ceo-001/tools/playback.mjs --animatic
python production/he-said-ceo-001/tools/contact.py animatic
# Inspect complete animatic playback and frames; update ANIMATIC-REVIEW.md.
# Only after that review passes, render the same presentation at final resolution.
python production/he-said-ceo-001/tools/render.py --quality final
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/verify.py
node production/he-said-ceo-001/tools/playback.mjs
python production/he-said-ceo-001/tools/contact.py narrated
python production/he-said-ceo-001/tools/contact.py muted
# Inspect both complete exports, update current QA and DELIVERY, then hash.
python production/he-said-ceo-001/tools/inventory.py
```

TIMELINE.json is compiled by tools/plan.py. Its `presentation` block controls
the crop, disclosure and proof layout. This visual pass reuses the approved
physical source videos and audio; ordinary rebuilding needs no recapture,
voice generation or remix. The PHYSICAL capture reports retain the original
capture timeline hash. The renderer validates their `physical_schedule_sha256`
against the current fps and physical scene, while RENDER.json records the
current presentation timeline hash and unchanged source-video hash. This
separates source performance provenance from the later composition.

Changing fps or `physical_scene` requires fresh captures with
`node production/he-said-ceo-001/tools/capture-physical.mjs` and its `--final`
variant before each corresponding render. Such performance changes are outside
this approved pass. Changes to voice placement or takes would require a fresh
mix and review and are also outside this pass.
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
