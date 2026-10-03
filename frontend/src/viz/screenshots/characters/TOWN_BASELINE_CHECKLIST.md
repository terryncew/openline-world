# Town Robot Baseline Checklist

Source of truth: `frontend/src/town/robots/` + `frontend/src/town/kit.tsx`.
The workshop implementations live in `frontend/src/viz/scene/WorkerFigures.tsx`.
Every line below was verified against the town code; the workshop column
records the audit result of the second conformance pass.

## Shared kit (town/kit.tsx)

- [x] PAL: cream #f3ead9, creamDark #e2d5bd, terracotta #c26d4b,
      terracottaDark #9d5236, blue #4a6f8a, blueDark #38536a,
      sage #8ba888, sageDark #6d8a6b, wood #a9805a, woodDark #7d5f40,
      stone #cfc4ae, stoneDark #a89a80, ink #3d3428, warm #e8a34f,
      white #faf6ec, path #dcc9a3 — workshop uses the same kit module
- [x] matte: meshStandardMaterial, roughness 0.92, metalness 0
- [x] BlobShadow: circle at y=0.015, color #3d3428, opacity 0.22, no depthWrite
- [x] Limb: capsule pivoted at top, mesh at -length/2
- [x] Hinge: barrel cylinder (r*0.82, r*1.15 long, 12 seg), axis X
- [x] Foot: box at [0,-h/2+0.02,0.05]

## Carrier (town/robots/Carrier.tsx)

- [x] BlobShadow r=0.62
- [x] Legs at [±0.22,0.4,0]: Limb(0.26,0.13,blueDark); knee Hinge(0.1,ink)
      at [0,-0.15,0]; Foot(0.26,0.12,0.34,ink) at [0,-0.3,0.04]
- [x] Torso capsule(0.36,0.34) blue at [0,0.92,0]
- [x] Terracotta overlay capsule(0.32,0.28) scale [1.16,0.7,0.9] at [0,0.92,0]
- [x] Belt cylinder(0.38,0.38,0.1) woodDark at [0,0.66,0]
- [x] Arms at [±0.44,1.14,0]: shoulder Hinge(0.1,terracottaDark);
      Limb(0.3,0.12,terracottaDark); elbow at [0,-0.32,0]
      Hinge(0.085,woodDark)
- [x] Gripper (woodDark): palm sphere(0.085) at [0,-0.05,0]; two finger
      boxes [0.055,0.15,0.07] at [±0.055,-0.13,0]; finger Hinge(0.05,ink)
      at [0,-0.05,0]
- [x] Head at [0,1.5,0]: sphere(0.22) cream; brow box [0.3,0.07,0.1]
      terracottaDark at [0,0.11,0.14]; eyes sphere(0.038) ink
      at [±0.085,0,0.185]
- Note: town gripper angle is dynamic (closed 0..1); workshop fixes it at
  half-closed — neutral static pose, not a characteristic miss.

## Tinkerer (town/robots/Tinkerer.tsx)

- [x] BlobShadow r=0.5
- [x] Legs at [±0.15,0.42,0]: Limb(0.2,0.075,sageDark); knee
      Hinge(0.075,ink) at [0,-0.2,0]; Limb(0.16,0.06,sageDark);
      block foot box [0.19,0.1,0.28] ink at [0,-0.18,0.04]
- [x] Torso cylinder(0.21,0.13,0.58) sage at [0,0.8,0]
- [x] Panel bands cylinder(0.185,0.185,0.05) sageDark at y 0.62 and 0.98
- [x] Collar ring cylinder(0.22,0.22,0.07) sageDark at [0,1.1,0]
- [x] Idle arm at [±0.24,1.04,0]: Hinge(0.06,ink); Limb(0.14,0.06,sageDark);
      elbow at [0,-0.14,0] Hinge(0.06,ink); Limb(0.12,0.05,sageDark);
      hand sphere(0.07) cream at [0,-0.14,0]
