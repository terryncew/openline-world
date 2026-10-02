/**
 * OpenLine World — square world state.
 * frontend/src/square/worldState.ts
 *
 * DECORATIVE ONLY. This module owns the town's ambient life: who wanders
 * where, at what pace, doing what idle task. It is seeded and deterministic.
 *
 * HARD BOUNDARY (enforced by square.boundary.test.ts): nothing in this
 * module — and nothing anywhere under src/square/ — may manufacture
 * protocol facts. No imports from ../viz/* (except the VizView component
 * for screen composition), ../api, or ../world/api. No POST. No event log
 * writes. No receipts. The town imagines; the workshop proves.
 */

export type WanderTask = "stroll" | "carry" | "sweep" | "chat" | "idle";

export interface Wanderer {
  id: string;
  /** pastel body color */
  color: string;
  /** closed loop of waypoints on the ground plane; null = stationary */
  path: Array<[number, number]> | null;
  /** units per second along the path */
  speed: number;
  /** seconds offset into the loop */
  phase: number;
  task: WanderTask;
  /** body scale */
  scale: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261002);

function circlePath(cx: number, cz: number, r: number, n: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

const PALETTE = ["#8fd0c2", "#f2b8a0", "#a8c8f0", "#d8b8e8", "#f0d888", "#a8e0a0", "#f0a8b8"];

/** The town's ambient cast. Fixed at module load; stable across reloads. */
export const WANDERERS: Wanderer[] = [
  { id: "pip",   color: PALETTE[0], path: circlePath(0, 0, 5.2, 24), speed: 0.9, phase: 0,  task: "stroll", scale: 1.0 },
  { id: "tock",  color: PALETTE[2], path: [[4.5, -2], [9, -2], [12.5, 0], [9, 2], [4.5, 2]], speed: 1.1, phase: 3,  task: "stroll", scale: 0.92 },
  { id: "mabel", color: PALETTE[4], path: [[-4.5, 3], [-9, 3], [-12, 0], [-9, -3], [-4.5, -3]], speed: 0.8, phase: 7,  task: "carry",  scale: 1.05 },
  { id: "dust",  color: PALETTE[5], path: null, speed: 0, phase: 0, task: "sweep", scale: 0.85 },
  { id: "bramble", color: PALETTE[3], path: null, speed: 0, phase: 0, task: "chat", scale: 0.95 },
  { id: "fern",  color: PALETTE[6], path: null, speed: 0, phase: 2.2, task: "chat", scale: 0.95 },
  { id: "hopper", color: PALETTE[1], path: circlePath(0, 0, 8.6, 32), speed: 1.4, phase: 11, task: "stroll", scale: 0.8 },
];

/** Fixed anchors for stationary robots: [x, z, facingYaw]. */
export const ANCHORS: Record<string, [number, number, number]> = {
  dust: [2.6, -7.6, Math.PI],       // sweeping the workshop steps
  bramble: [-1.8, 2.4, 0.9],        // chatting by the fountain
  fern: [-0.4, 3.1, -2.2],          // chatting by the fountain
};

export interface Pose {
  x: number;
  z: number;
  /** facing yaw, radians */
  yaw: number;
  /** vertical bob offset */
  bob: number;
  /** 0..1 walk-cycle phase for leg swing */
  stride: number;
}

function pathLength(path: Array<[number, number]>): number {
  let L = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

/**
 * Pure pose function: wanderer + wall-clock seconds -> pose.
 * No side effects, no randomness at call time, no protocol knowledge.
 */
export function poseAt(w: Wanderer, t: number): Pose {
  if (w.path === null) {
    const [x, z, yaw] = ANCHORS[w.id] ?? [0, 0, 0];
    const tt = t + w.phase;
    if (w.task === "sweep") {
      // small scrubbing oscillation in front of the workshop steps
      const s = Math.sin(tt * 2.2);
      return { x: x + s * 0.55, z, yaw: yaw + s * 0.25, bob: Math.abs(Math.sin(tt * 2.2)) * 0.03, stride: (tt * 2.2) % 1 };
    }
    if (w.task === "chat") {
      return { x, z, yaw: yaw + Math.sin(tt * 0.7) * 0.12, bob: Math.sin(tt * 1.8) * 0.035, stride: 0 };
    }
    return { x, z, yaw: yaw + Math.sin(tt * 0.4) * 0.3, bob: Math.sin(tt * 1.2) * 0.02, stride: 0 };
  }
  const path = w.path;
  const L = pathLength(path);
  const d = ((t * w.speed + w.phase * w.speed) % L + L) % L;
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= acc + seg) {
      const f = seg === 0 ? 0 : (d - acc) / seg;
      const x = a[0] + (b[0] - a[0]) * f;
      const z = a[1] + (b[1] - a[1]) * f;
      const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      return { x, z, yaw, bob: Math.abs(Math.sin(t * 7 + w.phase)) * 0.045, stride: (t * 2.4 + w.phase) % 1 };
    }
    acc += seg;
  }
  const p0 = path[0];
  return { x: p0[0], z: p0[1], yaw: 0, bob: 0, stride: 0 };
}

/** Decorative idle jitter so no two reloads look staged. Not protocol. */
export function decorativeSeed(): number {
  return Math.floor(rand() * 1e9);
}
