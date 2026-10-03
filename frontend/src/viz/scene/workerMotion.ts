/**
 * OpenLine World visualization — worker motion.
 * frontend/src/viz/scene/workerMotion.ts
 *
 * Derives every workroom pose from reducer state. A worker's phase is a
 * pure function of its events; wall-clock only interpolates between
 * data-derived poses. Nothing is invented: where the log is silent, the
 * worker shows honest idle at its bench.
 *
 * Phase <- exact event evidence:
 *   preparing  - mandate create (owner-signed), no proposals yet:
 *                reading the task ledger at the bench
 *   assembling - proposal in-flight (agent-reported), first 0.9s:
 *                shaping the packet at the bench
 *   carrying   - proposal in-flight: walking the lane to the gate
 *                mouth with the packet in hand
 *   waiting    - proposal in-flight, walk done: presenting the packet
 *                at the threshold
 *   halted     - latest decision STOPPED (receiver-signed), 2.4s:
 *                recoil at the gate mouth
 *   released   - latest decision ALLOWED (receiver-signed), 1.8s:
 *                the packet passes, the worker settles
 *   filing     - receipt (receiver-signed) for the worker's proposal:
 *                walking back to the bench
 *   revoked    - mandate REVOKED (owner-signed): powered down in place
 *
 * Durations below are stage direction only (like pacing.ts); the
 * verdicts and standings are data.
 */
import type { VizProposal, VizReceipt, VizWorker } from "../protocol";
import { workerHome } from "./layout.ts";

export type ArmPose =
  | "hang"
  | "read"
  | "assemble"
  | "carry"
  | "present"
  | "recoil"
  | "dead";

export type WorkerPhase =
  | "preparing"
  | "assembling"
  | "carrying"
  | "waiting"
  | "halted"
  | "released"
  | "filing"
  | "revoked";

export interface PacketAnchor {
  pos: [number, number, number];
  scale: number;
  proposalId: string;
}

export interface WorkerMotion {
  phase: WorkerPhase;
  /** seconds since this phase's data last changed */
  ageS: number;
  pos: [number, number, number];
  /** radians, atan2(dx, dz): the figure faces +z locally */
  facingY: number;
  armPose: ArmPose;
  /** radians, + tips the head down toward the bench */
  headTilt: number;
  /** 0..1 leg-swing amount */
  walkAmt: number;
  eyeOn: boolean;
  packet: PacketAnchor | null;
}

export const ASSEMBLE_S = 0.9;
export const WALK_S = 2.4;
export const HALT_S = 2.4;
export const RELEASE_S = 1.8;
export const FILE_S = 2.2;
const ENTER_S = 1.1;

/** Small casts get the full workroom staging; crowds keep the swarm.
 * KNOWN LIMITATION — WORKER-FAMILY-OVERFLOW: above 8 the viz falls back
 * to generic capsules, not the town families. Guarded by
 * src/viz/worker-family-guard.test.ts; see
 * src/viz/screenshots/characters/KNOWN_LIMITATIONS.md. */
export function useFigures(workerCount: number): boolean {
  return workerCount <= 8;
}

export const GATE_MOUTH: [number, number, number] = [4.7, 0, 0.35];
const LANE_MID: [number, number] = [-1.6, 0.6];

const BENCH_SPOTS: Array<[number, number]> = [
  [-6.1, 2.2],
  [-6.1, 3.6],
  [-7.6, 2.8],
  [-4.2, -1.8],
];

/** The worker stands just west of its bench, facing the gate (+x); the
 *  bench (ledger, tray, tools) sits BENCH_DX ahead of the stand spot,
 *  beside the lane so the carry path stays clear. */
export const BENCH_DX = 0.55;

export function benchPos(index: number, workerId: string): [number, number, number] {
  if (index < BENCH_SPOTS.length) {
    const [x, z] = BENCH_SPOTS[index];
    return [x, 0, z];
  }
  return workerHome(index, workerId);
}

export { BENCH_SPOTS };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (k: number) =>
  k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);

/** Walk the lane bench -> gate mouth. Returns x, z and travel direction. */
function walkPath(
  bench: [number, number, number],
  k: number
): { x: number; z: number; fx: number; fz: number } {
  const e = easeInOut(clamp01(k));
  const ax = bench[0];
  const az = bench[2];
  const cx = GATE_MOUTH[0];
  const cz = GATE_MOUTH[2];
  if (e < 0.5) {
    const t = easeInOut(e * 2);
    return {
      x: ax + (LANE_MID[0] - ax) * t,
      z: az + (LANE_MID[1] - az) * t,
      fx: LANE_MID[0] - ax,
      fz: LANE_MID[1] - az,
    };
  }
  const t = easeInOut((e - 0.5) * 2);
  return {
    x: LANE_MID[0] + (cx - LANE_MID[0]) * t,
    z: LANE_MID[1] + (cz - LANE_MID[1]) * t,
    fx: cx - LANE_MID[0],
    fz: cz - LANE_MID[1],
  };
}

