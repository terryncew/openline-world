# Viz benchmark — `?vizbench=N`

Measured 2026-10-02 in headless Chromium (Playwright, chromium-1148)
with SwiftShader software rasterization, 1280x800 viewport unless noted.
`?vizbench=N` feeds N synthetic workers (+N proposals, +N decisions, +N
receipts) through the same reducer path as real events, then measures
average FPS over ~5s via rAF deltas.

## Results

| N (workers) | fps | frames/5s | JS heap | notes |
|---|---|---|---|---|
| 10 | 2.7 | 14 | 78 MB | |
| 100 | 2.0 | 11 | 83 MB | |
| 1000 | 1.3 | 8 | 89 MB | 4000 synthetic events through the reducer |

Viewport diagnostic (N=10):

| viewport | fps |
|---|---|
| 1280x800 | 3.4 |
| 640x400 | 11.1 |

## Reading the numbers

The bottleneck in this environment is SwiftShader fill-rate, not entity
count: quartering the pixels triples the frame rate, while 100x more
entities (10 -> 1000) only halves it. That sublinear entity scaling is
the instancing working — the scene is a handful of instanced draw calls
(workers, eyes, seals, packets, tablets) regardless of N.

On a real GPU this scene is trivially light: no shadow maps, no
postprocessing, capped pixel ratio, static geometry. The headless-CPU
numbers above are a worst case and should not be read as shipped
performance.

## Adaptive fidelity (what ships)

- Pixel ratio capped at 2 on desktop, 1.5 on small screens
  (`VIZ_DPR_CAP` in `scene/VizCanvas.tsx`).
- Idle animation (worker bobbing, seal spin) runs only for <=128
  entities; beyond that the swarm holds still.
- Seal tethers and tablet seal-dots render only for <=64 / <=200
  entities respectively.
- No postprocessing, no shadows, fog for depth instead of effects.
- `?vizbench=N` stays available for regression checks.

## Not tested

Mobile Safari / iPhone-class hardware: no device available in this
environment. The measures above are the mitigation; verify on-device
before calling the mobile story done.
