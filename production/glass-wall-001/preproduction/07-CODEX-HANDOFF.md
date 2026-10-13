# THE GLASS WALL — Production Handoff for Codex

Preproduction package. No repo changes made, nothing published, $0 spent.
Codex owns technical production. These are orders, not suggestions — where
the package says "decision needed," stop and get it before building.

## What you're holding

`./` (this package, at `production/glass-wall-001/preproduction/` in this repo):

| File | Contents |
|---|---|
| `01-ASSET-INVENTORY.md` | Reusable assets with exact paths/commits; gaps |
| `02-SHOOTING-SCRIPT.md` | Locked 62s script, 10 spoken lines |
| `03-STORYBOARD.md` | 11 shots: camera, composition, movement, SFX, music |
| `04-VISUAL-STYLE-AND-CHARACTERS.md` | Style pillars, character design, environments, receipt prop |
| `05-SOUND-PLAN.md` | Voices, music cues, SFX recipes, mix spec |
| `06-TECHNICAL-HONESTY.md` | Claim-by-claim review; fiction disclosures; claim-shot map |
| `keyframes/` | `margaret-lovable.png`, `margaret-furious.png`, `calm-robot.png` |

## Locked creative decisions (do not reopen without the owner)

- 64.0 seconds, 1,920 frames, 1920×1080, 16:9, 30 fps.
- Twelve spoken lines, exactly as written in `02-SHOOTING-SCRIPT.md`. The
  pauses and the final distant bonk are jokes — do not compress them.
- v2 world: original stylized near-future, animated humans, expressive
  original robots. The v1 wooden-miniature world is retired (keyframes
  archived in `keyframes/v1-miniature/`).
- Margaret is charming for a full beat before the provocation. The rage must
  be hilarious, never menacing.
- The CEO — the owner — activates revocation. The robot activates nothing.
- The bonks are funny, never violent. No comedy stings under the impacts.
- Minimal on-screen text: the receipt (`door.open — REFUSED`) and the end card.
- Technical honesty per `06-TECHNICAL-HONESTY.md`: OpenLine revokes authority
  over the protected door; the glass is physical containment, not software.
  Never imply unbreakable glass, stopped thoughts, or total control.

## Production plan

1. **Scaffold.** New production dir `production/glass-wall-001/` in
   openline-world, modeled on `production/he-said-ceo-001/` (SCREENPLAY,
   TIMELINE.json, SHOTS, CLAIM-SHOT-MAP, NARRATION, AUDIO-PLAN, AUDIT,
   TECHNICAL-QA, PLAYBACK-QA, WATCH.html).
   ⚠️ Requires owner approval: new branch (suggest `film/glass-wall-001`).
2. **Animatic first.** Build the timeline and a full animatic before any final
   capture. The animatic review gates final rendering (same as he-said-ceo-001).
3. **New builds.** Margaret rig (lovable + furious states), calm-robot rig,
   executive figurines, lawyer, boardroom set, Margaret's chamber, glass
   partition + transparent security door with red lock indicator. Keyframes in
   this package are the design targets.
4. **Voices.** Verify or rebuild the kokoro-onnx venv (`/workspace/media-tools/venv`
   is missing on this VM) or use the bundled `tts` CLI. Cast per the sound
   plan. One continuous take per speaker; keep every sample unclipped.
   Human listening stays UNVERIFIED — record that.
5. **Music/SFX.** Deterministic synthesis only (numpy 48kHz). Bonk recipe in
   the sound plan: pitched burst, fast pitch drop, short decay, tuned lower
   per impact; final bonk gets lowpass + room reverb. D–A–E motif per cue map.
6. **Capture.** Deterministic `__renderAt(t)` preferred for the character
   animation; apply wall-clock linear correction if capturing in real time.
7. **Assemble.** ffmpeg: 48kHz stereo, −16 LUFS integrated, −1.5 dBTP ceiling.
   Captions (SRT/VTT), poster frame, WATCH.html. Narrated + muted MP4s.
8. **QA.** Frame count 1,860; loudness/peak measured; three declared silences
   verified on the full mix; caption accuracy; claim-shot map complete;
   contact sheets reviewed. No publish, no merge without explicit owner order.

## Final QA criteria (ship gates)

- [ ] Exactly 64.0s / 1,920 frames @30fps, 1920×1080, no dropped/duplicated frames
- [ ] All 12 dialogue lines present, verbatim, correctly timed; no added lines
- [ ] Door refusal chime + three bonks + final distant bonk land on their
  storyboard marks; none under music
- [ ] Revocation, aftermath, and final-bonk silences measure as digital silence
  on the full mix
- [ ] −16 LUFS integrated, −1.5 dBTP ceiling, no clipping
- [ ] Claim-shot map complete; fiction disclosures recorded in AUDIT
- [ ] Margaret reads lovable-then-furious; calm robot never hurries
- [ ] No paid API spend; spend log shows $0
- [ ] Nothing published, no merge, branch unpushed or draft-PR only per owner order

## Flags — unavailable or needs approval

**Unavailable / must verify:**
- `/workspace/media-tools/venv` (kokoro-onnx) is gone on this VM. Rebuild or
  fall back to the `tts` CLI before voice production.
- No Margaret / calm robot / executive / boardroom / glass-door assets exist.
  All new builds; budget the rigging time.
- Multi-character local TTS dialogue is untested — run a voice test early.

**Needs the owner's approval before you start:**
1. New branch `film/glass-wall-001` (repo change — his call).
2. TTS path: rebuild kokoro-onnx, or use the bundled `tts` CLI?
3. Include an "ACTUAL OPENLINE TEST" evidence beat (like the last commercial),
   or keep the film pure disclosed fiction?
4. Receipt prop wording lock: `door.open — REFUSED`.
5. v2 character keyframes (`keyframes/v2-near-future/`) approved as the design
   targets — owner reviews before rigging begins.

Resolved in v2 (no longer open): executives are stylized animated humans; the
CEO (owner) activates revocation; near-future world replaces the wooden
miniature; Margaret's job is parcel sorting; the calm robot is an original
cheeky service robot (not Wren).
