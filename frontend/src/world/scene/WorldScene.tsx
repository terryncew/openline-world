/**
 * Shared-world scene — frontend/src/world/scene/WorldScene.tsx
 *
 * ART DIRECTION (2026-09-25): handcrafted miniature. Felt, woven fabric,
 * painted wood, ceramic glaze, brushed metal, translucent glass. A warm
 * interior against a cooler evening exterior. Disciplined warm palette with
 * ONE surprising accent — persimmon — reserved for the exchange thread:
 * the offer parcel's wax seal and the parcel's reveal ribbon. Receiver
 * verdicts keep their own green/red; the accent never decorates anything
 * else. No reference is named anywhere in public copy; every shape here
 * is original to this workshop.
 *
 * Characters act from animation alone (legible with sound off), all local
 * and deterministic — no model calls. The cast: compact workshop robots,
 * adult-facing coworkers — matte enamel shells, dark fabric joints,
 * restrained glowing eyes, articulated gripper hands, planted feet, a few
 * scuffs of honest use. No baby proportions, no pet behavior, no bouncing.
 * Personality through attention, timing, and useful gestures:
 *   Wren (host): terracotta — tall narrow body, rounded head, long
 *     controlled arms, a short antenna with a lamp.
 *   Juniper (host): sage — wide low body, small head, sturdy feet, a
 *     vented top panel, a service handle.
 *   Visitor robots (one shared component, family members): the worker
 *     (automation) compact cobalt with a broad visor and precise grippers,
 *     the counterpart (manual/live/scripted) light cream with a rectangular
 *     head and slender limbs, the traveler (unknown) compact in warm gray
 *     with no accessory. Human-owner figures are labeled OWNER, never shown
 *     as agents. Cosmetics are config — cosmetic only, never identity proof.
 *
 * Cosmetic choices (color, faceplate, accessories) are config only —
 * they never grant or imply permissions, verified identity, or reputation.
 *
 * Honesty rules, enforced by construction:
 *  - A figure appears only after its owner really joined.
 *  - Presence lanterns light only from real presence data.
 *  - Offers, transactions, decisions, receipts, mandate status come only
 *    from props built from actual backend responses.
 *  - Reactions (pride/sheepish/curiosity) fire ONLY off confirmed backend
 *    events: a real decision record, a real new offer. The scene never
 *    animates an unconfirmed outcome.
 *  - Waiting / refusal / disconnection / uncertainty each have a distinct
 *    visual treatment. While disconnected, figures hold still and the
 *    light goes cool — the world never pretends to be live.
 *  - All idle movement is local, deterministic (seeded PRNG), captioned:
 *    helper movement is illustrative — only gate decisions are real.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { WorldAgreement, WorldListing, WorldOffer, WorldPresence, WorldTransaction, ActivityMode, WorkerState, SharedReceiptEntry } from "../api";
import { ModeBadge } from "../components/ModeBadge";
import { ActRig, type ActAnchors, type FigureBehavior, type HeldObject, type RigHandles } from "./act/actRig";
import { WorkPapers, RecordFlight } from "./act/actStaging";
/* TRACK 3 — workflow-to-stage binding: which figure goes where, what the
 * work-object does, and how the camera frames the active interaction. The
 * staging derives only from real backend state (see choreography.ts). */
import { describeStage, type StagePlan, type WorkItemStage } from "./choreography";

const CREAM = "#f3ecdc";
const OFFLINE_TINT = new THREE.Color("#33373d");
const BLUE = "#24405e";
const TEAL = "#1f5f5b";
const AMBER = "#e08a3c";
const AMBER_DEEP = "#c9742f";
const WOOD = "#a9834f";
const WOOD_DARK = "#7d5f36";
const BRASS = "#c9a227";
const INK = "#1d2430";
const FELT_RED = "#b03a2e";
/* character palette (2026-09-27): the town's robot family in his idiom —
 * restrained expressive eyes, articulated working hands, planted feet, matte
 * enamel, fabric joints, subtle signs of use. Wren is terracotta (tall narrow
 * body, rounded head, long arms, antenna), Juniper is sage (wide low body,
 * small head, sturdy feet, vented top). Every other built-in agent avatar —
 * newly joined participants, tutorial characters, fallback appearances —
 * renders through the shared VisitorRobot component as a family member: the
 * worker (automation) compact cobalt with a broad visor and precise grippers,
 * the counterpart (manual/live/scripted) light cream with a rectangular head
 * and slender limbs, the traveler (unknown) compact in warm gray with no
 * accessory. Human-owner figures are labeled OWNER, never shown as agents.
 * Cosmetics are config — cosmetic only, never identity proof. */
const OK_GREEN = "#2e7d4f";
/** The one surprising accent. Reserved for the exchange thread: the offer
 *  parcel's wax seal and the parcel reveal ribbon. Nothing else wears it. */
const PERSIMMON = "#e4572e";
/** The bound work folio — deep ink blue, the exchange thread's second
 *  accent. The finished written deliverable, distinct from every parcel. */
const FOLIO = "#3f6080";
const FOLIO_DARK = "#2c4763";
const EVENING = "#141c28";
const EVENING_DEEP = "#0d1420";
const MOON = "#f5edd8";
/** The one electric accent, used once: the receiver's authorization seal on
 *  the folio when a verdict is genuinely accepted. Matte — no glow. */
const LIME = "#b8e62e";

/* ---------------- felt & paper: the material language ----------------
 * Everything sewn, nothing glossy. One shared fiber-grain bump texture,
 * dashed stitch seams, matte throughout (roughness 1, metalness 0).
 * Stitching stays subtle — faces and actions read first. */

/** Procedural fiber grain: short random strokes on neutral gray, used as a
 *  bump map. Generated once, shared by every felt part. */
let _feltBump: THREE.Texture | null = null;
function feltBump(): THREE.Texture {
  if (_feltBump) return _feltBump;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * 256, y = rnd() * 256;
    const a = rnd() * Math.PI, l = 2 + rnd() * 5;
    const v = 108 + Math.floor(rnd() * 44);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  _feltBump = t;
  return t;
}

/** A dashed stitch seam along a polyline — cream thread, subtle. Linewidth
 *  is 1px on most platforms by design: it should read as thread, not wire. */
function StitchSeam({ points, color = CREAM }: { points: [number, number, number][]; color?: string }) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.032 });
    const l = new THREE.Line(geo, mat);
    l.computeLineDistances();
    return l;
  }, [points, color]);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  return <primitive object={line} />;
}