- [x] Head at [0,1.32,0]: neck Hinge(0.09,ink) at [0,-0.08,0];
      sphere(0.17) cream; lens housing box [0.21,0.21,0.08] ink
      at [0.1,0.03,0.1] rot y 24°; eye sphere(0.075) #faf6ec
      at [0.1,0.03,0.14]; pupil sphere(0.032) ink at [0.15,0.03,0.17]
- [x] Antenna cylinder(0.015,0.015,0.18) terracottaDark at [-0.05,0.2,0];
      tip sphere(0.035) warm at [-0.05,0.3,0]
- Note: town has ONE idle arm (left) + a StretchLimb working arm reaching
  the crank (vignette scenery). Workshop mirrors the idle-arm pattern on
  both sides so the motion rig can pose both arms for the bench task.
  Documented posing adaptation.

## Reader (town/robots/Reader.tsx)

- [x] BlobShadow r=0.5
- [x] Legs: Limb(0.12,0.065,blueDark); knee Hinge(0.055,ink) at [0,-0.12,0];
      Limb(0.1,0.055,blueDark); rounded foot sphere(0.085) ink
      at [0,-0.13,0.03]
- [x] Ball torso sphere(0.27) blue
- [x] Chest panel box [0.18,0.14,0.05] blueDark, front
- [x] Rivet cylinder(0.03,0.03,0.02) warm, rotated [π/2,0,0], on the panel
- [x] Arms: shoulder Hinge(0.06,ink); Limb(0.11,0.07,blueDark);
      elbow at [0,-0.12,0] Hinge(0.06,ink); Limb(0.1,0.05,blueDark);
      hand sphere(0.085) cream at [0,-0.13,0]
- [x] Head: neck Hinge(0.08,ink); sphere(0.19) cream; visor band box
      [0.34,0.13,0.13] blueDark; eyes sphere(0.045) #faf6ec;
      pupils sphere(0.02) ink
- Note: town reader is SEATED (legs dangle, rot x 24°). Workshop reader
  STANDS for the bench task; all segment lengths, colors and detailing
  kept exact, only the stance changed. Documented posing adaptation.
