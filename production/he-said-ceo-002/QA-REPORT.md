# Revised CEO cut — QA

Status: technical and sampled visual PASS; ready for user review. This is a
separate revision, not approval to publish or replace the original.

## Actual delivered export

`renders/he-said-ceo-revised.mp4` is 34.000 seconds, 1,020 frames at 30 fps,
1920×1080, H.264/yuv420p with stereo 48 kHz AAC. Both streams start at zero
and last 34 seconds. Full decode, every video timestamp, and black-frame
checks passed. MP4 SHA-256:

`0e788190e79feedad43fa4dc7d446b3f554fe8ab8a69aced8c710aa1dadf731a`

Encoded sound measures −16.22 LUFS integrated and −2.81 dB true peak. All nine
narration cues align with the mix at 0 ms measured lag; correlation is at least
0.99964 after AAC encoding. Removing only the authored pause insertions
reconstructs all 597,720 original narration samples exactly. Speech is not
truncated. The single latch lands on the shutter's closed frame, 482.

## Playback and picture

The complete export played at normal speed in Chromium, from zero to ended
without seeking, on phone landscape (844×390) and laptop (1440×900) layouts.
Both decoded all 1,020 frames with zero dropped frames and no media/page errors.
These are browser layout checks, not physical iPhone/Safari tests. The optional
muted export also completed on both layouts; its phone run dropped three
presentation frames, with no encoding error or missing decoded frames.

Producing and independent reviewing agents inspected actual decoded final
frames: every second across the complete cut, quarter-second samples through
the walk and argument, native joke/proof frames, phone playback captures, and
the poster. Framing, continuity, bubble ownership/readability, held reactions,
the distinct smaller please gesture, and the inert closed gate passed sampled
inspection. All 11 active motion ranges have a unique decoded image each frame.
The real proof insert holds 6.3 seconds; its decoded UI pixels correlate
0.99959 with the frozen recorded source. No new visual defect was found.

## Preservation

All 266 tracked files of the approved production match commit
`05250b5db6c9d4fe40d055b1932a0b5867e2f97c`, including its original MP4.
All 14 frozen facts/evidence/UI sources copied into this revision are also
byte-identical. Both receiver signatures verify and the reloaded wallet export
matches. The existing 31 authority/workshop regression tests passed. No product
code, test evidence, paid API, merge, deployment, or remote publication changed.

## Limits

The new local George narrator, restrained room/foley mix, and revised comic
holds are concrete editorial changes. Machine measurements and sampled visual
review do not establish perceived voice naturalness or audience response.
The agents cannot hear playback; human listening and final creative approval
remain unverified and belong to the user's review.

Raw results: `TECHNICAL-QA.json`, `PLAYBACK-QA.json`,
`review/FULL-SEQUENCE.json`, `ANIMATIC-REVIEW.md`, and `audio/MIX.json`.
