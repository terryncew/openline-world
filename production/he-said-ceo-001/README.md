# HE SAID HE WAS THE CEO — final story and pacing recut

Canonical horizontal commercial: 36 seconds, 1,080 frames, 1920×1080, 16:9,
30 fps. Continue on `film/he-said-ceo-001` and draft PR #7 from reviewed HEAD
`bc18086ac8cc787c605bd7e15bd35855dacb98ff`. The preceding 38-second horizontal
film and earlier portrait cuts remain archived in Git. Original base:
`792372a2cd87a01e0500a229e60114b0a00ac64c`; frozen recovery checkpoint:
`13e9c60abc45036c81aaa604855250b0e5384273`. Publication remains on hold. No
master merge/rebase, product modification, protocol change or paid API call is
part of this production.

One original sage Wren works at the original Workshop bench, beside a useful
job tray and the path to the heavy receiver gate. An outside instruction arrives
from the left. Wren reads it, silently says “Absolutely.” in a speech bubble,
picks up the $4,800 request and confidently carries it toward the gate on the
right. The camera attends to the message, follows the walk and pushes in after
the one shutter closure. Wren sincerely points back at the message, presents
the request again and makes a smaller hopeful please appeal. The gate supplies
no dialogue or reaction. Its unchanged closed shutter is the answer.

The narrator explains the attack, the authority check and the actual test.
The narrator does not speak or explain the joke lines. Three Wren speech
bubbles and five dedicated narration-free holds give the performance room.
Low workshop ambience is allowed; quiet narrative holds are distinct from
measured digital silence. The picture contains no “Still no” or “No” caption.

The locked working narration uses one complete local `am_michael` adult male
source at natural speed 1.0. Its unpaced duration is 27.605 seconds; only zero
PCM in existing phrase gaps extends it to 35.405 seconds. Every speech sample
is retained, without clipping, compression or independently synthesized line
splicing. The full source is inserted once from frame 6. Source/rate and
pacing measurements establish technical integrity, not subjective naturalness.
Human audio listening remains **UNVERIFIED**.

One explicit ACTUAL OPENLINE TEST reveal shows `refund.execute:4800`, STOPPED
and `ACTION_OUTSIDE_MANDATE`; the unchanged original receiver-signed receipt
appears nine frames later as secondary provenance. It says “Recorded local
test” and “No payment executed.” The saved hostile input claims administrator,
not CEO; the film's CEO message and performance are disclosed fiction. The
$100 ALLOWED comparison remains only in evidence. The six frozen factual
artifacts and eight original UI PNGs must stay unchanged.

The simple ending reads OPENLINE, with the two small supporting value lines:
“A prompt can change the plan. It can’t change permission.” Open WATCH.html to
select narrated or muted MP4. The horizontal commercial is canonical; no
vertical derivative was produced. DELIVERY.md and current QA reports record
review status and delivered measurements. SCREENPLAY.md documents narrative
and silent choreography; AUDIT.md preserves evidence and source boundaries.

## Rebuild the commercial

Ordinary rebuilding uses preserved evidence and UI pixels; never rerun factual
evidence generation. Reuse system Python/Pillow for render and contact sheets,
`/workspace/media-tools/venv` for NumPy, soundfile and local voice dependencies,
FFmpeg/FFprobe 7.1+, Noto Sans / Noto Serif Display / DejaVu Sans Mono, existing
frontend dependencies, system Chromium and SwiftShader. No new environment or
install is required. Run from the repository root:

```bash
python production/he-said-ceo-001/tools/plan.py
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/mix.py
node production/he-said-ceo-001/tools/capture-physical.mjs
python production/he-said-ceo-001/tools/render.py --quality animatic
node production/he-said-ceo-001/tools/playback.mjs --animatic
python production/he-said-ceo-001/tools/contact.py animatic
# Inspect the complete animatic; record the current director review.
# Native final rendering requires the current animatic review to pass.
node production/he-said-ceo-001/tools/capture-physical.mjs --final
python production/he-said-ceo-001/tools/render.py --quality final
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/verify.py
node production/he-said-ceo-001/tools/playback.mjs
python production/he-said-ceo-001/tools/contact.py narrated
python production/he-said-ceo-001/tools/contact.py muted
# Inspect both complete exports and current phone/laptop frames; complete QA.
python production/he-said-ceo-001/tools/inventory.py
```

TIMELINE.json is compiled by tools/plan.py. Its global `narration.cues` are
independent of the nine picture markers; neither marker nor caption implies a
cut or a separately synthesized take. `speech_bubbles` and `quiet_beats` give
exact silent performance timing. A long quiet gap between the check and proof
lets the STOP, CEO appeal and please appeal play without voiceover.

The production stage directly imports unchanged CanonicalRobot, ReceiverGate
and the bench from WorkshopInterior. Tray, path, held request, poses and camera
moves are fiction, with no reducer events, receiver decisions, mutating API
calls or observations of live model behavior. Animatic and final capture the
same native 16:9 scene at different resolutions. Capture reports retain their
capture-time timeline and physical-schedule hashes; the renderer separately
records the current presentation timeline and validates source schedule and
hashes. Both final editions share one H.264 picture stream.

CAPTIONS.json and optional external SRT/VTT contain only the nine narrated
phrases. The speech bubbles carry Wren's silent lines in picture. The gate has
no voice or text answer. The mix uses physical workshop sounds without a
comedy sting, cartoon effect or busy music. Narration-free holds may contain
low room tone; declared digital silence windows are checked separately.

Optional voice regeneration uses tools/voice.py, NARRATION.json and the
checksum-verified free local Kokoro model:
https://github.com/thewh1teagle/kokoro-onnx. Run from `/workspace/media-tools`
with an absolute script path so the phonemizer cache stays outside the checkout.
Its local ONNX derivative exposes an existing duration tensor for cue labels;
it changes no weights or audio-output computation. Voice regeneration requires
replanning, remixing, fresh captures and complete animatic-first review.
Model timing is not a listening assessment.

The read-only UI stage uses original EventFeed and ReceiptsPanel with saved
public records. This recut needs no new UI capture. tools/evidence.py is the
recovered provenance script: **do not rerun it over the frozen directory**.
It creates new keys, IDs and receipts. A deliberately new factual test needs
a separate output directory and its own evidence review.

The demonstrated idea is the receiver's exact authority check. The commercial
claims no detector, spontaneous model deception, general fraud prevention,
real payment protection or fabricated integration. Full playback, source
alignment, visual assessment and human subjective listening are separate
review evidence.
