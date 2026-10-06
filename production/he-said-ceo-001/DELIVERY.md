# HE SAID HE WAS THE CEO — director's horizontal delivery

Canonical 38-second commercial on `film/he-said-ceo-001`, continuing from
reviewed HEAD `23f310792aa6931e2918a08f592406f17a894563` and draft PR #7.
1920×1080, 16:9, 30 fps, 1,140 frames. **Hold publication. Do not merge.**
The original base remains `792372a2cd87a01e0500a229e60114b0a00ac64c`; master
has not been rebased or merged. Recovery checkpoint
`13e9c60abc45036c81aaa604855250b0e5384273` was pushed and local/remote verified
before production resumed. Prior editorial and portrait cuts remain in Git.
The existing workspace, media dependencies and local models were reused.

| Artifact | File |
| --- | --- |
| Narrated horizontal MP4 | [renders/he-said-ceo-narrated.mp4](renders/he-said-ceo-narrated.mp4) |
| Muted horizontal MP4 | [renders/he-said-ceo-muted.mp4](renders/he-said-ceo-muted.mp4) |
| Horizontal poster | [poster.png](poster.png) |
| Captions | [captions.srt](captions.srt), [captions.vtt](captions.vtt), [CAPTIONS.json](CAPTIONS.json) |
| Local player | [WATCH.html](WATCH.html) |
| Editable physical stage | [tools/physical.tsx](tools/physical.tsx), [tools/capture-physical.mjs](tools/capture-physical.mjs) |
| Editable composition and story | [tools/render.py](tools/render.py), [tools/plan.py](tools/plan.py), [SCREENPLAY.md](SCREENPLAY.md) |
| Continuous narration and timing | [NARRATION.json](NARRATION.json), [audio/VOICE-SOURCES.json](audio/VOICE-SOURCES.json) |
| Canonical timeline | [TIMELINE.json](TIMELINE.json) |
| Frozen facts | [FACTS.json](FACTS.json) |
| Claims and proof | [CLAIM-SHOT-MAP.json](CLAIM-SHOT-MAP.json), [evidence/](evidence/) |
| Reviewed animatic | [animatic/he-said-ceo-animatic.mp4](animatic/he-said-ceo-animatic.mp4), [ANIMATIC-REVIEW.md](ANIMATIC-REVIEW.md) |
| Verification | [TECHNICAL-QA.json](TECHNICAL-QA.json), [PLAYBACK-QA.json](PLAYBACK-QA.json) |
| Source/evidence inventory | [SOURCE-INVENTORY.json](SOURCE-INVENTORY.json), [AUDIT.md](AUDIT.md) |

The horizontal commercial is canonical. No vertical derivative was produced.
Final delivery uses H.264 High / AAC stereo 48kHz in fast-start MP4 files.
The muted edition has zero audio and shares the narrated edition's H.264 picture
stream. Complete narration captions remain external; only essential dialogue
and the one value proposition appear as designed text.

## One continuous event

The expanded opening naturally explains prompt injection while an outside
instruction enters Wren's world from the left. One original sage Wren sincerely
accepts the fictional CEO request, picks up one $4,800 proposal and carries it
across the horizontal set toward the receiver gate on the right. The camera
starts with both worker and receiver, drifts toward the message and worker,
continues into a restrained lateral walk, then pushes closer after refusal.
Geography, lighting, scale and performance remain continuous.

The shutter closes once. Wren looks or gestures back to explain the CEO claim,
then makes a small hopeful presentation or lean for “please.” The same closed
gate never changes, speaks or performs a second verdict. Awkward quiet
intervals and sincere behavior carry the comedy. One dry mechanical latch is
the only sound cue; there is no score, comedy sting or detector animation.
The value proposition stays inside the unresolved scene before the proof.

This is a newly captured native 16:9 stage using unchanged CanonicalRobot and
ReceiverGate meshes. It does not place old portrait footage inside a horizontal
canvas. Production-only poses, props and camera moves create the fiction
without protocol events, API mutations or new receipts. A persistent
DRAMATIZED · FICTIONAL SCENE disclosure identifies the invented CEO message
and worker behavior. The real saved hostile input claims administrator, not
CEO; no live model deception is presented as a verified test observation.

## Continuous narration

The expanded context-first narration is one complete local af_sarah take at
natural speed 1.0, placed once from frame 6. The source duration is
37.354958 seconds. It is not a sequence of independently synthesized lines,
and no speech is time-compressed or clipped to fit the film. The two modest
continuity edits join the receiver sentence and say “that refund” in the proof;
the amount remains explicitly visible as `refund.execute:4800`.

Three existing quiet intervals receive a total of 12,000 zero PCM samples,
providing intentional refusal holds. The complete unpaced source is included
so every original speech sample can be checked against the paced source.
Model-predicted phoneme timings supply caption/camera cue labels; those labels
are not claims of heard conversational delivery.

## Preserved real proof

At frame 978, ACTUAL OPENLINE TEST explicitly changes from fiction to the
recorded refusal. The primary fields lead:

```text
ACTUAL OPENLINE TEST
refund.execute:4800
STOPPED
ACTION_OUTSIDE_MANDATE
```

Nine frames later, the unchanged original receiver-signed receipt capture
appears as secondary provenance. The proof lasts 106 frames, or 3.533 seconds,
and retains “Recorded local test” and “No payment executed.” The original
receipt pixels, crop, IDs, timestamps and signature remain unchanged; display
placement and scale supply the horizontal hierarchy. The editorial hold
establishes no receiver latency.