- Note: town reader holds a book (town accessory). The workshop worker's
  hands carry the proposal packet (the viz's own carried object) during
  the work task. Documented accessory adaptation.

## Sweeper (town/robots/Sweeper.tsx)

- [x] BlobShadow r=0.5
- [x] Legs at [±0.13,0.3,0]: Limb(0.15,0.085,terracottaDark); knee
      Hinge(0.08,ink) at [0,-0.15,0]; Limb(0.13,0.07,terracottaDark);
      Foot(0.28,0.13,0.4,ink) at [0,-0.13,0.04]
- [x] Squat torso capsule(0.25,0.3) cream at [0,0.78,0]
- [x] Shoulder pads sphere(0.1) terracottaDark at [±0.27,0.22,0.02]
- [x] Sash box [0.46,0.09,0.46] blue, rot z 12°, at [0,0.02,0]
- [x] Back vent box [0.2,0.16,0.04] creamDark at [0,0.12,-0.22]
- [x] Arms at [±0.26,0.22,0.08]: Hinge(0.07,ink); Limb(0.13,0.065,cream);
      elbow at [0,-0.13,0] Hinge(0.07,ink); Limb(0.12,0.055,cream);
      hand sphere(0.09) woodDark at [0,-0.14,0]
- [x] Can head cylinder(0.17,0.18,0.24) terracotta; neck Hinge(0.1,ink)
      at [0,-0.13,0]; cap disc cylinder(0.185,0.185,0.05) blueDark
      at [0,0.13,0]; brim box [0.22,0.03,0.14] blueDark at [0,0.15,0.12];
      eyes sphere(0.032) ink at [±0.07,0,0.155]
- Note: town sweeper holds a broom (town tool). Omitted in the workshop —
  the worker's hands are needed for the bench task. Documented.

## Waiter (town/robots/Extras.tsx)

- [x] BlobShadow r=0.42
- [x] ChunkLeg x=±0.14, blueDark: [x,0.34,0]; Limb(0.17,0.08);
      knee [0,-0.17,0] Hinge(0.075,ink); Limb(0.15,0.065);
      Foot(0.26,0.12,0.36,ink) at [0,-0.15,0.04]
- [x] Box torso [0.44,0.5,0.34] sage at [0,0.72,0]
- [x] Chest box [0.2,0.12,0.04] sageDark at [0,0.1,0.18]
- [x] Arms at [±0.27,1.02,0.06]: Hinge(0.065,ink); Limb(0.14,0.06,sageDark);
      elbow [0,-0.14,0] Hinge(0.06,ink); Limb(0.12,0.05,sageDark);
      hand sphere(0.085) cream at [0,-0.15,0]
- [x] Dome head: neck Hinge(0.09,ink) at [0,-0.1,0] (head at [0,1.14,0]);
      hemisphere sphere(0.19,16,12,0,2π,0,π/2) cream;
      rim cylinder(0.19,0.19,0.05) blueDark; eyes sphere(0.032) ink
      at [±0.07,0.06,0.15]
- Town role: stands by the workshop door, attention on it (TownApp.tsx).

## Passerby (town/robots/Extras.tsx)

- [x] BlobShadow r=0.42
- [x] ChunkLeg x=±0.13, terracottaDark (same construction as above)
- [x] Tapered torso cylinder(0.2,0.26,0.52) blue at [0,0.7,0]
- [x] Arms at [±0.26,1.02,0.06]: Hinge(0.065,ink);
      Limb(0.24,0.06,blueDark); elbow at [0,-0.24,0] Hinge(0.06,ink);
      Limb(0.2,0.05,blueDark); hand sphere(0.085) cream at [0,-0.23,0]
- [x] Bucket head cylinder(0.16,0.17,0.22) terracotta at [0,1.1,0];
      neck Hinge(0.085,ink) at [0,-0.09,0];
      brim cylinder(0.2,0.2,0.04) terracottaDark at [0,0.12,0];
      eyes sphere(0.03) ink at [±0.065,0.02,0.145]
- Note: town passerby carries a wood parcel with a cream strap. The
  workshop worker carries the proposal packet instead. Documented.

## Helper (town/robots/Extras.tsx)

- [x] BlobShadow r=0.42
- [x] ChunkLeg x=±0.13, sageDark (same construction as above)
- [x] Round torso sphere(0.24) cream at [0,0.7,0]
- [x] Chest box [0.16,0.12,0.04] creamDark at [0,0,0.21]
- [x] Arms at [±0.26,0.88,0.06]: Hinge(0.065,ink);
      Limb(0.2,0.06,creamDark); elbow at [0,-0.2,0] Hinge(0.06,ink);
      Limb(0.16,0.05,creamDark); hand sphere(0.085) cream at [0,-0.19,0]
- [x] Dome head sphere(0.16) sage at [0,1.06,0]; neck Hinge(0.08,ink)
      at [0,-0.08,0]; eyes sphere(0.028) ink at [±0.06,0.02,0.135]
- Note: town helper holds a book (town accessory). Omitted in the workshop
  for the same reason as the reader's book. Documented.

## Workshop-only additions (approved, not town characteristics)

- Brass mandate lamp on the chest: warm while mandated, dark when revoked.
- Revocation dimming: all town colors lerp toward #5a6a7a at 0.55 when
  the worker is inactive.
- Deterministic family per workerId hash; motion-rig posing
  (read/assemble/carry/present/recoil/dead).

## Known remaining gap (not one of the seven — reported, not restructured)

- `frontend/src/viz/scene/WorkerSwarm.tsx`: when the worker count exceeds 8
  (`useFigures` in workerMotion.ts), the viz renders instanced generic
  capsules ("capsule body + eye light", per-worker hue) instead of the
  town families. The curated demo stays at ≤8 workers so the families
  always show, but any crowd above 8 falls back to non-family capsules.
  Fixing it means re-architecting the instanced crowd renderer — out of
  scope for this pass per the minimal-literal instruction.
