/**
 * OpenLine World visualization — worker swarm.
 * frontend/src/viz/scene/WorkerSwarm.tsx
 *
 * Instanced small machines: capsule body + eye light. One draw call for
 * bodies, one for eyes, at any count. Per-worker hue (wren teal, juniper
 * amber, others hash-derived) — matte body colors, never gold: gold is
 * the owner's seal alone. Revoked workers dim in place — the backend
 * emits no exit event, so nothing animates away.
 *
 * A newly admitted worker slides in from the west edge over ~1.1s
 * (entrance choreography keyed off first-appearance in state).
 *
 * Idle bobbing runs only for small crowds (<=128); beyond that the swarm
 * holds still and stays cheap.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hashStr, workerHue, type VizWorker } from "../protocol";
import { workerHome, VISITOR_POS, CRATE_POS } from "./layout";

const CLAIM_DIM = new THREE.Color("#5a6a7a");
/** Unadmitted figure: claimed presence, no authority. Cool gray — visibly
 *  not a worker hue, never gold (gold is the owner's seal alone). */
const VISITOR_TINT = new THREE.Color("#8b98a8");
/** Failed-reach choreography: 0.5s out, 0.3s hold, 0.7s back. */
const REACH_SECS = 1.5;

export function WorkerSwarm({
  workers,
  selectedId,
  onSelect,
  homeFn = workerHome,
  reachingWorkerId = null,
  onReachComplete,
}: {
  workers: VizWorker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Override worker positioning (authority-view staging). */
  homeFn?: (index: number, workerId: string) => [number, number, number];
  /** When set, this worker performs one mechanical reach toward the job
   *  crate and returns to neutral. Used only for the failed pre-grant
   *  attempt — the crate never moves, no receipt appears. */
  reachingWorkerId?: string | null;
  /** Scene-owned lifecycle: called exactly once when the reach
   *  choreography completes. */
  onReachComplete?: (workerId: string) => void;
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const eyeRef = useRef<THREE.InstancedMesh>(null);
  const n = workers.length;
  // entrance choreography: first-appearance wall-clock per worker
  const enteredAtRef = useRef(new Map<string, number>());
  // CP3 §3: inactive visitors get their own entrance clock; they slide in
  // and complete the entrance while still inactive (no authority implied)
  const visitorEnteredAtRef = useRef(new Map<string, number>());
  const nowS = () => performance.now() / 1000;
  const ENTER_SECS = 1.1;
  const ENTER_FROM_X = -8.5;
  const VISITOR_ENTER_SECS = 1.0;
  const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);

  const homes = useMemo(
    () =>
      workers.map((w, i) =>
        // Unadmitted figures stand at the visitor spot — present, no
        // standing — never in a worker home slot.
        w.admitted ? homeFn(i, w.workerId) : VISITOR_POS
      ),
    [workers, homeFn]
  );
  const phases = useMemo(
    () => workers.map((w) => (hashStr(w.workerId + ":bob") % 1000) / 1000 * Math.PI * 2),
    [workers]
  );

  const colors = useMemo(() => {
    const c = new THREE.Color();
    return workers.map((w) => {
      if (!w.admitted) return VISITOR_TINT.clone(); // claimed, not admitted
      c.setHSL(workerHue(w.workerId), 0.42, w.active ? 0.52 : 0.3);
      if (!w.active) c.lerp(CLAIM_DIM, 0.55);
      return c.clone();
    });
  }, [workers]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // failed-reach choreography: wall-clock start per trigger
  const reachT0Ref = useRef<number | null>(null);
  const reachForRef = useRef<string | null>(null);
  const reachDoneRef = useRef(false);
  const onReachCompleteRef = useRef(onReachComplete);
  onReachCompleteRef.current = onReachComplete;
  useLayoutEffect(() => {
    if (reachingWorkerId && reachForRef.current !== reachingWorkerId) {
      reachForRef.current = reachingWorkerId;
      reachT0Ref.current = nowS();
      reachDoneRef.current = false;
    } else if (!reachingWorkerId) {
      reachForRef.current = null;
      reachT0Ref.current = null;
      reachDoneRef.current = false;
    }
  }, [reachingWorkerId]);

  // track first-appearance; forget entries that leave state (scrub back)
  useLayoutEffect(() => {
    const t = nowS();
    const m = enteredAtRef.current;
    const vm = visitorEnteredAtRef.current;
    for (const w of workers) {
      if (!m.has(w.workerId)) m.set(w.workerId, t);
      if (!w.admitted && !vm.has(w.workerId)) vm.set(w.workerId, t);
    }
    for (const id of [...m.keys()]) {
      if (!workers.some((w) => w.workerId === id)) m.delete(id);
    }
    for (const id of [...vm.keys()]) {
      if (!workers.some((w) => w.workerId === id && !w.admitted)) vm.delete(id);
    }
  }, [workers]);

  /** Entrance slide: x lerps from the west edge to home over ENTER_SECS. */
  const enterK = (workerId: string): number => {
    const t0 = enteredAtRef.current.get(workerId);
    if (t0 == null) return 1;
    return Math.min(1, (nowS() - t0) / ENTER_SECS);
  };
  /** CP3 §3: visitor entrance progress 0..1. Unadmitted figures slide in
   *  to the visitor spot and complete the entrance while still inactive. */
  const visitorEnterK = (workerId: string): number => {
    const t0 = visitorEnteredAtRef.current.get(workerId);
    if (t0 == null) return 1;
    return Math.min(1, (nowS() - t0) / VISITOR_ENTER_SECS);
  };
  const enterX = (workerId: string, homeX: number): number => {
    const k = easeOutCubic(Math.max(0, enterK(workerId)));
    return ENTER_FROM_X + (homeX - ENTER_FROM_X) * k;
  };
  /** Visitor entrance: x lerps from the west edge to VISITOR_POS. */
  const visitorEnterX = (workerId: string): number => {
    const k = easeOutCubic(Math.max(0, visitorEnterK(workerId)));
    return ENTER_FROM_X + (VISITOR_POS[0] - ENTER_FROM_X) * k;
  };

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const eye = eyeRef.current;
    if (!body || !eye) return;
    for (let i = 0; i < n; i++) {
      dummy.position.set(enterX(workers[i].workerId, homes[i][0]), 0.62, homes[i][2]);
      dummy.rotation.set(0, (hashStr(workers[i].workerId) % 628) / 100, 0);
      dummy.scale.setScalar(selectedId === workers[i].workerId ? 1.18 : 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      body.setColorAt(i, colors[i]);
      // eye sits on the gate-facing side
      dummy.position.set(enterX(workers[i].workerId, homes[i][0]) + 0.28, 0.95, homes[i][2]);
      dummy.scale.setScalar(selectedId === workers[i].workerId ? 1.18 : 1);
      dummy.updateMatrix();
      eye.setMatrixAt(i, dummy.matrix);
      eye.setColorAt(i, workers[i].active
        ? new THREE.Color("#ffe9b8")
        : new THREE.Color("#3c4148"));
    }
    body.instanceMatrix.needsUpdate = true;
    eye.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (eye.instanceColor) eye.instanceColor.needsUpdate = true;
  }, [n, homes, colors, workers, selectedId, dummy, phases]);

  // gentle idle bob, small crowds only; plus the failed-reach choreography
  useFrame(({ clock }) => {
    if (n === 0 || n > 128) return;
    const body = bodyRef.current;
    const eye = eyeRef.current;
    if (!body || !eye) return;
    const t = clock.elapsedTime;
    // reach progress 0..1 (one-shot), or -1 when idle
    let reachK = -1;
    if (reachT0Ref.current != null && reachingWorkerId) {
      const age = nowS() - reachT0Ref.current;
      if (age < REACH_SECS) {
        reachK = age / REACH_SECS;
      } else if (!reachDoneRef.current) {
        // CP3 §2: full choreography complete — report once so the
        // lifecycle returns to false from the scene itself
        reachDoneRef.current = true;
        const doneId = reachingWorkerId;
        queueMicrotask(() => onReachCompleteRef.current?.(doneId));
      }
    }
    for (let i = 0; i < n; i++) {
      const isReaching =
        reachK >= 0 && workers[i].workerId === reachingWorkerId;
      if (!workers[i].active && !isReaching) continue;
      // CP3 §3: inactive visitors complete a visible entrance; the idle
      // bob stays gated on entrance completion so motion means arrival
      const vK = workers[i].admitted ? 1 : visitorEnterK(workers[i].workerId);
      const bob = vK >= 1 ? Math.sin(t * 1.6 + phases[i]) * 0.05 : 0;
      let x: number;
      let z: number;
      if (workers[i].admitted) {
        x = enterX(workers[i].workerId, homes[i][0]);
        z = homes[i][2];
      } else {
        x = visitorEnterX(workers[i].workerId);
        z = VISITOR_POS[2];
      }
      let lean = 0;
      if (reachK >= 0 && workers[i].workerId === reachingWorkerId) {
        // mechanical reach toward the crate: out, hold, back. The crate
        // never moves; no receipt appears; the worker returns to neutral.
        const out = Math.min(1, reachK / 0.33);
        const back = Math.max(0, (reachK - 0.53) / 0.47);
        const k = (out < 1 ? 1 - Math.pow(1 - out, 3) : 1) * (1 - back * back);
        const dx = CRATE_POS[0] - homes[i][0];
        const dz = CRATE_POS[2] - homes[i][2];
        const dist = Math.max(0.001, Math.hypot(dx, dz));
        x += (dx / dist) * 1.3 * k;
        z += (dz / dist) * 1.3 * k;
        lean = 0.35 * k;
      }
      dummy.position.set(x, 0.62 + bob, z);
      dummy.rotation.set(lean, (hashStr(workers[i].workerId) % 628) / 100, 0);
      dummy.scale.setScalar(selectedId === workers[i].workerId ? 1.18 : 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + 0.28, 0.95 + bob, z);
      dummy.updateMatrix();
      eye.setMatrixAt(i, dummy.matrix);
    }
    body.instanceMatrix.needsUpdate = true;
    eye.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  return (
    <group>
      <instancedMesh frustumCulled={false}
        ref={bodyRef}
        args={[undefined, undefined, Math.max(n, 1)]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(workers[e.instanceId ?? 0]?.workerId ?? null);
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <capsuleGeometry args={[0.34, 0.55, 6, 14]} />
        <meshStandardMaterial roughness={0.55} metalness={0.25} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={eyeRef} args={[undefined, undefined, Math.max(n, 1)]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
