# PIPELINE-PROOF.md — BUILD 001 pipeline proof

The task is feasible with ordinary tools. This proof renders a short
horizontal clip to a captioned vertical MP4 and measures what it costs.

## What it does

Input: `practice-input.mp4` (14.08s, 1920x1080, cut from the public
film `openline_agent_economy_60_16x9.mp4`) plus `practice-transcript.srt`
(5 timed captions, 0-based).

Pipeline (`run_proof.py`):

1. Crop the horizontal frame to a vertical slice: `crop=608:1080:656:0`.
2. Scale to 720x1280.
3. Burn timed captions from the SRT with ffmpeg `drawtext` (one filter
   per caption line, `enable` gated on the caption's time window).
   Style: Noto Sans 28px, white with black outline. Captions sit above
   a 100px protected band at the bottom of the frame.
4. Encode libx264 (medium, CRF 20), AAC 128k, faststart.

## Measured result (this machine, 2026-09-29)

Hardware: AMD EPYC 9D25 126-Core Processor, 2 vCPU, 7.75 GiB RAM.
Software: ffmpeg 8.1.2.

| measure | value |
|---|---|
| wall-clock runtime | 8.1 s |
| peak RSS | 318.6 MB |
| output size | 591,245 bytes |
| output | 720x1280, h264, yuv420p, AAC |
| duration | 14.08 s (matches input) |
| A/V start offset | 0.0 ms (limit 40 ms) |
| caption band at t=3.5 | 64 px, above the protected band |
| caption pixels in protected band | 0 |

Caption timing verified at 10 sample points across the clip: captions
visible inside their transcript windows, absent outside. All checks
pass. Full record: `proof/proof-result.json`.

## Reproduce

```
cd research/build-001/proof
python3 run_proof.py
```

Needs ffmpeg with libx264 and the Noto Sans font. No network, no
account, no cost.

## Known pitfall (found while building this)

ffmpeg's libass-based `subtitles` and `ass` filters, in this build,
duplicate wrapped caption text vertically at 720x1280 with
FontSize >= 20. Timing stays correct; the layout breaks (the active
caption renders several times, stacked). Short single-line captions
are unaffected. The proof uses `drawtext` instead, which is
deterministic. Participants using the `subtitles` filter should test
their caption rendering at full size before trusting it.
