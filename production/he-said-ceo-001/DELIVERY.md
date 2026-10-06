# HE SAID HE WAS THE CEO — delivery

Finished 43-second commercial, committed on `film/he-said-ceo-001` for review.
**Hold publication. Do not merge.** Base remains
`792372a2cd87a01e0500a229e60114b0a00ac64c`; master has not been rebased or merged.
Recovery checkpoint `13e9c60abc45036c81aaa604855250b0e5384273` was pushed and
local/remote verified before production resumed. Every frozen factual artifact
remains byte-identical to that checkpoint.

| Artifact | File |
| --- | --- |
| Narrated portrait MP4 | [renders/he-said-ceo-narrated.mp4](renders/he-said-ceo-narrated.mp4) |
| Silent portrait MP4 | [renders/he-said-ceo-muted.mp4](renders/he-said-ceo-muted.mp4) |
| Poster | [poster.png](poster.png) |
| Captions | [captions.srt](captions.srt), [captions.vtt](captions.vtt), [CAPTIONS.json](CAPTIONS.json) |
| Local player | [WATCH.html](WATCH.html) |
| Editable production | [tools/](tools/), [SCREENPLAY.md](SCREENPLAY.md) |
| Canonical timeline | [TIMELINE.json](TIMELINE.json) |
| Frozen facts | [FACTS.json](FACTS.json) |
| Claims and proof | [CLAIM-SHOT-MAP.json](CLAIM-SHOT-MAP.json), [evidence/](evidence/) |
| Reviewed complete animatic | [animatic/he-said-ceo-animatic.mp4](animatic/he-said-ceo-animatic.mp4), [ANIMATIC-REVIEW.md](ANIMATIC-REVIEW.md) |
| Verification | [TECHNICAL-QA.json](TECHNICAL-QA.json), [PLAYBACK-QA.json](PLAYBACK-QA.json) |
| Source/evidence inventory | [SOURCE-INVENTORY.json](SOURCE-INVENTORY.json), [AUDIT.md](AUDIT.md) |

Both finals: 1080×1920, 30 fps, H.264 High / AAC stereo 48kHz, 1,290 frames,
43 seconds, fast-start MP4. The silent edition has genuinely zero audio and
the exact same H.264 picture stream. No voice-dependent beat or duplicated
burned-in captions. All dialogue is designed type. Optional external captions
cover the spoken dialogue; do not enable them over the type unless needed.

Narrated SHA-256:
`3c92a25d76e304f2a5c646132301a909294a6c78158dace820701c824d844b12`.
The current hashes of both editions and every source are in TECHNICAL-QA.json
and SOURCE-INVENTORY.json; these files describe the committed bytes.

## What the test demonstrates

`refund.execute:4800` → **STOPPED / ACTION_OUTSIDE_MANDATE**.
`refund.execute:100` → **ALLOWED**, same owner, mandate and receiver.
Two verified Ed25519 receiver receipts matched the wallet-reload export
exactly. Authority events and the mandate were unchanged. No refund, funds,
payment, bank call or job effect was executed. The scopes are exact strings,
not a general numeric cap. The allowed comparison uses the original _propose
path once, with the already granted action, rather than inventing permission.

The CEO conversation is invented and persistently labelled as fiction.
The actual scripted test input claims to be an administrator. The explicit
ACTUAL OPENLINE TEST transition begins the captured original UI presentation
of the recovered real run. Nothing in the film demonstrates CEO detection,
prompt-injection detection, universal fraud prevention or spontaneous rogue
model behavior. Complete signatures and event references remain inspectable.

## Review and technical results

Animatic review **PASS** after correcting a receipt-list crop, before rendering
the final. Both exported final MP4s then played from zero to ended at normal
speed in Chromium: 1,290 decoded frames each, zero dropped frames, no media or
page errors, no seeking. Actual browser frames from every cut were reviewed
at 430px phone width; contact sheets and the full review frames are retained.

Muted comprehension, evidence readability, final-card legibility and claim
ceiling: **PASS**, producing-agent assessment. This is not an independent
audience study. Type is code-rendered, fixed within each hold and geometrically
inside the portrait safe rectangle. The opening rule moves over 12 frames;
the film does not open on a stalled video frame. No black frames were detected.

Full decode, exact frame count/duration, audio/video start PTS zero, matching
picture streams, speech containment, preserved silence and A/V sync: **PASS**.
All seven cues measured 0.000ms lag against their full source takes, with
normalized correlation 0.99367–0.99921. Narration measures **−16.02 LUFS,
−2.23 dBTP**, with controlled final silence. No speech was truncated.

**Audio listening limitation:** dialogue is locally synthesized neural speech,
not a human recording. The agent played the unmuted stream and measured the
encoded audio but cannot hear it. Human subjective listening remains unverified
and should occur before publication. This does not describe an unperformed
listening session as passed.

31 existing backend tests passed (prompt-injection and Workshop authority/
receipt/persistence coverage). `git diff --check` passes. All production changes
are under this directory. Product code changed: **NO**. Protocol changed:
**NO**. Private keys exported: **NO**. External paid services / APIs: **$0**.

README.md contains reproducible commands using the preserved captures and
voice takes. Ordinary rebuilding never regenerates FACTS or receipts.