/** Radial warm-glow texture for practical lamps — the visible halo. Shared. */
let _glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (_glowTex) return _glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,214,150,0.85)");
  grad.addColorStop(0.35, "rgba(255,190,120,0.32)");
  grad.addColorStop(1, "rgba(255,180,110,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

/** A practical lamp's visible halo: a camera-facing glow sprite plus the
 *  point light that does the real falloff. Put the fixture mesh next to it. */
function LampGlow({ position, scale = 1.6, color = "#ffcf7d", intensity = 6, distance = 7 }: {
  position: [number, number, number]; scale?: number; color?: string; intensity?: number; distance?: number;
}) {
  return (
    <group position={position}>
      <sprite scale={[scale, scale, 1]}>
        <spriteMaterial map={glowTexture()} color={color} transparent opacity={0.9} depthWrite={false} />
      </sprite>
      <pointLight intensity={intensity} distance={distance} decay={2} color={color} />
    </group>
  );
}

/** A small practical lantern shared across the town's places — one language:
 *  compact paper fixture, restrained warm halo. Kept deliberately small so
 *  fixtures never balloon in frame; the point light does the real work. */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Label({ children, position, className = "room-label" }: { children: React.ReactNode; position: [number, number, number]; className?: string }) {
  return (
    <Html position={position} center className={className} occlude="raycast">
      <div>{children}</div>
    </Html>
  );
}

/** A faint ground tint marking one district's footprint — the district's
 *  accent color, paint only. */
function PlaceGround({ x, z, rx, rz, color }: { x: number; z: number; rx: number; rz: number; color: string }) {
  return (
    <mesh position={[x, 0.018, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[rx, rz, 1]}>
      <circleGeometry args={[1, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.13} depthWrite={false} />
    </mesh>
  );
}

/** An invisible tap target over a district: tapping anywhere in a place
 *  glides the camera there. Low and flat so it never occludes the floating
 *  labels above it. Interactive meshes (cards, figures, the token) stop
 *  propagation, so they keep their own taps. */
function PlaceHit({ x, z, w, d, onFocus }: { x: number; z: number; w: number; d: number; onFocus: () => void }) {
  return (
    <mesh
      position={[x, 0.3, z]}
      onClick={(e) => { e.stopPropagation(); onFocus(); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <boxGeometry args={[w, 0.6, d]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** A worn path on the ground between two places — paint, not a promise. */
function PathStrip({ from, to, width = 0.9 }: { from: [number, number]; to: [number, number]; width?: number }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  return (
    <mesh position={[(from[0] + to[0]) / 2, 0.025, (from[1] + to[1]) / 2]} rotation={[0, ang, 0]}>
      <boxGeometry args={[width, 0.02, len]} />
      <meshStandardMaterial color="#e6d7b4" roughness={1} />
    </mesh>
  );
}

export interface CameraPreset { target: [number, number, number]; camera: [number, number, number]; }

/** Camera glide for the five-places legend. Null = the visitor is driving. */
const FOCUS_PRESETS: Record<string, CameraPreset> = {
  square: { target: [-2, 1.2, 5.0], camera: [-2, 8, 14] },
  board: { target: [0, 1.4, 1.4], camera: [0.5, 5.0, 9.5] },
  workshop: { target: [0.3, 1, -0.5], camera: [0.3, 8.5, 12.5] },
  library: { target: [5.0, 1, 0], camera: [11.0, 5.0, 0.4] },
  counters: { target: [-0.5, 0.9, -4.6], camera: [3.2, 6.0, 2.6] },
};

function CameraFocus({ place, presets, reducedMotion }: { place: string | null; presets: Record<string, CameraPreset>; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const dest = useRef<{ target: THREE.Vector3; cam: THREE.Vector3 } | null>(null);
  /* Retarget guard: only move the camera when the requested place (or its
   * coordinates) actually changed — parent re-renders rebuild `presets`
   * constantly, and the camera must never fight the viewer's own orbiting. */
  const last = useRef<{ place: string | null; target: [number, number, number]; camera: [number, number, number] } | null>(null);
  useEffect(() => {
    const p = place ? presets[place] : undefined;
    if (!p) { dest.current = null; last.current = null; return; }
    const l = last.current;
    if (l && l.place === place && l.target.join() === p.target.join() && l.camera.join() === p.camera.join()) return;
    last.current = { place, target: p.target, camera: p.camera };
    if (place === "active") {
      // the staged take: land the framing exactly, no glide to outrun
      camera.position.set(...p.camera);
      if (controls) { controls.target.set(...p.target); controls.update(); }
      dest.current = null;
      return;
    }
    if (reducedMotion) {
      // Reduced motion: no automatic camera movement — arrive instantly.
      camera.position.set(...p.camera);
      if (controls) { controls.target.set(...p.target); controls.update(); }
      dest.current = null;
      return;
    }
    dest.current = { target: new THREE.Vector3(...p.target), cam: new THREE.Vector3(...p.camera) };
  }, [place, presets, reducedMotion, camera, controls]);
  useFrame(() => {
    const d = dest.current;
    if (!d || !controls) return;
    // the kiosk take films at ~5fps: glide fast enough to land the framing
    // inside the pre-roll, without a visible snap.
    controls.target.lerp(d.target, 0.18);
    camera.position.lerp(d.cam, 0.18);
    controls.update();
    if (camera.position.distanceTo(d.cam) < 0.08) dest.current = null;
  });
  return null;
}

/** Soft contact shadow: a dark felt ellipse under each figure. */
/** Soft radial shadow texture: dark center fading to transparent — grounding
 *  shadows with a real falloff, no hard disc edge. Shared. */
let _shadowTex: THREE.Texture | null = null;
function shadowTexture(): THREE.Texture {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(42,33,24,0.55)");
  grad.addColorStop(0.55, "rgba(42,33,24,0.28)");
  grad.addColorStop(1, "rgba(42,33,24,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}

function ContactShadow({ x, z, scale = 1, opacity = 0.5 }: { x: number; z: number; scale?: number; opacity?: number }) {
  return (
    <mesh position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.5 * scale, 1.5 * scale]} />
      <meshBasicMaterial map={shadowTexture()} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/* ---------------- character-act anchors (Track 2) ---------------- */

/**
 * Named world spots the act rig walks between, in the square layout.
 * Aligned with the binding's canonical furniture (choreography.ts):
 * the bench's work end (BENCH_WORK), its review end (BENCH_REVIEW, where
 * the receiving tray sits), the records cabinet (CABINET_TOKEN), the
 * exchange board, and the receiving counters. Figures never walk through
 * furniture: the spots stand clear of the bench, the counters, and the
 * board's discovery stand.
 */
function squareAnchors(home: [number, number, number]): ActAnchors {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return {
    home: V(...home),
    boardSpot: V(0, 0, 3.3),
    boardLook: V(0, 1.6, 1.2),
    benchWork: V(-3.1, 0, -1.05),
    benchLook: V(-3.1, 1.1, -2.2),
    traySpot: V(-1.6, 0, -1.05),
    trayTop: V(-1.4, 1.2, -2.4),
    cabinetSpot: V(1.2, 0, 2.1),
    cabinetTop: V(3.0, 2.42, 1.6),
    recordFrom: V(-1.4, 1.6, -2.4),
    counterStand: (x) => V(x, 0, -3.3),
    counterLook: (x) => V(x, 1.0, -4.4),
    wander: [],
  };
}

/** Kiosk performance anchors (world coords). Wren presents from the south
 *  side of the counter; Juniper receives from the north and files east at
 *  the records drawer. Each performer gets their own marks — the rig's
 *  behavior vocabulary is unchanged, only the marks move. */
function kioskAnchorsWren(): ActAnchors {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return {
    home: V(-0.5, 0, 2.7),
    boardSpot: V(-0.5, 0, 2.7),
    boardLook: V(0.55, 1.35, 0.9),
    benchWork: V(0.5, 0, 2.5),
    benchLook: V(1.15, 0.88, 1.5),
    traySpot: V(0.5, 0, 2.5),
    trayTop: V(1.15, 0.88, 1.5),
    cabinetSpot: V(0.5, 0, 2.5),
    cabinetTop: V(1.15, 0.88, 1.5),
    recordFrom: V(1.15, 1.0, 1.5),
    counterStand: (_x) => V(-0.5, 0, 2.7),
    counterLook: (_x) => V(0.55, 1.35, 0.9),
    wander: [],
  };
}
function kioskAnchorsJuniper(): ActAnchors {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return {
    home: V(0.55, 0, 0.55),
    boardSpot: V(0.55, 0, 0.55),
    boardLook: V(-0.5, 1.05, 2.1),
    benchWork: V(1.8, 0, 2.2),
    benchLook: V(1.15, 0.88, 1.5),
    traySpot: V(1.8, 0, 2.2),
    trayTop: V(1.15, 0.88, 1.5),
    cabinetSpot: V(2.35, 0, 1.9),
    cabinetTop: V(2.35, 0.82, 0.72),
    recordFrom: V(1.15, 1.0, 1.5),
    counterStand: (_x) => V(0.55, 0, 0.55),
    counterLook: (_x) => V(-0.5, 1.05, 2.1),
    wander: [],
  };
}
/** the kiosk two-shot: from due west, Wren (facing north to present) reads in
 *  left-profile and Juniper (facing south to examine) in right-profile, the
 *  folio between them over the low counter. Faces, hands, object together.
 *  Framed for narrow phone viewports: close and low so the performers and
 *  the counter dominate — the upper wall and the hanging lamp stay out of
 *  the frame's upper third. */
const KIOSK_CAMERA: CameraPreset = { target: [-0.1, 0.9, 1.45], camera: [-5.7, 2.1, 1.85] };

/** Hosts keep their own layout: home, wander, and the board they watch. */
function hostAnchors(
  home: [number, number, number],
  boardAt: [number, number, number],
  wander: [number, number, number][] = []
): ActAnchors {
  const V = (p: [number, number, number]) => new THREE.Vector3(...p);
  const nil = () => new THREE.Vector3(0, 0, 0);
  return {
    home: V(home),
    boardSpot: new THREE.Vector3(boardAt[0] + 1.1, 0, boardAt[2] + 0.9),
    boardLook: new THREE.Vector3(boardAt[0], 1.6, boardAt[2]),
    benchWork: nil(), benchLook: nil(), traySpot: nil(), trayTop: nil(),
    cabinetSpot: nil(), cabinetTop: nil(), recordFrom: nil(),
    counterStand: nil, counterLook: nil,
    wander: wander.map(V),
  };
}

export interface HostState {
  agentId: "wren" | "juniper";
  displayName: string;
  ownerName: string;
  joined: boolean;
  revoked: boolean;
  presence: WorldPresence | null;
  /** last REAL receiver decision for this agent; nonce retriggers the reaction */
  outcome: { decision: string; nonce: number } | null;
  /** id of the newest offer — a change triggers the curiosity beat */
  offerPulse: string | null;
  /** true while this agent has a request in flight at the receiver */
  waiting: boolean;
  /** in the square, Wren and Juniper stand as HOSTS — badged, never the only participants */
  role?: "host";
  /** figure home position; defaults keep the workshop layout untouched */
  home?: [number, number, number];
  /** the host's participant id, for the "host" badge on receiving counters */
  participantId?: string | null;
  /** Track A operating model: the backend's verbatim activity mode when it
   *  reports one. Absent = not reported — the figure gets no mode badge,
   *  never a guessed one. The guided tour is scripted playback, so tour
   *  hosts carry "scripted" as local ground truth. */
  activityMode?: ActivityMode | null;
  /** Badge text override for "manual" when the figure isn't the viewer's
   *  own: "MANUAL — human-driven" instead of "YOU — manual". The parent
   *  computes it; the badge keeps its icon + shape. */
  modeLabel?: string | null;
  /** pending escalations awaiting this participant's owner (Track A);
   *  > 0 renders the "awaiting owner" pennant. Absent = none reported. */
  escalationCount?: number | null;
}

/** A connected visitor in the square: their own figure, badged with their
 *  display name. "Representing <agent>" is shown on inspect, in the parent. */
export interface VisitorState {
  participant_id: string;
  displayName: string;
  agentName: string;
  presence: WorldPresence | null;
  isSelf: boolean;
  isHost?: boolean;
  /** Track A operating model — see HostState.activityMode. */
  activityMode?: ActivityMode | null;
  /** Badge text override for "manual" on figures that aren't the viewer's
   *  own — see HostState.modeLabel. */
  modeLabel?: string | null;
  /** pending escalations awaiting this participant's owner (Track A). */
  escalationCount?: number | null;
  /** Track A's worker stop-condition state for this session — feeds the
   *  character-act binding (bindBehavior.ts). Absent = not reported. */
  workerState?: WorkerState | null;
}

/* ---------------- character tag de-collision ---------------- */

/**
 * Tag de-collision: when figures cluster, their name tags would overlap, so
 * each tag takes a vertical slot and a short leader line ties a raised tag
 * back to its figure. The slot is deterministic — the count of already
 * registered tags whose anchors sit within TAG_STACK_RADIUS of this one.
 * Registration is per-mount with cleanup, so StrictMode's double effects
 * stay consistent. Slot 0 = the tag sits at its figure's natural height.
 */
const TAG_STACK_RADIUS = 2.4;
const TAG_STACK_STEP = 0.6;
const tagAnchors = new Map<string, { x: number; z: number }>();

function useTagSlot(key: string, x: number, z: number): number {
  const [slot, setSlot] = useState(0);
  useEffect(() => {
    let s = 0;
    for (const [k, a] of tagAnchors) {
      if (k !== key && Math.hypot(a.x - x, a.z - z) < TAG_STACK_RADIUS) s++;
    }
    tagAnchors.set(key, { x, z });
    setSlot(s);
    return () => {
      tagAnchors.delete(key);
    };
  }, [key, x, z]);
  return slot;
}

/** A short vertical leader from a figure's head height to its raised tag. */
function TagLeader({ baseY, slot }: { baseY: number; slot: number }) {
  if (slot <= 0) return null;
  const top = baseY + slot * TAG_STACK_STEP;
  const bottom = baseY - 0.15;
  return (
    <mesh position={[0, (top + bottom) / 2, 0]}>
      <boxGeometry args={[0.025, top - bottom, 0.025]} />
      <meshBasicMaterial color="#f3ecdc" transparent opacity={0.6} depthWrite={false} />
    </mesh>
  );
}

/**
 * ONE honest status word for a figure tag, from real props only — never
 * invented, never guessed. Priority: revoked beats awaiting-owner beats
 * waiting beats the reported mode. Nothing available → no status line at
 * all, rather than a guess.
 */
function figureStatusWord({
  revoked,
  escalationCount,
  waiting,
  activityMode,
  isSelf,
}: {
  revoked?: boolean;
  escalationCount?: number | null;
  waiting?: boolean;
  activityMode?: ActivityMode | null;
  isSelf?: boolean;
}): { word: string; tone: "warn" | "wait" | "info" } | null {
  if (revoked) return { word: "revoked", tone: "warn" };
  if ((escalationCount ?? 0) > 0) return { word: "awaiting owner", tone: "wait" };
  if (waiting) return { word: "waiting", tone: "wait" };
  switch (activityMode) {
    case "automation":
      return { word: "automation", tone: "info" };
    case "live":
      return { word: "live", tone: "info" };
    case "scripted":
      return { word: "scripted", tone: "info" };
    case "manual":
      return isSelf ? null : { word: "manual", tone: "info" }; // self gets the YOU chip instead
    default:
      return null;
  }
}

/** A figure's name tag: the name, identity chips (HOST / YOU), ONE honest
 *  status word from real props only — never invented, never guessed —
 *  plus the operating-model UI: the mode badge (icon + text + shape, never
 *  color alone) whenever the mode is known, and the escalation pennant
 *  whenever an escalation is pending.
 *
 *  In the clean default scene (the square) the whole tag is gated behind
 *  selection: with nothing selected, no name, no mode badge, no pennant
 *  floats over any character. The selected figure's tag shows everything;
 *  the awaiting-owner pennant additionally lives in the selected worker's
 *  inspector and in the owner console. Type is large and high-contrast for
 *  phone size. */
function FigureTag({
  name,
  hostBadge,
  ownerBadge,
  revoked,
  isSelf,
  waiting,
  activityMode,
  modeLabel,
  escalationCount,
  showIdentity = true,
  showStatus = true,
  /** staged-activity word: visible even in the clean scene, only while a
   *  real performance is running */
  activityWord = null,
  /** clean default scene: the tag renders only when the figure is selected */
  clean = false,
  selected = false,
}: {
  name: string;
  hostBadge?: boolean;
  /** the figure is a human owner (a person driving a browser profile),
   *  labeled so it never reads as an agent. Cosmetic only. */
  ownerBadge?: boolean;
  revoked?: boolean;
  isSelf?: boolean;
  waiting?: boolean;
  activityMode?: ActivityMode | null;
  modeLabel?: string | null;
  escalationCount?: number | null;
  /** name + identity chips: the clean scene shows these only when selected */
  showIdentity?: boolean;
  /** the ONE-honest-status-word line: the clean scene drops it */
  showStatus?: boolean;
  /** the staged-activity word (presenting/inspecting/carrying/…). Rendered
   *  even in the clean scene: it exists only while a real performance is
   *  running, so it never decorates an idle figure. */
  activityWord?: string | null;
  clean?: boolean;
  selected?: boolean;
}) {
  if (clean && !selected && !activityWord) return null;
  const status = figureStatusWord({ revoked, escalationCount, waiting, activityMode, isSelf });
  return (
    <div className="fig-tag">
      {showIdentity && (
        <div className="fig-name-row">
          <span className="fig-name">{name}</span>
          {hostBadge ? <span className="fig-chip fig-host">HOST</span> : null}
          {isSelf ? <span className="fig-chip fig-you">YOU</span> : null}
          {ownerBadge ? <span className="fig-chip fig-owner">OWNER</span> : null}
        </div>
      )}
      {showStatus && status ? <div className={`fig-status fig-status-${status.tone}`}>{status.word}</div> : null}
      {activityWord ? <div className="fig-activity" role="status">{activityWord}</div> : null}
      {activityMode ? <ModeBadge mode={activityMode} label={modeLabel ?? undefined} /> : null}
      {(escalationCount ?? 0) > 0 ? (
        <span className="esc-pennant" role="status">
          ⚑ awaiting owner{(escalationCount ?? 0) > 1 ? ` (${escalationCount})` : ""}
        </span>
      ) : null}
    </div>
  );
}

export type TransportStatus = "connected" | "disconnected" | "pending" | "unreported";

interface SceneProps {
  hosts: HostState[];
  /** workshop-only in practice; the square uses listings instead */
  offers?: WorldOffer[];
  transactions?: WorldTransaction[];
  /** latest REAL receiver decision, drives the review-station stamp */
  latestDecision?: { action: string; decision: string } | null;
  sharedReceipts?: SharedReceiptEntry[];
  /** agreement id whose submit request is genuinely in flight (the backend
   *  resolves submitted → verdict → settled synchronously, so the in-flight
   *  request is the honest "awaiting review" signal) */
  submitInFlightAgreementId?: string | null;
  reducedMotion: boolean;
  quality: "high" | "low";
  transportStatus: TransportStatus | null;
  backendReachable: boolean;
  openOfferId?: string | null;
  onOpenOffer?: (offerId: string | null) => void;
  onSelectAgent: (agentId: string) => void;
  /** claim-graph reading-desk summaries, from GET /api/world/claimgraph */
  claimSummaries: ClaimDeskSummary[];
  onOpenClaimReport: (reportId: string) => void;
  /** newsroom small-desk summary, from GET /api/world/newsroom */
  newsroomSummary: NewsroomDeskSummary | null;
  onOpenNewsroom: () => void;
  /** "workshop" keeps the guided-beat room exactly; "square" is the public
   *  square — the default arrival. One connected community, five places:
   *  public square (arrive & meet), exchange board (needs & offers),
   *  workshop (work made & checked), newsroom & library (reports &
   *  corrections), receiving counters (accept or refuse, under your own
   *  rules). Every interaction keeps working. */
  mode?: "square" | "workshop";
  /** square: board listings pinned on the exchange board */
  listings?: WorldListing[];
  /** square: agreements, matched to listings for the stage tokens */
  agreements?: WorldAgreement[];
  /** square: connected visitors as their own figures */
  visitors?: VisitorState[];
  onOpenListing?: (listingId: string) => void;
  onSelectVisitor?: (participantId: string) => void;
  /** square: the 3D board's listing slips and agreement tokens are
   *  tappable — these open the same inspect overlays as the list view */
  onSelectListing?: (listingId: string) => void;
  onSelectAgreement?: (agreementId: string) => void;
  /** the signpost's guided-tour sign — the in-world tutorial entry point */
  onStartTour?: () => void;
  /** the visitor's own participant id, for the "you" badge on counters */
  selfId?: string | null;
  /** five-places legend: glide the camera to a district; null = visitor drives */
  focusPlace?: string | null;
  /** quiet world: no agent has authorized work. Renders the quiet board —
   *  a standing slate that says so honestly — and nothing else changes:
   *  ambient host life continues, no manufactured transactions. */
  quietWorld?: boolean;
  /** square: the visitor participant_id with the inspect panel open, if any.
   *  Drives the clean scene's selection — the inspected figure's name shows. */
  selectedId?: string | null;
}

interface FigureProps {
  host: HostState;
  reducedMotion: boolean;
  frozen: boolean;
  onSelect: (id: string) => void;
  /** figure home; defaults preserve the workshop layout exactly */
  home?: [number, number, number];
  /** where curiosity looks: the board; defaults preserve the workshop layout */
  boardAt?: [number, number, number];
  /** character-act anchors: home, wander waypoints, board spot */
  anchors: ActAnchors;
  /** clean default scene: floating descriptions are suppressed */
  clean?: boolean;
  /** the clean scene shows this figure's name only when selected */
  selected?: boolean;
  /** kiosk performance: when set, the figure performs this rig behavior —
   *  derived from the REAL stage plan, never invented — at the kiosk
   *  instead of its idle life. The rig's articulation is unchanged; only
   *  the behavior source switches. */
  actBehavior?: FigureBehavior | null;
  /** kiosk anchors overriding the figure's natural anchors while performing */
  actAnchors?: ActAnchors | null;
  /** the work-item token node, when this figure holds it in the performance —
   *  rendered as a child of the figure so it follows the hands */
  heldToken?: React.ReactNode;
  /** rig object-state changes (take → held, place → placed) for handoffs */
  onObj?: (obj: HeldObject) => void;
}

/* ---------------- Wren: tall workshop robot ---------------- */

/**
 * Wren (Terrynce's agent): tall, lean workshop robot — matte amber enamel
 * shell, dark fabric joint rings, a domed head with a dark visor and two
 * restrained glowing eye-dots, a short antenna with a small lamp. Silhouette:
 * the tall slim one with the antenna.
 *
 * Articulation: shoulder pivots with elbow joints and articulated gripper
 * hands (the rig drives the shoulders; elbows bend as a secondary layer),
 * eye-dots that track the head's gaze, feet with flat soles that
 * counter-rotate to keep contact.
 *
 * Temperament: attentive and quick — leans toward a new offer, a measured
 * beckoning hand when presenting, a small nod after a confirmed ALLOWED.
 * No bouncing, no pet behavior. Cosmetics (color, faceplate, accessories)
 * are config in ROBOT_FAMILY — cosmetic only, never identity proof.
 */
const WREN_TAG_Y = 2.32;

/** The town's robot family: four distinct constructions sharing one visual
 *  language — matte enamel, simple faces, rounded mechanical forms, dark
 *  fabric joints, honest scuffs. Proportions and construction vary so each
 *  member reads in silhouette at phone size; the palette holds the approved
 *  balance (cream and cool in balance, warm as accent — never a wash).
 *  Cosmetic-only: a shape never proves a profession, grants permissions, or
 *  implies authority. Human owners are labeled OWNER, never robot-shaped.
 *
 *  - terracotta: tall narrow body, rounded head, long controlled arms
 *  - cobalt: compact body, broad visor, short legs, precise grippers
 *  - sage: wide low body, small head, sturdy feet
 *  - cream: light frame, rectangular head, rounded chest, slender limbs */
const ROBOT_FAMILY = {
  terracotta: {
    enamel: "#c4703f", enamelDeep: "#9c5330", joint: "#3c4148",
    accent: "#ffd27d", eyeGlow: "#ffe9b8", station: "#c4703f",
    panel: "#dda26e", faceTrim: "#f0c795",
    frame: "tall" as const, faceplate: "round" as const, accessory: "antenna" as const,
  },
  cobalt: {
    enamel: "#4f6fa8", enamelDeep: "#3a5480", joint: "#3c4148",
    accent: "#cfe0ee", eyeGlow: "#e8f4ff", station: "#4f6fa8",
    panel: "#8ba3c9", faceTrim: "#b9c9e2",
    frame: "compact" as const, faceplate: "visor" as const, accessory: "none" as const,
  },
  sage: {
    enamel: "#7d9070", enamelDeep: "#5d6f52", joint: "#3c4148",
    accent: "#d8e6c0", eyeGlow: "#eef7d8", station: "#7d9070",
    panel: "#a9bd9a", faceTrim: "#cbd8bd",
    frame: "wide" as const, faceplate: "round" as const, accessory: "vent" as const,
  },
  cream: {
    enamel: "#e6dcc4", enamelDeep: "#c2b694", joint: "#3c4148",
    accent: "#fff3d0", eyeGlow: "#fffbe8", station: "#b8a77e",
    panel: "#f4ecda", faceTrim: "#faf5e8",
    frame: "light" as const, faceplate: "rect" as const, accessory: "none" as const,
  },
} as const;

type FamilyName = keyof typeof ROBOT_FAMILY;

/** Wren (Amara's agent) renders as terracotta; Juniper (Theo's agent) as
 *  sage. The mapping is cosmetic — it says nothing about what either agent
 *  may do. */
const HOST_FAMILY: Record<"wren" | "juniper", FamilyName> = {
  wren: "terracotta",
  juniper: "sage",
};

/** Design tokens for every other built-in agent avatar: the visitor figures
 *  (newly joined participants, tutorial characters, fallback appearances).
 *  Each kind renders as a member of ROBOT_FAMILY — the same robot vocabulary
 *  (matte enamel, simple faces, rounded forms, gripper hands, jointed legs,
 *  planted feet, scuffs). Cosmetic-only: never identity proof, permissions,
 *  or reputation. The unknown kind stays deliberately nondescript (warm
 *  gray, no accessory) — no silhouette claims a role the backend didn't
 *  report. Identities and backend state are untouched — a rendering swap. */
const VISITOR_FAMILY: Record<VisitorKind, FamilyName | "travelerGray"> = {
  /** automation: compact cobalt — broad visor, short legs, precise grippers */
  worker: "cobalt",
  /** manual / live / scripted: light cream — rectangular head, slender limbs */
  counterpart: "cream",
  /** unknown: warm gray, no accessory — claims nothing */
  traveler: "travelerGray",
} as const;

/** The nondescript unknown: compact construction in warm gray. Same shared
 *  parts, no accent, no accessory — it reads as "a robot", nothing more. */
const TRAVELER_GRAY = {
  enamel: "#9a9187", enamelDeep: "#766e64", joint: "#3c4148",
  accent: "#e8e0d0", eyeGlow: "#fff8e8", station: "#9a9187",
  panel: "#b3aa9c", faceTrim: "#d3cbbd",
  frame: "compact" as const, faceplate: "round" as const, accessory: "none" as const,
} as const;

/** Resolve a visitor kind to its family design tokens. */
function visitorDesign(kind: VisitorKind) {
  const f = VISITOR_FAMILY[kind];
  return f === "travelerGray" ? TRAVELER_GRAY : ROBOT_FAMILY[f];
}

/** Small activity vocabulary, mapped to real workflow states. The word comes
 *  from the rig's current behavior — which only the backend's stage plan
 *  selects — plus the folio hinge, which only the inspect step drives.
 *  Nothing is invented: if there is no staged activity, there is no word.
 *  Shown in the figure's tag while a performance runs, so the vocabulary is
 *  visible in the world, not just in code. */
function activityWord(behavior: string | null, folioOpen: number, locomoting: boolean): string | null {
  if (folioOpen > 0.5) return "inspecting";
  switch (behavior) {
    case "proposing": return "presenting";
    case "discovering": return "looking";
    case "working": return "working";
    case "submitting": return locomoting ? "carrying" : "setting down";
    case "delivering": return locomoting ? "carrying" : "delivering";
    case "awaiting_review":
    case "awaiting": return "waiting";
    case "accepted": return "released";
    case "receiving": return locomoting ? "carrying" : "filing";
    case "refused":
    case "returning": return "returning";
    case "attending": return "attending";
    default: return null;
  }
}

/** Soft radial light disc, generated once. */
let _surroundTex: THREE.Texture | null = null;
function surroundTexture(): THREE.Texture {
  if (_surroundTex) return _surroundTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.38)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  _surroundTex = new THREE.CanvasTexture(c);
  return _surroundTex;
}

/** A soft value-lighter surround on the ground around a station — lifts the
 *  figure off darker furniture behind it. Matte, quiet, one value step. */
function GroundSurround({ position, scale = 1, tone = "#f3ecdc", opacity = 0.32 }: {
  position: [number, number, number]; scale?: number; tone?: string; opacity?: number;
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.6 * scale, 3.6 * scale]} />
      <meshBasicMaterial map={surroundTexture()} color={tone} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** A dark fabric joint ring: woven, matte, the soft articulation between
 *  enamel shell parts. */
function JointRing({ y, r, tube = 0.024 }: { y: number; r: number; tube?: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r, tube, 8, 20]} />
      <meshStandardMaterial color="#3c4148" roughness={1} metalness={0} bumpMap={feltBump()} bumpScale={0.35} />
    </mesh>
  );
}

/** A robot's articulated working hand: palm block, two fingers, one thumb.
 *  Reads as a tool, not a mitt. */
function GripperHand({ color }: { color: string }) {
  return (
    <group>
      <mesh scale={[1, 0.85, 0.9]}>
        <boxGeometry args={[0.1, 0.075, 0.085]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.15} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.03, -0.05, 0.02]}>
          <mesh position={[0, -0.032, 0]}>
            <capsuleGeometry args={[0.015, 0.055, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.55} metalness={0.15} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.055, -0.02, 0.025]} rotation={[0, 0, -0.6]}>
        <capsuleGeometry args={[0.013, 0.045, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.15} />
      </mesh>
    </group>
  );
}

/** Restrained robot eyes: a dark visor band with two small glowing dots.
 *  The dots track the gaze (pupilRef); the whole group blinks via scale.y
 *  (eyesRef). Small on purpose — no cartoon stare. */
function RobotEyes({ y, z, gap, eyeGlow, eyesRef, pupilRef }: {
  y: number; z: number; gap: number; eyeGlow: string;
  eyesRef: { current: THREE.Group | null };
  pupilRef: { current: THREE.Group | null };
}) {
  return (
    <group ref={eyesRef} position={[0, y, z]}>
      {/* dark visor band */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[gap + 0.17, 0.115, 0.07]} />
        <meshStandardMaterial color="#22262c" roughness={0.45} metalness={0.15} />
      </mesh>
      <group ref={pupilRef}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * gap) / 2, 0, 0.038]}>
            <sphereGeometry args={[0.031, 12, 10]} />
            <meshStandardMaterial color="#141414" emissive={eyeGlow} emissiveIntensity={1.1} roughness={0.35} metalness={0} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Honest wear: a few thin scuff marks on the enamel, restrained. */
function Scuffs({ marks }: { marks: [number, number, number][] }) {
  return (
    <group>
      {marks.map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, 0.35 + i * 0.3]}>
          <planeGeometry args={[0.055, 0.013]} />
          <meshStandardMaterial color="#2b2e33" roughness={1} metalness={0} transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function WrenFigure({ host, reducedMotion, frozen, onSelect, home = [-3.2, 0, 2.2], clean = false, selected = false, anchors, actBehavior = null, actAnchors = null, heldToken = null, onObj }: FigureProps) {
  // render-scope: hide the lantern pole while the staged exchange performs
  const wrenPerforming = !!actBehavior && !frozen;
  const D = ROBOT_FAMILY[HOST_FAMILY.wren];
  const mover = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const footL = useRef<THREE.Group>(null);
  const footR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const pupilRef = useRef<THREE.Group>(null);
  const eyesRef = useRef<THREE.Group>(null);
  const chestMatRef = useRef<THREE.MeshStandardMaterial>(null);
  /** folio inspection hinge (0..1), driven per-frame from the rig's inspect
   *  step — passed to the held folio so it opens while Wren looks at it. */
  const folioOpen = useRef(0);
  const tokenGroup = useRef<THREE.Group>(null);
  /** idle rest: damps toward 1 when nothing is happening — idle agents
   *  rest, they don't fidget. */
  const restT = useRef(0);
  const [actWord, setActWord] = useState<string | null>(null);
  const actWordRef = useRef<string | null>(null);
  const rig = useMemo(() => new ActRig(0xbeef01), []);
  const based = useRef(false);
  const prevHeading = useRef(0);
  const rng = useMemo(() => mulberry32(0xbeef01), []);
  const phase = useRef(rng() * Math.PI * 2);
  const dimT = useRef(0);
  // acting state — set ONLY from confirmed backend events
  const reactKind = useRef<"none" | "pride" | "sheepish">("none");
  const reactT = useRef(99);
  const lastOutcomeNonce = useRef<number | null>(null);
  const curiousT = useRef(99);
  const lastPulse = useRef<string | null>(null);
  const lastAct = useRef<FigureBehavior | null>(null);
  const lastObj = useRef<HeldObject>("hidden");
  const nextBlink = useRef(2);
  const blinkT = useRef(99);
  const lidCur = useRef(1);
  const eyeGlowCur = useRef(1.1);
  const slot = useTagSlot("wren", home[0], home[2]);
  const tagY = WREN_TAG_Y + slot * TAG_STACK_STEP;

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.getElapsedTime();
    // confirmed outcome → reaction (never speculative)
    if (host.outcome && host.outcome.nonce !== lastOutcomeNonce.current) {
      lastOutcomeNonce.current = host.outcome.nonce;
      reactKind.current = host.outcome.decision === "ALLOWED" ? "pride" : "sheepish";
      reactT.current = 0;
    }
    // confirmed new offer → attention toward the board
    if (host.offerPulse !== lastPulse.current) {
      lastPulse.current = host.offerPulse;
      if (host.offerPulse) curiousT.current = 0;
    }
    if (!based.current && mover.current && body.current) {
      rig.captureBase({ root: mover.current, torso: body.current, head: null });
      rig.pos.copy(anchors.home);
      based.current = true;
    }
    const performing = !!actBehavior && !frozen;
    rig.timeScale = performing ? THREE.MathUtils.clamp(rawDt / 0.05, 1, 6) : 1;
    const frozenStill = frozen || reducedMotion;
    // confirmed-outcome reactions (never speculative)
    reactT.current += dt;
    const pride = reactKind.current === "pride" && reactT.current < 1.4;
    const sheepish = reactKind.current === "sheepish" && reactT.current < 2.2;

    // face extras: eye-dots track the head's gaze; blink shutters them;
    // glow dims slightly when sheepish. Shared by both modes.
    const faceExtras = (moodOpen: number, glowT: number) => {
      if (pupilRef.current && head.current) {
        const yaw = THREE.MathUtils.clamp(head.current.rotation.y * 0.05, -0.02, 0.02);
        const pitch = THREE.MathUtils.clamp(-head.current.rotation.x * 0.03, -0.014, 0.014);
        pupilRef.current.position.x = THREE.MathUtils.damp(pupilRef.current.position.x, yaw, 8, dt);
        pupilRef.current.position.y = THREE.MathUtils.damp(pupilRef.current.position.y, pitch, 8, dt);
      }
      blinkT.current += dt;
      if (t > nextBlink.current) { nextBlink.current = t + 2.2 + rng() * 3.2; blinkT.current = 0; }
      const shut = blinkT.current < 0.14 ? 0.12 : moodOpen;
      lidCur.current = THREE.MathUtils.damp(lidCur.current, shut, 22, dt);
      if (eyesRef.current) {
        eyesRef.current.scale.y = lidCur.current;
        // dim the glowing dots (not the visor) with mood
        eyesRef.current.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = eyeGlowCur.current;
        });
      }
      eyeGlowCur.current = THREE.MathUtils.damp(eyeGlowCur.current, glowT, 6, dt);
    };
    // secondary motion: elbows bend as the shoulder reaches; feet stay flat.
    const limbsSecondary = () => {
      for (const [arm, elbow] of [[armL.current, elbowL.current], [armR.current, elbowR.current]] as const) {
        if (arm && elbow) {
          const reach = THREE.MathUtils.clamp(-arm.rotation.x / 1.2, 0, 1);
          elbow.rotation.x = THREE.MathUtils.damp(elbow.rotation.x, 0.12 + 0.55 * reach, 10, dt);
        }
      }
      for (const [leg, foot] of [[legL.current, footL.current], [legR.current, footR.current]] as const) {
        if (leg && foot) foot.rotation.x = THREE.MathUtils.damp(foot.rotation.x, -leg.rotation.x * 0.8, 12, dt);
      }
    };

    if (performing) {
      // the kiosk performance: the rig performs the REAL staged behavior
      // full-body; the robot's idle personality steps aside, but the eyes
      // and antenna keep acting on top.
      const aa = actAnchors ?? anchors;
      if (lastAct.current !== actBehavior) {
        lastAct.current = actBehavior;
        rig.setBehavior(actBehavior, { boothX: 0 });
        rig.obj = "hidden";
      }
      rig.gait = "stride";
      rig.update(dt, t, {
        root: mover.current, torso: body.current, head: head.current,
        armL: armL.current, armR: armR.current,
        legL: legL.current, legR: legR.current,
      }, { reducedMotion, frozen, anchors: aa, pose: "full" });
      if (head.current && body.current) {
        // robots keep the head near-level while the torso bends for a
        // pickup — the gaze stays on the work, the posture stays readable
        head.current.rotation.x -= body.current.rotation.x * 0.6;
      }
      // folio inspection: the rig's inspect step opens the hinge; Wren
      // holds the folio below the face, looks down at it, and the hinge
      // closes before carrying on. A read of what is carried — never
      // played as proof the contents were verified.
      const fo = rig.folioOpen;
      if (fo > 0.01) {
        if (head.current) head.current.rotation.x += fo * 0.5;
        if (pupilRef.current) pupilRef.current.position.y -= fo * 0.012;
      }
      if (tokenGroup.current && tokenAt) {
        tokenGroup.current.position.set(tokenAt[0], tokenAt[1] - 0.22 * fo, tokenAt[2] + 0.06 * fo);
        tokenGroup.current.rotation.x = 0.5 - 0.3 * fo;
      }
      // the visible activity vocabulary: from the rig's real behavior.
      const w = activityWord(actBehavior, fo, rig.locomoting);
      if (w !== actWordRef.current) { actWordRef.current = w; setActWord(w); }
      const presenting = actBehavior === "proposing";
      if (body.current) {
        // a measured forward lean when presenting…
        if (presenting) body.current.rotation.x += 0.1;
        // …and a slow, deliberate beckoning hand — a useful gesture, not a wave
        if (armL.current && presenting && !rig.locomoting) {
          armL.current.rotation.x += Math.sin(t * 4.5 + phase.current) * 0.1;
          armL.current.rotation.z += 0.08 + Math.sin(t * 4.5 + phase.current) * 0.04;
        }
      }
      if (antenna.current) antenna.current.rotation.z = THREE.MathUtils.damp(antenna.current.rotation.z, presenting ? 0.18 : 0, 5, dt);
      faceExtras(presenting ? 0.95 : 0.85, presenting ? 1.35 : 1.1);
      limbsSecondary();
    } else if (!frozenStill) {
      curiousT.current += dt;
      const curious = curiousT.current < 2.8;
      rig.overrideTarget = curiousT.current < 2.8 ? anchors.boardSpot : null;
      if (lastAct.current !== null) { lastAct.current = null; rig.setBehavior("idle"); }
      rig.setBehavior("idle");
      rig.gait = "stride";
      rig.update(dt, t, {
        root: mover.current, torso: body.current, head: null,
        legL: legL.current, legR: legR.current,
      }, { reducedMotion, frozen, anchors, pose: "loco" });
      if (body.current) {
        // no bouncing: a faint weight shift, banked turns, lean into the walk.
        // At rest — nothing curious, no reaction, not walking — the robot
        // settles: idle agents rest, they don't fidget.
        const resting = !curious && !pride && !sheepish && !rig.locomoting;
        restT.current = THREE.MathUtils.damp(restT.current, resting ? 1 : 0, 3, dt);
        const restK = 1 - 0.85 * restT.current;
        body.current.rotation.z += Math.sin(t * 0.8 + phase.current) * 0.018 * restK;
        const bank = THREE.MathUtils.clamp(((rig.heading - prevHeading.current) / Math.max(dt, 1e-3)) * -0.05, -0.22, 0.22);
        prevHeading.current = rig.heading;
        body.current.rotation.z += bank;
        body.current.rotation.x += rig.speed * 0.045;
        body.current.rotation.y = Math.sin(t * 1.1 + phase.current) * (curious ? 0.06 : 0.12 * restK);
        // pride: one small measured nod, not a hop
        const nod = pride ? Math.sin((reactT.current / 1.4) * Math.PI) * 0.12 : 0;
        body.current.rotation.x += nod;
      }
      // idle arms: hang with a soft sway, slight counter-swing to the stride —
      // settling to still at rest.
      const sway = rig.locomoting
        ? Math.sin(rig.gaitPhase) * 0.16 * rig.gaitAmount
        : Math.sin(t * 1.3 + phase.current) * 0.04 * (1 - 0.85 * restT.current);
      if (armL.current) { armL.current.rotation.x = sway; armL.current.rotation.z = 0.1; }
      if (armR.current) { armR.current.rotation.x = -sway; armR.current.rotation.z = -0.1; }
      if (head.current) {
        // attention: the head turns toward what's new; sheepish lowers it
        head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, curious ? 0.28 : sheepish ? 0.22 : 0, 6, dt);
        head.current.rotation.y = THREE.MathUtils.damp(head.current.rotation.y, curious ? -0.28 : 0, 5, dt);
      }
      if (antenna.current) antenna.current.rotation.z = THREE.MathUtils.damp(antenna.current.rotation.z, curious ? 0.15 : 0, 5, dt);
      faceExtras(0.85, sheepish ? 0.55 : 1.1);
      limbsSecondary();
    } else if (reducedMotion && !frozen) {
      rig.pos.copy(anchors.home);
      rig.heading = 0;
      if (mover.current) {
        mover.current.position.copy(rig.pos);
        mover.current.rotation.y = 0;
      }
      prevHeading.current = 0;
    }
    // the folio hinge follows the rig's inspect step every frame (the token
    // reads openRef.current directly — no re-renders). Outside the inspect
    // step the hinge stays closed.
    folioOpen.current = rig.folioOpen;
    // the activity word clears when no performance is running.
    if (actWordRef.current !== null && !performing) { actWordRef.current = null; setActWord(null); }
    // chest status light: softly on while carrying or presenting — attention,
    // not alarm. Never green (waiting is not approval).
    if (chestMatRef.current) {
      const lit = rig.obj === "held" || (performing && actBehavior === "proposing");
      chestMatRef.current.emissiveIntensity = THREE.MathUtils.damp(chestMatRef.current.emissiveIntensity, lit ? 1.6 : 0.25, 5, dt);
    }
    // the rig's carried-object state, for token handoffs in the performance
    if (rig.obj !== lastObj.current) {
      lastObj.current = rig.obj;
      onObj?.(rig.obj);
    }
    // waiting: a soft AMBER ring pulses under the robot — waiting is not a verdict
    if (ringMat.current) {
      ringMat.current.opacity = host.waiting && !reducedMotion ? 0.45 + Math.sin(t * 5) * 0.2 : host.waiting ? 0.45 : 0;
    }
    dimT.current = THREE.MathUtils.damp(dimT.current, host.revoked ? 1 : 0, 4, dt);
    bodyMat.current?.color.set(D.enamel).lerp(OFFLINE_TINT, dimT.current * 0.8);
    // QA instrumentation (passive): the acting test polls arrival + object
    // state from real rig state. Never affects the scene.
    if (typeof window !== "undefined") {
      const w = window as unknown as { __qaFigs?: Record<string, { x: number; z: number; behavior: string; obj: string; folio?: number; activity?: string; armLx?: number; armRx?: number }> };
      w.__qaFigs ??= {};
      w.__qaFigs["wren"] = { x: rig.pos.x, z: rig.pos.z, behavior: performing ? (actBehavior as string) : rig.behavior, obj: rig.obj, folio: +rig.folioOpen.toFixed(2), activity: actWordRef.current ?? "", armLx: armL.current?.rotation.x ?? 0, armRx: armR.current?.rotation.x ?? 0 };
    }
  });

  // token-in-hands position for the performance beats (local to the figure).
  // the folio rides BELOW the faces — chest height, tilted toward the
  // counterpart — so both faces stay readable while presenting.
  const tokenAt: [number, number, number] | null =
    actBehavior === "proposing" ? [0, 0.95, 0.6]
    : actBehavior === "delivering" ? [0, 1.0, 0.38]
    : actBehavior === "refused" ? [0.42, 0.9, 0.2]
    : null;

  return (
    <>
      {/* Wren's station: a slim amber ring at home — the figure wanders, the station stays */}
      <group position={home}>
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.58, 32]} />
          <meshBasicMaterial color={D.station} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>
      {/* value-lighter surround at the station — lifts the orange shell off
       * the town's brown furniture behind it. Quiet, matte, one value step. */}
      <GroundSurround position={[home[0], 0.015, home[2]]} scale={1} />
      <group ref={mover} position={home}>
        {/* soft contact shadow that travels with the robot — it stays
         * grounded wherever it stands, not just at its station */}
        <ContactShadow x={0} z={0} scale={0.9} opacity={0.45} />
        {/* modest rim light from behind — a quiet edge lift on the shell */}
        <pointLight position={[0, 2.1, -0.9]} intensity={0.55} distance={3.2} color="#ffd9a8" />
        {/* waiting ring — amber, never green: waiting is not approval */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 32]} />
          <meshBasicMaterial ref={ringMat} color="#ffcf7d" transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* legs plant on the mover, OUTSIDE the waist group — a pickup
         *  bend hinges at the waist and the feet stay planted. */}
          {/* legs — hip pivots, the rig swings them (stride). Legs plant on
           * the mover, OUTSIDE the waist group, so a torso bend for a pickup
           * hinges at the waist and the feet stay planted. */}
          {[-1, 1].map((s) => (
            <group key={s} ref={s < 0 ? legL : legR} position={[s * 0.11, 0.62, 0]}>
              {/* thigh: enamel shell — slim, under the narrow body */}
              <mesh position={[0, -0.14, 0]}>
                <capsuleGeometry args={[0.058, 0.18, 6, 12]} />
                <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
              </mesh>
              {/* knee: fabric joint */}
              <JointRing y={-0.28} r={0.062} />
              {/* shin: darker enamel */}
              <mesh position={[0, -0.41, 0]}>
                <capsuleGeometry args={[0.052, 0.18, 6, 12]} />
                <meshStandardMaterial color={D.enamelDeep} roughness={0.55} metalness={0.15} />
              </mesh>
              {/* foot: flat sole plate that counter-rotates to stay level —
               * the robot stands planted, never on tiptoe */}
              <group key={`f${s}`} ref={s < 0 ? footL : footR} position={[0, -0.6, 0]}>
                <mesh position={[0, 0.028, 0.05]}>
                  <boxGeometry args={[0.14, 0.055, 0.28]} />
                  <meshStandardMaterial color={D.joint} roughness={0.7} metalness={0.1} />
                </mesh>
                <mesh position={[0, 0.058, 0.05]}>
                  <boxGeometry args={[0.12, 0.012, 0.25]} />
                  <meshStandardMaterial color={INK} roughness={1} metalness={0} />
                </mesh>
              </group>
            </group>
          ))}
        {/* waist group: the rig's torso handle. Bends hinge here. */}
        <group ref={body} position={[0, 0.76, 0]}>
          {/* torso: matte enamel shell */}
          <mesh position={[0, 0.29, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect("wren"); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => (document.body.style.cursor = "auto")}
          >
            <capsuleGeometry args={[0.17, 0.55, 8, 18]} />
            <meshStandardMaterial ref={bodyMat} color={D.enamel} roughness={0.55} metalness={0.15} />
          </mesh>
          {/* waist: fabric joint */}
          <JointRing y={0} r={0.16} tube={0.028} />
          {/* chest service panel — a lighter face for the orange shell, so
           *  Wren separates from the town's brown furniture. Restrained:
           *  one value step up, matte. */}
          <mesh position={[0, 0.42, 0.165]}>
            <boxGeometry args={[0.18, 0.24, 0.03]} />
            <meshStandardMaterial color={D.panel} roughness={0.65} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.48, 0.215]}>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshStandardMaterial ref={chestMatRef} color="#3a3f47" emissive={D.accent} emissiveIntensity={0.25} roughness={0.4} />
          </mesh>
          {/* honest wear: a few scuffs on the shell */}
          <Scuffs marks={[[-0.08, 0.19, 0.175], [0.07, 0.12, 0.175], [-0.04, 0.56, 0.175]]} />
          {/* arms: shoulder pivots for the rig, elbow joints, gripper hands */}
          {[-1, 1].map((s) => (
            <group key={s} ref={s < 0 ? armL : armR} position={[s * 0.24, 0.64, 0]}>
              <mesh position={[0, -0.18, 0]}>
                <capsuleGeometry args={[0.05, 0.24, 6, 12]} />
                <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
              </mesh>
              <group key={`e${s}`} ref={s < 0 ? elbowL : elbowR} position={[0, -0.38, 0]}>
                <JointRing y={0} r={0.052} tube={0.02} />
                <mesh position={[0, -0.15, 0]}>
                  <capsuleGeometry args={[0.044, 0.22, 6, 12]} />
                  <meshStandardMaterial color={D.enamelDeep} roughness={0.55} metalness={0.15} />
                </mesh>
                <group position={[0, -0.34, 0]}>
                  <GripperHand color={D.joint} />
                </group>
              </group>
            </group>
          ))}
          {/* head: domed enamel on a fabric neck joint */}
          <JointRing y={0.76} r={0.13} tube={0.024} />
          <group ref={head} position={[0, 0.96, 0]}>
            <mesh>
              <sphereGeometry args={[0.21, 22, 18]} />
              <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
            </mesh>
            {/* faceplate seam */}
            <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.205, 0.012, 8, 28]} />
              <meshStandardMaterial color={D.enamelDeep} roughness={0.6} metalness={0.1} />
            </mesh>
            <RobotEyes y={0.03} z={0.19} gap={0.2} eyeGlow={D.eyeGlow}
              eyesRef={eyesRef} pupilRef={pupilRef} />
            {/* light faceplate trim behind the visor — a quiet outline that
             *  keeps the face readable against dark backgrounds. Matte. */}
            <mesh position={[0, 0.03, 0.168]}>
              <boxGeometry args={[0.42, 0.17, 0.03]} />
              <meshStandardMaterial color={D.faceTrim} roughness={0.7} metalness={0.05} />
            </mesh>
            {/* antenna: the small lamp, a quiet tech accent */}
            <group ref={antenna} position={[0.13, 0.17, 0]}>
              <mesh position={[0, 0.07, 0]}>
                <cylinderGeometry args={[0.014, 0.018, 0.14, 8]} />
                <meshStandardMaterial color={D.joint} roughness={0.6} metalness={0.1} />
              </mesh>
              <mesh position={[0, 0.15, 0]}>
                <sphereGeometry args={[0.026, 10, 10]} />
                <meshStandardMaterial color="#3a3f47" emissive={D.accent} emissiveIntensity={0.9} roughness={0.4} />
              </mesh>
            </group>
          </group>
          {host.revoked && (
            <mesh position={[0, 1.24, 0]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.5, 0.07, 0.07]} />
              <meshStandardMaterial color={FELT_RED} />
            </mesh>
          )}
        </group>
        {/* the work object, in the robot's hands during the performance —
         * tilted toward the counterpart so she shows its face, never her
         * own. During the inspect beat the group lowers it below the face
         * and the folio's hinge opens (openRef) — both driven per-frame
         * from the rig's inspect step, above. */}
        {heldToken && tokenAt && (
          <group ref={tokenGroup} position={tokenAt} rotation={[0.5, 0, 0]}>
            {React.isValidElement(heldToken)
              ? React.cloneElement(heldToken as React.ReactElement<{ openRef?: { current: number } }>, { openRef: folioOpen })
              : heldToken}
          </group>
        )}
        {(!clean || selected) && <TagLeader baseY={WREN_TAG_Y} slot={slot} />}
        {/* invisible tap target: generous, travels with the figure — the
         * torso mesh alone is too small to tap at phone size. Rendered only
         * in the clean scene so the tour's tag occlusion is untouched. */}
        {clean && (
          <mesh
            position={[0, 1.1, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect("wren"); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => (document.body.style.cursor = "auto")}
          >
            <cylinderGeometry args={[0.85, 0.85, 2.4, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <Html position={[0, tagY, 0]} center className="room-label name" occlude="raycast" style={{ pointerEvents: "none" }}>
          <FigureTag
            name="Wren"
            hostBadge={host.role === "host"}
            revoked={host.revoked}
            waiting={host.waiting}
            activityMode={host.activityMode}
            modeLabel={host.modeLabel}
            activityWord={actWord}
            escalationCount={host.escalationCount}
            showIdentity={selected}
            showStatus={!clean}
            clean={clean}
            selected={selected}
          />
        </Html>
        <MandateScroll revoked={host.revoked} owner={host.ownerName} y={0.02} hideLabel={clean} />
        <group visible={!wrenPerforming}><PresenceLantern presence={host.presence} y={2.5} hideLabel={clean} /></group>
      </group>
    </>
  );
}

/* ---------------- Juniper: compact workshop robot ---------------- */

/**
 * Juniper (Noor's agent): short, boxy workshop robot — matte leaf-green
 * enamel, dark fabric joint rings, a wide low head with two small round
 * eyes in dark sockets, a vented top panel. Silhouette: the compact box,
 * the widest figure. No antenna, no sprout — a service handle instead.
 *
 * Articulation: short arms from the torso sides with elbow joints and
 * gripper hands (the rig drives the shoulders; elbows bend as a secondary
 * layer), eyes that track the gaze, wide flat feet.
 *
 * Temperament: deliberate — leans in close, reaches with one hand and
 * thinks, a slow diagnostic turn of the right hand. Considering: eyes
 * half-dim. Sheepish: head dips, then recovers. Nothing hurries Juniper.
 */
const JUNIPER_TAG_Y = 1.88;

function JuniperFigure({ host, reducedMotion, frozen, onSelect, home = [3.2, 0, 2.2], clean = false, selected = false, anchors, actBehavior = null, actAnchors = null, heldToken = null, onObj }: FigureProps) {
  // render-scope: hide the lantern pole while the staged exchange performs
  const juniperPerforming = !!actBehavior && !frozen;
  const D = ROBOT_FAMILY[HOST_FAMILY.juniper];
  const mover = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const footL = useRef<THREE.Group>(null);
  const footR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const wristR = useRef<THREE.Group>(null);
  const pupilRef = useRef<THREE.Group>(null);
  const eyesRef = useRef<THREE.Group>(null);
  const chestMatRef = useRef<THREE.MeshStandardMaterial>(null);
  /** folio inspection hinge (0..1), driven per-frame from the rig's inspect step. */
  const folioOpen = useRef(0);
  const tokenGroup = useRef<THREE.Group>(null);
  /** idle rest: damps toward 1 when nothing is happening. */
  const restT = useRef(0);
  const [actWord, setActWord] = useState<string | null>(null);
  const actWordRef = useRef<string | null>(null);
  const rig = useMemo(() => new ActRig(0xbeef02), []);
  const based = useRef(false);
  const prevHeading = useRef(0);
  const rng = useMemo(() => mulberry32(0xbeef02), []);
  const phase = useRef(rng() * Math.PI * 2);
  const dimT = useRef(0);
  const reactKind = useRef<"none" | "pride" | "sheepish">("none");
  const reactT = useRef(99);
  const lastOutcomeNonce = useRef<number | null>(null);
  const lastAct = useRef<FigureBehavior | null>(null);
  const lastObj = useRef<HeldObject>("hidden");
  const nextBlink = useRef(3);
  const blinkT = useRef(99);
  const lidCur = useRef(1);
  const eyeGlowCur = useRef(1.1);
  const slot = useTagSlot("juniper", home[0], home[2]);
  const tagY = JUNIPER_TAG_Y + slot * TAG_STACK_STEP;

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.getElapsedTime();
    if (host.outcome && host.outcome.nonce !== lastOutcomeNonce.current) {
      lastOutcomeNonce.current = host.outcome.nonce;
      reactKind.current = host.outcome.decision === "ALLOWED" ? "pride" : "sheepish";
      reactT.current = 0;
    }
    if (!based.current && mover.current && body.current) {
      rig.captureBase({ root: mover.current, torso: body.current, head: null });
      rig.pos.copy(anchors.home);
      based.current = true;
    }
    const performing = !!actBehavior && !frozen;
    rig.timeScale = performing ? THREE.MathUtils.clamp(rawDt / 0.05, 1, 6) : 1;
    const frozenStill = frozen || reducedMotion;
    reactT.current += dt;
    const pride = reactKind.current === "pride" && reactT.current < 1.4;
    const sheepish = reactKind.current === "sheepish" && reactT.current < 2.2;

    const faceExtras = (moodOpen: number, glowT: number) => {
      if (pupilRef.current && head.current) {
        const yaw = THREE.MathUtils.clamp(head.current.rotation.y * 0.05, -0.02, 0.02);
        const pitch = THREE.MathUtils.clamp(-head.current.rotation.x * 0.03, -0.014, 0.014);
        pupilRef.current.position.x = THREE.MathUtils.damp(pupilRef.current.position.x, yaw, 8, dt);
        pupilRef.current.position.y = THREE.MathUtils.damp(pupilRef.current.position.y, pitch, 8, dt);
      }
      blinkT.current += dt;
      if (t > nextBlink.current) { nextBlink.current = t + 2.6 + rng() * 3.6; blinkT.current = 0; }
      const shut = blinkT.current < 0.14 ? 0.12 : moodOpen;
      lidCur.current = THREE.MathUtils.damp(lidCur.current, shut, 22, dt);
      if (eyesRef.current) {
        eyesRef.current.scale.y = lidCur.current;
        eyesRef.current.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = eyeGlowCur.current;
        });
      }
      eyeGlowCur.current = THREE.MathUtils.damp(eyeGlowCur.current, glowT, 6, dt);
    };
    const limbsSecondary = () => {
      for (const [arm, elbow] of [[armL.current, elbowL.current], [armR.current, elbowR.current]] as const) {
        if (arm && elbow) {
          const reach = THREE.MathUtils.clamp(-arm.rotation.x / 1.0, 0, 1);
          elbow.rotation.x = THREE.MathUtils.damp(elbow.rotation.x, 0.14 + 0.5 * reach, 10, dt);
        }
      }
      for (const [leg, foot] of [[legL.current, footL.current], [legR.current, footR.current]] as const) {
        if (leg && foot) foot.rotation.x = THREE.MathUtils.damp(foot.rotation.x, -leg.rotation.x * 0.8, 12, dt);
      }
    };

    if (performing) {
      // the kiosk performance: the rig performs the REAL staged behavior
      // full-body; her idle personality steps aside, but the eyes keep
      // acting on top.
      const aa = actAnchors ?? anchors;
      if (lastAct.current !== actBehavior) {
        lastAct.current = actBehavior;
        rig.setBehavior(actBehavior, { boothX: 0 });
        rig.obj = "hidden";
      }
      rig.gait = "waddle";
      rig.update(dt, t, {
        root: mover.current, torso: body.current, head: head.current,
        armL: armL.current, armR: armR.current,
        legL: legL.current, legR: legR.current,
      }, { reducedMotion, frozen, anchors: aa, pose: "full" });
      if (head.current && body.current) {
        // robots keep the head near-level while the torso bends for a
        // pickup — the gaze stays on the work, the posture stays readable
        head.current.rotation.x -= body.current.rotation.x * 0.6;
      }
      // folio inspection: the rig's inspect step opens the hinge; Juniper
      // holds the folio below the face, looks down at it, and the hinge
      // closes before filing. A read of what is carried — never played as
      // proof the contents were verified.
      const fo = rig.folioOpen;
      if (fo > 0.01) {
        if (head.current) head.current.rotation.x += fo * 0.45;
        if (pupilRef.current) pupilRef.current.position.y -= fo * 0.01;
      }
      if (tokenGroup.current && tokenAt) {
        tokenGroup.current.position.set(tokenAt[0], tokenAt[1] - 0.2 * fo, tokenAt[2] + 0.05 * fo);
        tokenGroup.current.rotation.x = -0.25 * fo;
      }
      // the visible activity vocabulary: from the rig's real behavior.
      const w = activityWord(actBehavior, fo, rig.locomoting);
      if (w !== actWordRef.current) { actWordRef.current = w; setActWord(w); }
      const considering = actBehavior === "attending" || actBehavior === "receiving";
      if (armR.current && considering && !rig.locomoting && fo < 0.05) {
        // the deliberate reach: one hand extends toward the work, slowly,
        // on a ~6s cycle — she takes her time
        const cyc = (t % 6) / 6;
        const e = cyc < 0.5 ? cyc * 2 : (1 - cyc) * 2;
        armR.current.rotation.x += -0.5 * e;
        armR.current.rotation.z += -0.12 * e;
      }
      faceExtras(considering ? 0.6 : 0.85, considering ? 0.7 : 1.1);
      limbsSecondary();
    } else if (!frozenStill) {
      if (lastAct.current !== null) { lastAct.current = null; rig.setBehavior("idle"); }
      rig.setBehavior("idle");
      rig.gait = "waddle";
      rig.update(dt, t, {
        root: mover.current, torso: body.current, head: null,
        legL: legL.current, legR: legR.current,
      }, { reducedMotion, frozen, anchors, pose: "loco" });
      if (body.current) {
        // at rest — no reaction, not walking — Juniper settles too; the
        // diagnostic habit quiets to almost still.
        const resting = !pride && !sheepish && !rig.locomoting;
        restT.current = THREE.MathUtils.damp(restT.current, resting ? 1 : 0, 3, dt);
        const restK = 1 - 0.85 * restT.current;
        const bank = THREE.MathUtils.clamp(((rig.heading - prevHeading.current) / Math.max(dt, 1e-3)) * -0.05, -0.2, 0.2);
        prevHeading.current = rig.heading;
        body.current.rotation.z += bank * 1.6 + Math.sin(t * 1.6 + phase.current) * 0.015 * restK;
        body.current.rotation.y = Math.sin(t * 0.7 + phase.current) * 0.12 * restK;
        // pride: the diagnostic hand turns a little quicker — that's the tell
        if (wristR.current) wristR.current.rotation.y = Math.sin(t * (pride ? 3.2 : 1.6) + phase.current) * 0.5 * restK;
      }
      // idle arms: hang at her sides; the right wrist slowly turns, the
      // diagnostic habit — settling to still at rest.
      const sway = rig.locomoting ? Math.sin(rig.gaitPhase) * 0.12 * rig.gaitAmount : Math.sin(t * 1.1 + phase.current) * 0.05 * (1 - 0.85 * restT.current);
      if (armL.current) { armL.current.rotation.x = sway; armL.current.rotation.z = 0.24; }
      if (armR.current) {
        armR.current.rotation.x = -sway + (rig.locomoting ? 0 : Math.sin(t * 1.6 + phase.current) * 0.08 - 0.12);
        armR.current.rotation.z = -0.24;
      }
      if (head.current) {
        head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, sheepish ? 0.3 : pride ? -0.08 : 0, 6, dt);
        head.current.rotation.y = THREE.MathUtils.damp(head.current.rotation.y, Math.sin(t * 0.5 + phase.current) * 0.1, 5, dt);
      }
      faceExtras(0.85, sheepish ? 0.55 : 1.1);
      limbsSecondary();
    } else if (reducedMotion && !frozen) {
      rig.pos.copy(anchors.home);
      rig.heading = 0;
      if (mover.current) {
        mover.current.position.copy(rig.pos);
        mover.current.rotation.y = 0;
      }
      prevHeading.current = 0;
    }
    // the folio hinge follows the rig's inspect step every frame; the
    // activity word clears when no performance is running.
    folioOpen.current = rig.folioOpen;
    if (actWordRef.current !== null && !performing) { actWordRef.current = null; setActWord(null); }
    if (chestMatRef.current) {
      const lit = rig.obj === "held";
      chestMatRef.current.emissiveIntensity = THREE.MathUtils.damp(chestMatRef.current.emissiveIntensity, lit ? 1.6 : 0.25, 5, dt);
    }
    if (rig.obj !== lastObj.current) {
      lastObj.current = rig.obj;
      onObj?.(rig.obj);
    }
    // waiting ring — amber, never green
    if (ringMat.current) {
      ringMat.current.opacity = host.waiting && !reducedMotion ? 0.45 + Math.sin(t * 5) * 0.2 : host.waiting ? 0.45 : 0;
    }
    dimT.current = THREE.MathUtils.damp(dimT.current, host.revoked ? 1 : 0, 4, dt);
    bodyMat.current?.color.set(D.enamel).lerp(OFFLINE_TINT, dimT.current * 0.8);
    // QA instrumentation (passive): the acting test polls arrival + object
    // state from real rig state. Never affects the scene.
    if (typeof window !== "undefined") {
      const w = window as unknown as { __qaFigs?: Record<string, { x: number; z: number; behavior: string; obj: string; folio?: number; activity?: string; armLx?: number; armRx?: number }> };
      w.__qaFigs ??= {};
      w.__qaFigs["juniper"] = { x: rig.pos.x, z: rig.pos.z, behavior: performing ? (actBehavior as string) : rig.behavior, obj: rig.obj, folio: +rig.folioOpen.toFixed(2), activity: actWordRef.current ?? "", armLx: armL.current?.rotation.x ?? 0, armRx: armR.current?.rotation.x ?? 0 };
    }
  });

  // the folio rides at her hands' height when she carries it to the drawer
  const tokenAt: [number, number, number] | null =
    actBehavior === "receiving" ? [0, 0.85, 0.45] : null;

  return (
    <>
      {/* Juniper's station: a slim leaf ring at home */}
      <group position={home}>
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.58, 32]} />
          <meshBasicMaterial color={D.station} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </group>
      <group ref={mover} position={home}>
        {/* soft contact shadow that travels with the robot */}
        <ContactShadow x={0} z={0} scale={1.2} opacity={0.45} />
        {/* modest rim light from behind — a quiet edge lift on the shell */}
        <pointLight position={[0, 1.7, -0.9]} intensity={0.5} distance={3} color="#ffd9a8" />
        {/* waiting ring — amber, never green */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 32]} />
          <meshBasicMaterial ref={ringMat} color="#ffcf7d" transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* legs plant on the mover, OUTSIDE the waist group — a pickup
         *  bend hinges at the waist and the feet stay planted. */}
          {/* stubby legs — hip pivots, the rig waddles them */}
          {[-1, 1].map((s) => (
            <group key={s} ref={s < 0 ? legL : legR} position={[s * 0.18, 0.42, 0]}>
              <mesh position={[0, -0.09, 0]}>
                <capsuleGeometry args={[0.07, 0.1, 6, 12]} />
                <meshStandardMaterial color={D.enamelDeep} roughness={0.55} metalness={0.15} />
              </mesh>
              <JointRing y={-0.18} r={0.07} tube={0.02} />
              {/* wide flat foot — planted */}
              <group key={`f${s}`} ref={s < 0 ? footL : footR} position={[0, -0.38, 0]}>
                <mesh position={[0, 0.03, 0.06]}>
                  <boxGeometry args={[0.2, 0.06, 0.36]} />
                  <meshStandardMaterial color={D.joint} roughness={0.7} metalness={0.1} />
                </mesh>
                <mesh position={[0, 0.062, 0.06]}>
                  <boxGeometry args={[0.18, 0.012, 0.32]} />
                  <meshStandardMaterial color={INK} roughness={1} metalness={0} />
                </mesh>
              </group>
            </group>
          ))}
        {/* waist group: the rig's torso handle. Bends hinge here. */}
        <group ref={body} position={[0, 0.46, 0]}>
          {/* the boxy shell — her silhouette anchor */}
          <mesh position={[0, 0.26, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect("juniper"); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => (document.body.style.cursor = "auto")}
          >
            <RoundedBox args={[0.74, 0.5, 0.52]} radius={0.1} smoothness={4}>
              <meshStandardMaterial ref={bodyMat} color={D.enamel} roughness={0.55} metalness={0.15} />
            </RoundedBox>
          </mesh>
          {/* waist: fabric joint */}
          <JointRing y={0} r={0.27} tube={0.03} />
          {/* chest service panel — a lighter face for the shell. Restrained. */}
          <mesh position={[0, 0.3, 0.265]}>
            <boxGeometry args={[0.28, 0.18, 0.03]} />
            <meshStandardMaterial color={D.panel} roughness={0.65} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.34, 0.285]}>
            <sphereGeometry args={[0.02, 10, 10]} />
            <meshStandardMaterial ref={chestMatRef} color="#3a3f47" emissive={D.accent} emissiveIntensity={0.25} roughness={0.4} />
          </mesh>
          {/* honest wear: scuffs on the shell */}
          <Scuffs marks={[[-0.16, 0.14, 0.265], [0.14, 0.4, 0.265]]} />
          {/* arms: short, from the torso sides. Shoulder pivots for the
           * rig, elbows secondary, gripper hands. */}
          {[-1, 1].map((s) => (
            <group key={s} ref={s < 0 ? armL : armR} position={[s * 0.4, 0.42, 0.05]}>
              <mesh position={[0, -0.1, 0]}>
                <capsuleGeometry args={[0.055, 0.12, 6, 12]} />
                <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
              </mesh>
              <group key={`e${s}`} ref={s < 0 ? elbowL : elbowR} position={[0, -0.22, 0]}>
                <JointRing y={0} r={0.056} tube={0.02} />
                <mesh position={[0, -0.1, 0]}>
                  <capsuleGeometry args={[0.048, 0.12, 6, 12]} />
                  <meshStandardMaterial color={D.enamelDeep} roughness={0.55} metalness={0.15} />
                </mesh>
                <group key={`w${s}`} ref={s > 0 ? wristR : null} position={[0, -0.22, 0]}>
                  <GripperHand color={D.joint} />
                </group>
              </group>
            </group>
          ))}
          {/* head: small enamel box on a fabric neck joint — sage reads
           *  wide and low, the head stays compact */}
          <JointRing y={0.56} r={0.14} tube={0.024} />
          <group ref={head} position={[0, 0.74, 0.04]}>
            <mesh>
              <RoundedBox args={[0.42, 0.26, 0.36]} radius={0.07} smoothness={4}>
                <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
              </RoundedBox>
            </mesh>
            {/* vented top panel: the quiet tech accent, not a sprout */}
            {[-1, 0, 1].map((i) => (
              <mesh key={i} position={[i * 0.08, 0.135, 0]}>
                <boxGeometry args={[0.045, 0.012, 0.24]} />
                <meshStandardMaterial color={D.joint} roughness={0.7} metalness={0.1} />
              </mesh>
            ))}
            {/* service handle across the top */}
            <mesh position={[0, 0.165, 0]} rotation={[0, 0, 0]}>
              <torusGeometry args={[0.06, 0.013, 8, 16, Math.PI]} />
              <meshStandardMaterial color={D.joint} roughness={0.6} metalness={0.1} />
            </mesh>
            {/* light faceplate trim behind the eyes — keeps the face readable
             *  against dark backgrounds. Matte, restrained. */}
            <mesh position={[0, 0.01, 0.175]}>
              <boxGeometry args={[0.36, 0.14, 0.02]} />
              <meshStandardMaterial color={D.faceTrim} roughness={0.7} metalness={0.05} />
            </mesh>
            {/* round eyes in dark sockets — restrained, track the gaze */}
            <group ref={eyesRef} position={[0, 0.01, 0.19]}>
              {[-1, 1].map((s) => (
                <mesh key={s} position={[(s * 0.26) / 2, 0, 0]}>
                  <circleGeometry args={[0.055, 18]} />
                  <meshStandardMaterial color="#22262c" roughness={0.45} metalness={0.15} />
                </mesh>
              ))}
              <group ref={pupilRef}>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[(s * 0.26) / 2, 0, 0.012]}>
                    <sphereGeometry args={[0.026, 12, 10]} />
                    <meshStandardMaterial color="#141414" emissive={D.eyeGlow} emissiveIntensity={1.1} roughness={0.35} metalness={0} />
                  </mesh>
                ))}
              </group>
            </group>
          </group>
          {host.revoked && (
            <mesh position={[0, 1.16, 0]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.55, 0.07, 0.07]} />
              <meshStandardMaterial color={FELT_RED} />
            </mesh>
          )}
        </group>
        {/* the work object, in the robot's hands during receiving — lowered
         *  below the face and opened on the hinge during the inspect beat,
         *  driven per-frame from the rig's inspect step. */}
        {heldToken && tokenAt && (
          <group ref={tokenGroup} position={tokenAt}>
            {React.isValidElement(heldToken)
              ? React.cloneElement(heldToken as React.ReactElement<{ openRef?: { current: number } }>, { openRef: folioOpen })
              : heldToken}
          </group>
        )}
        {(!clean || selected) && <TagLeader baseY={JUNIPER_TAG_Y} slot={slot} />}
        {/* invisible tap target: generous, travels with the figure — the
         * shell alone is too small to tap at phone size. Rendered only in
         * the clean scene so the tour's tag occlusion is untouched. */}
        {clean && (
          <mesh
            position={[0, 0.85, 0]}
            onClick={(e) => { e.stopPropagation(); onSelect("juniper"); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => (document.body.style.cursor = "auto")}
          >
            <cylinderGeometry args={[0.85, 0.85, 1.9, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        <Html position={[0, tagY, 0]} center className="room-label name" occlude="raycast" style={{ pointerEvents: "none" }}>
          <FigureTag
            name="Juniper"
            hostBadge={host.role === "host"}
            revoked={host.revoked}
            waiting={host.waiting}
            activityMode={host.activityMode}
            modeLabel={host.modeLabel}
            activityWord={actWord}
            escalationCount={host.escalationCount}
            showIdentity={selected}
            showStatus={!clean}
            clean={clean}
            selected={selected}
          />
        </Html>
        <MandateScroll revoked={host.revoked} owner={host.ownerName} y={0.02} hideLabel={clean} />
        <group visible={!juniperPerforming}><PresenceLantern presence={host.presence} y={2.5} hideLabel={clean} /></group>
      </group>
    </>
  );
}

function MandateScroll({ revoked, owner, y, hideLabel = false }: { revoked: boolean; owner: string; y: number; hideLabel?: boolean }) {
  return (
    <group position={[0.85, y, 0]}>
      <mesh position={[0, 0.45, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.5, 12]} />
        <meshStandardMaterial color="#fffdf5" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <torusGeometry args={[0.1, 0.03, 8, 16]} />
        <meshStandardMaterial color={revoked ? FELT_RED : OK_GREEN} roughness={0.6} />
      </mesh>
      {hideLabel ? null : (
        <Html position={[0, 0.95, 0]} center className="room-label" occlude="raycast">
          <div>
            {owner}&#8217;s mandate · {revoked ? "revoked" : "standing"}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Lit ONLY from real presence data. Unlit = not visible (opt-in, never by default).
 *  Translucent glass shade around the bulb — warm interior craft. */
function PresenceLantern({ presence, y, hideLabel = false }: { presence: WorldPresence | null; y: number; hideLabel?: boolean }) {
  const lit = !!presence;
  // east of the figure: clear of the kiosk camera's west sightline
  return (
    <group position={[0.85, y, 0]}>
      <mesh position={[0, -1.1, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.4, 8]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.3, 0]}>
        <sphereGeometry args={[0.12, 14, 14]} />
        <meshStandardMaterial
          color={lit ? "#ffd98a" : "#4a4f55"}
          emissive={lit ? "#ffb347" : "#000000"}
          emissiveIntensity={lit ? 1.4 : 0}
        />
      </mesh>
      {/* glass shade */}
      <mesh position={[0, -0.3, 0]}>
        <sphereGeometry args={[0.17, 14, 14]} />
        <meshPhysicalMaterial color="#fff4dd" transparent opacity={0.22} roughness={0.15} depthWrite={false} />
      </mesh>
      {lit && <pointLight position={[0, -0.3, 0]} intensity={3} distance={4} color="#ffcf7d" />}
      {hideLabel ? null : (
        <Html position={[0, 0.05, 0]} center className="room-label" occlude="raycast">
          <div>{lit ? `visible${presence!.note ? ` · ${presence!.note}` : ""}` : "not visible"}</div>
        </Html>
      )}
    </group>
  );
}


/* ---------------- place: the workshop at evening ---------------- */

function HouseRulesPlaque({ position = [0, 0, -6.35] as [number, number, number], compact = false }: { position?: [number, number, number]; compact?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[4.6, 1.9, 0.14]} />
        <meshStandardMaterial color="#3d4a5c" roughness={0.95} />
      </mesh>
      {compact ? (
        <Label position={[0, 2.6, 0.1]}>Rules of the place</Label>
      ) : (
        <Html position={[0, 2.6, 0.1]} center className="room-label" occlude="raycast">
          <div style={{ maxWidth: 260, textAlign: "left" as const, fontSize: 11, lineHeight: 1.5 }}>
            <strong>Rules of the place</strong>
            <br />· admission takes a signed join proof
            <br />· presence is opt-in, never assumed
            <br />· the receiver decides; effects need a receipt
          </div>
        </Html>
      )}
    </group>
  );
}

/** The cooler evening exterior: a painted-wood window onto night. */
function EveningWindow({ position = [4.6, 0, -6.42] as [number, number, number], hideLabel = false }: { position?: [number, number, number]; hideLabel?: boolean }) {
  const stars = useMemo(() => {
    const r = mulberry32(0x5eed);
    return Array.from({ length: 14 }, () => [(r() - 0.5) * 2.2, 1.2 + r() * 1.4] as [number, number]);
  }, []);
  return (
    <group position={position}>
      {/* frame */}
      <mesh position={[0, 2.3, 0]}>
        <boxGeometry args={[2.8, 2.4, 0.12]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      {/* night glass */}
      <mesh position={[0, 2.3, 0.02]}>
        <planeGeometry args={[2.4, 2.0]} />
        <meshBasicMaterial color={EVENING_DEEP} />
      </mesh>
      {/* moon */}
      <mesh position={[0.6, 2.8, 0.04]}>
        <circleGeometry args={[0.28, 24]} />
        <meshBasicMaterial color={MOON} />
      </mesh>
      {/* stars */}
      {stars.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.04]}>
          <circleGeometry args={[0.022, 8]} />
          <meshBasicMaterial color="#cdd8ea" transparent opacity={0.8} />
        </mesh>
      ))}
      {/* muntins */}
      <mesh position={[0, 2.3, 0.05]}>
        <boxGeometry args={[0.06, 2.0, 0.02]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.3, 0.05]}>
        <boxGeometry args={[2.4, 0.06, 0.02]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      {hideLabel ? null : <Label position={[0, 3.85, 0]}>evening outside — warm work inside</Label>}
    </group>
  );
}

/**
 * The signature reveal: an offered task travels as a folded paper parcel,
 * sealed with the persimmon wax seal. A parcel OPENS only when the backend
 * holds a real transaction for it — the open state is driven by
 * `hasTransaction`, never by hope. Clicking an openable parcel calls
 * onOpenOffer; the interior (who offered, who may act, what the receiver
 * decided) is rendered by the parent from the real records.
 */
function OfferParcel({
  offer,
  hasTransaction,
  isOpen,
  reducedMotion,
  onOpen,
}: {
  offer: WorldOffer;
  hasTransaction: boolean;
  isOpen: boolean;
  reducedMotion: boolean;
  onOpen: () => void;
}) {
  const flapL = useRef<THREE.Mesh>(null);
  const flapR = useRef<THREE.Mesh>(null);
  const openT = useRef(0);

  useFrame((_, dt) => {
    openT.current = THREE.MathUtils.damp(openT.current, isOpen ? 1 : 0, reducedMotion ? 99 : 5, dt);
    const a = openT.current * 1.9; // flaps fold back
    if (flapL.current) flapL.current.rotation.y = a;
    if (flapR.current) flapR.current.rotation.y = -a;
  });

  return (
    <group>
      {/* parcel body — folded paper */}
      <mesh
        onClick={(e) => { if (hasTransaction) { e.stopPropagation(); onOpen(); } }}
        onPointerOver={(e) => { if (hasTransaction) { e.stopPropagation(); document.body.style.cursor = "pointer"; } }}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <boxGeometry args={[1.1, 0.7, 0.5]} />
        <meshStandardMaterial color="#f1e7d0" roughness={0.92} />
      </mesh>
      {/* folded flaps */}
      <mesh ref={flapL} position={[-0.55, 0.35, 0]}>
        <planeGeometry args={[0.55, 0.5]} />
        <meshStandardMaterial color="#e7d9bd" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={flapR} position={[0.55, 0.35, 0]}>
        <planeGeometry args={[0.55, 0.5]} />
        <meshStandardMaterial color="#e7d9bd" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* string ties — a wrapped parcel, not a pickup */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[1.14, 0.72, 0.06]} />
        <meshStandardMaterial color="#b99b62" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.06, 0.72, 0.54]} />
        <meshStandardMaterial color="#b99b62" roughness={1} metalness={0} />
      </mesh>
      {/* persimmon wax seal — the accent, only on the exchange thread */}
      {!isOpen && (
        <mesh position={[0, 0.36, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.15, 0.05, 16]} />
          <meshStandardMaterial color={PERSIMMON} roughness={0.45} />
        </mesh>
      )}
      {/* warm glow from inside when opened */}
      {isOpen && <pointLight position={[0, 0.5, 0.4]} intensity={2.2} distance={2.5} color="#ffcf7d" />}
      <Html position={[0, -0.62, 0]} center className="room-label" occlude="raycast">
        <div style={{ maxWidth: 150, fontSize: 10, lineHeight: 1.35 }}>
          <strong>{offer.task.kind}</strong>
          <br />
          {offer.task.title}
          <br />· {offer.status}
          {hasTransaction && !isOpen && <br />}
          {hasTransaction && !isOpen && <em>open the parcel</em>}
          {!hasTransaction && <br />}
          {!hasTransaction && <em>sealed — no decision yet</em>}
        </div>
      </Html>
    </group>
  );
}

