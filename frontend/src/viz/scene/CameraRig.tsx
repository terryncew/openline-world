/**
 * OpenLine World visualization — camera rig.
 * frontend/src/viz/scene/CameraRig.tsx
 *
 * Gentle eased camera, no WASD. Views: World / Follow worker / Focus
 * receiver / Records. An explicit user view selection always wins; when
 * the view is "world", the timeline may hand the rig a close-up:
 *
 *   "gate"        — a proposal is in flight or a verdict just landed.
 *                   The camera dollies close to the gate mouth so the
 *                   packet, the threshold, and the verdict flash fill
 *                   the frame. This is the consequential moment; it
 *                   must be impossible to miss, even on a phone.
 *   "replacement" — the worker-replacement payoff: a medium shot
 *                   framing the dimmed old worker + dead seal, the new
 *                   worker + bright seal, and the records arc.
 *   "work"        — an authorized worker at the bench: frames the
 *                   workbench, the active worker, and the persistent job.
 *                   Used when authority is granted or a consequence is
 *                   allowed — the work itself takes focus, not the gate.
 *
 * Motion stays slow and damped; nothing here can nauseate.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VizWorker } from "../protocol";
import { workerHome } from "./layout";
import { GATE_FOCUS } from "./ProposalPackets";

export type VizCameraView = "world" | "worker" | "receiver" | "records";

/** Timeline-driven close-ups. Null = rest at the view framing. */
export type VizCloseup = "gate" | "replacement" | "work" | null;

const WORLD_POS: [number, number, number] = [0, 9.5, 15];
const WORLD_TGT: [number, number, number] = [1.2, 0.8, 0];
/** Authored portrait framing: pulled back and raised so the east-west
 *  spread (obelisk → gate) stays readable on narrow screens. Not a
 *  narrowed desktop camera — a different authored position. */
const PORTRAIT_POS: [number, number, number] = [-0.5, 13, 21];
const PORTRAIT_TGT: [number, number, number] = [-0.8, 0.8, 0.2];
const PORTRAIT_FOV = 58;
const RECEIVER_POS: [number, number, number] = [11.5, 4.5, 7.5];
const RECORDS_POS: [number, number, number] = [14.5, 6, -6];
const RECORDS_TGT: [number, number, number] = [10.5, 0.5, 0];

/* Gate close-up: on the packet's approach axis (west), looking straight
 * at the gate mouth. The packet flies toward the viewer, halts at the
 * threshold, and the verdict flash ring faces the camera. FOV 42 at ~6.3
 * units gives ~4.8 vertical units — the gate (3.6 tall) dominates the
 * frame without cropping the flash. */
const GATE_CLOSEUP_POS: [number, number, number] = [0.2, 2.5, 0.8];
const GATE_CLOSEUP_TGT: [number, number, number] = [6.5, 1.4, 0];

/* Replacement payoff: medium shot spanning the workers (west) and the
 * records arc behind the gate (east). */
const REPLACEMENT_POS: [number, number, number] = [4.2, 5.4, 10.8];
const REPLACEMENT_TGT: [number, number, number] = [2.6, 0.9, 1.0];

/* Work close-up: the bench and the worker. Frames the workbench
 * (at [-1.2,0,3.4]) and the worker ring around [-2.2,0,1.2] — the
 * active worker, the persistent job, and the bench in one shot.
 * Pulled back enough that the worker doesn't fill the frame. */
const WORK_POS: [number, number, number] = [-2.5, 6.5, 13.5];
const WORK_TGT: [number, number, number] = [-1.8, 0.7, 2.0];

export function CameraRig({
  view,
  workers,
  followWorkerId,
  closeup,
  portrait = false,
  onCameraSettled,
}: {
  view: VizCameraView;
  workers: VizWorker[];
  followWorkerId: string | null;
  /** Timeline-driven close-up; only applies when view === "world". */
  closeup: VizCloseup;
  /** Authored portrait framing for narrow screens. */
  portrait?: boolean;
  /** Scene-owned (CP3 §4): called when no required closeup is active and
   *  camera position + look target are within authored framing tolerance. */
  onCameraSettled?: () => void;
}) {
  const { camera } = useThree();
  const basePos = portrait ? PORTRAIT_POS : WORLD_POS;
  const baseTgt = portrait ? PORTRAIT_TGT : WORLD_TGT;
  const target = useRef(new THREE.Vector3(...baseTgt));
  const posGoal = useRef(new THREE.Vector3(...basePos));
  const tgtGoal = useRef(new THREE.Vector3(...baseTgt));
  // CP3 §4: scene-owned camera settle state
  const camSettledRef = useRef(false);
  const onCameraSettledRef = useRef(onCameraSettled);
  onCameraSettledRef.current = onCameraSettled;

  const workerIndex = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.workerId, i));
    return m;
  }, [workers]);

  useFrame((_, dt) => {
    const dtc = Math.min(dt, 0.05);
    // Authored portrait framing includes a wider fov; the desktop camera
    // keeps the canvas default.
    const cam = camera as THREE.PerspectiveCamera;
    const wantFov = portrait ? PORTRAIT_FOV : 42;
    if (Math.abs(cam.fov - wantFov) > 0.01) {
      cam.fov = wantFov;
      cam.updateProjectionMatrix();
    }
    let p: [number, number, number] = basePos;
    let g: [number, number, number] = baseTgt;

    if (view === "receiver") {
      p = RECEIVER_POS;
      g = GATE_FOCUS;
    } else if (view === "records") {
      p = RECORDS_POS;
      g = RECORDS_TGT;
    } else if (view === "worker" && followWorkerId) {
      const wi = workerIndex.get(followWorkerId) ?? 0;
      const home = workerHome(wi, followWorkerId);
      p = [home[0] + 3.5, 3.2, home[2] + 5.5];
      g = [home[0], 1.1, home[2]];
    } else if (view === "world" && closeup === "gate") {
      p = GATE_CLOSEUP_POS;
      g = GATE_CLOSEUP_TGT;
    } else if (view === "world" && closeup === "replacement") {
      p = REPLACEMENT_POS;
      g = REPLACEMENT_TGT;
    } else if (view === "world" && closeup === "work") {
      p = WORK_POS;
      g = WORK_TGT;
    }
    posGoal.current.set(...p);
    tgtGoal.current.set(...g);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, posGoal.current.x, 8.0, dtc);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, posGoal.current.y, 8.0, dtc);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, posGoal.current.z, 8.0, dtc);
    target.current.x = THREE.MathUtils.damp(target.current.x, tgtGoal.current.x, 8.0, dtc);
    target.current.y = THREE.MathUtils.damp(target.current.y, tgtGoal.current.y, 8.0, dtc);
    target.current.z = THREE.MathUtils.damp(target.current.z, tgtGoal.current.z, 8.0, dtc);
    camera.lookAt(target.current);
    // CP3 §4: settled when no required closeup is active and the camera is
    // within authored framing tolerance. Damp never exactly reaches the
    // goal; 0.02 world-units is well inside the legible band.
    const noCloseup = !(view === "world" && closeup !== null);
    const settled =
      noCloseup &&
      camera.position.distanceTo(posGoal.current) < 0.02 &&
      target.current.distanceTo(tgtGoal.current) < 0.02;
    if (settled && !camSettledRef.current) {
      camSettledRef.current = true;
      queueMicrotask(() => onCameraSettledRef.current?.());
    } else if (!settled && camSettledRef.current) {
      camSettledRef.current = false;
    }
  });

  return null;
}
