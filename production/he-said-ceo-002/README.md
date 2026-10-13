# HE SAID HE WAS THE CEO — revised review cut

Revision: renders/he-said-ceo-revised.mp4. Approved original unchanged at
../he-said-ceo-001/renders/he-said-ceo-narrated.mp4. WATCH.html is a local
comparison player, not a public download endpoint. REVISION-NOTES.md describes
changes; QA-REPORT.md records current actual-export checks.

Use the existing isolated checkout, installed frontend dependencies and
/workspace/media-tools/venv. Keep frozen evidence/recorded UI unchanged. No
worktree, factual regeneration or application-code change is needed.

From repository root (audio generator runs from /workspace/media-tools):

```bash
cd /workspace/media-tools
/workspace/media-tools/venv/bin/python /workspace/openline-world/production/he-said-ceo-002/tools/revision-audio.py
cd /workspace/openline-world
python production/he-said-ceo-002/tools/plan.py
node production/he-said-ceo-002/tools/capture-physical.mjs --preview
node production/he-said-ceo-002/tools/capture-physical.mjs
python production/he-said-ceo-002/tools/render.py --quality animatic
node production/he-said-ceo-002/tools/playback.mjs --animatic
python production/he-said-ceo-002/tools/review-sequence.py animatic
# Review actual current animatic and record timeline/movie hashes in ANIMATIC-REVIEW.md
node production/he-said-ceo-002/tools/capture-physical.mjs --final
python production/he-said-ceo-002/tools/render.py --quality final
/workspace/media-tools/venv/bin/python production/he-said-ceo-002/tools/revision-verify.py
node production/he-said-ceo-002/tools/playback.mjs
python production/he-said-ceo-002/tools/review-sequence.py narrated --file renders/he-said-ceo-revised.mp4
```

Reuses Node/Vite/React Three Fiber/Three.js, system Chromium/SwiftShader,
FFmpeg/FFprobe, Python/Pillow and local Kokoro. Media venv includes NumPy,
SciPy, soundfile, ONNX and cryptography50.0.2. No paid API/new model download.
Direct outgoing attachments are unavailable; external delivery requires an
explicitly authorized destination. Human auditory approval remains separate.