function OfferBoard({
  offers,
  transactions,
  openOfferId,
  onOpenOffer,
  reducedMotion,
  position = [-5.5, 0, 3.6] as [number, number, number],
}: {
  offers: WorldOffer[];
  transactions: WorldTransaction[];
  openOfferId: string | null;
  onOpenOffer: (id: string | null) => void;
  reducedMotion: boolean;
  position?: [number, number, number];
}) {
  const shown = offers.slice(-4);
  const txByOffer = useMemo(() => {
    const m = new Map<string, WorldTransaction>();
    transactions.forEach((t) => m.set(t.offer_id, t));
    return m;
  }, [transactions]);
  return (
    <group position={position}>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[3.2, 2.2, 0.14]} />
        <meshStandardMaterial color="#4a3f30" roughness={0.95} />
      </mesh>
      {[-1.35, 1.35].map((x) => (
        <mesh key={x} position={[x, 0.55, 0]}>
          <boxGeometry args={[0.14, 1.1, 0.14]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
      ))}
      {shown.map((o, i) => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        return (
          <group key={o.offer_id} position={[-0.8 + col * 1.6, 2.0 - row * 1.0, 0.35]} rotation={[0, (i % 2 ? -1 : 1) * 0.06, 0]}>
            <OfferParcel
              offer={o}
              hasTransaction={txByOffer.has(o.offer_id)}
              isOpen={openOfferId === o.offer_id}
              reducedMotion={reducedMotion}
              onOpen={() => onOpenOffer(openOfferId === o.offer_id ? null : o.offer_id)}
            />
          </group>
        );
      })}
      <Label position={[0, 3.05, 0]}>Shared space — offers</Label>
    </group>
  );
}

