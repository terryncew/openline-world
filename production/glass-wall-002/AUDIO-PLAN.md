# THE GLASS WALL — revision002 audio

This64 s review cut preserves all twelve original dialogue lines, the four exact BONK times (38.000,41.500,45.000,56.500 s), and all five complete-mix silence windows. Non-robot source WAVs and their JSON manifests are bit-identical to approved commit64862a67be2f72661f94b8d4dd01589ef921e998. The original film/audio directory remains untouched.

## Higher, quicker service robot

The new voice uses native Kokoro style interpolation:65% `af_heart` plus35% `am_liam`, calculated from the existing local voice archive. There is no waveform pitch shift, vocoder effect or waveform speed-up. Native voice-style averaging is documented in the official Kokoro pipeline. Auditions of `am_puck`, `af_heart`, `am_liam` and three blend ratios are retained in `audio/auditions/` and `audio/AUDITIONS.json`.

Strong-voiced-frame autocorrelation gives a median of approximately189 Hz across revised robot takes versus133 Hz originally (ratio1.425). Pitch estimates can contain octave errors; perceived pitch, personality and naturalness require listening. Model speed is1.10 on03/04/05,1.154 on short “Watch Margaret” to retain its full take before the camera cut, and1.02 on the provocation to avoid rushing an already brisk joke. All original words are preserved. `OpenLine` is synthesized as `Open Line`; the installed tokenizer produces the same phonemes for both spellings.

| Cue | Actual measured speech | Direction |
|---|---|---|
|03|6.130–7.770 s|Light, direct question; reduced onset delay|
|04|8.530–9.980 s|A complete sentence, with room before the explanation|
|05 first sentence|10.780–11.940 s|“It's got a kill switch.”|
|05 second sentence|12.270–13.460 s|“For protected actions.”;330 ms measured separation|
|06|14.230–15.130 s|Complete short invitation|
|07|21.070–23.480 s|Matter-of-fact provocation, without excessive speed|

These boundaries come from10 ms PCM RMS frames at−45 dB relative to each take's strongest frame. They are not independent forced word alignment. `TIMELINE.json` retains whole-take scheduled bounds and supplies measured speech onset/end, new PCM mouth envelopes, model phoneme predictions, and exact sentence segment bounds for graphics.

Line05 is one complete naturally synthesized two-sentence source. `audio/takes/05-robot-unpaced.wav` retains all71,968 original24 kHz PCM samples. Its existing290 ms quiet boundary receives960 zero samples (40 ms) at source sample32,040. The resulting330 ms separation retains every original sample. `VOICE-REVISION.json` documents exact lossless reconstruction; no faint consonants, word endings or breath tails are trimmed.

## Mixing and story cues

The decorative mallets at6.1,8.9 and11.4 s are removed to expose the robot's weaker consonants. The original introduction, rage jab, later receipt/title notes, humming and physical effects remain. A tiny contact texture lands on controller handoff frame915 (30.5 s). `owner-revoke-slider` lands when the owner completes the pull at frame930 (31.0 s); it replaces the old tablet tap.

The entire mix uses one peak-safe constant master gain. It contains no nonlinear saturation, compression, dynamic limiter, dynamic loudnorm processing or robot EQ. The inherited saturation caused a mixed-line recognizer regression during preparation; removing it restored an exact unprompted robot transcript. Revision target is−18 LUFS±1, maximum−1.5 dBTP, with a−2 dBTP rendering ceiling for AAC headroom. Final source measures−17.76 LUFS and−2.00 dBTP. This slightly lower integrated level preserves consonant shape and impact dynamics.

Original Margaret line09 retains its existing distant low-pass treatment; line10 retains its reduced level. Their original dry takes are unchanged. Each stem receives the same constant master gain and reconstructs the final mix within PCM quantization tolerance.

## Verification and limits

Unprompted PocketSphinx5.0.4 recognition on all five actual revised mixed windows matches every normalized robot word. Under the same unrestricted recognizer and window recipe, the original mix reports two substitutions: “open long” and “protective actions.” The brand is normalized as two words for scoring; no expected transcript, restricted grammar or new dictionary is supplied to the recognizer. ASR success is objective comparison evidence, not proof of first-listen intelligibility, acting or comedic delivery. Human auditory approval is pending.

Research sources and the original measurements are in `SOURCED-VOICE-RESEARCH.md`. Model/voice checksums and licenses remain local. The derivative ONNX only exposes existing `/encoder/Cast_output_0` through an Identity output named `duration`; weights and audio computation are unchanged. No remote API, voice cloning, paid service, upload or publication occurred.

Reproduce auditions with `/workspace/media-tools/venv/bin/python production/glass-wall-002/tools/audio.py --audition-only`, then rebuild the mix/timeline/captions with the same command without `--audition-only`. Both operate only on revision002; approved non-robot caches must already exist and match the original sources.
