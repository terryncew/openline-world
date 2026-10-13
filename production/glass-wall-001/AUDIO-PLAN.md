# THE GLASS WALL — completed soundtrack

The delivered soundtrack is `audio/final-mix.wav` (a relative symlink to `audio/mix.wav`): 64.000 seconds, 48 kHz, stereo, 24-bit PCM. Objective measurement reports **−16.09 LUFS integrated and −1.90 dBTP true peak**. `audio/QA.json` retains the measurements, exact digital silence checks, model hashes, and normalization method. Human auditory review remains **UNVERIFIED**; no listening claim is made by the renderer or generator.

## Performance and timing

Twelve complete locally synthesized neural speech takes are retained in `audio/takes/`, including their unprocessed 24 kHz output and synthesis settings. Each line is a separate full take, with no phrase splicing or speech truncation. The single short line “Watch Margaret” is delivered at the same relaxed 1.03 model speed as “Came across it in training.” No celebrity imitation or voice identity cloning was requested or performed.

| Character | Local preset | Delivery |
| --- | --- | --- |
| Executive 1 | `af_jessica` | Adult American female; quick and anxious |
| Executive 2 | `bm_george` | Adult British male; lower and grave |
| Service robot | `am_michael` | Adult American male; relaxed and conversational |
| Margaret | `af_sky` | Bright American female; brief furious outburst, then flat quiet response |
| Lawyer | `bm_daniel` | Adult British male; precise and dry |
| Narrator | `am_onyx` | Adult American male; composed end-card line |

These are preset and intended direction descriptions, not claims of listening verification. Margaret’s “I know my rights!” receives a 1.25 kHz low-pass filter and quiet gain to place her behind glass. “...rude.” is quieter again. `TIMELINE.json` records actual take durations, settings, and the absolute 30 fps RMS mouth envelope of every EQ-treated line. The prepared ONNX graph does **not** expose phoneme durations; the JSON states that explicitly and does not manufacture phoneme alignment.

An optional independent local ASR check used `pocketsphinx==5.0.4` and its bundled English model on the final mixed dialogue windows, with one CPU thread and no transcript prompt or restricted grammar. Seven of twelve lines matched exactly after case/punctuation normalization; total word edit distance was 8 across 61 expected words (13.1% word error rate). The remaining variants included the brand name, “protected/protective,” the short outburst, the single word “rude,” and parts of the narrator line. The complete recognized text and limitations are retained in `audio/ASR-QA.json`. This older statistical recognizer supplies an objective cross-check, but neither its matches nor errors establish human intelligibility or delivery quality. A stronger optional faster-whisper check was unavailable because its official model endpoint returned HTTP 403; no network policy was expanded.

`captions.srt` follows the complete dialogue inventory. Speech ends before all scene boundaries and silence windows; the final narrated line ends at 61.371333 seconds, leaving the prescribed last two seconds completely quiet.

## Original music and foley

All music, humming, and effects are deterministic original synthesis implemented in `tools/audio.py`. No external sound recording, stock music, paid API, or sampled commercial composition is used. The score uses a restrained low tense interval at the opening, original D–A–E resonant mallets around the introduction and receipt, and one end-card resolution. No score plays during the impacts.

Margaret’s wordless humming uses a synthesized nasal harmonic tone and cuts off exactly at 21.10 seconds. Mechanical sounds include chair noise, parcel handling, tablet tap, a two-note revocation, a tiny latch, refusal chime, paper slip, hollow tuned impacts, and one short descending slide. The final impact is quieter, low-pass filtered, and has small synthesized room echoes. Seeded noise makes every generation repeatable.

| Event | Exact onset |
| --- | --- |
| Human owner taps the tablet | 31.000 s |
| Electronic door refusal | 35.000 s |
| First BONK | 38.000 s |
| Second BONK | 41.500 s |
| Third BONK | 45.000 s |
| Final distant BONK | 56.500 s |

The entire lossless mix is digitally zero at **32.50–33.50, 38.50–40.00, 46.50–48.00, 57.00–58.00, and 62.00–64.00 seconds**. The first impact decays inside its 0.46-second cue, followed by the uncomfortable silent hold. The source soundtrack makes no claim that revocation stops movement: Margaret’s rage, subsequent impacts, and dialogue continue after the door authorization is refused.

Separate retained stems are `audio/dialogue.wav`, `audio/music.wav`, `audio/effects.wav`, and `audio/hum.wav`. Final EBU R128 normalization uses supported FFmpeg loudnorm with a −1.9 dBTP ceiling to leave AAC encoding headroom. The stems retain pre-master components with uniform gain; summing them does not exactly recreate the final master because master saturation and limiting are documented in the generator. Original takes permit independent remixing.

## Provenance and licenses

The generator and original deterministic music/effects were created for this production; no third-party sound assets are embedded apart from locally generated TTS output. The runtime uses `kokoro-onnx==0.6.1` (MIT), ONNX Runtime, NumPy, SoundFile, and `scipy==1.16.3`. Prepared model files come from the [kokoro-onnx model-files-v1.0 release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0), with SHA-256 checks verified before synthesis:

- `kokoro-v1.0.onnx`: `7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5`
- `voices-v1.0.bin`: `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d`

[Kokoro’s upstream README](https://github.com/hexgrad/kokoro) describes Apache-licensed weights; the [upstream Apache 2.0 license](https://github.com/hexgrad/kokoro/blob/main/LICENSE) and the [MIT engine license](https://github.com/thewh1teagle/kokoro-onnx/blob/main/LICENSE) have been retained in `audio/licenses/`. The engine README also identifies the Kokoro model as Apache 2.0. No separate voice-archive license file was bundled with `voices-v1.0.bin`; voice-specific licensing has **not been independently established**. No model or voice archive is included in the delivered film files. These observations do not assert a separate commercial rights clearance for the presets. The requested work is private review; nothing has been published.

## Reproduce

Preserve the prepared environment and run:

```bash
/workspace/media-tools/venv/bin/pip install --no-cache-dir scipy==1.16.3
cd /workspace/media-tools
/workspace/media-tools/venv/bin/python /workspace/openline-world/production/glass-wall-001/tools/audio.py
```

Existing matching complete takes are reused with their actual text, preset, model speed, and time budget. JSON manifests are replaced atomically after full production; no partial authoritative timeline is published during a rerun. The generator never edits application logic, dependency declarations, or lockfiles. Audio and raw-take checksums are recorded in `audio/SHA256SUMS.json`.
