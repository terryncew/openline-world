# Robot voice research before picture capture

This note was recorded before any revision picture capture. The user's auditory review is the evidence of the performance problem. Automated measurements help choose and synchronize a replacement; they do not establish that a listener understands every word.

## Findings from the original 64862a67 cut

The original robot uses `am_michael` at model speeds 1.01–1.10. A 50 ms autocorrelation estimate on strong voiced frames gives median fundamentals of approximately 128–143 Hz across its five takes. A 10 ms RMS activity analysis, relative to each take's strongest frame, finds first activity 30–130 ms after scheduled take starts (03: 90 ms; 04: 30 ms; 05: 40 ms; 06: 90 ms; 07: 130 ms). Action timing must use actual PCM activity, not assume the first sample is a spoken word. Original export QA reports zero sample offset at all twelve source-to-AAC anchors; that does not support applying an arbitrary global audio offset.

The original duration output is unavailable. All original phoneme arrays are empty. Installed Kokoro ONNX 0.6.1 `create_timed` explains that, without durations, punctuation pause settings affect batch joins only. Its pause insertion module requires timings to top up internal punctuation. Short lines generally occupy one batch, so changing `sentence_pause` alone is insufficient. The original line05 already contains a measured 270 ms quiet interval; the control weakness is not proof that this particular gap is absent.

Original robot full-take rates are approximately 148, 162, 158, 95 and 180 words/minute. Speeding every phrase indiscriminately risks rushing the provocation. Whole-line speech/background RMS contrast for03/04/05 is26.5/23.4/25.6 dB, but weaker active50 ms speech windows can fall to13.3/6.1/11.5 dB. The mallets at6.1/8.9/11.4 s can be removed to leave weak consonants exposed.

Original unprompted PocketSphinx recognition renders OpenLine as “open long” and protected as “protective.” These are comparison warnings, not proof of audible errors. The existing tokenizer produces identical phonemes for `OpenLine` and `Open Line`; whitespace alone does not change pronunciation in this installed implementation.

## Implementation direction

Audition actual local `am_puck`, `af_heart` and `am_liam` at modest speeds1.08–1.12, then choose from measured native pitch and unprompted recognition. Use the existing verified derivative ONNX that exposes the original duration tensor through an Identity output, without changing weights or audio computation. Preserve complete sentences, add a measured300–350 ms separator within line05, and record actual PCM activity alongside model predictions. Rebuild the mouth envelope from the new PCM. Keep original non-robot takes bit-identical and all64 s/BONK/silence timing intact.

Give speech priority over decorative notes. Reinforce OPENLINE and PROTECTED DOOR ACCESS on the handed controller, synchronized with the explanation. Those graphics supplement the voice; they are not a substitute for understandable dialogue. First-listen intelligibility and comic delivery remain subject to human auditory review.

## Primary sources accessed

- [Official Kokoro ONNX README](https://raw.githubusercontent.com/thewh1teagle/kokoro-onnx/main/README.md), read2026-10-13: local presets and recommendation to use Misaki G2P. Installed engine source also inspected: `kokoro_onnx/__init__.py`, `pauses.py`, `chunker.py`, `tokenizer.py`.
- [Official Misaki README](https://raw.githubusercontent.com/hexgrad/misaki/main/README.md), read2026-10-13: explicit pronunciation notation and English G2P/fallback support. No new G2P dependency or model download is required by this revision.
- [Official Kokoro pipeline](https://raw.githubusercontent.com/hexgrad/kokoro/main/kokoro/pipeline.py), read2026-10-13: language, voice and phoneme handling.
- [W3C G56](https://raw.githubusercontent.com/w3c/wcag/main/techniques/general/G56.html), read2026-10-13: speech/background contrast guidance, including a20 dB RMS example. Its associated success criterion formally covers prerecorded audio-only content;20 dB is used as a useful mix design target here, not a film conformance claim.
- [W3C Captions (Prerecorded)](https://raw.githubusercontent.com/w3c/wcag/main/understanding/20/captions-prerecorded.html), read2026-10-13: synchronized dialogue, speaker identification and meaningful sound cues.

Direct Hugging Face, W3C website and ASHA requests returned proxy HTTP403. No network policy change was attempted. All synthesis remains local and free. No human listening is claimed.