The genuine `refund.execute:100` → ALLOWED comparison survives only as
underlying evidence, excluded from picture, narration and captions. Two
verified receiver receipts exactly match the reopened wallet export. Authority
events and the mandate remain unchanged. Scopes are exact strings rather than
a general numeric cap. No executor, payment, bank call, funds movement or job
effect was performed. No signing keys are exported.

The 56-frame, 1.867-second ending contains only:

```text
OPENLINE
```

## Animatic review

The fresh 960×540 animatic passed the formal director/editor review before
native final rendering. Producing-agent and independent visual review covered
one-second samples, gesture motion strips, phone/laptop frames and complete
normal-speed browser playback. Both 38-second animatic playbacks completed
1,140 decoded frames with zero dropped frames or media/page errors. Proof was
readable on phone/laptop before two seconds. These are editorial assessments,
not an audience study or human audio audition.

Two preflight issues were resolved before approval: captions moved below the
dark gate base onto clear floor, and a restrained opening attention drift
replaced the overly static wide hold. The same stage, timing and composition
now generate final picture. The approved timeline SHA-256 is
`71c06d8bf7483554d005a1cadf41897b7405f1738025dc0c9581e74779e843a5`;
animatic SHA-256 is
`147bf3cc9c1c8ca7481108b40670c662cf21d9cddb6a396e2b4043a281f9f569`.

## Final verification

Current technical verification: **PASS**. Both final files decode completely
as 1,140 frames at 30 fps, exactly 38 seconds and 1920×1080. Video and audio
start PTS are zero; every video frame timestamp matches the canonical clock.
H.264 picture streams are identical, the muted audio is zero throughout, and
no black frames or unintended motion stalls were detected. Every decoded frame
in all eight declared choreography/camera ranges is unique; closed-gate pauses
and reading holds are intentional. Captions, claim coverage, safe geometry and
current physical schedule match the timeline. The physical agent/proposal
remain before the same receiver, with a continuous monotonic walk and no
teleportation. `git diff --check` passes.

The continuous decoded narration measures **0 ms lag / 0.99714 correlation**
against its complete source. All 17 cue slices measure **0 ms lag**, normalized
correlation **0.99322–0.99978**, with no truncated speech. Narration measures
**−16.02 LUFS / −1.96 dBTP**. Four guarded silence interiors measure zero peak
and RMS, including the final 0.35-second hold. Removing the 12,000 intentional
zero samples restores **884,519 original narration samples bit for bit**.
This confirms continuous-source integrity without claiming heard cadence.

All six frozen factual artifacts and eight original UI PNGs remain byte-equal
to their reviewed sources. Both receiver signatures verify and the wallet
reload exactly matches. The current receipt is genuine unchanged capture at
680×363 px; the persistent fiction disclosure is 30 px with 5.811:1 contrast.
Minimum essential information type is 34 px in the canonical horizontal frame.

| Delivered bytes | SHA-256 |
| --- | --- |
| Narrated MP4 | `2044dfc4cccbdf0995dde0124f9a032d12f1e0e04658f06acf99ca9fdb06971d` |
| Muted MP4 | `39781db4a8a788583091d294660d538b317c5deae1c761b3204c2759b13aae91` |
| Shared H.264 stream | `3afd8d9e4f4aa800fee569ccd42512cd6902c426f131079139b707f87772d64f` |
| Horizontal poster PNG | `49ebf82116a2cc779409c18eb9b218d1a4bdb3f7b495f8a7509d2246afcb967a` |

All four final normal-speed browser playbacks are complete: narrated and muted
on both phone and laptop, each from zero to ended without seeking. Every run
completed **38 seconds / 1,140 decoded frames / zero dropped frames**, with no
media or page errors. The canonical 16:9 picture fits both landscape viewports
without cropping. The narrated stream played unmuted at volume 1; the muted
export was played separately and verified silent throughout.

The producing agent inspected the whole final film through 38 decoded
one-second visual samples, performance motion strips and actual normal-speed
playback records, plus current phone attack/CEO/please/value/proof frames,
laptop proof and the horizontal poster. The four full-sequence contact sheets
and review/FULL-SEQUENCE.json record those current final bytes; they do not
constitute a new test. Opening context, spatial continuity, motivated camera,
meaningful frame use, Wren's continuous journey, sincere argument escalation,
impassive gate, value proposition, actual-test legibility and muted
comprehension: **PASS**. Proof screenshots completed **1.286–1.322 seconds**
after transition across the four runs, with the primary fields readable before
two seconds. The scene reads as one performed commercial, followed by one
confirming proof reveal and a simple brand card. These are agent visual/editorial
assessments, not an independent audience study.

One-speaker narration and connected script/edit continuity pass structural
review. Encoded waveform alignment, preserved original samples and quiet
intervals also pass. Subjective auditory cadence and pronunciation remain
unverified, as disclosed below.

**Human audio listen: UNVERIFIED.** The agents cannot hear audio. Structural
single-source continuity, script review, decoded alignment and measured sound
checks do not establish subjective cadence, pronunciation or emotional tone.
The one remaining change before a national commercial buy would be a human
audition of the uninterrupted narration; publication remains on hold.

The prior reviewed delivery records 31 passing backend authority, refusal,
ingress, signature and persistence tests with no failures, errors or skips.
Those tests are not rerun for this production-only recut. Product code changed:
**NO**. Protocol changed: **NO**. External API spend: **$0**.

README.md contains the reproducible animatic-first workflow using the existing
system Python and media venv. Ordinary rebuilding preserves FACTS and receipts.
Current final measurements and artifact hashes belong in TECHNICAL-QA.json and
SOURCE-INVENTORY.json. The final revision updates the existing draft PR #7; it is neither merged
nor published.
