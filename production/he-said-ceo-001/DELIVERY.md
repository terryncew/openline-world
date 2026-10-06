# HE SAID HE WAS THE CEO — final visual-comedy delivery

Finished 31-second physical commercial on `film/he-said-ceo-001` for review.
This visual pass continues from reviewed HEAD
`f671cb04d265414cbb48d1a78e4886e43a4fa72e`. Its approved story, voiceover,
captions, physical performance, pauses, sound cue and timing remain unchanged.
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
| Narrated MP4 | `b9a7b115b46a76d0df1b760277cb0d33253193d0b24d6c10852548ca7a37cd12` |
| Silent MP4 | `1128f7bff853d955e7a401648c2b811316db08113b7a2fe06edcb06a77a32138` |
| Shared H.264 stream | `1c13882cc04a096b1ce54ee63e95507e1543a119c3794fdd73b60c73415687b7` |
| Poster PNG | `b6d7d7d9f93099a0ad381b53a22ac9c57d72d726aeced3e092f0b5638f832a11` |

## Exactly three presentation changes

1. A continuous eased crop begins at frame 242, after shutter closure at frame
   241. It reaches 1.62× magnification by frame 272, before the CEO argument,
   and holds until the actual-test transition at frame 658. Wren's hands, the
   complete gate aperture, closed shutter and STOP mechanism remain visible
   with surrounding ground. The source perspective and performance are reused;
   the gate makes no new response.
2. DRAMATIZED · FICTIONAL SCENE stays at its stable upper-left position in
   quieter 28 px regular type. Measured contrast is 5.811:1 against the cream
   background. Phone review confirms it remains present below the hierarchy
   of the hostile message and comedy.
3. The proof leads with ACTUAL OPENLINE TEST, `refund.execute:4800`, STOPPED,
   and `ACTION_OUTSIDE_MANDATE`, in that order. The genuine captured receipt
   remains visibly secondary below them at 704×375 px. Its source bytes and
   original crop are unchanged; no substitute receipt is constructed.

The poster reflects the tighter physical composition. No new props, characters,
angles, cuts, dialogue, jokes, facts or story information have been added.

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
proof shot. Its primary result hierarchy is:

```text
ACTUAL OPENLINE TEST
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

The fresh complete animatic passed review before final rendering. It used the
same presentation code and timeline as the final. Both approved physical
source videos and capture reports were reused byte-for-byte; no new physical
capture was needed. Their original timeline hash records the earlier capture,
while their physical-schedule hash matches the unchanged current performance.
The current render reports separately identify the presentation timeline and
source hashes. The full voice takes, mix, single latch, captions, evidence and
ending are also unchanged. Both exported final MP4s then
played at normal speed from zero to ended in Chromium, without seeking:
930 decoded frames each, zero dropped frames, no media or page errors. The
narrated stream played unmuted at volume 1; the silent export played separately.

The producing agent inspected all four final contact sheets, native final CEO,
please and proof frames, actual phone-size please and proof samples, and the
updated poster. Wren/gate phone legibility, visual argument comedy, quiet but
clear fiction disclosure, two-second proof comprehension, preserved real
receipt and muted comprehension: **PASS**. The primary proof fields are clear
in phone screenshots taken 1.8876 seconds after transition in the narrated
edition and 1.8691 seconds in the muted edition. No added visual information
made the idea harder to understand. An independent fresh-animatic visual
review answered questions 1–7 YES and question 8 NO; its proof screenshot was
at +1.893 seconds. These are visual assessments, not an audience study.
Type is stable and geometrically inside the portrait safe rectangle;
the opening picture changes, and no black frames were detected. The physical
capture schedule matches the canonical timeline; sampled worker and proposal
centers stay before the gate, which stays closed through the arguments.
Decoded-pixel checks of pickup, walking, shutter closure and both gestures
found every active frame unique, with no repeated-frame stalls. Static proof
and end-card reading holds are intentional. The film is materially better than
f671cb04: the same earnest pleas are easier to read on a phone, and the four
existing proof fields lead the unchanged receipt without adding a new idea.

Full decode, exact frame count and duration, audio/video start PTS zero,
identical picture streams, complete speech containment, preserved silence and
A/V sync: **PASS**. All 12 cues measured **0 ms lag** against their full source
takes, with normalized correlation **0.98978–0.99957** and no truncation.
Narration measures **−16.14 LUFS / −2.00 dBTP**. All three controlled silence
windows have zero measured peak, including the final 0.22 seconds. The muted
edition is silent throughout. Caption sources match the timeline and voice.
Both encoded AAC streams are byte-identical to their approved f671cb04
counterparts. The timeline excluding its new `presentation` block is equal to
the approved timeline; 35 locked source, audio, caption and staging artifacts
are byte-identical to that reviewed HEAD.

**Human audio listening: UNVERIFIED.** Dialogue is locally synthesized neural
speech, not a human recording. Browser playback and encoded-audio measurements
are complete, but the agents cannot hear audio. A human subjective listening
pass remains necessary before publication; it has not been represented as
performed or passed.

The prior reviewed delivery records 31 passing backend authority, refusal,
ingress, signature and persistence tests with zero failures, errors or skips.
Those tests were not rerun for this presentation-only pass; product and
protocol code remain unchanged. Current full playback, decode, A/V timing,
phone-size checks, muted comprehension and evidence integrity all pass.
`git diff --check` passes.
All production changes are under this directory. Product code changed: **NO**.
Protocol changed: **NO**. Private keys exported: **NO**. External paid services
or APIs: **$0**.

README.md contains the reproducible animatic-first composition, playback
and verification workflow. Ordinary rebuilding uses preserved evidence and
voice takes; it never regenerates FACTS or receipts. Current artifact hashes
and audit records are available in TECHNICAL-QA.json and SOURCE-INVENTORY.json.
