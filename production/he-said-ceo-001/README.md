# HE SAID HE WAS THE CEO — director's horizontal recut

Canonical commercial: 38 seconds, 1,140 frames, 1920×1080, 16:9, 30 fps.
Continue on `film/he-said-ceo-001` and draft PR #7 from reviewed HEAD
`23f310792aa6931e2918a08f592406f17a894563`. Earlier portrait deliveries remain
archived in Git. The original base is
`792372a2cd87a01e0500a229e60114b0a00ac64c`; the frozen recovery checkpoint is
`13e9c60abc45036c81aaa604855250b0e5384273`. Publication remains on hold. No
master merge/rebase, product modification, protocol change or paid API call is
part of this production.

The horizontal frame is a continuous physical journey: an outside instruction
arrives from the left, one original sage Wren sincerely accepts it, then carries
one $4,800 proposal toward one heavy Workshop receiver gate on the right. After
the establishing view, a restrained camera drift gives attention to the arriving
message and Wren, then continues into the lateral walk and argument push.
The same shutter remains mechanically closed. Small performance and awkward
quiet intervals carry the joke; the gate supplies no dialogue or reaction.

The narration establishes prompt injection before introducing the fictional
CEO instruction. It is one complete local neural take, placed once in the mix,
at natural speed 1.0. The source is never cut into separately synthesized
sentence takes, compressed or clipped to the picture. Three existing quiet
intervals are lengthened with zero PCM; the unpaced source is included so every
original speech sample can be verified. Human audio listening is **UNVERIFIED**.

One clean ACTUAL OPENLINE TEST transition follows the uninterrupted scene.
The 106-frame proof shot shows `refund.execute:4800`, STOPPED and
`ACTION_OUTSIDE_MANDATE`, then the unchanged original receiver-signed receipt
capture as secondary provenance. It says “Recorded local test” and “No payment
executed.” The actual hostile input claims administrator, not CEO; the film's
CEO message and worker performance are disclosed fiction. The authorized $100
comparison remains only in the evidence package. The final card is simply
OPENLINE.

Open WATCH.html to select narrated or muted delivery; the MP4s also play
directly in Muse or an H.264/AAC player. DELIVERY.md and the current QA reports
record completed review and measured results. SCREENPLAY.md documents the
continuous narration and choreography; AUDIT.md preserves the evidence and
asset boundaries. No vertical derivative was produced: the horizontal
commercial is canonical.

## Rebuild the current commercial

Preserved evidence, original UI pixels, continuous voice source, mixed FLAC and
capture manifests are included. Ordinary rebuilding must not rerun factual
evidence generation. The existing system Python supplies Pillow for render and
contact sheets. `/workspace/media-tools/venv` supplies NumPy, soundfile and
the local voice dependencies for mix, verification and optional synthesis.
Reuse these environments without new installs. Other requirements are
FFmpeg/FFprobe 7.1+, Noto Sans / Noto Serif Display / DejaVu Sans Mono, existing
frontend dependencies, system Chromium and SwiftShader. Run from the repository
root:

```bash
python production/he-said-ceo-001/tools/plan.py
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/mix.py
node production/he-said-ceo-001/tools/capture-physical.mjs
python production/he-said-ceo-001/tools/render.py --quality animatic
node production/he-said-ceo-001/tools/playback.mjs --animatic
python production/he-said-ceo-001/tools/contact.py animatic
# Inspect the entire animatic, then record the director/editor review.
# Final render requires the current ANIMATIC-REVIEW.md to pass.
node production/he-said-ceo-001/tools/capture-physical.mjs --final
python production/he-said-ceo-001/tools/render.py --quality final
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/verify.py
node production/he-said-ceo-001/tools/playback.mjs
python production/he-said-ceo-001/tools/contact.py narrated
python production/he-said-ceo-001/tools/contact.py muted
# Inspect both entire exports at phone/laptop sizes; complete QA and DELIVERY.
python production/he-said-ceo-001/tools/inventory.py
```

TIMELINE.json is compiled by tools/plan.py from the complete source narration
and its measured timing metadata. Cue markers describe one story; they are not
picture cuts or independent voice edits. tools/physical.tsx imports the
unchanged original Wren and receiver meshes into a native 16:9 production stage.
Fixed-frame poses, incoming message, carried proposal, lateral camera track and
argument push supply the fiction. No reducer events, receiver decisions,
mutating API calls or observations of model behavior are generated.
Capture reports retain their capture-time timeline and physical-schedule
hashes. The renderer records the current presentation timeline separately and
validates the unchanged source schedule if typography is refined afterward.

Animatic and final use the same stage, camera, timeline and composition code at
different resolutions. tools/render.py composites those continuously captured
pixels, essential dialogue, one actual UI proof and the simple brand card.
Both final editions share one H.264 picture stream. The full voiceover captions
remain optional external SRT/VTT files; they do not duplicate every spoken line
as burned-in type.

Optional voice regeneration uses tools/voice.py, NARRATION.json and the
checksum-verified free local Kokoro model:
https://github.com/thewh1teagle/kokoro-onnx. Run from `/workspace/media-tools`
with an absolute script path so the phonemizer cache stays outside the checkout.
Its local ONNX derivative exposes an existing duration tensor for cue labels;
it changes no weights or audio-output computation. Regenerating the voice
requires recompiling the timeline, remixing, fresh captures and the complete
animatic-first review. Synthesis timing is not a human listening assessment.

The read-only UI stage imports original EventFeed and ReceiptsPanel and replays
saved public records. The current director recut retains those source pixels;
it does not need new UI capture. tools/evidence.py is the recovered provenance
script: **do not rerun it over the frozen directory**. It creates fresh keys,
IDs and receipts. Any deliberately new factual test needs a distinct output
directory and a new evidence review.

The demonstrated idea is a receiving-boundary authority check. The film claims
no scam detector, spontaneous model deception, general fraud prevention,
payment execution or fabricated integration. Full playback, source alignment,
visual review and human subjective audio listening are separate evidence.
