# THE GLASS WALL — environment validation, production blocked

The film has not been rendered. No finished commercial, poster, or vertical cut
is claimed. This record covers the prepared production tools only.

Branch: `film/glass-wall-001`, based on master
`5dd095b4d7a046569abd4518b1c9a60ae6007015`. No merge, push, publication,
deployment, or paid API call was performed.

## Required handoff missing

The brief specifies Muse's latest revised screenplay, storyboard, art direction,
sound plan, technical-honesty review, and production handoff at
`~/workspace/glass-wall-preproduction/`. `/home/agent/workspace` does not exist;
`/workspace/glass-wall-preproduction` is also absent. Searches of the checkout
and accessible workspace did not locate the package. The remote branch list
contains no glass-wall branch. The earlier productions are available, but are
not the revised handoff. The package's accessible location or its files is the
remaining prerequisite to reading and implementing that requested foundation.

## Verified capabilities

- Existing HTTPS Git proxy: read-only `git ls-remote origin HEAD` succeeds.
- Node 24.19.0, Python 3.12.14, Chromium, Blender 4.3.2, FFmpeg/FFprobe 7.1.5.
- Frozen frontend installation via `npm ci`; writable npm cache is
  `/workspace/npm-cache`. The original default cache was inaccessible.
- Frontend TypeScript/Vite build passes. Existing frontend tests: 46 passed,
  zero failures, zero skips.
- Existing production WebGL stage rendered frame 450 at 960×540 without
  browser page errors. Output is an infrastructure sample, not Glass Wall art.
- Chromium decoded the existing 1920×1080, 36-second production MP4 and advanced
  playback through 47 decoded frames. This is a startup smoke check, not a
  review of the entire old film.
- Blender rendered a factory-scene PNG in background mode. EGL and read-only
  shader-cache warnings did not prevent rendering. Final-scene throughput and
  EEVEE/Cycles suitability have not been benchmarked.
- Checksum-verified local Kokoro ONNX voice inference generated the sample
  “Why don’t you guys use OpenLine?” using `am_michael`, natural speed 1.0:
  2.282667 seconds, 24 kHz PCM, finite samples, peak 0.608403.
- A new 960×540/24fps H.264/AAC smoke MP4 was encoded and fully decoded by
  FFmpeg without errors. Picture: 2.250 seconds; audio: 2.282 seconds; the
  32 ms duration difference is below one picture frame. The smoke has a still
  image, so it does not verify character mouth timing or final-film sync.
- Original source, tests, manifests, lockfile, previous film outputs, and
  frozen factual evidence remain unchanged.

## Asset provenance and tools

The voice smoke uses the free local Kokoro model distributed at
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0.
Model SHA-256:
`7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5`.
Voice archive SHA-256:
`bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`.
These match the repository's existing production pins. Kokoro ONNX 0.6.1,
ONNX Runtime 1.31.0, NumPy 2.4.6, soundfile 0.13.1, Pillow 12.2.0 and ONNX
1.20.1 are installed in `/workspace/media-tools/venv`. Full dependency pins
are in `/workspace/media-tools/requirements.lock`.

The browser sample uses the unchanged OpenLine `he-said-ceo-001` stage and
existing narrated MP4 solely to verify reusable infrastructure. No old robot,
wooden workshop, scene, score, or sound effect is selected for the new film.
No new music or sound effects have been sourced. Voice quality has not received
subjective listening review. Final character designs, animation, dialogue mix,
BONK timing, continuity, film playback, and production tests remain unrun.

## Retained local setup artifacts

`/workspace/media-tools/setup.sh` is the tested repeatable dependency setup.
`smoke-voice.py` and `smoke-browser.mjs` recreate local capability checks.
`stage-smoke.jpg`, `blender-smoke.png`, `voice-smoke.wav`, `av-smoke.mp4`,
`browser-smoke.json`, and `setup-validation.log` are local environment checks.
They are not deliverables for THE GLASS WALL. No service needs to remain running;
the browser smoke starts and closes its own loopback Vite server.
