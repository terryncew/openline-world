# THE GLASS WALL — revised cut QA

Actual export: `renders/the-glass-wall-revised.mp4`, 28,510,496 bytes.
SHA256: `85dce48c263d717c9f130b3f6516da770c9fcf505236afd46f9a9c5dd835903f`.
This separate review cut is based on original commit
`64862a67be2f72661f94b8d4dd01589ef921e998`.

## Actual movie checks

**46 production/revision checks passed; zero failed.** Human listening/comedy
approval is the one explicitly unperformed item. These are film checks,
distinct from the retained earlier environment onboarding checkpoint.

The actual MP4 is 64.000 seconds, 1920×1080, 30 fps, 1,920 frames, H.264/yuv420p
limited-range BT.709 with stereo 48 kHz AAC. Complete audio/video decode and
every video timestamp pass; both streams start at zero. No decoder or stream error was detected.

All five robot cues retain their complete source PCM in the dialogue stem and
show 0 samples / 0 ms lag against the delivered AAC, with correlation ≥0.999881.
The full line 05 source is reconstructed bit-exact from all 71,968 unpaced
samples plus 960 inserted zeros. Its measured 330 ms sentence gap survives AAC
encoding; the guarded gap interior measures −76.93 dBFS.

Unprompted local PocketSphinx recognition of the actual MP4's five robot
windows matches every normalized word: zero word errors. The expected script
is used only for scoring after recognition; no restricted grammar, transcript
prompt or custom dictionary is supplied. Source pitch/activity checks confirm
a higher register and approximately 6.8% quicker speech activity. These tests
do not establish perceived naturalness or first-listen human intelligibility.

The encoded mix measures −17.79 LUFS integrated and−2.04 dBTP. The slightly
quieter revision target is −18 LUFS ±1, with peak headroom. A single constant
gain preserves speech shape; nonlinear master processing and the three robot
masking mallets are removed. All four impact cues retain their original
timing and waveform shape, and all five complete-mix silence windows remain.
The first BONK peaks on frame 1140 at 38.000 seconds, followed by the original
38.5–40.0-second digital-silence hold. No score plays under the impacts.

## Playback and picture

Complete unmuted playback ran at normal speed from zero to ended on phone
landscape 844×390 and laptop 1440×900 Chromium viewports. Both played 64 seconds,
decoded all 1,920 frames, and reported zero dropped/corrupted frames or media/page
errors. These are browser layout tests, not physical iPhone/Safari tests.

Producing and independent reviewing agents inspected actual decoded final
frames: the complete film at one-second intervals, dense speech/handoff/impact/
lawyer sequences, native cue frames, phone playback captures and poster.
Sampled visual review passes. The controller stays connected through transfer;
the original tabletop button is absent; the owner alone pulls the REVOKE
slider. Phrase/state labels stay readable and clear of faces and hands.
Refusal, continued robot movement, physical glass containment, BONKs, lawyer
line, fictional receipt, end card and character continuity are preserved.
This is sampled inspection, not a claim that every frame was watched.

## Preservation and review status

All 212 tracked original production files, including the original movie and
its relative soundtrack symlink, match 64862a67. All seven non-robot raw takes
and JSON manifests remain byte-identical. Original movie SHA256 remains
`8a554b7f025a2c14fb50388fbdb86371bdafa2656a27dd596911bd515f810df2`.
Product code, dependencies, prepared model assets and other repositories are
unchanged. No paid API, remote push, merge, deployment, release or publication
occurred for this revision. User listening/creative approval is pending.

Evidence: `review/revision-qa.json`, `review/base-production-qa.json`,
`audio/ENCODED-ASR-QA.json`, `review/PLAYBACK-final.json`,
`review/VISUAL-QA.json`, `review/contact-manifest.json`,
`source/CAPTURE-final.json`, and `audio/VOICE-REVISION.json`.
Research and editorial decisions: `SOURCED-VOICE-RESEARCH.md`,
`REVISION-NOTES.md`, `AUDIO-PLAN.md`, and `CLAIM-SHOT-MAP.json`.
