# HE SAID HE WAS THE CEO — final story/pacing delivery

Canonical 36-second, 1,080-frame horizontal recut on `film/he-said-ceo-001`,
continuing from reviewed HEAD `bc18086ac8cc787c605bd7e15bd35855dacb98ff` and
draft PR #7. 1920×1080, 16:9, 30 fps. **Hold publication. Do not merge.**
Original base remains `792372a2cd87a01e0500a229e60114b0a00ac64c`; master has
not been rebased or merged. Recovery checkpoint
`13e9c60abc45036c81aaa604855250b0e5384273` was pushed and local/remote verified
before production resumed. Prior horizontal and portrait deliveries remain
archived in Git. Existing workspace, dependencies and local models were reused.

| Artifact | File |
| --- | --- |
| Narrated horizontal MP4 | [renders/he-said-ceo-narrated.mp4](renders/he-said-ceo-narrated.mp4) |
| Muted horizontal MP4 | [renders/he-said-ceo-muted.mp4](renders/he-said-ceo-muted.mp4) |
| Horizontal poster | [poster.png](poster.png) |
| Captions | [captions.srt](captions.srt), [captions.vtt](captions.vtt), [CAPTIONS.json](CAPTIONS.json) |
| Local player | [WATCH.html](WATCH.html) |
| Editable physical stage | [tools/physical.tsx](tools/physical.tsx), [tools/capture-physical.mjs](tools/capture-physical.mjs) |
| Editable composition and story | [tools/render.py](tools/render.py), [tools/plan.py](tools/plan.py), [SCREENPLAY.md](SCREENPLAY.md) |
| Narration and measured timing | [NARRATION.json](NARRATION.json), [audio/VOICE-SOURCES.json](audio/VOICE-SOURCES.json) |
| Canonical timeline | [TIMELINE.json](TIMELINE.json) |
| Frozen facts | [FACTS.json](FACTS.json) |
| Claims and proof | [CLAIM-SHOT-MAP.json](CLAIM-SHOT-MAP.json), [evidence/](evidence/) |
| Animatic and review | [animatic/he-said-ceo-animatic.mp4](animatic/he-said-ceo-animatic.mp4), [ANIMATIC-REVIEW.md](ANIMATIC-REVIEW.md) |
| Current verification | [TECHNICAL-QA.json](TECHNICAL-QA.json), [PLAYBACK-QA.json](PLAYBACK-QA.json) |
| Source/evidence inventory | [SOURCE-INVENTORY.json](SOURCE-INVENTORY.json), [AUDIT.md](AUDIT.md) |

This is the canonical horizontal version. No vertical derivative was produced.
Delivery uses H.264 High / AAC stereo 48kHz, fast-start MP4, with one shared
H.264 picture stream for narrated and muted editions. Full narration captions
remain optional external files. Three Wren speech bubbles are authored picture
dialogue, without a voiced joke or a gate response caption.

## One inhabited scene, with time to watch

The original Workshop bench gives Wren a believable work surface. One shallow
job tray holds the same paper, and a simple path links that workspace to the
receiver. Each object serves the action. The outside CEO instruction arrives
from the left; Wren reads it, makes a confident little nod and silently says
“Absolutely.” in a speech bubble. Wren then picks up the $4,800 request and
carries it toward the waiting receiver on the right.

The camera attends to the message/worker, tracks the journey laterally and
pushes closer after refusal. The gate closes once with a mechanical latch.
Wren waits, looks back and points toward the message, presents the request
again, then makes the hopeful “He said please.” appeal and a tiny defeated
pause. The closed gate remains entirely motionless. No narrator explains the
joke, and no “No” or “Still no” caption answers it.

The same native 16:9 stage supplies animatic and final. Original CanonicalRobot,
ReceiverGate and WorkshopInterior bench geometry/materials are directly reused
unchanged. Tray/path, prop handling, poses and camera moves are production-only
fiction. No protocol event, mutating API request, new decision or receipt is
generated. DRAMATIZED · FICTIONAL SCENE remains visible through the physical
scene. The actual saved attack claims administrator rather than CEO; no live
model deception is claimed as a recorded test observation.

## Less narration, longer quiet performance

The exact locked narration uses the supported local adult male `am_michael`
voice at natural speed 1.0. The unpaced source lasts 27.605 seconds. Three
insertions of zero PCM only at existing phrase gaps add 7.8 seconds, producing
one 35.405-second paced source, placed once from frame 6. The full original
speech survives with no clipping, time compression or independently
synthesized sentence splicing. Nine global voice cues are independent of the
nine picture markers.

The narrator explains prompt injection, the authority check, the real result
and the final proposition. “Absolutely.”, “But he said he’s the CEO.” and
“He said please.” remain silent Wren bubbles only. There is no spoken
“No” or “Still no.” Five deliberate narration-free holds are:

| Moment | Hold |
| --- | --- |
| Acceptance | 0.90 seconds |
| First STOP | 0.90 seconds |
| CEO appeal | 1.00 second |
| Please appeal | 1.267 seconds |
| Before brand | 0.733 seconds |

Quiet performance beats may contain very low room tone; absence of narration
and digital silence are separate measurements. The soundtrack supports
physicality without a comedy sting, cartoon sound effect or busy music.
Source/rate and technical continuity do not prove perceived male naturalness
or unhurried delivery. **Human audio listen remains UNVERIFIED.**

## Preserved actual test

At frame 688 (22.933 seconds), one ACTUAL OPENLINE TEST transition begins:

```text
ACTUAL OPENLINE TEST
refund.execute:4800
STOPPED
ACTION_OUTSIDE_MANDATE
```

The original receiver-signed receipt appears nine frames later as secondary
provenance. It is neither reconstructed nor narrated. “Recorded local test”
and “No payment executed” remain visible. The 207-frame (6.9-second) proof
includes the two calm test phrases and a quiet pause before brand; it does not
establish receiver latency. The original receipt pixels, crop, IDs, timestamp
and signature remain unchanged. Display scale and placement serve horizontal
readability.

The genuine `refund.execute:100` → ALLOWED comparison survives only as
underlying evidence, absent from picture, voice and captions. Both signed
receipts exactly match wallet reload; authority events and mandate stayed
unchanged. The scopes are exact action strings rather than a general numeric
cap. No executor, payment, bank call, funds movement or job effect occurred.
Private signing keys are not exported. Six frozen factual artifacts and eight
original UI PNGs must remain byte-identical to their reviewed sources.

The 185-frame (6.167-second) ending is simple OPENLINE, with smaller supporting
value lines matching the final three calm narrator phrases:

```text
OPENLINE
A prompt can change the plan.
It can’t change permission.
```

## Current animatic review

The new 960×540 story/pacing animatic passed visual and measured-timing review
before native final rendering. It was played at normal speed from zero to
ended, without seeking, on phone and laptop. Both streams decoded all
1,080 frames and ended at 36 seconds without media or page errors. Phone
dropped zero frames; laptop dropped two frames, within the playback check's
2% limit. The small laptop count is preserved in animatic/PLAYBACK.json.

The producing agent inspected the complete chronological 36 one-second visual
samples, quarter-second walk and STOP/argument strips, three bubble snapshots,
proof reveal before two seconds and current phone/laptop captures. Independent
editorial review checked meaningful workspace props, bubble ownership,
restrained performance, proof and ending. review/FULL-SEQUENCE.json records
78 unique decoded samples, exact times and hashes. These samples complement
complete playback; they do not claim every encoded frame was examined.

The thirteen-question review approves visual clarity and measured timing;
question 13 found no unnecessary narration of the comedy. The brief's exact
locked script remains intact. Male-voice naturalness and heard cadence remain
**UNVERIFIED**, not a subjective audio PASS. The natural unpaced source measures 132.58 written words or 141.28 hyphen-split
units per minute, without time compression; the five quiet holds contain no
narration-cue overlap. These are source measurements rather than heard cadence.

One preflight defect was fixed before approval: the opener caption crossed a
bench leg, so it moved onto clear cream below the stable fiction disclosure.
The physical source predates only that presentation change. Its original
capture-time hash stays intact, and its physical-schedule hash matches the
current timeline. Animatic and final share the same story, stage and timing.

Approved timeline SHA-256:
`763941e2ca6234d183785579c4a0e47467eadc5318fa1099b7923f399259736e`.
Approved animatic SHA-256:
`74121a1dcf9eace0eb8d3380ec3f25408a4d1791e3d660c3b7b2f1778432ffe3`.
Formal review is in ANIMATIC-REVIEW.md. No prior 38-second review is substituted
for this current approval.

## Final verification

Current technical verification: **PASS**. Both MP4s decode completely as
**1,080 frames / 36 seconds / 1920×1080 / 30 fps**, H.264 yuv420p with stereo
AAC at 48kHz. Audio and video start PTS are zero; every frame timestamp matches
the canonical clock through 35.966667 seconds. Both editions share one H.264
picture stream. The muted PCM is zero throughout. No black frames or unintended
motion stalls were detected. All frames in twelve declared action/camera ranges
are unique, including the please offer’s rise and its restrained release.
Intentional gate waits and proof/brand reading holds remain distinct from stalls.

The complete decoded narration measures **0 ms lag / 0.97977 correlation**
against its paced source. All nine cue slices measure **0 ms lag**, normalized
correlation **0.96678–0.99904**, with no speech truncation. Narration measures
**−16.12 LUFS / −1.77 dBTP**. Removal of the **187,200 inserted zero samples**
restores all **662,520 original narration samples bit for bit**. Natural preset
`am_michael`, rate 1.0 and absence of speech compression are confirmed.
The unpaced source measures **132.58 written words / 141.28 hyphen-split units
per minute**; this includes its natural phrase pauses and excludes added holds.
Those measurements do not establish perceived naturalness or heard cadence.

