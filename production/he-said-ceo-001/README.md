# HE SAID HE WAS THE CEO

Production-only OpenLine commercial. 43 seconds, 1080×1920, 30 fps. Branch
`film/he-said-ceo-001`. Based on
`792372a2cd87a01e0500a229e60114b0a00ac64c`. No master merge/rebase, product
modification, protocol change or paid API call. Publication is on hold.

The recovery checkpoint and frozen evidence are documented in AUDIT.md.
FACTS.json contains the exact demonstrated pair. The first part is fictional
comedy, explicitly labelled; the second is a read-only capture of the real
recovered test records using existing OpenLine UI components.

Open WATCH.html locally to select the narrated or silent edition. Use the
MP4 files directly for playback in Muse or any H.264/AAC player. See DELIVERY.md
for artifact paths, review status and audio-listening limits.

## Rebuild the preserved production

The voice WAV files, mixed FLAC, original UI captures and full public evidence
are included. Ordinary rebuilding needs no evidence regeneration or model call.
Use Python 3.12 with Pillow, NumPy and soundfile, FFmpeg/FFprobe 7.1+, the Noto
Sans / Noto Serif Display / DejaVu Sans Mono fonts, and the repository's existing
frontend dependencies for capture/playback. RENDER.json records font hashes.
Run from the repository root, with the cloud's existing media-tools Python
environment where soundfile is needed:

```bash
python production/he-said-ceo-001/tools/plan.py
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/mix.py
python production/he-said-ceo-001/tools/render.py --quality animatic
node production/he-said-ceo-001/tools/playback.mjs --animatic
python production/he-said-ceo-001/tools/contact.py animatic
# Inspect the complete animatic, then write/update ANIMATIC-REVIEW.md.
python production/he-said-ceo-001/tools/render.py --quality final
/workspace/media-tools/venv/bin/python production/he-said-ceo-001/tools/verify.py
node production/he-said-ceo-001/tools/playback.mjs
python production/he-said-ceo-001/tools/contact.py narrated
python production/he-said-ceo-001/tools/contact.py muted
python production/he-said-ceo-001/tools/inventory.py
```

TIMELINE.json is compiled by tools/plan.py; edit the shot rows there. It is the
single timing source for type, cuts, SFX, speech placement and captions.
tools/render.py contains the editable composition and asserts title-safe
geometry. Animatic and final use that same code. Both final editions copy the
same H.264 picture stream, so silent delivery cannot drift from the narration.

To recapture UI without reminting receipts, run tools/prepare-projection.py
with the existing backend environment, then tools/capture-ui.mjs. The stage
imports the original EventFeed and ReceiptsPanel and replays only the preserved
real records. Capture-only font scaling changes no product files or values.
tools/evidence.py is the recovered provenance script; **do not rerun it over
the frozen directory**. It creates fresh keys, IDs and receipts. A deliberately
new test must use a distinct output directory and be reviewed as new evidence.

Voice regeneration is optional. tools/voice.py uses the already installed
checksum-verified local Kokoro model from the free upstream model-files-v1.0
release at https://github.com/thewh1teagle/kokoro-onnx. It writes only the local
production audio takes. Run it from /workspace/media-tools to keep its local
phonemizer cache outside the checkout. Dialogue is synthetic, not a human
recording. External API spend: $0.

Source inventory, claim mapping, animatic review, technical QA and full-browser
playback QA are included. Human listening remains outstanding; measured
speech-window alignment is not a substitute for subjective listening.