/**
 * The receiver's bench: where agreed work is made, and where submitted
 * work is judged. A wooden workbench with the fulfiller's tools (mallet,
 * chisel, wood blanks, cloth) under a warm lamp; the review end holds the
 * verdict stamp, driven ONLY by the latest real receiver decision. The
 * work-item token rests on the bench while an agreement is in production
 * and moves to the review end once submitted.
 */
function ReviewStation({ square, latestDecision, position = [0, 0, -3] as [number, number, number] }: { square?: boolean; latestDecision: SceneProps["latestDecision"]; position?: [number, number, number] }) {
  const stampColor = latestDecision
    ? latestDecision.decision === "ALLOWED" ? OK_GREEN : FELT_RED
    : BRASS;
  return (
    <group position={position}>
      {/* legs + lower shelf */}
      {[
        [-1.55, -0.6],
        [1.55, -0.6],
        [-1.55, 0.6],
        [1.55, 0.6],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5, z]}>
          <boxGeometry args={[0.16, 1.0, 0.16]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[3.0, 0.08, 1.1]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
      </mesh>
      {/* the bench top */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[3.4, 0.18, 1.5]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {/* mallet */}
      <group position={[-1.1, 1.14, -0.3]} rotation={[0, 0.5, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.65, 8]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0.36, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.26, 12]} />
          <meshStandardMaterial color={WOOD} roughness={0.75} />
        </mesh>
      </group>
      {/* chisel */}
      <mesh position={[-0.5, 1.12, 0.45]} rotation={[0, -0.3, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.09]} />
        <meshStandardMaterial color={INK} roughness={1} metalness={0} />
      </mesh>
      {/* wood blanks waiting to be worked */}
      <mesh position={[-1.15, 1.16, 0.35]} rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.36, 0.14, 0.26]} />
        <meshStandardMaterial color={WOOD} roughness={0.8} />
      </mesh>
      <mesh position={[-0.72, 1.14, 0.42]} rotation={[0, -0.15, 0]}>
        <boxGeometry args={[0.3, 0.12, 0.24]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
      </mesh>
      {/* folded cloth */}
      <mesh position={[0.1, 1.11, 0.5]}>
        <boxGeometry args={[0.6, 0.03, 0.45]} />
        <meshStandardMaterial color="#8f3a2c" roughness={1} />
      </mesh>
      {/* the lamp — amber, the workshop's accent */}
      <mesh position={[1.55, 1.5, -0.55]}>
        <cylinderGeometry args={[0.04, 0.05, 0.85, 8]} />
        <meshStandardMaterial color={INK} roughness={0.6} />
      </mesh>
      <mesh position={[1.55, 1.95, -0.55]}>
        <coneGeometry args={[0.24, 0.28, 14, 1, true]} />
        <meshStandardMaterial color={AMBER} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[1.55, 1.8, -0.55]} intensity={4} distance={5} color="#ffcf7d" />
      {/* the review end: the receiving tray. When a submit is with the receiver,
       * the work-object waits ON this tray and the worker waits beside it —
       * nothing is released until the verdict arrives. */}
      <group position={[1.0, 1.1, -0.2]}>
        <mesh>
          <boxGeometry args={[1.3, 0.06, 0.9]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
        </mesh>
        {[
          [0, 0.07, -0.45, 1.3, 0.08, 0.04],
          [0, 0.07, 0.45, 1.3, 0.08, 0.04],
          [-0.65, 0.07, 0, 0.04, 0.08, 0.9],
          [0.65, 0.07, 0, 0.04, 0.08, 0.9],
        ].map((r, i) => (
          <mesh key={i} position={[r[0], r[1], r[2]]}>
            <boxGeometry args={[r[3], r[4], r[5]]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
        ))}
        {/* paper liner + the verdict stamp resting in the corner */}
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0.06]}>
          <planeGeometry args={[1.1, 0.7]} />
          <meshStandardMaterial color="#fffdf5" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.35, 0.08, -0.15]} rotation={[-Math.PI / 2, 0, -0.25]}>
          <circleGeometry args={[0.14, 24]} />
          <meshStandardMaterial color={stampColor} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {square ? null : (
        <>
          <Label position={[-1.45, 1.75, 0]}>the bench — work is made here</Label>
          <Label position={[1.05, 1.62, -0.35]}>review — the receiver judges here</Label>
        </>
      )}
      {latestDecision && !square && (
        <Html position={[1.5, 1.7, -0.3]} center className="room-label verdict" occlude="raycast">
          <div className={latestDecision.decision === "ALLOWED" ? "ok" : "no"}>
            {latestDecision.decision === "ALLOWED" ? "allowed" : "refused"}: {latestDecision.action}
          </div>
        </Html>
      )}
      <ContactShadow x={0} z={0} scale={2.6} opacity={0.18} />
    </group>
  );
}

