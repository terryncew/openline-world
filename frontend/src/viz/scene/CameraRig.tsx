/**
 * OpenLine World visualization — camera rig.
 * frontend/src/viz/scene/CameraRig.tsx
 *
 * Gentle eased camera, no WASD. Views: World / Follow worker / Focus
 * receiver / Records. The rig also takes a focus hint derived from the
 * latest event kind (proposal -> gate, decision -> gate hold, receipt ->
 * ease back), but an explicit user view selection always wins.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VizWorker } from "../protocol";
import { workerHome } from "./layout";
import { GATE_FOCUS } from "./ProposalPackets";

export type VizCameraView = "world" | "worker" | "receiver" | "records";

const WORLD_POS: [number, number, number] = [0, 9.5, 15];
const WORLD_TGT: [number, number, number] = [1.2, 0.8, 0];
const RECEIVER_POS: [number, number, number] = [11.5, 4.5, 7.5];
const RECORDS_POS: [number, number, number] = [14.5, 6, -6];
const RECORDS_TGT: [number, number, number] = [10.5, 0.5, 0];

export function CameraRig({
  view,
  workers,
  followWorkerId,
  focusHint,
}: {
  view: VizCameraView;
  workers: VizWorker[];
  followWorkerId: string | null;
  /** "gate" | "world" | null — derived from latest event; user view wins */
  focusHint: "gate" | "world" | null;
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
    let p: [number, number, number] = WORLD_POS;
    let g: [number, number, number] = WORLD_TGT;

    if (view === "receiver" || (view === "world" && focusHint === "gate")) {
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
