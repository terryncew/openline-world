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
 *
 * Motion stays slow and damped; nothing here can nauseate.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VizWorker } from "../protocol";
import { workerHome } from "./layout";
import { GATE_FOCUS } from "./ProposalPackets";
import { VIZ_SMALL_SCREEN } from "./VizCanvas";

export type VizCameraView = "world" | "worker" | "receiver" | "records";

/** Bench-driven close-ups. Null = rest at the view framing. */
export type VizCloseup = "gate" | "replacement" | null;

const WORLD_POS: [number, number, number] = [0, 9.5, 15];
const WORLD_TGT: [number, number, number] = [1.2, 0.8, 0];
/* Portrait: its own authored framing, not a narrowed desktop shot —
 * a medium shot of the consequential core: gate mouth, cream lane,
 * archive rack. Same world state, different composition. */
const WORLD_POS_PORTRAIT: [number, number, number] = [-1.5, 5.5, 8.5];
const WORLD_TGT_PORTRAIT: [number, number, number] = [7.5, 0.8, -0.5];
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

export function CameraRig({
  view,
  workers,
  followWorkerId,
  closeup,
}: {
  view: VizCameraView;
  workers: VizWorker[];
  followWorkerId: string | null;
  /** Bench-driven close-up; only applies when view === "world". */
  closeup: VizCloseup;
}) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(...WORLD_TGT));
  const posGoal = useRef(new THREE.Vector3(...WORLD_POS));
  const tgtGoal = useRef(new THREE.Vector3(...WORLD_TGT));

  const workerIndex = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.workerId, i));
    return m;
  }, [workers]);

  useFrame((_, dt) => {
    const dtc = Math.min(dt, 0.05);
    const worldPos = VIZ_SMALL_SCREEN ? WORLD_POS_PORTRAIT : WORLD_POS;
    const worldTgt = VIZ_SMALL_SCREEN ? WORLD_TGT_PORTRAIT : WORLD_TGT;
    let p: [number, number, number] = worldPos;
    let g: [number, number, number] = worldTgt;

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
    }
    posGoal.current.set(...p);
    tgtGoal.current.set(...g);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, posGoal.current.x, 2.2, dtc);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, posGoal.current.y, 2.2, dtc);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, posGoal.current.z, 2.2, dtc);
    target.current.x = THREE.MathUtils.damp(target.current.x, tgtGoal.current.x, 2.2, dtc);
    target.current.y = THREE.MathUtils.damp(target.current.y, tgtGoal.current.y, 2.2, dtc);
    target.current.z = THREE.MathUtils.damp(target.current.z, tgtGoal.current.z, 2.2, dtc);
    camera.lookAt(target.current);
  });

  return null;
}
