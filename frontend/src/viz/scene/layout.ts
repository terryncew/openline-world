/**
 * OpenLine World visualization — deterministic layout.
 * frontend/src/viz/scene/layout.ts
 *
 * Every position is a pure function of an id/index: replays lay out
 * identically, no Math.random anywhere. The gate sits east (+x), the owner
 * obelisk southwest, workers gather center-west, receipts arc behind the
 * gate.
 */
import { hashStr } from "../protocol";

export const GATE_X = 6.5;
export const GATE_Z = 0;

/** WORLD-AUTHORITY-001: the persistent job crate + ticket. Fixed, central —
 *  the thing the workers gather around and the history hangs from. */
export const CRATE_POS: [number, number, number] = [-1.2, 0, 3.4];

/** WORLD-AUTHORITY-001: the side table. A secondary surface for the
 *  unadmitted proposal — visible, but off the worker→gate work path. */
export const SIDE_TABLE_POS: [number, number, number] = [4.6, 0, 4.8];

/** WORLD-AUTHORITY-001: where a claimed-but-unadmitted worker stands.
 *  At the scene's edge, away from worker homes — present, no standing. */
export const VISITOR_POS: [number, number, number] = [3.2, 0, -3.4];

/** Worker home position: ring slots for the first few, then a deterministic
 *  spiral so 1000 workers still get unique, stable spots. */
export function workerHome(index: number, workerId: string): [number, number, number] {
  const h = hashStr(workerId) / 0xffffffff;
  if (index < 8) {
    const a = (index / 8) * Math.PI * 2 + 0.6;
    return [-2.2 + Math.cos(a) * 2.6, 0, 1.2 + Math.sin(a) * 2.2];
  }
  const ring = Math.floor((index - 8) / 24) + 1;
  const slot = (index - 8) % 24;
  const a = (slot / 24) * Math.PI * 2 + h * 0.5;
  const r = 4.2 + ring * 1.35;
  return [
    Math.max(-9, Math.min(2.5, -2.2 + Math.cos(a) * r)),
    0,
    1.2 + Math.sin(a) * r * 0.8,
  ];
}

/** Seal hover position: above its worker. */
export function sealPos(workerPos: [number, number, number], revoked: boolean): [number, number, number] {
  return [workerPos[0], revoked ? 0.22 : 2.35, workerPos[2]];
}

/** Receipt tablet slot in the records arc behind the gate. Rows grow with
 *  count; positions stable per index. */
export function receiptSlot(index: number): [number, number, number] {
  const perRow = 14;
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const x = GATE_X + 2.1 + row * 0.85;
  const z = -4.6 + col * 0.72;
  const y = 0.45 + (row % 3) * 0.12;
  return [x, y, z];
}

/** Point on the proposal arc from a worker to the gate mouth. */
export function proposalArc(
  from: [number, number, number],
  t: number
): [number, number, number] {
  const x0 = from[0], y0 = 1.15, z0 = from[2];
  const x1 = GATE_X - 0.4, y1 = 1.5, z1 = GATE_Z;
  const apex = 2.6 + Math.min(1.6, Math.hypot(x1 - x0, z1 - z0) * 0.12);
  const x = x0 + (x1 - x0) * t;
  const z = z0 + (z1 - z0) * t;
  const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * apex * 0.45;
  return [x, y, z];
}
