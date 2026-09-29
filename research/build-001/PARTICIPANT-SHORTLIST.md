# BUILD-001 participant shortlist

Status: research only. Nobody has been contacted, nobody has agreed.
Public information only. Each entry is a builder (or small team) with
public work in exactly this space: ffmpeg pipelines, caption burn-in,
vertical reframe, or agent-driven editing. JUN is deliberately excluded
— his invitation is held separately for the pilot.

## 1. WyattBlue — auto-editor

- Public evidence: github.com/WyattBlue/auto-editor — open-source CLI
  that auto-edits video (silence/motion detection), whisper
  integration, ffmpeg pipeline. Long-running, well-maintained project.
- Why he fits: has shipped the hardest parts of this task already
  (cut detection, transcript alignment, ffmpeg export). A 72-hour
  human-in-the-loop vertical clip tool is adjacent to his daily work.
- Note: recent releases use a FOSSIL license-key model for some
  features; the CLI core stays open source. Entry must be open source.

## 2. waseemnasir2k26 — reelforge

- Public evidence: github.com/waseemnasir2k26/reelforge — faster-whisper
  word timestamps, ASS captions, ffmpeg crop to 1080x1920, local-only.
  Describes itself as the self-hosted alternative to paid clip tools.
- Why he fits: the pipeline proof's twin — same stack, same output
  shape, same local-rendering constraint.
- Note: new repo (September 2026); single maintainer so far.

## 3. sebetancurch — auto-caption

- Public evidence: github.com/sebetancurch/auto-caption — free, local,
  CapCut-style karaoke captions for 9:16 shorts; faster-whisper word
  timestamps, animated ASS, ffmpeg burn-in; MIT license.
- Why he fits: caption readability and timing are half the scoring
  rubric; this builder lives in exactly that half.
- Note: small repo (8 commits, single digits of stars); team of one.

## 4. timothybrush — qmm-autoedit

- Public evidence: github.com/timothybrush/qmm-autoedit — CPU-only
  auto-editor: raw video to 9:16 Shorts, dead-air removal, karaoke
  captions, blurred-background reframe; ffmpeg + faster-whisper.
- Why he fits: explicitly targets the no-GPU constraint and the 9:16
  reframe problem, both in the frozen requirements.
- Note: single maintainer.

## 5. gloria2807 — openshorts

- Public evidence: github.com/gloria2807/openshorts — open-source AI
  clip generator: long video to 9:16 shorts, moment detection, face
  tracking, faster-whisper subtitles; MIT self-host via Docker.
- Why it fits: the only candidate already doing AI moment detection
  plus smart 9:16 reframing (tracking, split-screen, screencast modes).
- Note: offers a paid cloud tier ($12/mo) alongside the free
  self-host; disclose the commercial overlap if approached.

## 6. benpiper — auto-video-editor

- Public evidence: github.com/benpiper/auto-video-editor — silence,
  filler-word, and freeze-frame removal; whisper transcription;
  ffmpeg processing; MIT license. Built for screen recordings,
  lectures, and podcasts.
- Why he fits: the hidden final clip is a screen recording; this
  builder's stated use case is exactly that input type.
- Note: single maintainer.

## 7. theSamPadilla — montaj

- Public evidence: github.com/thesampadilla/montaj — "a video editing
  CLIP for AI agents": CLI-first, agent-native, open source; whisper,
  pinned ffmpeg, React render engine; on PyPI and Homebrew.
- Why he fits: the agent-tinkerer angle — an editing pipeline
  designed to be driven by an agent harness, which is the natural
  shape of a team entering an agent-coordination experiment.
- Note: leans on hosted APIs (Kling, Gemini) for some features; the
  entry would need to stay local and open source.

## 8. Ekaanth — OpenCut-AI (unverified)

- Public evidence: cited in third-party integration docs as
  transcript-driven editing (smart cut, auto-ducking); repo not
  independently verified in this pass.
- Why listed: transcript-driven cutting is the core workflow; worth
  one verification step before any approach.
- Note: verify the repo exists and is active before shortlisting
  firmly.

## Weak spots in this list

- Most candidates are single maintainers, not teams. A "team" may in
  practice be one person plus their agent harness — acceptable under
  the rules, but say so plainly if it happens.
- Heavy overlap: six of eight are whisper-plus-ffmpeg pipelines. That
  is fine for a fair race on the same task, but the 24-hour
  integration phase may produce near-identical entries. The rubric
  should be ready for that.
- Recency risk: reelforge and auto-caption are weeks old. Check they
  are still maintained before invitations go out.