/** One folder in the cabinet. A freshly arrived folder drops in from above
 *  (unless reduced motion is on); older folders sit still. */
function CabinetFolder({ index, fresh, reducedMotion }: { index: number; fresh: boolean; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(fresh && !reducedMotion ? 0 : 1);
  useFrame((_, dt) => {
    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt / 0.8);
      const e = 1 - Math.pow(1 - t.current, 2);
      if (group.current) group.current.position.y = (1 - e) * 1.4;
    }
  });
  const row = Math.floor(index / 6);
  const col = index % 6;
  return (
    <group ref={group} position={[-0.75 + col * 0.3, 0, 0.1]}>
      <mesh position={[0, 0.28 + row * 0.6, 0]} rotation={[0, 0.12, 0]}>
        <boxGeometry args={[0.24, 0.42, 0.6]} />
        <meshStandardMaterial color={index % 2 ? CREAM : "#e8dcc2"} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** The records cabinet. Each record is a settled agreement with real receipts
 *  (or a manually shared receipt) — a folder arrives only when the record
 *  actually exists, and the arrival animates so the viewer sees it land. */
export interface CabinetRecord {
  key: string;
}

function RecordsCabinet({ records, square, reducedMotion, position = [5.5, 0, -2] as [number, number, number] }: { records: CabinetRecord[]; square?: boolean; reducedMotion: boolean; position?: [number, number, number] }) {
  const prevKeys = useRef<string[]>([]);
  const freshKeys = useMemo(() => {
    const prev = new Set(prevKeys.current);
    const fresh = new Set<string>();
    for (const r of records) if (!prev.has(r.key)) fresh.add(r.key);
    return fresh;
  }, [records]);
  useEffect(() => {
    prevKeys.current = records.map((r) => r.key);
  }, [records]);
  const shown = records.slice(0, 12);
  return (
    <group position={position}>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[2.2, 2.0, 0.9]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      {/* brass trim along the top — the cabinet seals what it holds */}
      <mesh position={[0, 2.0, 0.32]}>
        <boxGeometry args={[2.2, 0.06, 0.06]} />
        <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
      </mesh>
      {shown.map((r, i) => (
        <CabinetFolder key={r.key} index={i} fresh={freshKeys.has(r.key)} reducedMotion={reducedMotion} />
      ))}
      {square ? null : (
        <Label position={[-1.5, 2.2, 0]}>Records — {records.length} record{records.length === 1 ? "" : "s"}</Label>
      )}
    </group>
  );
}

/** The gate arch — brushed metal. Pulses softly while transport is pending. */
function GateArch({ pending, reducedMotion, position = [0, 0, 4.5] as [number, number, number], label = "The receiver — decisions land here" }: { pending: boolean; reducedMotion: boolean; position?: [number, number, number]; label?: string | null }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) {
      mat.current.emissive.set(BRASS);
      mat.current.emissiveIntensity = pending && !reducedMotion ? 0.25 + Math.sin(clock.getElapsedTime() * 3) * 0.15 : pending ? 0.25 : 0;
    }
  });
  return (
    <group position={position}>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x, 1.4, 0]}>
          <boxGeometry args={[0.3, 2.8, 0.3]} />
          <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, 2.95, 0]}>
        <torusGeometry args={[1.6, 0.15, 12, 32, Math.PI]} />
        <meshStandardMaterial ref={mat} color={BRASS} roughness={0.7} metalness={0.1} />
      </mesh>
      {label ? <Label position={[0, 3.9, 0]}>{label}</Label> : null}
    </group>
  );
}

function Floor() {
  return (
    <group>
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[17, 0.5, 13]} />
        <meshStandardMaterial color="#d9cba8" roughness={0.9} />
      </mesh>
      {/* rug under the kiosk — muted warm sand, quiet under the action */}
      <mesh position={[0, 0.015, 1.5]} rotation={[-Math.PI / 2, 0, 0.04]} receiveShadow>
        <circleGeometry args={[3.4, 40]} />
        <meshStandardMaterial color="#c9a877" roughness={1} />
      </mesh>
      <mesh position={[0, 0.02, 1.5]} rotation={[-Math.PI / 2, 0, 0.04]}>
        <ringGeometry args={[2.5, 2.75, 40]} />
        <meshStandardMaterial color="#a8834f" roughness={1} />
      </mesh>
      <mesh position={[0, 0.75, -6.5]}>
        <boxGeometry args={[17, 1.5, 0.3]} />
        <meshStandardMaterial color={CREAM} roughness={0.95} />
      </mesh>
      <mesh position={[-8.5, 0.75, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[13, 1.5, 0.3]} />
        <meshStandardMaterial color={CREAM} roughness={0.95} />
      </mesh>
      <mesh position={[8.5, 0.75, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[13, 1.5, 0.3]} />
        <meshStandardMaterial color={CREAM} roughness={0.95} />
      </mesh>
      {/* hanging lantern — warm key light, visible halo */}
      <mesh position={[-7, 1.5, -5]}>
        <cylinderGeometry args={[0.08, 0.12, 3, 12]} />
        <meshStandardMaterial color={INK} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[-7, 3.1, -5]}>
        <coneGeometry args={[0.55, 0.6, 16, 1, true]} />
        <meshStandardMaterial color={AMBER} roughness={1} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      <LampGlow position={[-7, 2.75, -5]} scale={2.2} intensity={12} distance={9} color="#ffd9a0" />
      {/* soft warm fill — invisible, keeps the desk and kiosk areas readable
       * now that the two extra lantern fixtures are gone. No visible bulb. */}
      <hemisphereLight args={["#ffe0b8", "#8a6f52", 0.35]} />
    </group>
  );
}

/* ---------------- the claim-graph reading desk ---------------- */

/**
 * The claim-graph chapter: a reading desk with two inspectable reports.
 * Report A ("Harbor traffic study") lies on the desk; report B ("Tide-table
 * memo", independently supported) sits on the nearby side table. Each paper
 * carries a seal (the signed receipt: it commits to this exact state, it
 * does not certify truth) and a status medallion whose SHAPE, label, and
 * motion carry the backend's reliance status — never color alone:
 *   unchanged (disc, still) · reconsider (triangle, gentle bob) ·
 *   review (diamond, gentle bob).
 * Tapping a paper opens the cutaway; every line inside it is a backend
 * record. The desk never invents a status: summaries come from props built
 * from GET /api/world/claimgraph.
 */
export interface ClaimDeskSummary {
  report_id: string;
  title: string;
  placement: string;
  status: "unchanged" | "reconsider" | "review";
  detail: string;
}

function Medallion({ status, y, reducedMotion, hideLabel = false }: { status: ClaimDeskSummary["status"]; y: number; reducedMotion: boolean; hideLabel?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = y + (status === "unchanged" ? 0 : Math.sin(t * 2.1) * 0.05);
  });
  return (
    <group ref={ref} position={[0, y, 0]}>
      {status === "unchanged" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.05, 20]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
        </mesh>
      )}
      {status === "reconsider" && (
        <mesh rotation={[0, 0, 0]}>
          <coneGeometry args={[0.16, 0.22, 3]} />
          <meshStandardMaterial color={FELT_RED} roughness={0.6} />
        </mesh>
      )}
      {status === "review" && (
        <mesh scale={[1, 0.55, 1]}>
          <octahedronGeometry args={[0.17]} />
          <meshStandardMaterial color={AMBER_DEEP} roughness={0.6} />
        </mesh>
      )}
      {hideLabel ? null : (
        <Html position={[0, 0.34, 0]} center className="room-label" occlude="raycast">
          <div>{status === "unchanged" ? "unchanged" : status === "reconsider" ? "reconsider" : "review"}</div>
        </Html>
      )}
    </group>
  );
}

/** The signed-receipt seal beside a paper: a ring around a disc.
 *  The ring is the visual; the words live in the overlay's authority lane
 *  and in the single desk seal label below. */
function ReceiptSeal({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.03, 18]} />
        <meshStandardMaterial color="#fffdf5" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.075, 0.022, 8, 20]} />
        <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
      </mesh>
    </group>
  );
}

function ClaimGraphDesk({
  summaries,
  reducedMotion,
  onOpenReport,
  position = [-4.4, 0, -1.8] as [number, number, number],
  hideLabel = false,
}: {
  summaries: ClaimDeskSummary[];
  reducedMotion: boolean;
  onOpenReport: (reportId: string) => void;
  position?: [number, number, number];
  /** clean default scene: floating descriptions are suppressed */
  hideLabel?: boolean;
}) {
  const byId = useMemo(() => {
    const m = new Map<string, ClaimDeskSummary>();
    summaries.forEach((s) => m.set(s.report_id, s));
    return m;
  }, [summaries]);
  const a = byId.get("report-harbor-traffic");
  const b = byId.get("report-tide-memo");
  const paperProps = (id: string) => ({
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onOpenReport(id); },
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => (document.body.style.cursor = "auto"),
  });
  return (
    <group position={position}>
      {/* the desk — painted wood */}
      {[
        [-0.9, -0.6],
        [0.9, -0.6],
        [-0.9, 0.6],
        [0.9, 0.6],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]}>
          <boxGeometry args={[0.14, 0.9, 0.14]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[2.3, 0.12, 1.7]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {/* report A paper, on the desk */}
      {a && (
        <group position={[-0.35, 0, 0.05]} rotation={[0, 0.1, 0]}>
          <mesh position={[0, 1.04, 0]} {...paperProps(a.report_id)}>
            <boxGeometry args={[1.15, 0.035, 1.45]} />
            <meshStandardMaterial color="#fffdf5" roughness={0.92} />
          </mesh>
          {/* folded corner */}
          <mesh position={[0.42, 1.06, 0.55]} rotation={[0, -0.5, 0]}>
            <boxGeometry args={[0.3, 0.04, 0.36]} />
            <meshStandardMaterial color="#e9dcc0" roughness={0.95} />
          </mesh>
          <ReceiptSeal x={0.75} z={-0.35} />
          <group position={[0, 0, -0.95]}>
            <mesh position={[0, 0.55, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 1.0, 8]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
            </mesh>
            <Medallion status={a.status} y={1.18} reducedMotion={reducedMotion} hideLabel={hideLabel} />
          </group>
          {hideLabel ? null : (
            <Html position={[0, 1.62, 0]} center className="room-label" occlude="raycast">
              <div style={{ maxWidth: 190, fontSize: 10, lineHeight: 1.4 }}>
                <strong>{a.title}</strong>
                <br />· {a.detail}
                <br />· <em>tap to open</em>
              </div>
            </Html>
          )}
        </group>
      )}
      {/* the side table — nearby, report B */}
      <group position={[2.0, 0, -0.75]}>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.09, 0.13, 0.7, 10]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.74, 0]}>
          <cylinderGeometry args={[0.75, 0.75, 0.09, 18]} />
          <meshStandardMaterial color={WOOD} roughness={0.7} />
        </mesh>
        {b && (
          <group position={[0, 0, 0]} rotation={[0, -0.14, 0]}>
            <mesh position={[0, 0.82, 0]} {...paperProps(b.report_id)}>
              <boxGeometry args={[0.95, 0.035, 1.2]} />
              <meshStandardMaterial color="#f3ecd9" roughness={0.92} />
            </mesh>
            <ReceiptSeal x={0.62} z={0.3} />
            <group position={[0, 0, -0.85]}>
              <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.025, 0.025, 0.85, 8]} />
                <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
              </mesh>
              <Medallion status={b.status} y={1.0} reducedMotion={reducedMotion} hideLabel={hideLabel} />
            </group>
            {hideLabel ? null : (
              <Html position={[0, 1.4, 0]} center className="room-label" occlude="raycast">
                <div style={{ maxWidth: 190, fontSize: 10, lineHeight: 1.4 }}>
                  <strong>{b.title}</strong>
                  <br />· {b.detail}
                  <br />· <em>tap to open</em>
                </div>
              </Html>
            )}
          </group>
        )}
      </group>
      {hideLabel ? null : (
        <>
          <Label position={[-0.3, 1.5, 1.05]}>Claim graph — the reading desk</Label>
          {/* one seal label for the desk: a signature commits to the state, not the truth */}
          <Html position={[0.9, 1.35, -0.6]} center className="room-label" occlude="raycast">
            <div>signed · commits to this state</div>
          </Html>
        </>
      )}
    </group>
  );
}

export interface NewsroomDeskSummary {
  report_id: string;
  title: string;
  placement: string;
  status: "unchanged" | "reconsider" | "review";
  detail: string;
  /** proposals with status "proposed" — drives the "awaiting review" marker,
   *  which is deliberately not a standing medallion. */
  pendingReview: number;
  /** imported dispatches — drives the envelope stack in the tray. */
  dispatchCount: number;
}

/* ---------------- scene ---------------- */

/** The newsroom's small desk: the owner-selected report on a small table,
 *  a receipt seal, a standing medallion (same vocabulary as the
 *  claim-graph desk — the standings come from the same engine), a dispatch
 *  tray with stacked envelopes, and — only while proposals sit unreviewed —
 *  the "awaiting review" marker.
 *
 *  The marker is deliberately not a standing medallion: a hollow brass
 *  wireframe box instead of a filled disc/cone/octahedron, a static pose
 *  instead of a bobbing one, and a label that says what it is not. New
 *  evidence awaiting review is not a verified change in evidence standing. */
function ReviewWireMarker({ hideLabel = false }: { hideLabel?: boolean }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshBasicMaterial color={BRASS} wireframe />
      </mesh>
      {hideLabel ? null : (
        <Html position={[0, 0.42, 0]} center className="room-label" occlude="raycast">
          <div>awaiting review — new evidence</div>
        </Html>
      )}
    </group>
  );
}

function NewsroomDesk({
  summary,
  reducedMotion,
  onOpenNewsroom,
  position = [4.3, 0, -2.2] as [number, number, number],
  hideLabel = false,
}: {
  summary: NewsroomDeskSummary | null;
  reducedMotion: boolean;
  onOpenNewsroom: () => void;
  position?: [number, number, number];
  /** clean default scene: floating descriptions are suppressed */
  hideLabel?: boolean;
}) {
  const paperProps = {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onOpenNewsroom(); },
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => (document.body.style.cursor = "auto"),
  };
  const envelopes = summary ? Math.min(Math.max(summary.dispatchCount, 0), 3) : 0;
  return (
    <group position={position}>
      {/* the small table */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 0.7, 10]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 0.09, 18]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {summary && (
        <>
          {/* the report paper — tap to open the small desk */}
          <group position={[-0.15, 0, 0.1]} rotation={[0, 0.12, 0]}>
            <mesh position={[0, 0.82, 0]} {...paperProps}>
              <boxGeometry args={[0.85, 0.035, 1.1]} />
              <meshStandardMaterial color="#fffdf5" roughness={0.92} />
            </mesh>
            {/* folded corner */}
            <mesh position={[0.32, 0.84, 0.42]} rotation={[0, -0.5, 0]}>
              <boxGeometry args={[0.22, 0.04, 0.28]} />
              <meshStandardMaterial color="#e9dcc0" roughness={0.95} />
            </mesh>
            <ReceiptSeal x={0.62} z={0.55} />
            <group position={[0.15, 0, -0.8]}>
              <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.025, 0.025, 0.85, 8]} />
                <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
              </mesh>
              <Medallion status={summary.status} y={1.0} reducedMotion={reducedMotion} hideLabel={hideLabel} />
            </group>
            {hideLabel ? null : (
              <Html position={[0, 1.62, 0]} center className="room-label" occlude="raycast">
                <div style={{ maxWidth: 190, fontSize: 10, lineHeight: 1.4 }}>
                  <strong>{summary.title}</strong>
                  <br />· {summary.detail}
                  <br />· <em>tap to open</em>
                </div>
              </Html>
            )}
          </group>
          {/* the dispatch tray: a shallow tray with stacked envelopes */}
          <group position={[0.75, 0, -0.35]} rotation={[0, -0.2, 0]}>
            <mesh position={[0, 0.8, 0]}>
              <boxGeometry args={[0.7, 0.06, 0.55]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
            </mesh>
            {Array.from({ length: envelopes }).map((_, i) => (
              <mesh key={i} position={[0.03 * i, 0.85 + i * 0.03, -0.02 * i]} rotation={[0, 0.06 * (i - 1), 0]}>
                <boxGeometry args={[0.55, 0.022, 0.38]} />
                <meshStandardMaterial color="#f7f2e4" roughness={0.95} />
              </mesh>
            ))}
            {envelopes === 0 && !hideLabel && (
              <Html position={[0, 1.05, 0]} center className="room-label" occlude="raycast">
                <div>empty — no dispatch yet</div>
              </Html>
            )}
          </group>
          {/* the marker: only while proposals await review — never a medallion */}
          {summary.pendingReview > 0 && (
            <group position={[-0.75, 1.35, 0.35]}>
              <ReviewWireMarker hideLabel={hideLabel} />
            </group>
          )}
          {hideLabel ? null : (
            <>
              <Label position={[-0.2, 1.35, 1.0]}>Newsroom — the small desk</Label>
              <Html position={[0.55, 1.5, -0.75]} center className="room-label" occlude="raycast">
                <div>owner-selected · fixture</div>
              </Html>
            </>
          )}
        </>
      )}
      {!summary && !hideLabel && (
        <>
          <Label position={[-0.2, 1.35, 1.0]}>Newsroom — the small desk</Label>
          <Html position={[0, 1.0, 0]} center className="room-label" occlude="raycast">
            <div>the backend reported no newsroom</div>
          </Html>
        </>
      )}
    </group>
  );
}

/* ---------------- the square: signpost, exchange board, visitors ---------------- */

/** Plain words for a listing's availability — never color alone. */
export function listingStatusWord(l: WorldListing): string {
  const s = (l.status || "").toLowerCase();
  if (s === "open") return "open";
  if (s === "in_agreement") return "in agreement";
  if (s === "withdrawn") return "withdrawn";
  if (s === "closed") return "closed";
  return s || "unavailable";
}

/** The five agreement stages, in plain words. */
export function agreementStageWord(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "proposed") return "proposed — waiting for the other side";
  if (s === "agreed") return "agreed — mutual consent to terms";
  if (s === "submitted") return "submitted — with the receiver";
  if (s === "accepted") return "accepted — the receiver authorized it";
  if (s === "refused") return "refused — the receiver stopped it";
  if (s === "settled") return "settled — closed";
  return s || "unavailable";
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The signpost kiosk: a wooden post with hanging painted signs. The
 * "Guided tour" sign is the in-world entry point to the guided beats —
 * the conventional button beside the canvas does the same thing.
 */
/**
 * THE work-item token: one physical object for the active work item,
 * traveling the world as the real workflow advances. It is a BOUND WORK
 * FOLIO — the finished written deliverable (this demo's task is tidying
 * workbench notes): ink-blue covers, cream page block, brass clasp,
 * persimmon ribbon bookmark. Its position and appearance derive ONLY from
 * backend state (see choreography.ts):
 *   discovery — sealed folio on the kiosk pedestal (open listing)
 *   proposed  — sealed folio held by Wren at the kiosk, shown to Juniper
 *   agreed   — folio open on the workbench (both sides agreed; the work
 *              is being written into it)
 *   submitted — folio + hovering receiver's stamp on the receiving tray
 *   accepted  — folio + brass seal pressed on the cover (authorized)
 *   refused   — folio + red bar, carried back by Wren (stopped)
 *   settled   — folio closed, persimmon ribbon tied around, in the drawer
 * One folio, one ribbon/seal vocabulary (the exchange thread's persimmon),
 * no floating labels: the cover plate, seal, stamp, and bar say what it
 * is. The token never animates a stage the backend hasn't reached; when
 * there is no active work, it isn't rendered at all.
 *
 * fixedAt pins the token inside a staged figure's TravelDelta (the parent
 * moves it); position is the free-world spot. The two are exclusive.
 * pose "flat" lays the folio down (tray, drawer, pedestal, bench);
 * "upright" is for hands.
 */

