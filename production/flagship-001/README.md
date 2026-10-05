# OpenLine — The Work Stays

A flagship production built from current HEAD
`2235fa6ce916876cd39ed35be97263ddfc111b6a`, on the separate branch
`film/openline-flagship-001`. No merge or deployment.

Open `WATCH.html` with a local static server, or play any MP4 directly.
Every render is a normal H.264/AAC MP4 with fast-start metadata.

| Cut | Play / download |
|---|---|
| 90-second cinematic master | [openline-master-90.mp4](renders/openline-master-90.mp4) |
| 60-second flagship | [openline-flagship-60.mp4](renders/openline-flagship-60.mp4) |
| 30-second hero | [openline-hero-30.mp4](renders/openline-hero-30.mp4) |
| 15-second cut | [openline-cut-15.mp4](renders/openline-cut-15.mp4) |
| 30-second portrait/social | [openline-social-vertical-30.mp4](renders/openline-social-vertical-30.mp4) |
| Developer ending (68s) | [openline-developer-ending.mp4](renders/openline-developer-ending.mp4) |
| Security/buyer ending (68s) | [openline-buyer-ending.mp4](renders/openline-buyer-ending.mp4) |

Muse can fetch the branch, open this directory and display the committed MP4s.
A direct remote master URL is:
https://raw.githubusercontent.com/terryncew/openline-world/film/openline-flagship-001/production/flagship-001/renders/openline-master-90.mp4

All cuts share source footage, narration takes and the original sonic identity.
Horizontal delivery: 1920×1080, 24 fps. Portrait delivery: 1080×1920, 24 fps,
with authored crops, a wide owner-link inset and re-typeset evidence/end artwork.
Audio: 48 kHz stereo AAC; original score and foley; local neural narration.
Separate master score, effects and voice stems are retained under `audio/`.

## Production record

- `AUDIT.md`, `ASSET-INVENTORY.json`, `EVIDENCE-INVENTORY.json`: existing scenes/media, capability corpus and verified limits.
- `TREATMENT.md`, `SCREENPLAY.md`, `STORYBOARD.md`: story and creative choices.
- `SHOTS.json`, `EDITS.json`, `renders/*-MANIFEST.json`: classifications and edit provenance.
- `CLAIMS.md`, `evidence/`: real run, complete signed receipts and existing test results.
- `AUDIO-PLAN.md`, `BRAND-CANON.md`, `audio/*-CUES.json`: reusable sound and visual identity.
- `CAPTURE-NOTES.md`, `tools/`: controlled capture and reproducible edit/mix tooling.
- `review/TECHNICAL-QA.json`, `review/PLAYBACK-QA.json`, `review/QUALITY-GATE.md`: measured checks and review limits.

The real STOP is Wren's `notes.read` request after explicit owner revocation.
Juniper's first reach has no mandate and produces no signed receipt. The owner
then grants a separate mandate with the same bounds, and work resumes on the
same job. Three signed receipts and two synthetic checkpoints survive.
This demonstrates the local scripted Workshop, not a live provider switch or
production integration. Application/protocol implementation files are unchanged.

## Reproduction

Use the repo's installed frontend dependencies and system Chromium/FFmpeg.
The media Python environment needs numpy, Pillow, soundfile, cryptography,
onnxruntime and kokoro-onnx. Model and voice assets are checksum-pinned in `tools/narrate.py`;
the large model weights are not committed. Existing capture/audio sources are
committed, so remixing the seven films does not require model downloads.

```sh
python production/flagship-001/tools/plan-shots.py
python production/flagship-001/tools/plan-edits.py
# To create a fresh evidence run (also changes signatures):
.venv/bin/python production/flagship-001/tools/export-evidence.py
BROWSER_EXECUTABLE=/usr/bin/chromium node production/flagship-001/tools/capture.mjs
python production/flagship-001/tools/artwork.py
# Use a Python environment with soundfile/numpy for the next commands:
python production/flagship-001/tools/mix.py
python production/flagship-001/tools/render.py
python production/flagship-001/tools/verify.py
python production/flagship-001/tools/contact-sheets.py
BROWSER_EXECUTABLE=/usr/bin/chromium node production/flagship-001/tools/playback.mjs
```

For an exact re-edit, keep the committed evidence and sources and begin with
`artwork.py`, `mix.py` and `render.py`. A new evidence export requires recapturing
the receipt UI so its visible signature still matches the retained artifact.

The master is a playable production render. Perceptual audio listening and
independent cold-viewer/advertising approval are unverified in this environment;
technical playback and signal measurements are reported separately. Neural
narration is disclosed rather than described as a human recording.