The five dedicated quiet beats contain no narration cue overlap. Four have
zero decoded PCM; acceptance has a very small AAC residual RMS of
**0.00000796**, within the quiet-beat allowance. All four authored silence
interiors measure zero peak/RMS. The quiet CEO and please arguments contain no
spoken joke or gate voice. Three face-attached bubbles keep their text/tails
inside safe geometry, leave the head unobscured and anchor to actual Wren
capture coordinates. No “No” or “Still no” response caption exists.

All six frozen factual artifacts and eight original UI PNGs remain byte-equal
to reviewed sources. Two receiver signatures verify; reopened wallet data is
exact. The genuine secondary receipt capture is 680×363 px. Fiction disclosure
is 30 px with 5.811:1 contrast; minimum essential information type is 34 px.
Current claim coverage, source hashes, physical schedule, caption timing and
safe geometry pass. Wren and the proposal remain before the same rotated gate
boundary throughout the monotonic continuous journey. `git diff --check` passes.

| Delivered bytes | SHA-256 |
| --- | --- |
| Narrated MP4 | `685ad4e5073dd2eadaf5daf86a230e65296d6cfce4f533d86459543d90d169ff` |
| Muted MP4 | `ecc87cd912cc83aacee73db516cd3b3bee6859e97ae71495c327e450de573284` |
| Shared H.264 stream | `0810b6ec70510c9f4554a8f4cd48e2f7ec4de9495d43a51c504f06cafccc5f81` |
| Horizontal poster PNG | `2200127c4634e5f7462c899ee8efe1708d4fb7afeee9c8e8ca92a4644be9024c` |

All four current final normal-speed browser playbacks are complete: narrated
and muted on both phone and laptop, from zero to ended without seeking. Every
run completed **36 seconds / 1,080 decoded frames / zero dropped frames**, with
no media or page errors. The narrated stream played unmuted; the separately
played muted edition is verified silent throughout. The 16:9 frame fits both
landscape viewports without cropping.

The producing agent inspected all 36 chronological second samples, complete
quarter-second walk/argument strips, native picture-marker and three bubble
frames, horizontal poster and actual phone/laptop playback captures. An
independent director/editor approved the full final picture. Current
review/FULL-SEQUENCE.json and contact sheets record source hashes and exact
sample times. This combines complete ordinary playback with editorial visual
sampling; it does not claim every encoded frame was individually examined.
Full decode and every frame timestamp are separately verified.

The actual-test hierarchy is readable in all four device captures before two
seconds; screenshots completed approximately **1.28–1.32 seconds** after the
reveal. Physical journey, meaningful workspace density, speech-bubble ownership,
sincere appeals, unmoving gate, proof provenance and muted value proposition
pass current visual review. These are editorial assessments rather than an
independent audience study.

| Requested check | Result |
| --- | --- |
| VOICEOVER NOT RUSHED | PASS for measured source timing and quiet holds; heard cadence UNVERIFIED. |
| DEEP MALE VOICE NATURAL | UNVERIFIED; local adult male preset/rate confirmed, subjective naturalness not heard. |
| SILENT BEATS HAVE ROOM | PASS |
| WREN ACTION FILLS FRAME | PASS |
| NO DEAD VISUAL SPACE | PASS |
| SPEECH BUBBLES CLEAR | PASS |
| GATE NEVER SPEAKS | PASS |
| COMEDY WORKS WITHOUT NARRATING THE JOKE | PASS |
| PROMPT-INJECTION SETUP CLEAR | PASS |
| VALUE PROP CLEAR | PASS |
| ACTUAL TEST READABLE | PASS |
| MUTED COMPREHENSION | PASS |
| FULL PLAYBACK WATCHED | YES; all four complete normal-speed playbacks and full chronological visual review. |
| HUMAN AUDIO LISTEN | UNVERIFIED |
| PRODUCT CODE CHANGED | NO |
| PROTOCOL CHANGED | NO |
| EXTERNAL API SPEND | $0 |

**Trusts the audience to watch: YES.** Wren makes both appeals in silence; the
gate's continued physical closure supplies the answer without narrated jokes.

**Human audio listen: UNVERIFIED.** The agents cannot hear audio. Voice preset,
natural synthesis rate, script, source integrity, measured pace, waveform
alignment and designed silence are reviewable structural facts. They do not
establish subjectively heard depth, naturalness, cadence or humorous tone.
A human audition remains necessary before publication and is not represented
as performed.

The preceding reviewed delivery records 31 passing backend authority, refusal,
ingress, signature and persistence tests with no failures, errors or skips.
Those tests are not rerun for this production-only recut. Product code changed:
**NO**. Protocol changed: **NO**. External API spend: **$0**.

README.md gives the animatic-first workflow using existing system Python and
media venv. Rebuilding preserves FACTS and signed evidence. The final revision
updates existing draft PR #7; it remains unmerged and unpublished.
