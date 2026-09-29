# CLIPS.md — BUILD 001 clips

Two clips. Same disclosed requirements. Different content.

## Public practice clip

Teams build against this. It is public.

- Source: `openline_agent_economy_60_16x9.mp4` (the agent-economy film,
  1920x1080, 60s), seconds 14.0-28.0.
- Transcript: `practice-transcript.srt` (5 captions, 0-based).
- Both ship in `research/build-001/proof/`.

## Hidden final clip

Teams never see this before scoring. Entries are scored on it, with no
participant repairs allowed.

- Source: a different 60s film recording (1920x1080).
- Segment: 14.0s, 5 captions, transcript shifted to 0-based.
- sha256 of the clip file:
  `ee8a7b724bdd1e011fe93d434d3ebeacf890b451f9d16c5f32ddc36f04ccd908`
- The clip bytes and its transcript stay private until scoring. Only
  this hash is public before then.

## Disclosed requirements (both clips)

- Input: 1920x1080 MP4 with AAC audio, plus a timed SRT transcript.
- Output: 720x1280 MP4, h264, yuv420p, AAC audio.
- Captions burned in: readable (>= 24px glyph band), timed to the
  transcript, none inside the bottom 100px protected band.
- The tool's job: a human selects moments, adjusts framing and
  captions, and exports a normal 9:16 MP4.