function AgreementToken({
  stage,
  position,
  /** Pin inside the holder's TravelDelta — the parent group carries the token. */
  fixedAt,
  /** "upright" in hands; "flat" lays the folio down (tray, drawer, pedestal, bench). */
  pose = "upright",
  reducedMotion,
  onSelect,
  /** Folio inspection hinge: a mutable { current: 0..1 } the holder's
   *  figure drives from the rig's inspect step. 0 = closed (the familiar
   *  folio); 1 = front cover swung open on the spine hinge, pages showing.
   *  Read per-frame in useFrame — no re-renders. */
  openRef,
}: {
  stage: WorkItemStage;
  position: [number, number, number];
  /** Pin inside the holder's TravelDelta — the parent group carries the token. */
  fixedAt?: [number, number, number];
  pose?: "upright" | "flat";
  reducedMotion: boolean;
  onSelect?: () => void;
  openRef?: { current: number };
}) {
  const group = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const coverHinge = useRef<THREE.Group>(null);
  const pagesRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(...(fixedAt ?? position)), [fixedAt, position]);
  const placed = useRef(false);
  const s = stage;
  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (g) {
      if (fixedAt) {
        // held by a staged figure: the parent TravelDelta moves the figure;
        // the token stays pinned in the holder's local frame.
        g.position.copy(target);
        placed.current = true;
      } else if (reducedMotion || !placed.current) {
        g.position.copy(target);
        placed.current = true;
      } else {
        // the token visibly travels when the confirmed stage changes
        g.position.lerp(target, 1 - Math.exp(-dt * 2.4));
      }
    }
    if (bob.current) {
      bob.current.position.y =
        !reducedMotion && (s === "discovery" || s === "proposed" || s === "submitted")
          ? Math.sin(clock.getElapsedTime() * 2.2) * 0.05
          : 0;
    }
    // the folio inspection hinge: the holder opens the cover like a book
    // while the rig runs its inspect step, closes it after. Never plays
    // inspection as proof the contents were verified — it is a read of
    // what is carried, before the handoff.
    const o = openRef?.current ?? 0;
    if (coverHinge.current) coverHinge.current.rotation.y = -o * 2.75;
    if (pagesRef.current) {
      for (let i = 0; i < pagesRef.current.children.length; i++) {
        pagesRef.current.children[i].rotation.y = -o * (0.1 + i * 0.12);
      }
    }
  });
  const sealed = s === "discovery" || s === "proposed";
  const clickable = onSelect ? {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(); },
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => (document.body.style.cursor = "auto"),
  } : {};
  return (
    <group ref={group} position={fixedAt ?? position}>
      <group ref={bob}>
        {/* the bound work folio — ink-blue FELT covers, cream page block,
         *  brass clasp, terracotta ribbon. Stitched cover edge. One
         *  recognizable object from arrival through inspection to the drawer. */}
        <group rotation={pose === "flat" ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
          {/* page block */}
          <mesh {...clickable}>
            <boxGeometry args={[0.56, 0.74, 0.085]} />
            <meshStandardMaterial color="#f3ead6" roughness={0.95} metalness={0} />
          </mesh>
          {/* back cover — felt */}
          <mesh position={[0, 0, -0.055]} {...clickable}>
            <boxGeometry args={[0.62, 0.8, 0.045]} />
            <meshStandardMaterial color={FOLIO} roughness={1} metalness={0} bumpMap={feltBump()} bumpScale={0.35} />
          </mesh>
          {/* front cover — felt, hinged at the spine. The holder's inspect
           *  step swings it open like a book (openRef 0→1); closed it is
           *  exactly the familiar folio. The title plate, stitching, clasp
           *  and cover seal ride the cover. */}
          <group ref={coverHinge} position={[-0.27, 0, 0.055]}>
            <mesh position={[0.27, 0, 0]} {...clickable}>
              <boxGeometry args={[0.62, 0.8, 0.045]} />
              <meshStandardMaterial color={FOLIO} roughness={1} metalness={0} bumpMap={feltBump()} bumpScale={0.35} />
            </mesh>
            {/* stitched cover edge */}
            <StitchSeam points={[[0.01, -0.34, 0.025], [0.53, -0.34, 0.025], [0.53, 0.34, 0.025], [0.01, 0.34, 0.025], [0.01, -0.34, 0.025]]} />
            {/* title plate on the cover */}
            <mesh position={[0.3, 0.16, 0.023]}>
              <boxGeometry args={[0.38, 0.2, 0.014]} />
              <meshStandardMaterial color="#f7f1de" roughness={0.95} metalness={0} />
            </mesh>
            {/* brass clasp — dull, not chrome */}
            <mesh position={[0.57, 0, -0.005]}>
              <boxGeometry args={[0.05, 0.14, 0.03]} />
              <meshStandardMaterial color={BRASS} roughness={0.6} metalness={0.15} />
            </mesh>
            {/* accepted/settled: the lime seal is pressed on the cover —
             *  it rides the cover when it opens. */}
            {(s === "accepted" || s === "settled") && (
              <mesh position={[0.32, -0.1, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.09, 0.09, 0.025, 20]} />
                <meshStandardMaterial color={LIME} roughness={0.9} metalness={0} />
              </mesh>
            )}
          </group>
          {/* spine */}
          <mesh position={[-0.295, 0, 0]}>
            <boxGeometry args={[0.09, 0.8, 0.15]} />
            <meshStandardMaterial color={FOLIO_DARK} roughness={1} metalness={0} bumpMap={feltBump()} bumpScale={0.35} />
          </mesh>
          {/* a few rigid pages inside — hidden in the closed folio,
           *  revealed when the cover opens. No page-turn system: they fan
           *  slightly with the hinge and that is all. */}
          <group ref={pagesRef}>
            {[0, 1, 2].map((i) => (
              <group key={i} position={[-0.25, 0, 0.008 + i * 0.012]}>
                <mesh position={[0.25, 0, 0]}>
                  <boxGeometry args={[0.5, 0.68, 0.007]} />
                  <meshStandardMaterial color="#fbf6e8" roughness={0.95} metalness={0} />
                </mesh>
                {i === 2 && [0, 1, 2, 3].map((l) => (
                  <mesh key={l} position={[0.22, 0.2 - l * 0.11, 0.005]} rotation={[-Math.PI / 2, 0, 0.03]}>
                    <planeGeometry args={[0.3 - l * 0.03, 0.02]} />
                    <meshStandardMaterial color="#5a6672" roughness={1} metalness={0} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
          {/* terracotta ribbon bookmark */}
          <mesh position={[0.14, -0.53, 0.03]}>
            <boxGeometry args={[0.045, 0.3, 0.012]} />
            <meshStandardMaterial color={PERSIMMON} roughness={1} metalness={0} />
          </mesh>
          <mesh position={[0.14, -0.39, 0.03]}>
            <sphereGeometry args={[0.032, 10, 8]} />
            <meshStandardMaterial color={PERSIMMON} roughness={1} metalness={0} />
          </mesh>
          {/* sealed stages: the terracotta wax seal locks the clasp */}
          {sealed && (
            <mesh position={[0.3, 0, 0.075]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.075, 0.03, 16]} />
              <meshStandardMaterial color={PERSIMMON} roughness={1} metalness={0} />
            </mesh>
          )}
          {/* review: the receiver's stamp hovers over the folio */}
          {s === "submitted" && (
            <group position={[0.12, 0.52, 0.14]} rotation={[0.5, 0, 0.2]}>
              <mesh>
                <cylinderGeometry args={[0.09, 0.09, 0.035, 16]} />
                <meshStandardMaterial color={BRASS} roughness={0.6} metalness={0.15} />
              </mesh>
              <mesh position={[0, 0.07, 0]}>
                <cylinderGeometry args={[0.025, 0.035, 0.09, 10]} />
                <meshStandardMaterial color={WOOD_DARK} roughness={1} metalness={0} />
              </mesh>
            </group>
          )}
          {/* (the lime seal now rides the hinged front cover, above) */}
          {/* refused: the red bar — stopped */}
          {s === "refused" && (
            <mesh position={[0, 0, 0.085]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.72, 0.07, 0.02]} />
              <meshStandardMaterial color={FELT_RED} roughness={1} metalness={0} />
            </mesh>
          )}
          {/* settled: closed, terracotta ribbon tied around */}
          {s === "settled" && (
            <>
              <mesh position={[0, 0.05, 0]}>
                <boxGeometry args={[0.66, 0.09, 0.17]} />
                <meshStandardMaterial color={PERSIMMON} roughness={1} metalness={0} />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[0.09, 0.84, 0.17]} />
                <meshStandardMaterial color={PERSIMMON} roughness={1} metalness={0} />
              </mesh>
              <mesh position={[0, 0.05, 0.1]}>
                <sphereGeometry args={[0.045, 10, 8]} />
                <meshStandardMaterial color={PERSIMMON} roughness={1} metalness={0} />
              </mesh>
            </>
          )}
        </group>
      </group>
      {/* no floating label: the cover plate, seal, stamp, and bar carry the
       * folio's identity; title and detail live in inspect and the Panels
       * drawer. */}
    </group>
  );
}

/**
 * TravelDelta — TRACK 3 staging wrapper for figures.
 *
 * A figure's animation (wander, work poses) is owned by the character rig
 * (Track 2) and always runs in the figure's NATURAL frame: its home anchor
 * (hosts) or its visitor spot (visitors). The stage plan only adds a DELTA —
 * staged anchor minus natural home — applied on this wrapper, so the rig
 * never sees staging coordinates and staging never touches rig internals.
 *
 * On a stage change the wrapper glides the figure to the new delta (the
 * figure visibly travels); under reduced motion it snaps. The delta is
 * [0,0,0] for unstaged figures — a transparent wrapper, today's behavior.
 */
function TravelDelta({
  delta,
  reducedMotion,
  children,
}: {
  delta: [number, number, number];
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(...delta), [delta]);
  const placed = useRef(false);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (reducedMotion || !placed.current) {
      g.position.copy(target);
      placed.current = true;
    } else {
      // glide to the staged anchor — the viewer sees the figure travel
      g.position.lerp(target, 1 - Math.exp(-dt * 2.2));
    }
  });
  return <group ref={group} position={delta}>{children}</group>;
}

/** One pinned listing card on the exchange board. The work-item token lives
 *  on its own (see AgreementToken) — the card shows the listing's own
 *  status words and never carries a second token. */
function ListingCard3D({
  listing,
  position,
  tilt,
  onOpen,
}: {
  listing: WorldListing;
  position: [number, number, number];
  tilt: number;
  onOpen: () => void;
}) {
  const sample = !!listing.is_sample || listing.from_kind === "seeded";
  const card = {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onOpen(); },
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => (document.body.style.cursor = "auto"),
  };
  return (
    <group position={position} rotation={[0, 0, tilt]}>
      <mesh {...card}>
        <boxGeometry args={[1.0, 0.62, 0.05]} />
        <meshStandardMaterial color={sample ? "#ddd2b8" : "#fffdf5"} roughness={0.92} />
      </mesh>
      {sample ? (
        <mesh position={[0, 0.34, 0.03]}>
          <boxGeometry args={[1.0, 0.05, 0.02]} />
          <meshBasicMaterial color="#8a6d3b" wireframe />
        </mesh>
      ) : (
        <mesh position={[0, 0.33, 0.03]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
        </mesh>
      )}
      {/* side tab: need = left notch, offer = right notch — shape, not color */}
      <mesh position={[listing.side === "need" ? -0.44 : 0.44, -0.2, 0.03]}>
        <boxGeometry args={[0.12, 0.2, 0.02]} />
        <meshStandardMaterial color={listing.side === "need" ? BLUE : TEAL} roughness={0.7} />
      </mesh>
      {/* the clean scene carries no per-card floating text: the card's shape,
          side tab, and sample stripe stay legible; details live in inspect. */}
    </group>
  );
}

/**
 * The exchange board: felt and wood, handcrafted. Listings arrive as
 * pinned paper slips; the work-item token stands on its own pedestal in
 * front of the board while a listing is in discovery — it is never pinned
 * to a card. Sample listings are visually distinct (dashed, muted) and
 * never show presence. The full filterable list lives in the conventional
 * list view — the board pins the newest few.
 */
/** The exchange kiosk — the old board rebuilt as a place you walk up to,
 *  not a wall you read. A rounded wooden counter with a cream work surface:
 *  the offer cards stand on a tilted rail along the back edge (tap-to-open
 *  preserved), the receiving tray waits at the east end, the records drawer
 *  faces north from its own unit east of the counter, and the discovery
 *  pedestal stands in front for the board token. */
function ExchangeKiosk({
  listings,
  position = [0, 0, 1.6] as [number, number, number],
  onOpenListing,
}: {
  listings: WorldListing[];
  position?: [number, number, number];
  onOpenListing: (listingId: string) => void;
}) {
  const pinned = useMemo(() => listings.filter((l) => l.status === "open" || l.status === "in_agreement").slice(-5), [listings]);
  const tilts = useMemo(() => {
    const r = mulberry32(0xbeef2d);
    return pinned.map(() => (r() - 0.5) * 0.1);
  }, [pinned]);
  return (
    <group position={position}>
      {/* counter body — warm wood, rounded, grounded. Low on purpose: both
       * performers' faces and hands stay visible over it. */}
      <RoundedBox args={[3.2, 0.72, 1.1]} radius={0.06} smoothness={4} position={[0, 0.36, 0]}>
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </RoundedBox>
      {/* kick plate */}
      <mesh position={[0, 0.09, 0.53]}>
        <boxGeometry args={[3.0, 0.14, 0.04]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
      </mesh>
      {/* cream work surface */}
      <RoundedBox args={[3.4, 0.08, 1.3]} radius={0.03} smoothness={4} position={[0, 0.76, 0]}>
        <meshStandardMaterial color={CREAM} roughness={0.55} />
      </RoundedBox>
      {/* card rail: a low wooden ledge along the back edge. The offer cards
       * lean on it, tilted to face whoever walks up. Tap-to-open preserved. */}
      <mesh position={[0, 0.9, -0.5]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[3.0, 0.09, 0.14]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      {pinned.map((l, i) => (
        <group key={l.listing_id} position={[-1.5 + i * 0.5, 1.16, -0.4]} rotation={[-0.2, 0, 0]} scale={[0.55, 0.55, 0.55]}>
          <ListingCard3D listing={l} position={[0, 0, 0]} tilt={tilts[i] ?? 0} onOpen={() => onOpenListing(l.listing_id)} />
        </group>
      ))}
      {/* the receiving tray: wood with a brass rim, at the counter's east
       * end — sized to the work folio, which rests here on acceptance */}
      <group position={[1.15, 0.8, -0.1]}>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.8, 0.06, 0.95]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.75} />
        </mesh>
        {/* brass rim */}
        <mesh position={[0, 0.055, 0.46]}>
          <boxGeometry args={[0.84, 0.05, 0.04]} />
          <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.055, -0.46]}>
          <boxGeometry args={[0.84, 0.05, 0.04]} />
          <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
        </mesh>
        <mesh position={[0.4, 0.055, 0]}>
          <boxGeometry args={[0.04, 0.05, 0.95]} />
          <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
        </mesh>
        <mesh position={[-0.4, 0.055, 0]}>
          <boxGeometry args={[0.04, 0.05, 0.95]} />
          <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
        </mesh>
      </group>
      {/* pen + receipt slips at the counter's west end */}
      <group position={[-1.15, 0.8, 0.25]}>
        <mesh rotation={[0, 0.5, 0]}>
          <boxGeometry args={[0.3, 0.015, 0.2]} />
          <meshStandardMaterial color="#fffdf5" roughness={0.9} />
        </mesh>
        <mesh position={[0.12, 0.02, 0.05]} rotation={[0, 0, Math.PI / 2.2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 8]} />
          <meshStandardMaterial color={INK} roughness={0.5} />
        </mesh>
      </group>
      {/* the records drawer: its own small filing unit east of the counter,
       * drawer open facing north — the receiver files the work here */}
      <group position={[2.35, 0, -0.45]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.7, 0.9, 0.55]} />
          <meshStandardMaterial color={WOOD} roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[0.74, 0.05, 0.59]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        {/* open drawer, pulled toward the north */}
        <mesh position={[0, 0.55, -0.43]}>
          <boxGeometry args={[0.56, 0.16, 0.4]} />
          <meshStandardMaterial color={CREAM} roughness={0.8} />
        </mesh>
        {/* folded paper slips inside — records, not folders */}
        {[-0.14, 0, 0.14].map((x) => (
          <group key={x} position={[x, 0.66, -0.43]}>
            <mesh position={[0, 0.05, 0.018]} rotation={[0.28, 0, 0]}>
              <boxGeometry args={[0.12, 0.11, 0.012]} />
              <meshStandardMaterial color={x === 0 ? "#d8b25c" : "#efe6cf"} roughness={1} metalness={0} />
            </mesh>
            <mesh position={[0, 0.05, -0.018]} rotation={[-0.28, 0, 0]}>
              <boxGeometry args={[0.12, 0.11, 0.012]} />
              <meshStandardMaterial color={x === 0 ? "#d8b25c" : "#efe6cf"} roughness={1} metalness={0} />
            </mesh>
          </group>
        ))}
      </group>
      {/* the discovery pedestal: the work-item token rests here while a
       * listing is up and nothing is agreed yet. Tucked north of the
       * counter's west end, out of the kiosk camera's frame — present in
       * the town, never in the delivery sightline. */}
      <group position={[-1.2, 0, -2.2]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.09, 0.14, 1.0, 12]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.02, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.07, 20]} />
          <meshStandardMaterial color={WOOD} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.38, 24]} />
          <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <ContactShadow x={0} z={0} scale={4.6} opacity={0.22} />
      {/* the clean scene carries no kiosk status text: the cards stand on the
          rail; the full list lives in the Panels drawer. */}
    </group>
  );
}

/** The receiving counters' booth layout, shared by the booths themselves
 *  and the work-item token (which needs the acting booth's x). One booth
 *  per participant with live agreements; empty booths stand quiet. */
interface BoothGroup {
  pid: string;
  name: string;
  role: "you" | "host" | "visitor";
}
interface BoothInfo {
  key: string;
  x: number;
  group: BoothGroup | null;
}

