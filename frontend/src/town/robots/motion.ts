/** Pure deterministic pose math shared by the town actors and Node tests. */
import { loop, pulse, bump, tremor, gait, track, d } from "../acting.ts";

export const CARRIER_LOOP = 16;

export interface CarrierPose {
  rootX: number;
  rootY: number;
  lean: number;
  rock: number;
  turnY: number;
  armSwing: number;
  armSide: number;
  grip: number;
  legL: number;
  legR: number;
  headTilt: number;
  timberX: number;
  timberY: number;
  timberSway: number;
}

export function carrierPoseAt(t: number, sx: 1 | -1): CarrierPose {
  const T = loop(t, CARRIER_LOOP);
  const travel = track([[0, 0], [5.4, 0], [6.2, 0.08], [8.8, 0.92], [9.4, 1], [16, 1]], T);
  const rootX = (-1.15 + 2.3 * travel) * sx;
  const walking = T > 5.4 && T < 9.4;
  const gaitPh = gait(T, 5.4, 9.4, 3);
  const crouch =
    pulse(T, 1.0, 2.0, 4.2, 5.0, 0.26) +
    pulse(T, 9.0, 9.6, 10.2, 11.0, 0.3);
  const lifting = T > 3.0 && T < 4.8;

  return {
    rootX,
    rootY: -crouch + (walking ? Math.abs(gaitPh) * 0.03 : 0),
    lean:
      pulse(T, 1.0, 2.0, 2.6, 3.2, d(16)) +
      pulse(T, 3.2, 4.0, 4.4, 5.2, d(-10)) +
      (walking ? d(4) : 0) +
      pulse(T, 9.0, 9.6, 10.2, 11.0, d(14)),
    rock: walking ? gaitPh * d(4) : 0,
    turnY:
      (Math.PI / 2) * sx +
      track([[0, 0], [12.5, 0], [14.2, Math.PI * sx], [16, Math.PI * sx]], T),
    armSwing:
      pulse(T, 1.0, 2.2, 2.8, 3.4, d(-38)) +
      pulse(T, 3.4, 4.4, 8.6, 9.4, d(-52)) +
      pulse(T, 9.4, 10.0, 10.6, 11.4, d(-30)) +
      bump(T, 11.4, 13.0, d(18)),
    armSide: d(24),
    grip: pulse(T, 2.4, 3.0, 10.6, 11.4, 1),
    legL: walking ? gaitPh * d(22) : 0,
    legR: walking ? -gaitPh * d(22) : 0,
    headTilt:
      pulse(T, 1.0, 2.0, 2.8, 3.4, d(10)) +
      (lifting ? tremor(T, d(1.2)) : 0),
    timberX: (-1.15 + 2.3 * travel) * sx,
    timberY:
      0.26 +
      0.3 * travel +
      pulse(T, 3.2, 4.2, 8.8, 9.8, 0.54 - 0.3 * travel) +
      (lifting ? tremor(T, 0.012) : 0),
    timberSway: walking ? gait(T + 0.35, 5.4, 9.4, 3) * d(3) : 0,
  };
}

export const CRANK_CENTER: [number, number, number] = [0.95, 1.02, 0];
export const CRANK_RADIUS = 0.2;
export const CRANK_HANDLE_Z = 0.08;

/** World-space center shared by the rendered crank handle and gripping hand. */
export function crankHandleAt(theta: number): [number, number, number] {
  return [
    CRANK_CENTER[0],
    CRANK_CENTER[1] + Math.cos(theta) * CRANK_RADIUS - Math.sin(theta) * CRANK_HANDLE_Z,
    CRANK_CENTER[2] + Math.sin(theta) * CRANK_RADIUS + Math.cos(theta) * CRANK_HANDLE_Z,
  ];
}
