# Delivery checks

The final seven exported files pass complete H.264/AAC decoding, native 24-fps frame counts, zero stream starts and exact planned audio/video durations. All speech windows retain their source timing (minimum waveform correlation 0.942), and the interior of every STOP-silence window decodes to zero.

Three complete receiver receipts verify against the captured gate key. The 26 existing Workshop tests pass. Application and protocol files are unchanged from the production base.

| File | Duration | Size | Integrated | True peak |
|---|---:|---|---:|---:|
| [openline-master-90.mp4](../renders/openline-master-90.mp4) | 90s | 1920×1080 | -16.62 LUFS | -1.86 dBTP |
| [openline-flagship-60.mp4](../renders/openline-flagship-60.mp4) | 60s | 1920×1080 | -16.11 LUFS | -1.76 dBTP |
| [openline-hero-30.mp4](../renders/openline-hero-30.mp4) | 30s | 1920×1080 | -15.94 LUFS | -1.62 dBTP |
| [openline-cut-15.mp4](../renders/openline-cut-15.mp4) | 15s | 1920×1080 | -15.39 LUFS | -1.56 dBTP |
| [openline-social-vertical-30.mp4](../renders/openline-social-vertical-30.mp4) | 30s | 1080×1920 | -16.36 LUFS | -1.84 dBTP |
| [openline-developer-ending.mp4](../renders/openline-developer-ending.mp4) | 68s | 1920×1080 | -16.69 LUFS | -1.63 dBTP |
| [openline-buyer-ending.mp4](../renders/openline-buyer-ending.mp4) | 68s | 1920×1080 | -16.46 LUFS | -1.90 dBTP |

Full hashes, voice-window timing, silence measurements and per-file decode outcomes are in [TECHNICAL-QA.json](TECHNICAL-QA.json). Browser outcomes and final-byte hashes are in [PLAYBACK-QA.json](PLAYBACK-QA.json). The instrumented headless player reports occasional presented-frame drops during screenshot capture; those counts are retained in the report. Encoded frame counts and complete decoding were verified separately. The committed master is under GitHub’s per-file size limit and uses ordinary Git, with no external media account or Git LFS dependency.

Audio perception is unavailable to this agent. These measurements and unmuted playback do not certify naturalness, audible balance or independent audience comprehension. See [QUALITY-GATE.md](QUALITY-GATE.md) for the maker’s advertising review and its limits.