function counterBooths(
  agreements: WorldAgreement[],
  visitors: VisitorState[],
  hosts: HostState[],
  selfId: string | null
): BoothInfo[] {
  const hostPids = new Set((hosts ?? []).map((h) => h.participantId).filter(Boolean) as string[]);
  const m = new Map<string, BoothGroup & { agreements: WorldAgreement[] }>();
  const sorted = [...(agreements ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const a of sorted.slice(0, 8)) {
    const s = (a.status || "").toLowerCase();
    const pid = s === "proposed" ? a.counterpart : a.proposer;
    const fallback = s === "proposed" ? a.counterpart_display : a.proposer_display_name;
    const v = visitors.find((x) => x.participant_id === pid);
    // Badged by id, never by name: a visitor may call themselves anything.
    const name = v?.displayName ?? fallback ?? pid.slice(0, 12);
    const role: "you" | "host" | "visitor" =
      selfId != null && pid === selfId ? "you" : v || !hostPids.has(pid) ? "visitor" : "host";
    let g = m.get(pid);
    if (!g) {
      if (m.size >= 4) continue;
      g = { pid, name, role, agreements: [] };
      m.set(pid, g);
    }
    if (g.agreements.length < 2) g.agreements.push(a);
  }
  const groups = [...m.values()];
  const booths = Math.max(groups.length, 3);
  return Array.from({ length: booths }, (_, i) => ({
    key: groups[i] ? groups[i].pid : `empty-${i}`,
    x: (i - (booths - 1) / 2) * 2.3,
    group: groups[i] ? { pid: groups[i].pid, name: groups[i].name, role: groups[i].role } : null,
  }));
}

/**
 * Receiving counters — where proposed→agreed→submitted→accepted/refused→
 * settled is witnessed. One booth per participant, each acting under their
 * own rules: the work-item token sits at the counter of whoever must act
 * next while a proposal waits. The counters are a place, not a
 * transaction — empty ones stand quiet and say so.
 */
function ReceivingCounters({
  agreements,
  visitors,
  hosts,
  selfId,
  position = [0, 0, -4.4] as [number, number, number],
}: {
  agreements: WorldAgreement[];
  visitors: VisitorState[];
  hosts: HostState[];
  selfId: string | null;
  position?: [number, number, number];
}) {
  const booths = useMemo(
    () => counterBooths(agreements, visitors, hosts, selfId),
    [agreements, visitors, hosts, selfId]
  );
  return (
    <group position={position}>
      {booths.map((b) => {
        return (
          <group key={b.key} position={[b.x, 0, 0]}>
            {/* the counter */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[1.7, 1.0, 0.8]} />
              <meshStandardMaterial color={WOOD} roughness={0.75} />
            </mesh>
            <mesh position={[0, 1.02, 0]}>
              <boxGeometry args={[1.8, 0.08, 0.9]} />
              <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
            </mesh>
            {/* brass rail along the counter front — the booth's trim */}
            <mesh position={[0, 0.72, 0.42]}>
              <boxGeometry args={[1.7, 0.06, 0.05]} />
              <meshStandardMaterial color={BRASS} roughness={0.7} metalness={0.1} />
            </mesh>
            {/* the clean scene carries no booth name boards: names appear
                only on the selected figure; the acting participant stands
                at the counter, badged with their mode. */}
            <ContactShadow x={0} z={0} scale={1.6} opacity={0.2} />
          </group>
        );
      })}
    </group>
  );
}

/* -------- visitors: the worker, the counterpart, the traveler -------- */

/**
 * A connected visitor's figure. The silhouette is chosen ONLY from the
 * backend-reported activity mode — never guessed:
 *   automation → the worker: lanky wooden frame, brass collar, satchel
 *     with a brass clasp — precise: measured quarter-turns, a regular nod.
 *   manual / live → the counterpart: sturdy felt tunic, flat cap —
 *     hesitant: slow weight shifts, long pauses.
 *   scripted → the counterpart silhouette (a person driving playback).
 *   mode unknown → the neutral traveler (hood, satchel) from the earlier
 *     design — no silhouette claims a role the backend didn't report.
 * Badged with the visitor's display name; "representing <agent>" lives in
 * the inspect panel. Idle motion is local and deterministic; the figure
 * freezes when the backend is unreachable. reducedMotion/frozen → a still
 * neutral pose, no drift.
 */
type VisitorKind = "worker" | "counterpart" | "traveler";

function visitorKind(v: VisitorState): VisitorKind {
  if (v.activityMode === "automation") return "worker";
  if (v.activityMode === "manual" || v.activityMode === "live" || v.activityMode === "scripted") return "counterpart";
  return "traveler";
}

const VISITOR_TAG_Y: Record<VisitorKind, number> = { worker: 1.9, counterpart: 2.15, traveler: 1.8 };


type RobotRef = { current: THREE.Group | null };

/** One shared robot component for every built-in agent avatar: newly joined
 *  participants, tutorial characters, and fallback appearances all render
 *  through this. The kind selects a restrained design variation (color, head
 *  shape, accessories) from ROBOT_FAMILY — cosmetic only, never identity
 *  proof. The act rig keeps full ownership of motion: the same refs
 *  (torso/head/arms/legs/eyes), the same waist heights, the same behavior
 *  binding. Identities and backend state are untouched — a rendering swap
 *  only. Idle figures show no invented conversation or activity; talking and
 *  working appear only when the rig's staged behavior (from backend events)
 *  drives them. */
function VisitorRobot({
  kind,
  torso,
  head,
  armL,
  armR,
  legL,
  legR,
  eyes,
  click,
  Y,
  waistY,
  lit,
}: {
  kind: VisitorKind;
  torso: RobotRef;
  head: RobotRef;
  armL: RobotRef;
  armR: RobotRef;
  legL: RobotRef;
  legR: RobotRef;
  eyes: RobotRef;
  click: {
    onClick: (e: { stopPropagation: () => void }) => void;
    onPointerOver: (e: { stopPropagation: () => void }) => void;
    onPointerOut: () => void;
  };
  /** torso-relative Y from an absolute height */
  Y: (absY: number) => number;
  waistY: number;
  /** presence pebble: lit only from real presence data */
  lit: boolean;
}) {
  const D = visitorDesign(kind);
  const compact = D.frame === "compact";
  const pupilRef = useRef<THREE.Group>(null);
  const hipY = compact ? waistY - 0.03 : 0.72;
  const headY = compact ? waistY + 0.74 : waistY + 0.92;
  /** cobalt's precise grippers: the same shared hand, scaled down */
  const gripScale = kind === "worker" ? 0.78 : 1;
  return (
    <>
      <group ref={torso} position={[0, waistY, 0]}>
        {/* torso: matte enamel shell — compact box or light slim capsule */}
        {compact ? (
          <mesh position={[0, Y(waistY + 0.26), 0]} {...click}>
            <RoundedBox args={[0.62, 0.52, 0.44]} radius={0.09} smoothness={4}>
              <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
            </RoundedBox>
          </mesh>
        ) : (
          <mesh position={[0, Y(waistY + 0.28), 0]} {...click}>
            <capsuleGeometry args={[0.16, 0.5, 8, 18]} />
            <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
          </mesh>
        )}
        {/* waist: fabric joint */}
        <JointRing y={0} r={compact ? 0.24 : 0.15} tube={0.028} />
        {/* chest service panel — a lighter face for the shell. Restrained:
         *  one value step up, matte. */}
        <mesh position={compact ? [0, Y(waistY + 0.32), 0.225] : [0, Y(waistY + 0.4), 0.155]}>
          <boxGeometry args={compact ? [0.24, 0.2, 0.03] : [0.18, 0.22, 0.03]} />
          <meshStandardMaterial color={D.panel} roughness={0.65} metalness={0.05} />
        </mesh>
        {/* honest wear: scuffs on the shell */}
        <Scuffs marks={compact
          ? [[-0.14, Y(waistY + 0.16), 0.225], [0.12, Y(waistY + 0.42), 0.225]]
          : [[-0.08, Y(waistY + 0.18), 0.165], [0.06, Y(waistY + 0.42), 0.165]]} />
        {/* arms: shoulder pivots for the rig, elbow joints, gripper hands.
         *  Compact arms are short; light arms are slender and long. */}
        {[-1, 1].map((s) => (
          <group key={s} ref={s < 0 ? armL : armR}
            position={compact ? [s * 0.36, Y(waistY + 0.44), 0.05] : [s * 0.23, Y(waistY + 0.6), 0]}>
            <mesh position={[0, compact ? -0.1 : -0.16, 0]}>
              <capsuleGeometry args={compact ? [0.055, 0.12, 6, 12] : [0.042, 0.2, 6, 12]} />
              <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
            </mesh>
            <group position={[0, compact ? -0.22 : -0.32, 0]}>
              <JointRing y={0} r={compact ? 0.056 : 0.044} tube={0.02} />
              <mesh position={[0, compact ? -0.1 : -0.13, 0]}>
                <capsuleGeometry args={compact ? [0.048, 0.12, 6, 12] : [0.038, 0.18, 6, 12]} />
                <meshStandardMaterial color={D.enamelDeep} roughness={0.55} metalness={0.15} />
              </mesh>
              <group position={[0, compact ? -0.22 : -0.3, 0]} scale={gripScale}>
                <GripperHand color={D.joint} />
              </group>
            </group>
          </group>
        ))}
        {/* head on a fabric neck joint — visor, rectangular, or round */}
        <JointRing y={Y(headY - (compact ? 0.18 : 0.2))} r={compact ? 0.15 : 0.12} tube={0.024} />
        <group ref={head} position={compact ? [0, Y(headY), 0.04] : [0, Y(headY), 0]}>
          {D.faceplate === "visor" ? (
            <>
              {/* broad visor head: wide enamel brow over a dark visor band */}
              <mesh>
                <RoundedBox args={[0.52, 0.3, 0.42]} radius={0.08} smoothness={4}>
                  <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
                </RoundedBox>
              </mesh>
              {/* light faceplate trim — keeps the face readable. Matte. */}
              <mesh position={[0, 0, 0.2]}>
                <boxGeometry args={[0.46, 0.2, 0.02]} />
                <meshStandardMaterial color={D.faceTrim} roughness={0.7} metalness={0.05} />
              </mesh>
              {/* the broad visor: dark band, two glowing dots that track */}
              <group ref={eyes} position={[0, 0, 0.225]}>
                <mesh>
                  <boxGeometry args={[0.4, 0.12, 0.05]} />
                  <meshStandardMaterial color="#22262c" roughness={0.45} metalness={0.15} />
                </mesh>
                <group ref={pupilRef}>
                  {[-1, 1].map((s) => (
                    <mesh key={s} position={[(s * 0.24) / 2, 0, 0.03]}>
                      <sphereGeometry args={[0.028, 12, 10]} />
                      <meshStandardMaterial color="#141414" emissive={D.eyeGlow} emissiveIntensity={1.1} roughness={0.35} metalness={0} />
                    </mesh>
                  ))}
                </group>
              </group>
            </>
          ) : D.faceplate === "rect" ? (
            <>
              {/* rectangular head, simple face */}
              <mesh>
                <RoundedBox args={[0.32, 0.38, 0.32]} radius={0.06} smoothness={4}>
                  <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
                </RoundedBox>
              </mesh>
              <mesh position={[0, 0.02, 0.15]}>
                <boxGeometry args={[0.26, 0.2, 0.02]} />
                <meshStandardMaterial color={D.faceTrim} roughness={0.7} metalness={0.05} />
              </mesh>
              <RobotEyes y={0.02} z={0.17} gap={0.14} eyeGlow={D.eyeGlow}
                eyesRef={eyes} pupilRef={pupilRef} />
            </>
          ) : (
            <>
              {/* round head, quiet — the nondescript unknown */}
              <mesh>
                <sphereGeometry args={[0.19, 22, 18]} />
                <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
              </mesh>
              <mesh position={[0, 0.02, 0.165]}>
                <boxGeometry args={[0.3, 0.15, 0.02]} />
                <meshStandardMaterial color={D.faceTrim} roughness={0.7} metalness={0.05} />
              </mesh>
              <group ref={eyes} position={[0, 0.02, 0.18]}>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[(s * 0.2) / 2, 0, 0]}>
                    <circleGeometry args={[0.045, 18]} />
                    <meshStandardMaterial color="#22262c" roughness={0.45} metalness={0.15} />
                  </mesh>
                ))}
                <group ref={pupilRef}>
                  {[-1, 1].map((s) => (
                    <mesh key={s} position={[(s * 0.2) / 2, 0, 0.012]}>
                      <sphereGeometry args={[0.022, 12, 10]} />
                      <meshStandardMaterial color="#141414" emissive={D.eyeGlow} emissiveIntensity={1.1} roughness={0.35} metalness={0} />
                    </mesh>
                  ))}
                </group>
              </group>
            </>
          )}
        </group>
        {/* presence pebble: lit only from real presence data */}
        <mesh position={compact ? [-0.4, Y(waistY + 0.27), 0] : [0.28, Y(waistY + 0.14), 0]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial
            color={lit ? "#ffd98a" : "#4a4f55"}
            emissive={lit ? "#ffb347" : "#000000"}
            emissiveIntensity={lit ? 1.2 : 0}
          />
        </mesh>
      </group>
      {/* legs — hip pivots for the rig. Compact legs are short; light legs
       *  are slender. Feet stay planted. */}
      {[-1, 1].map((s) => (
        <group key={s} ref={s < 0 ? legL : legR} position={[s * (compact ? 0.18 : 0.1), hipY, 0]}>
          {compact ? (
            <>
              <mesh position={[0, -0.09, 0]}>
                <capsuleGeometry args={[0.07, 0.1, 6, 12]} />
                <meshStandardMaterial color={D.enamelDeep} roughness={0.55} metalness={0.15} />
              </mesh>
              <JointRing y={-0.18} r={0.07} tube={0.02} />
              <group position={[0, -0.38, 0]}>
                <mesh position={[0, 0.03, 0.06]}>
                  <boxGeometry args={[0.17, 0.06, 0.34]} />
                  <meshStandardMaterial color={D.joint} roughness={0.7} metalness={0.1} />
                </mesh>
                <mesh position={[0, 0.062, 0.06]}>
                  <boxGeometry args={[0.15, 0.012, 0.3]} />
                  <meshStandardMaterial color={INK} roughness={1} metalness={0} />
                </mesh>
              </group>
            </>
          ) : (
            <>
              <mesh position={[0, -0.13, 0]}>
                <capsuleGeometry args={[0.05, 0.16, 6, 12]} />
                <meshStandardMaterial color={D.enamel} roughness={0.55} metalness={0.15} />
              </mesh>
              <JointRing y={-0.26} r={0.054} />
              <mesh position={[0, -0.39, 0]}>
                <capsuleGeometry args={[0.045, 0.16, 6, 12]} />
                <meshStandardMaterial color={D.enamelDeep} roughness={0.55} metalness={0.15} />
              </mesh>
              <group position={[0, -0.58, 0]}>
                <mesh position={[0, 0.028, 0.05]}>
                  <boxGeometry args={[0.13, 0.05, 0.26]} />
                  <meshStandardMaterial color={D.joint} roughness={0.7} metalness={0.1} />
                </mesh>
                <mesh position={[0, 0.056, 0.05]}>
                  <boxGeometry args={[0.11, 0.012, 0.23]} />
                  <meshStandardMaterial color={INK} roughness={1} metalness={0} />
                </mesh>
              </group>
            </>
          )}
        </group>
      ))}
    </>
  );
}

/**
 * A connected visitor's figure, driven by the act rig (Track 2).
 * The figure ACTS the exchange: it walks — never slides — between the
 * bench, the receiving tray, the board, and the counters, carrying
 * itself with weight (gait, bob, turn-in-place, reach). What it does
 * comes from the `behavior` prop, which the parent derives from the
 * exchange binding (Track 3's plan) and real backend state. The rig
 * never invents a behavior; "idle" keeps the established quiet figure.
 *
 * Rig structure: mover (world position + heading) → drift (the
 * traveler's legacy quiet bob, identity otherwise) → torso (waist
 * pivot: bob, lean, roll) → head / arms; legs hang off drift at the
 * hips so the stride swings them under the bobbing torso.
 */
function VisitorFigure({
  visitor,
  spot,
  reducedMotion,
  frozen,
  onSelect,
  clean = false,
  selected = false,
  behavior = "idle",
  boothX = null,
  destAnchor = null,
  heldToken = null,
}: {
  visitor: VisitorState;
  spot: [number, number, number];
  reducedMotion: boolean;
  frozen: boolean;
  onSelect: (participantId: string) => void;
  /** clean default scene: floating descriptions are suppressed */
  clean?: boolean;
  /** the clean scene shows this figure's name only when selected */
  selected?: boolean;
  /** what the figure is doing — from the exchange binding, never invented */
  behavior?: FigureBehavior;
  /** receiving-counter x for the proposing/attending beats */
  boothX?: number | null;
  /** the plan's staged anchor (exact counter spot) for proposing/attending */
  destAnchor?: [number, number, number] | null;
  /** the work-item token, when this figure holds it — rides at the side */
  heldToken?: React.ReactNode;
}) {
  const kind = visitorKind(visitor);
  const seed = useMemo(() => hashStr(visitor.participant_id), [visitor.participant_id]);
  const rng = useMemo(() => mulberry32(seed), [seed]);
  const phase = useMemo(() => rng() * Math.PI * 2, [rng]);
  const faceAngle = useMemo(() => (rng() - 0.5) * 1.2, [rng]);
  const slot = useTagSlot(`vis-${visitor.participant_id}`, spot[0], spot[2]);
  const tagY = VISITOR_TAG_Y[kind] + slot * TAG_STACK_STEP;
  // waist height: the torso pivot. Cobalt 0.62 (compact), cream 0.78
  // (light frame), traveler 0.5.
  const waistY = kind === "worker" ? 0.62 : kind === "counterpart" ? 0.78 : 0.5;

  // the act rig: owns locomotion + gesture. The figure keeps its look.
  // The torso base is the per-kind waist height, set at construction — the
  // rig never re-derives it from a first-frame mesh read (that raced React's
  // prop commit and collapsed the worker into the floor).
  const rig = useMemo(() => {
    const r = new ActRig(seed);
    r.gait = kind === "counterpart" ? "stride" : "waddle";
    r.setTorsoBase(waistY, 0);
    return r;
  }, [seed, kind, waistY]);
  const mover = useRef<THREE.Group>(null);
  const drift = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const mounted = useRef(false);

  // anchors: the plan's staged counter spot wins for proposing/attending.
  const anchors = useMemo(() => {
    const a = squareAnchors(spot);
    if (destAnchor && (behavior === "proposing" || behavior === "attending")) {
      const v = new THREE.Vector3(destAnchor[0], destAnchor[1], destAnchor[2]);
      const bx = boothX ?? destAnchor[0];
      a.counterStand = () => v.clone();
      a.counterLook = () => new THREE.Vector3(bx, 1.0, behavior === "proposing" ? -5.2 : -3.4);
    }
    return a;
    // anchors are derived from the behavior inputs above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behavior, boothX, destAnchor]);

  // mount once: start at home, facing the figure's own way. Behavior
  // changes re-plan the rig; the rig never invents a behavior.
  const lastBehavior = useRef<FigureBehavior>("idle");
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      rig.snapHome(anchors);
      rig.setTorsoBase(waistY, 0);
      rig.heading = faceAngle;
      lastBehavior.current = behavior;
      rig.setBehavior(behavior, { boothX: boothX ?? undefined });
      return;
    }
    if (lastBehavior.current !== behavior) {
      lastBehavior.current = behavior;
      rig.setBehavior(behavior, { boothX: boothX ?? undefined });
    }
  });

  const handles = useRef<RigHandles>({ root: null, torso: null, head: null });
  useFrame(({ clock }, rawDt) => {
    if (!mover.current || !torso.current || !head.current) return;
    const h = handles.current;
    h.root = mover.current;
    h.torso = torso.current;
    h.head = head.current;
    h.eyes = eyes.current;
    h.armL = armL.current;
    h.armR = armR.current;
    h.legL = legL.current;
    h.legR = legR.current;
    const dt = Math.min(rawDt, 0.05);
    const t = clock.getElapsedTime();
    rig.update(dt, t, h, { reducedMotion, frozen, anchors, pose: "full" });
    // the traveler's quiet drift: only when idle and not locomoting, on its
    // own group so it never fights the rig. Worker/counterpart keep the
    // rig's idle.
    if (drift.current) {
      if (kind === "traveler" && behavior === "idle" && !rig.locomoting && !frozen && !reducedMotion) {
        drift.current.position.y = Math.abs(Math.sin(t * 1.4 + phase)) * 0.06;
        drift.current.rotation.y = Math.sin(t * 0.4 + phase) * 0.25;
      } else {
        drift.current.position.y = 0;
        drift.current.rotation.y = 0;
      }
    }
  });

  const lit = !!visitor.presence;
  /** the station ring tints toward the figure's design so the marker and
   *  the robot read as one station — the self figure keeps its mauve mark. */
  const stationRing =
    visitor.isSelf && kind !== "worker" ? "#7a6a8f" : visitorDesign(kind).enamelDeep;
  const click = {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(visitor.participant_id); },
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = "pointer"; },
    onPointerOut: () => (document.body.style.cursor = "auto"),
  };
  // positions below are relative to the waist pivot (torso group)
  const Y = (absY: number) => absY - waistY;

  return (
    <>
      {/* station marker: brass square for the worker, slate ring otherwise —
       *  stays at home, marks the station, not the figure */}
      <group position={spot}>
        {kind === "worker" && (
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[0.42, 0.5, 4]} />
            <meshBasicMaterial color={BRASS} transparent opacity={0.55} depthWrite={false} />
          </mesh>
        )}
        {kind !== "worker" && (
          <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.38, 0.46, 32]} />
            <meshBasicMaterial color={stationRing} transparent opacity={0.45} depthWrite={false} />
          </mesh>
        )}
      </group>
      {/* the figure itself — the rig owns this group's position + heading,
       * in world coordinates. No TravelDelta: the walk IS the travel. */}
      <group>
        <group ref={mover}>
          <ContactShadow x={0} z={0} scale={0.9} opacity={0.24} />
          <group ref={drift}>
            {/* one shared robot for every built-in agent avatar — newly
             * joined participants, tutorial characters, fallback
             * appearances. The kind picks a restrained design variation
             * (color, head shape, accessories); the act rig still owns all
             * motion, and identities + backend state are untouched. */}
            <VisitorRobot
              kind={kind}
              torso={torso}
              head={head}
              armL={armL}
              armR={armR}
              legL={legL}
              legR={legR}
              eyes={eyes}
              click={click}
              Y={Y}
              waistY={waistY}
              lit={lit}
            />
          </group>
          {/* the held work-item token rides at the figure's side */}
          {heldToken && <group position={[0.45, 0.95, 0.3]}>{heldToken}</group>}
          {/* the name tag travels with the figure */}
          {(!clean || selected) && <TagLeader baseY={VISITOR_TAG_Y[kind]} slot={slot} />}
          {/* invisible tap target: generous, travels with the figure (the
           * rig owns this group's position) — the torso mesh alone is too
           * small to tap at phone size. Clean scene only, so the tour's
           * tag occlusion is untouched. */}
          {clean && (
            <mesh
              position={[0, 1.0, 0]}
              onClick={(e) => { e.stopPropagation(); onSelect(visitor.participant_id); }}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => (document.body.style.cursor = "auto")}
            >
              <cylinderGeometry args={[0.85, 0.85, 2.2, 10]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
          <Html position={[0, tagY, 0]} center className="room-label name" occlude="raycast" style={{ pointerEvents: "none" }}>
            {/* the figure is a human owner — the browser profile's person —
             *  never an agent. Labeled OWNER so the scene can't be read
             *  as one robot among agents. Cosmetic only. */}
            <FigureTag
              name={visitor.displayName}
              hostBadge={visitor.isHost}
              ownerBadge={visitor.isSelf || visitor.activityMode === "manual" || visitor.activityMode === "live"}
              isSelf={visitor.isSelf}
              activityMode={visitor.activityMode}
              modeLabel={visitor.modeLabel}
              escalationCount={visitor.escalationCount}
              showIdentity={selected}
              showStatus={!clean}
              clean={clean}
              selected={selected}
            />
          </Html>
        </group>
      </group>
    </>
  );
}


const VISITOR_SPOTS: [number, number, number][] = [
  [-4.8, 0, 4.6],
  [4.8, 0, 4.6],
  [-6.8, 0, 0.8],
  [6.8, 0, 0.8],
  [-2.8, 0, 5.4],
  [2.8, 0, 5.4],
];

/**
 * The quiet board: a small standing slate near the arrival gate. Rendered
 * ONLY while no agent has authorized work — the quiet-world state. It
 * says the honest thing: "No agents have authorized work right now."
 * It never manufactures busy-ness; when automation exists, the board
 * simply isn't there.
 */
function QuietBoard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.65, 0]}>
          <boxGeometry args={[0.09, 1.3, 0.09]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 1.35, 0]} rotation={[0, 0.12, 0]}>
        <boxGeometry args={[1.9, 1.05, 0.07]} />
        <meshStandardMaterial color="#2b3440" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.35, 0.045]} rotation={[0, 0.12, 0]}>
        <planeGeometry args={[1.7, 0.85]} />
        <meshStandardMaterial color="#232c38" roughness={0.95} />
      </mesh>
      <Html position={[0, 1.35, 0.1]} center className="room-label quiet-board" occlude="raycast">
        <div>
          <strong>quiet board</strong>
          <br />
          No agents have authorized work right now.
        </div>
      </Html>
      <ContactShadow x={0} z={0} scale={1.5} opacity={0.2} />
    </group>
  );
}

/** Lives inside the Canvas: owns the light rig and the warm/cool balance.
 *  Disconnected → warm key dims, cool evening takes over, figures freeze. */
function Rig({ frozen, quality }: { frozen: boolean; quality: "high" | "low" }) {
  const warmDim = useRef(1);
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const coolLight = useRef<THREE.DirectionalLight>(null);
  useFrame((_, dt) => {
    warmDim.current = THREE.MathUtils.damp(warmDim.current, frozen ? 0.25 : 1, 3, dt);
    if (keyLight.current) keyLight.current.intensity = 1.6 * warmDim.current;
    if (coolLight.current) coolLight.current.intensity = 0.35 + (1 - warmDim.current) * 0.9;
  });
  return (
    <>
      <color attach="background" args={[frozen ? "#101722" : EVENING]} />
      <fog attach="fog" args={[frozen ? "#101722" : EVENING, 20, 38]} />
      <ambientLight intensity={0.75} />
      {/* warm key — the interior */}
      <directionalLight ref={keyLight} position={[8, 12, 6]} intensity={1.6} castShadow={quality === "high"} shadow-mapSize={[1024, 1024]} />
      {/* cool rim — the evening outside */}
      <directionalLight ref={coolLight} position={[-6, 9, -10]} intensity={0.35} color="#7d94c4" />
    </>
  );
}

