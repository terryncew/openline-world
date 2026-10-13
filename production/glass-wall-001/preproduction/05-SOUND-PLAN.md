# THE GLASS WALL — Sound Plan

All sound is $0: local synthesis, local TTS, or hand-recorded foley.
No paid APIs, no licensed music, no stock libraries.

## Voices

Engine: local neural TTS, same approach as the previous commercial
(kokoro-onnx, `$0` spend, disclosed local narration). If the kokoro venv
cannot be rebuilt, fall back to the bundled `tts` CLI
(`tts synthesize-script` supports multi-speaker dialogue).

Voice direction (cast from the local voice list at production time; human
listening stays UNVERIFIED per standing practice):

| Role | Direction | Notes |
|---|---|---|
| EXEC 1 | Adult, fast, panicked, slightly shrill | 4 words; the panic must be real, not campy |
| EXEC 2 | Adult, lower, grim | 6 words; the straight man of the panic |
| CALM ROBOT | Relaxed, warm, faintly cheeky | Unhurried to the point of comedy. Slight smile audible. "Came across it in training" lands like gossip |
| MARGARET (charming) | Wordless humming only | Content, major key — no voice needed |
| MARGARET (furious) | Small, fast, high-energy | Scale mismatch is the joke. Pitch up slightly in post if needed |
| MARGARET (muffled) | Same voice, lowpass EQ | As if through glass |
| MARGARET ("...rude.") | Flat, quiet, dead | The laugh is in the flatness |
| LAWYER | Dry, precise | Deadpan; the small nod does half the work |
| NARRATOR | Calm, warm | One line. Same register as previous films |

The CEO has no dialogue — one deliberate tap, one UI confirm tone. His
silence is part of the joke.

Rules: one continuous take per speaker where possible (previous production
kept every speech sample without clipping or line splicing). No celebrity
imitation. Speeds: calm robot ~0.92x, Margaret furious ~1.1x. Execs are now
stylized humans; cast accordingly (no robot-voice processing on humans).

## Music

Original deterministic synthesis only, in the established sonic signature:
D–A–E motif on soft resonant mallets, a physically final mechanical latch,
complete STOP silence, an open interval resolving at the end.

Cue map:
- Shots 1: low tense bed (restrained; no risers, no braams).
- Shot 2: bed drops out; D–A enters softly under the robot's line.
- Shot 3: motif completes (D–A–E) under "kill switch."
- Shots 4–8: no score. Humming, then silence, then bonks carry it.
- Shot 6 rage: one dissonant jab, then out.
- Shot 7 bonks: no music. The bonks are the percussion.
- Shot 9: motif returns, wry and quiet, under the receipt.
- Shot 11: full motif under the end card, resolving.

## Effects

| Effect | Production | Notes |
|---|---|---|
| Bonk (×3 + final distant) | Synthesize: pitched sine/triangle burst, fast pitch drop, short decay — a hollow *boink* | Must read funny, never violent. Tune each bonk slightly lower as they escalate; the final distant bonk gets lowpass + room reverb |
| Glass wobble | Synthesized resonant tone wobble after each impact | Sells the physicality of the partition |
| Slide-down slide | Short descending slide-whistle (synth) under Bonk 3 | One use only; don't milk it |
| Disconnect chime | Soft two-note chime at revocation | Follows the CEO's tap; then the stopped hum-note — the funniest cut is the interrupted note |
| Door refusal chime | Soft, final electronic tone | One clear refusal before the bonks begin; the honest beat |
| Steam hiss | Filtered noise burst | Comic, cartoonish |
| Footsteps, paper, coffee sip, glasses click, receipt slide | Hand-recorded foley (phone mic is fine) or synthesized | Keep them small and tactile |
| Lock indicator | None — it stays red in total silence | The absence of a sound is the point |

## Mix

48 kHz stereo. Integrated loudness −16 LUFS, true peak ceiling −1.5 dBTP
(same delivery spec as previous films). Music ducks under speech. The three
declared silences (revocation freeze, aftermath, final bonk) are applied to
the complete mix — no bed, no room tone creeping in. Separate narration,
score, and effects stems retained for review.