/** Per-worker data key: when this changes, the phase clock restarts. */
function workerKey(
  w: VizWorker,
  proposals: VizProposal[],
  receipts: VizReceipt[]
): string {
  const mine = proposals.filter((p) => p.workerId === w.workerId);
  const inflight = mine
    .filter((p) => p.status === "in-flight")
    .map((p) => p.id)
    .join(",");
  const decided = mine
    .filter((p) => p.status !== "in-flight")
    .map((p) => `${p.id}:${p.status}`)
    .join(",");
  const rc = receipts.filter((r) => r.helper === w.workerId).length;
  return `${w.workerId}|${inflight}|${decided}|${rc}|${w.active}`;
}

/** Wall-clock origin per worker, edge-triggered: when the worker's
 *  data key changes *as observed*, the phase clock restarts — even if
 *  the key was seen before (scrub back to a verdict replays its beat,
 *  like DecidedPacket's sceneKey). Shared across components so seals,
 *  packets, puffs, and figures agree on the phase clock. */
const lastKey = new Map<string, string>();
const originAt = new Map<string, number>();
function originFor(workerId: string, key: string, nowMs: number): number {
  if (lastKey.get(workerId) !== key) {
    lastKey.set(workerId, key);
    originAt.set(workerId, nowMs);
  }
  return originAt.get(workerId) ?? nowMs;
}

/** Raw phase from reducer state (no clock). */
function rawPhase(
  w: VizWorker,
  proposals: VizProposal[],
  receipts: VizReceipt[]
): Exclude<WorkerPhase, "assembling" | "carrying" | "waiting"> | "carrying" {
  if (!w.active) return "revoked";
  const mine = proposals.filter((p) => p.workerId === w.workerId);
  if (mine.some((p) => p.status === "in-flight")) return "carrying";
  const decided = mine
    .filter((p) => p.status !== "in-flight")
    .sort((a, b) => (b.decisionSeq ?? 0) - (a.decisionSeq ?? 0));
  if (decided.length > 0) {
    return decided[0].status === "stopped" ? "halted" : "released";
  }
  if (receipts.some((r) => r.helper === w.workerId)) return "filing";
  return "preparing";
}

/** Expand raw phase + age into the effective animated phase. */
function resolvePhase(
  raw: ReturnType<typeof rawPhase>,
  ageS: number
): { phase: WorkerPhase; tLocal: number } {
  switch (raw) {
    case "carrying":
      if (ageS < ASSEMBLE_S) return { phase: "assembling", tLocal: ageS };
      if (ageS < ASSEMBLE_S + WALK_S)
        return { phase: "carrying", tLocal: ageS - ASSEMBLE_S };
      return { phase: "waiting", tLocal: ageS - ASSEMBLE_S - WALK_S };
    case "halted":
      if (ageS < HALT_S) return { phase: "halted", tLocal: ageS };
      if (ageS < HALT_S + FILE_S)
        return { phase: "filing", tLocal: ageS - HALT_S };
      return { phase: "preparing", tLocal: ageS - HALT_S - FILE_S };
    case "released":
      if (ageS < RELEASE_S) return { phase: "released", tLocal: ageS };
      if (ageS < RELEASE_S + FILE_S)
        return { phase: "filing", tLocal: ageS - RELEASE_S };
      return { phase: "preparing", tLocal: ageS - RELEASE_S - FILE_S };
    case "filing":
      if (ageS < FILE_S) return { phase: "filing", tLocal: ageS };
      return { phase: "preparing", tLocal: ageS - FILE_S };
    default:
      return { phase: raw, tLocal: ageS };
  }
}

const FACE_GATE = Math.PI / 2; // facing +x

/** Full motion for one worker. Pure given (state, nowMs); the origin map
 *  is the only shared mutable state, keyed by the data itself. */