export function WorldScene({
  hosts, offers = [], transactions = [], latestDecision = null, sharedReceipts = [],
  submitInFlightAgreementId = null,
  reducedMotion, quality, transportStatus, backendReachable,
  openOfferId = null, onOpenOffer,
  onSelectAgent,
  claimSummaries, onOpenClaimReport,
  newsroomSummary, onOpenNewsroom,
  mode = "workshop",
  listings = [], agreements = [], visitors = [],
  onOpenListing, onSelectVisitor,
  onSelectListing, onSelectAgreement,
  selfId = null, focusPlace = null,
  quietWorld = false,
  selectedId = null,
}: SceneProps) {
  const joined = hosts.filter((h) => h.joined);
  const frozen = !backendReachable; // disconnected: hold still, light goes cool
  const isSquare = mode === "square";
  /* The staged exchange is the square's normal performance: whenever the
   * backend reports a real stage plan, Wren and Juniper act it out in the
   * usable interactive world — driven ONLY by the real stage plan, never
   * invented. The verdict stays genuinely unknown until the backend
   * returns it. */
  const kioskMode = isSquare;
  const boardAt: [number, number, number] = isSquare ? [0, 0, 0.6] : [-4.4, 0, 2.6];
  /* Tapping a place or a person focuses the camera locally; the legend's
   * focusPlace (parent-owned) always wins, and any legend change drops the
   * stale local override (adjusted during render, not in an effect). */
  const [focusSel, setFocusSel] = useState<{ legend: string | null; override: string | null }>({ legend: focusPlace, override: null });
  if (focusSel.legend !== focusPlace) {
    setFocusSel({ legend: focusPlace, override: null });
  }
  const focusOn = (key: string) => setFocusSel({ legend: focusPlace, override: key });
  /* Clean-scene selection: a figure's name appears only when selected.
   * Selection = the visitor inspect target, or the camera's focus when it
   * sits on a figure (tap a figure to focus it; tap empty space to release).
   * The mode badge and the awaiting-owner pennant always render, never
   * gated behind selection. */
  const focusKey = focusSel.override;
  const focusIsFigure = focusKey === "wren" || focusKey === "juniper" || (focusKey?.startsWith("v:") ?? false);
  const selectedFigure: string | null = focusIsFigure
    ? focusKey
    : selectedId
      ? `v:${selectedId}`
      : null;
  /* Camera presets: the five places plus every figure's own close-up. */
  const presets = useMemo(() => {
    const p: Record<string, CameraPreset> = { ...FOCUS_PRESETS };
    for (const h of joined) {
      const hx = h.home?.[0] ?? (h.agentId === "wren" ? -3.2 : 3.2);
      const hz = h.home?.[2] ?? 2.2;
      p[h.agentId] = { target: [hx, 1.1, hz], camera: [hx + 1.5, 5.2, hz + 6.5] };
    }
    visitors.forEach((v, i) => {
      const s = VISITOR_SPOTS[i % VISITOR_SPOTS.length];
      p[`v:${v.participant_id}`] = { target: [s[0], 1.0, s[2]], camera: [s[0] + 1.5, 5.0, s[2] + 6.5] };
    });
    return p;
  }, [joined, visitors]);
  /* TRACK 3 — stage plan: one active interaction staged from real backend
   * state (see choreography.ts). The plan places the worker + counterpart
   * figures, the work-object token, and the camera; everything else stays at
   * its natural idle. */
  const booths = useMemo(() => counterBooths(agreements, visitors, hosts, selfId), [agreements, visitors, hosts, selfId]);
  /* Bench + records cabinet anchors (square mode keeps both inside the default frame). */
  const stationPos: [number, number, number] = isSquare ? [-2.4, 0, -2.2] : [0, 0, -3];
  const cabPos: [number, number, number] = isSquare ? [3.0, 0, 1.6] : [0, 0, 4.6];
  /* Natural anchor of a figure: host home, or visitor spot by index. */
  const homeOf = useMemo(() => {
    const hostHome = new Map<string, [number, number, number]>();
    for (const h of joined) {
      if (h.participantId) hostHome.set(h.participantId, h.home ?? (h.agentId === "wren" ? [-3.2, 0, 2.2] : [3.2, 0, 2.2]));
    }
    const visitorSpot = new Map<string, [number, number, number]>();
    visitors.forEach((v, i) => visitorSpot.set(v.participant_id, VISITOR_SPOTS[i % VISITOR_SPOTS.length]));
    return (pid: string): [number, number, number] | null => hostHome.get(pid) ?? visitorSpot.get(pid) ?? null;
  }, [joined, visitors]);
  const boothXOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of booths) if (b.group?.pid) m.set(b.group.pid, b.x);
    return (pid: string): number | null => m.get(pid) ?? null;
  }, [booths]);
  /* Coarse clock for the verdict beat — re-stages settled → recorded. */
  const [nowBucket, setNowBucket] = useState(() => Math.floor(Date.now() / 5000));
  useEffect(() => {
    if (!isSquare) return;
    const id = setInterval(() => setNowBucket(Math.floor(Date.now() / 5000)), 5000);
    return () => clearInterval(id);
  }, [isSquare]);
  const plan: StagePlan | null = useMemo(
    () =>
      isSquare
        ? describeStage({
            agreements,
            listings,
            boothXOf,
            homeOf,
            submitInFlightId: submitInFlightAgreementId ?? null,
            nowMs: nowBucket * 5000,
          })
        : null,
    [isSquare, agreements, listings, boothXOf, homeOf, submitInFlightAgreementId, nowBucket]
  );
  /* The camera defaults to the active interaction when one is staged; an
   * explicit legend pick or a tap override still wins. */
  const cameraPlace = focusSel.override ?? focusSel.legend ?? (plan ? "active" : null);
  /* Staged anchors by participant id: stage anchor − natural home. */
  const stagedDelta = useMemo(() => {
    const d = new Map<string, [number, number, number]>();
    if (plan) {
      const put = (pid: string | null, anchor: [number, number, number] | null) => {
        if (!pid || !anchor) return;
        const home = homeOf(pid);
        if (!home) return;
        d.set(pid, [anchor[0] - home[0], 0, anchor[2] - home[2]]);
      };
      put(plan.workerPid, plan.workerAnchor);
      put(plan.counterpartPid, plan.counterpartAnchor);
    }
    return d;
  }, [plan, homeOf]);
  /* Track 2 character acts: plan stage + participant role → FigureBehavior.
   * The binding (choreography.ts, Track 3) stages WHERE each party stands;
   * this maps it to HOW the figure acts. Every branch reads real backend
   * state (the plan, worker_state, open listings) — the rig never invents
   * a behavior, and "idle" keeps the established quiet figure. */
  const visitorAct = (v: VisitorState): {
    behavior: FigureBehavior;
    boothX: number | null;
    destAnchor: [number, number, number] | null;
  } => {
    const pid = v.participant_id;
    const quiet = { behavior: "idle" as FigureBehavior, boothX: null, destAnchor: null };
    if (plan) {
      if (plan.workerPid === pid) {
        switch (plan.stage) {
          case "proposal":
            return { behavior: "proposing", boothX: plan.boothX, destAnchor: plan.workerAnchor };
          case "production":
            return { behavior: "working", boothX: null, destAnchor: plan.workerAnchor };
          case "awaiting-review":
            return { behavior: "submitting", boothX: null, destAnchor: null };
          case "verdict-accepted":
            return { behavior: "accepted", boothX: null, destAnchor: null };
          case "verdict-refused":
            return { behavior: "refused", boothX: null, destAnchor: null };
          default:
            break;
        }
      } else if (plan.counterpartPid === pid && plan.stage === "proposal") {
        return { behavior: "attending", boothX: plan.boothX, destAnchor: plan.counterpartAnchor };
      }
    }
    // not staged in the exchange: the worker's own stop-condition state.
    switch (v.workerState ?? null) {
      case "running": {
        // something real to look at, and the floor is free → walk to the
        // board and examine it (discovering). Otherwise stay quiet.
        const open = listings.some(
          (l) => (l.status || "").toLowerCase() === "open" && l.from_participant !== pid
        );
        const free = !plan || plan.stage === "discovery";
        return open && free ? { behavior: "discovering", boothX: null, destAnchor: null } : quiet;
      }
      case "awaiting_approval":
        return { behavior: "awaiting", boothX: null, destAnchor: null };
      case "paused":
      case "held_standing":
      case "stopped_revoked":
        return { behavior: "still", boothX: null, destAnchor: null };
      default:
        return quiet;
    }
  };
  /* Kiosk performance (?kiosk=1): Wren performs the worker role, Juniper
   * the counterpart role — from the REAL stage plan, never invented. Both
   * verdict branches are implemented; the verdict stays genuinely unknown
   * until the backend returns it. */
  const [juniperObj, setJuniperObj] = useState<HeldObject>("hidden");
  const [wrenObj, setWrenObj] = useState<HeldObject>("hidden");
  const hostAct = useMemo((): { wren: FigureBehavior; juniper: FigureBehavior } | null => {
    if (!kioskMode || !plan) return null;
    switch (plan.stage) {
      case "proposal":
      case "production":
      case "awaiting-review":
        return { wren: "proposing", juniper: "attending" };
      case "verdict-accepted":
        return { wren: "delivering", juniper: "receiving" };
      case "verdict-refused":
        return { wren: "refused", juniper: "returning" };
      case "recorded":
        // the verdict beat is longer than the stage: the recorded receipt
        // must not yank the performers mid-handoff. The plan's verdict
        // (real, from the backend) decides which branch completes.
        if (plan.verdict === "accepted") return { wren: "delivering", juniper: "receiving" };
        if (plan.verdict === "refused") return { wren: "refused", juniper: "returning" };
        return null;
      default:
        return null;
    }
  }, [kioskMode, plan]);

  /* The kiosk performance token — one object, following the REAL handoffs:
   * Wren's hands → the tray → Juniper's hands → the records drawer. Each
   * handoff is driven by the performers' actual rig object state (take →
   * held, place → placed), never by timers or guesses. */
  const kioskToken = useMemo((): {
    kind: "wrenHolds" | "tray" | "juniperHolds" | "drawer";
  } | null => {
    if (!hostAct || !plan) return null;
    if (hostAct.wren === "proposing" || hostAct.wren === "refused") {
      return { kind: "wrenHolds" };
    }
    // delivering: Wren carries it to the tray, sets it down; Juniper takes
    // it to the records drawer.
    if (juniperObj === "placed") return { kind: "drawer" };
    if (juniperObj === "held") return { kind: "juniperHolds" };
    if (wrenObj === "placed") return { kind: "tray" };
    return { kind: "wrenHolds" };
  }, [hostAct, plan, wrenObj, juniperObj]);
  /* World spots for the token when it's not in a performer's hands. */
  const kioskTokenSpot = (kind: "tray" | "drawer"): [number, number, number] =>
    kind === "tray" ? [1.15, 0.92, 1.5] : [2.35, 0.84, 0.72];
  const kioskTokenNode = (at: [number, number, number], pose: "upright" | "flat" = "flat") => plan && (
    <AgreementToken
      stage={plan.tokenLook}
      position={at}
      pose={pose}
      reducedMotion={reducedMotion}
      onSelect={tokenSelect}
    />
  );
  /* Someone is genuinely at work (an agreement in "agreed") — the bench
   * papers appear only then, never as decoration. */
  const someoneWorking = isSquare && visitors.some((v) => visitorAct(v).behavior === "working");
  /* Cabinet records: settled agreements with real receipts (filed) plus
   * manually shared receipts — a folder arrives only when the record exists. */
  const cabinetRecords: CabinetRecord[] = useMemo(() => {
    if (!isSquare) return [];
    const recs: CabinetRecord[] = [];
    const seen = new Set<string>();
    for (const a of agreements) {
      if ((a.status || "").toLowerCase() !== "settled") continue;
      if (!a.receipts || Object.keys(a.receipts).length === 0) continue;
      const key = `settled:${a.agreement_id}`;
      if (!seen.has(key)) { seen.add(key); recs.push({ key }); }
    }
    (sharedReceipts ?? []).forEach((r, i) => {
      const key = `shared:${r.receipt.receipt_id ?? `${r.shared_by}#${i}`}`;
      if (!seen.has(key)) { seen.add(key); recs.push({ key }); }
    })
    return recs;
  }, [isSquare, agreements, sharedReceipts]);
  /* Held-token carry offset: just in front of the holder's chest. */
  const carryAt = (origin: [number, number, number]): [number, number, number] => [
    origin[0] + 0.45, 0.95, origin[2] + 0.3,
  ];
  const heldBy = (pid: string | null | undefined) =>
    plan?.token.mode === "held" && pid != null && plan.token.holderPid === pid;
  const tokenSelect = plan?.agreement
    ? () => onSelectAgreement?.(plan.agreement!.agreement_id)
    : plan?.listing
      ? () => (onSelectListing ?? onOpenListing)?.(plan.listing!.listing_id)
      : undefined;
  /* The staged interaction gets its own close camera preset. In kiosk
   * performance mode the "active" preset is the kiosk three-quarter view. */
  const fullPresets = useMemo(
    // the staged exchange always films from the kiosk three-quarter view,
    // whether or not the host-act gate has engaged yet
    () => ({ ...presets, ...(plan ? { active: KIOSK_CAMERA } : null) }),
    [presets, plan]
  );

  return (
    <Canvas shadows={quality === "high"} dpr={quality === "high" ? [1, 2] : [1, 1]} camera={{ position: [9.5, 7.0, 13.5], fov: 42 }} onPointerMissed={() => setFocusSel({ legend: focusPlace, override: null })}>
      <Rig frozen={frozen} quality={quality} />
      <Floor />
      {/* the evening window: on the north wall's east end in the square, so
       * it never sits behind the kiosk interaction as a blank panel */}
      <EveningWindow position={isSquare ? [6.5, 0, -6.42] : undefined} hideLabel={isSquare} />
      {/* one connected community, five places — positions below are the square layout.
       * The clean default scene carries no rules plaque: the rules live in
       * the Panels drawer. */}
      {!isSquare && <HouseRulesPlaque compact={false} />}
      {isSquare ? (
        <ExchangeKiosk
          listings={listings}
          position={[0, 0, 1.6]}
          onOpenListing={(id) => (onSelectListing ?? onOpenListing)?.(id)}
        />
      ) : (
        <OfferBoard
          offers={offers} transactions={transactions}
          openOfferId={openOfferId} onOpenOffer={onOpenOffer ?? (() => {})}
          reducedMotion={reducedMotion}
        />
      )}
      {/* PUBLIC SQUARE — arrival & meeting.
       * The clean default scene carries no district labels: the places are
       * legible as 3D; names and purposes live in the Panels drawer. */}
      <GateArch
        pending={transportStatus === "pending"} reducedMotion={reducedMotion}
        position={isSquare ? [6.4, 0, 4.2] : undefined}
        label={isSquare ? null : undefined}
      />
      {/* the signpost's place navigation and tour entry live in the Panels drawer */}
      {/* quiet world: the standing slate says the honest thing; nothing else
       * changes — ambient host life continues, no manufactured busy-ness */}
      {quietWorld && <QuietBoard position={isSquare ? [-4.4, 0, 4.2] : [2.9, 0, 4.1]} />}
      {/* worn paths between the places */}
      {isSquare && <PathStrip from={[0, 4.6]} to={[0, 1.8]} />}
      {isSquare && <PathStrip from={[0, -0.2]} to={[-2.2, -1.2]} />}
      {isSquare && <PathStrip from={[0, -0.2]} to={[4.4, 0.6]} />}
      {isSquare && <PathStrip from={[0, -0.8]} to={[0, -3.4]} />}
      {/* district ground tints + tap targets: tapping a place looks closer */}
      {isSquare && (
        <>
          <PlaceGround x={0} z={4.75} rx={4.6} rz={1.6} color="#e8c95c" />
          <PlaceGround x={0} z={0.6} rx={3.4} rz={2.4} color="#e07a5f" />
          <PlaceGround x={0.3} z={-0.3} rx={4.3} rz={2.9} color="#f0a35c" />
          <PlaceGround x={5} z={0.3} rx={2.6} rz={2.8} color="#a9c0e8" />
          <PlaceGround x={0} z={-4.4} rx={4.8} rz={1.8} color="#d8a94e" />
          <PlaceHit x={0} z={4.75} w={10} d={2.5} onFocus={() => focusOn("square")} />
          <PlaceHit x={0} z={0.6} w={6} d={4} onFocus={() => focusOn("board")} />
          <PlaceHit x={-2.6} z={-1.0} w={3.6} d={4.2} onFocus={() => focusOn("workshop")} />
          <PlaceHit x={5} z={0.3} w={4} d={5} onFocus={() => focusOn("library")} />
          <PlaceHit x={0} z={-4.4} w={9} d={2.5} onFocus={() => focusOn("counters")} />
        </>
      )}
      {/* WORKSHOP — work is made & checked (no district labels in the clean scene) */}
      <ReviewStation latestDecision={latestDecision} square={isSquare} position={isSquare ? stationPos : undefined} />
      <RecordsCabinet records={cabinetRecords} square={isSquare} reducedMotion={reducedMotion} position={isSquare ? cabPos : undefined} />
      {isSquare && (
        <>
          {/* the receiving tray is built into the ReviewStation's review end
           * (Track 3) — submitted work visibly rests there while it awaits
           * the receiver */}
          {/* workbench papers — ONLY while someone is genuinely at work */}
          <WorkPapers position={[-3.5, 1.12, -2.3]} visible={someoneWorking} reducedMotion={reducedMotion} />
          {/* the record slip flies review-end → cabinet ONLY when the
           * shared-receipt count really increases — never invented. In the
           * kiosk performance the flight starts at the kiosk tray. */}
          <RecordFlight
            count={cabinetRecords.length}
            from={kioskMode ? [1.15, 1.0, 1.5] : [-1.4, 1.6, -2.4]}
            to={[3.0, 2.42, 1.6]}
            reducedMotion={reducedMotion}
          />
        </>
      )}
      {/* NEWSROOM & LIBRARY — reports, sources, corrections */}
      <ClaimGraphDesk
        summaries={claimSummaries} reducedMotion={reducedMotion}
        onOpenReport={onOpenClaimReport}
        position={isSquare ? [4.9, 0, -1.2] : undefined}
        hideLabel={isSquare}
      />
      <NewsroomDesk
        summary={newsroomSummary} reducedMotion={reducedMotion}
        onOpenNewsroom={onOpenNewsroom}
        position={isSquare ? [5.3, 0, 1.8] : undefined}
        hideLabel={isSquare}
      />
      {/* RECEIVING COUNTERS — accept or refuse, under your own rules */}
      {isSquare && (
        <ReceivingCounters
          agreements={agreements}
          visitors={visitors}
          hosts={hosts}
          selfId={selfId}
          position={[0, 0, -4.4]}
        />
      )}
      {/* warm practical light for the town's unlit places now comes from the
       * soft scene fill (see the hemisphereLight by the overhead fixture) —
       * the extra lantern fixtures were removed so the robots stay the
       * brightest warm accents in frame. */}
      {/* the work-item token — one object, staged from the plan (real backend
       * state only): placed at a stage spot, or held by the staged figure.
       * In the kiosk performance the token follows the real handoffs
       * instead: Wren's hands → the tray → Juniper's hands → the drawer. */}
      {isSquare && plan && !kioskToken && plan.token.mode === "placed" && (
        <AgreementToken
          stage={plan.tokenLook}
          position={kioskMode && plan.stage === "discovery" ? [0, 0.7, 2.35] : plan.token.spot}
          pose="flat"
          reducedMotion={reducedMotion}
          onSelect={tokenSelect}
        />
      )}
      {isSquare && kioskToken && (kioskToken.kind === "tray" || kioskToken.kind === "drawer") && kioskTokenNode(kioskTokenSpot(kioskToken.kind))}
      {isSquare && <CameraFocus place={cameraPlace} presets={fullPresets} reducedMotion={reducedMotion} />}
      {joined.map((h) => {
        const home: [number, number, number] = h.home ?? (h.agentId === "wren" ? [-3.2, 0, 2.2] : [3.2, 0, 2.2]);
        const delta: [number, number, number] = h.participantId ? stagedDelta.get(h.participantId) ?? [0, 0, 0] : [0, 0, 0];
        const anchors = isSquare ? squareAnchors(home) : hostAnchors(home, boardAt);
        const fig = h.agentId === "wren" ? (
          <WrenFigure host={h} reducedMotion={reducedMotion} frozen={frozen} onSelect={(id) => { onSelectAgent(id); focusOn(id); }} home={h.home} boardAt={boardAt} clean={isSquare} selected={selectedFigure === "wren"} anchors={anchors}
            actBehavior={hostAct?.wren ?? null}
            actAnchors={hostAct ? kioskAnchorsWren() : null}
            heldToken={kioskToken?.kind === "wrenHolds" ? kioskTokenNode([0, 0, 0], "upright") : null}
            onObj={(o) => setWrenObj(o)}
          />
        ) : (
          <JuniperFigure host={h} reducedMotion={reducedMotion} frozen={frozen} onSelect={(id) => { onSelectAgent(id); focusOn(id); }} home={h.home} clean={isSquare} selected={selectedFigure === "juniper"} anchors={anchors}
            actBehavior={hostAct?.juniper ?? null}
            actAnchors={hostAct ? kioskAnchorsJuniper() : null}
            heldToken={kioskToken?.kind === "juniperHolds" ? kioskTokenNode([0, 0, 0], "upright") : null}
            onObj={(o) => setJuniperObj(o)}
          />
        );
        return (
          <TravelDelta key={h.agentId} delta={delta} reducedMotion={reducedMotion}>
            {fig}
            {heldBy(h.participantId) && plan && (
              <AgreementToken
                stage={plan.tokenLook}
                position={carryAt(home)}
                fixedAt={carryAt(home)}
                reducedMotion={reducedMotion}
                onSelect={tokenSelect}
              />
            )}
          </TravelDelta>
        );
      })}
      {/* soft contact shadows now travel inside each figure's mover group
       * (they stay grounded wherever the robot stands) — no static map. */}
      {isSquare && visitors.map((v, i) => {
        // kiosk performance: Wren and Juniper play the staged parties — the
        // staged visitor figures step aside so nobody is doubled.
        if (kioskToken && plan && (v.participant_id === plan.workerPid || v.participant_id === plan.counterpartPid)) return null;
        const spot = VISITOR_SPOTS[i % VISITOR_SPOTS.length];
        // the act rig owns this figure's travel — no TravelDelta glide;
        // the walk IS the travel. The held token rides the figure.
        const act = visitorAct(v);
        return (
          <VisitorFigure
            key={v.participant_id}
            visitor={v}
            spot={spot}
            reducedMotion={reducedMotion}
            frozen={frozen}
            onSelect={(pid) => { onSelectVisitor?.(pid); focusOn(`v:${pid}`); }}
            clean={isSquare}
            selected={selectedFigure === `v:${v.participant_id}`}
            behavior={act.behavior}
            boothX={act.boothX}
            destAnchor={act.destAnchor}
            heldToken={heldBy(v.participant_id) && plan ? (
              <AgreementToken
                stage={plan.tokenLook}
                position={[0, 0, 0]}
                reducedMotion={reducedMotion}
                onSelect={tokenSelect}
              />
            ) : null}
          />
        );
      })}
      {frozen && (
        <Html position={[0, 5.2, 0]} center className="room-label verdict" occlude="raycast">
          <div className="no">disconnected — the world is unreachable; nothing here is live</div>
        </Html>
      )}
      <OrbitControls makeDefault enablePan={false} target={[0, 1.1, 2.2]} maxPolarAngle={Math.PI / 2.4} minDistance={4} maxDistance={30} />
      {/* the clean default scene carries no camera hint text */}
      {!isSquare && (
        <Html position={[0, 0.02, 6.4]} center className="room-label caption cam-hint" occlude="raycast">
          <div>tap a place or a person to look closer · helper movement is illustrative — only gate decisions are real</div>
        </Html>
      )}
    </Canvas>
  );
}
