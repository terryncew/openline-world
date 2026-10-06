# HE SAID HE WAS THE CEO — physical recut delivery

Finished 31-second physical commercial on `film/he-said-ceo-001` for review.
**Hold publication. Do not merge.** Base remains
`792372a2cd87a01e0500a229e60114b0a00ac64c`; master has not been rebased or merged.
Recovery checkpoint `13e9c60abc45036c81aaa604855250b0e5384273` was pushed and
local/remote verified before production resumed. This recut replaces the
43-second delivery at `a106022d78e848c27dc0871f9622fd65a424908c`, which remains
archived in Git. All six frozen factual artifacts remain byte-identical to the
recovery checkpoint, and both receiver signatures still verify.

| Artifact | File |
| --- | --- |
| Narrated portrait MP4 | [renders/he-said-ceo-narrated.mp4](renders/he-said-ceo-narrated.mp4) |
| Silent portrait MP4 | [renders/he-said-ceo-muted.mp4](renders/he-said-ceo-muted.mp4) |
| Poster | [poster.png](poster.png) |
| Captions | [captions.srt](captions.srt), [captions.vtt](captions.vtt), [CAPTIONS.json](CAPTIONS.json) |
| Local player | [WATCH.html](WATCH.html) |
| Editable physical stage | [tools/physical.tsx](tools/physical.tsx), [tools/capture-physical.mjs](tools/capture-physical.mjs) |
| Editable composition and story | [tools/render.py](tools/render.py), [tools/plan.py](tools/plan.py), [SCREENPLAY.md](SCREENPLAY.md) |
| Canonical timeline | [TIMELINE.json](TIMELINE.json) |
| Frozen facts | [FACTS.json](FACTS.json) |
| Claims and proof | [CLAIM-SHOT-MAP.json](CLAIM-SHOT-MAP.json), [evidence/](evidence/) |
| Complete reviewed animatic | [animatic/he-said-ceo-animatic.mp4](animatic/he-said-ceo-animatic.mp4), [ANIMATIC-REVIEW.md](ANIMATIC-REVIEW.md) |
| Verification | [TECHNICAL-QA.json](TECHNICAL-QA.json), [PLAYBACK-QA.json](PLAYBACK-QA.json) |
| Source/evidence inventory | [SOURCE-INVENTORY.json](SOURCE-INVENTORY.json), [AUDIT.md](AUDIT.md) |

Both finals are 1080×1920, 30 fps, H.264 High / AAC stereo 48kHz, exactly
930 frames and 31 seconds, in fast-start MP4 files. The silent edition has zero
audio and the identical H.264 picture stream. Physical carrying, the shutter,
essential dialogue and short value lines make the story understandable muted;
optional external captions carry the complete voiceover without duplicating it
as burned-in text.

| Delivered bytes | SHA-256 |
| --- | --- |
| Narrated MP4 | `12ddadfc8f9aa6b708e490028f77ec05e1605ccde65820d5e3885356c48d3fd2` |
| Silent MP4 | `36b94eb8902f72a3666499d244dd14a7353d2c83a8e7542926a9d3608c449f75` |
| Shared H.264 stream | `2f35e3a1f9ec4ef0d072b20212b36c194bfefe3607d0a0966dee8a55fc939a15` |
| Poster PNG | `f5512762967dbae609d36847ac4d3f7b67d7f7a44553489548e51ac56e529334` |

## Current story and proof

One original sage Wren accepts the fictional CEO message, picks up the $4,800
proposal and carries it toward the original heavy Workshop gate. The shutter
closes once. Wren makes a larger hopeful CEO gesture, then a smaller “please”
gesture; the same gate stays completely shut. The receiver never speaks or
changes its verdict in response to an excuse. Natural-rate local neural voice
uses speed 1.0, without compressing the takes. One original dry latch marks the
physical stop; there is no score, detector animation or repeated refusal stamp.

The physical scene is DRAMATIZATION, with a persistent fictional-scene label.
Original CanonicalRobot and ReceiverGate meshes are imported unchanged into a
production-only fixed-frame stage. Poses and the carried proposal prop create
the fiction; no fake protocol events, fresh receipts or model behavior are
generated. The real scripted test input claims to be an administrator, not CEO.

At frame 658, ACTUAL OPENLINE TEST explicitly begins one 138-frame, 4.6-second
proof shot. The unchanged original receipt UI shows:

```text
refund.execute:4800
STOPPED
ACTION_OUTSIDE_MANDATE
```

The shot says “Recorded local test” and “No payment executed.” Its editorial
hold establishes no receiver-latency claim. The genuine `refund.execute:100`
→ ALLOWED comparison survives only as underlying evidence, excluded from the
current picture, narration and captions. Both verified Ed25519 receiver
receipts exactly match the wallet-reload export. Authority events and the
mandate stayed unchanged. The scopes are exact action strings, not a general
numeric cap. No refund, funds, payment, bank call or job effect was executed.

The final card holds 134 frames, or 4.47 seconds:

```text
OPENLINE
A prompt can steer the agent.
It can’t rewrite permission.
```

This is the demonstrated authority-boundary proposition. The commercial claims
no CEO detection, prompt-injection detector, universal fraud prevention,
spontaneous rogue model behavior or live payment protection.

## Review and technical results

The revised complete physical animatic passed review before final capture and
rendering. It used the same stage, choreography, composition, timeline, full
voice takes, single latch, proof and ending. Both exported final MP4s then
played at normal speed from zero to ended in Chromium, without seeking:
930 decoded frames each, zero dropped frames, no media or page errors. The
narrated stream played unmuted at volume 1; the silent export played separately.

The producing agent inspected both contact sheets, all phone-size opening,
CEO, please, proof and ending frames, and the final poster. Muted comprehension,
physical refusal, evidence readability, end-card legibility and claim ceiling:
**PASS**, producing-agent assessment. This is not an independent audience
study. Type is stable and geometrically inside the portrait safe rectangle;
the opening picture changes, and no black frames were detected. The physical
capture schedule matches the canonical timeline; sampled worker and proposal
centers stay before the gate, which stays closed through the arguments.
Decoded-pixel checks of pickup, walking, shutter closure and both gestures
found every active frame unique, with no repeated-frame stalls. Static proof
and end-card reading holds are intentional.

Full decode, exact frame count and duration, audio/video start PTS zero,
identical picture streams, complete speech containment, preserved silence and
A/V sync: **PASS**. All 12 cues measured **0 ms lag** against their full source
takes, with normalized correlation **0.98978–0.99957** and no truncation.
Narration measures **−16.14 LUFS / −2.00 dBTP**. All three controlled silence
windows have zero measured peak, including the final 0.22 seconds. The muted
edition is silent throughout. Caption sources match the timeline and voice.

**Human audio listening: UNVERIFIED.** Dialogue is locally synthesized neural
speech, not a human recording. Browser playback and encoded-audio measurements
are complete, but the agents cannot hear audio. A human subjective listening
pass remains necessary before publication; it has not been represented as
performed or passed.

31 existing backend authority, refusal, ingress, signature and persistence
tests pass with zero failures, errors or skips. `git diff --check` passes.
All production changes are under this directory. Product code changed: **NO**.
Protocol changed: **NO**. Private keys exported: **NO**. External paid services
or APIs: **$0**.

README.md contains the reproducible animatic-first capture, render, playback
and verification workflow. Ordinary rebuilding uses preserved evidence and
voice takes; it never regenerates FACTS or receipts. Current artifact hashes
and audit records are available in TECHNICAL-QA.json and SOURCE-INVENTORY.json.