export function getMotion(
  w: VizWorker,
  index: number,
  proposals: VizProposal[],
  receipts: VizReceipt[],
  nowMs: number
): WorkerMotion {
  const bench = benchPos(index, w.workerId);
  const key = workerKey(w, proposals, receipts);
  const ageS = Math.max(0, (nowMs - originFor(w.workerId, key, nowMs)) / 1000);
  const raw = rawPhase(w, proposals, receipts);
  const { phase, tLocal } = resolvePhase(raw, ageS);

  const inflight = proposals
    .filter((p) => p.workerId === w.workerId && p.status === "in-flight")
    .sort((a, b) => a.seq - b.seq);
  const carryProposal = inflight[inflight.length - 1] ?? null;

  let pos: [number, number, number] = bench;
  let facingY = FACE_GATE;
  let armPose: ArmPose = "hang";
  let headTilt = 0;
  let walkAmt = 0;
  let packet: PacketAnchor | null = null;

  switch (phase) {
    case "preparing":
      armPose = index < BENCH_SPOTS.length ? "read" : "hang";
      headTilt = 0.35;
      break;
    case "assembling": {
      armPose = "assemble";
      headTilt = 0.28;
      const s = 0.3 + 0.7 * easeOutCubic(clamp01(tLocal / ASSEMBLE_S));
      if (carryProposal) {
        packet = {
          pos: [bench[0] + 0.8, 1.2, bench[2]],
          scale: s,
          proposalId: carryProposal.id,
        };
      }
      break;
    }
    case "carrying": {
      const wp = walkPath(bench, tLocal / WALK_S);
      pos = [wp.x, 0, wp.z];
      facingY = Math.atan2(wp.fx, wp.fz);
      armPose = "carry";
      walkAmt = 1;
      if (carryProposal) {
        const fx = Math.sin(facingY);
        const fz = Math.cos(facingY);
        packet = {
          pos: [wp.x + fx * 0.55, 1.05, wp.z + fz * 0.55],
          scale: 1,
          proposalId: carryProposal.id,
        };
      }
      break;
    }
    case "waiting":
      pos = [GATE_MOUTH[0], 0, GATE_MOUTH[2]];
      facingY = FACE_GATE;
      armPose = "present";
      headTilt = -0.06;
      if (carryProposal) {
        packet = {
          pos: [GATE_MOUTH[0] + 0.85, 1.35, GATE_MOUTH[2]],
          scale: 1,
          proposalId: carryProposal.id,
        };
      }
      break;
    case "halted": {
      const recoil = 0.55 * Math.min(1, tLocal / 0.35);
      pos = [GATE_MOUTH[0] - recoil, 0, GATE_MOUTH[2]];
      facingY = FACE_GATE;
      armPose = "recoil";
      headTilt = 0.22;
      break;
    }
    case "released":
      pos = [GATE_MOUTH[0], 0, GATE_MOUTH[2]];
      facingY = FACE_GATE;
      armPose = "hang";
      headTilt = 0.05;
      break;
    case "filing": {
      const wp = walkPath(bench, 1 - tLocal / FILE_S);
      pos = [wp.x, 0, wp.z];
      facingY = Math.atan2(-wp.fx, -wp.fz);
      armPose = "hang";
      walkAmt = 0.9;
      break;
    }
    case "revoked":
      armPose = "dead";
      headTilt = 0.45;
      break;
  }

  const out: WorkerMotion = {
    phase,
    ageS,
    pos,
    facingY,
    armPose,
    headTilt,
    walkAmt,
    eyeOn: phase !== "revoked",
    packet,
  };
  return out;
}

/* ---------- shared per-frame bookkeeping ---------- */

const enteredAt = new Map<string, number>();
const frozenPos = new Map<string, [number, number, number]>();

/** Call once per frame with the current worker list. Tracks
 *  first-appearance (entrance slide) and freezes revoked workers in
 *  place — the log has no exit event, so nothing animates away. */
export function trackWorkers(workers: VizWorker[], nowMs: number): void {
  for (const w of workers) {
    if (!enteredAt.has(w.workerId)) enteredAt.set(w.workerId, nowMs);
  }
  for (const id of [...enteredAt.keys()]) {
    if (!workers.some((w) => w.workerId === id)) {
      enteredAt.delete(id);
      frozenPos.delete(id);
      lastKey.delete(id);
      originAt.delete(id);
    }
  }
}

/** Stage position: motion pos, with the entrance slide for newcomers
 *  and the in-place freeze for revoked workers. */
export function stagePos(
  w: VizWorker,
  index: number,
  proposals: VizProposal[],
  receipts: VizReceipt[],
  nowMs: number
): [number, number, number] {
  const m = getMotion(w, index, proposals, receipts, nowMs);
  if (m.phase === "revoked") {
    return frozenPos.get(w.workerId) ?? m.pos;
  }
  frozenPos.set(w.workerId, m.pos);
  const t0 = enteredAt.get(w.workerId);
  if (t0 != null && nowMs - t0 < ENTER_S * 1000) {
    const k = easeOutCubic((nowMs - t0) / (ENTER_S * 1000));
    const bench = benchPos(index, w.workerId);
    return [-8.5 + (bench[0] + 8.5) * k, 0, bench[2]];
  }
  return m.pos;
}

/** True when the worker spoke recently (last 4 speeches): lift the head. */
export function hasRecentSpeech(
  workerId: string,
  speeches: Array<{ workerId: string }>
): boolean {
  return speeches.slice(-4).some((s) => s.workerId === workerId);
}
