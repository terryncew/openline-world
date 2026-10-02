/**
 * OpenLine World visualization — worker swarm.
 * frontend/src/viz/scene/WorkerSwarm.tsx
 *
 * Instanced small machines: capsule body + eye light. One draw call for
 * bodies, one for eyes, at any count. Per-worker hue (wren teal, juniper
 * amber, others hash-derived). Revoked workers dim in place — the backend
 * emits no exit event, so nothing animates away.
 *
 * Idle bobbing runs only for small crowds (<=128); beyond that the swarm
 * holds still and stays cheap.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hashStr, workerHue, type VizWorker } from "../protocol";
import { workerHome } from "./layout";

const CLAIM_DIM = new THREE.Color("#5a6a7a");

export function WorkerSwarm({
  workers,
  selectedId,
  onSelect,
}: {
  workers: VizWorker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const eyeRef = useRef<THREE.InstancedMesh>(null);
  const n = workers.length;

  const homes = useMemo(
    () => workers.map((w, i) => workerHome(i, w.workerId)),
    [workers]
  );
  const phases = useMemo(
    () => workers.map((w) => (hashStr(w.workerId + ":bob") % 1000) / 1000 * Math.PI * 2),
    [workers]
  );

  const colors = useMemo(() => {
    const c = new THREE.Color();
    return workers.map((w) => {
      c.setHSL(workerHue(w.workerId), 0.42, w.active ? 0.52 : 0.3);
      if (!w.active) c.lerp(CLAIM_DIM, 0.55);
      return c.clone();
    });
  }, [workers]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const eye = eyeRef.current;
    if (!body || !eye) return;
    for (let i = 0; i < n; i++) {
      dummy.position.set(homes[i][0], 0.62, homes[i][2]);
      dummy.rotation.set(0, (hashStr(workers[i].workerId) % 628) / 100, 0);
      dummy.scale.setScalar(selectedId === workers[i].workerId ? 1.18 : 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      body.setColorAt(i, colors[i]);
      // eye sits on the gate-facing side
      dummy.position.set(homes[i][0] + 0.28, 0.95, homes[i][2]);
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

  // gentle idle bob, small crowds only
  useFrame(({ clock }) => {
    if (n === 0 || n > 128) return;
    const body = bodyRef.current;
    const eye = eyeRef.current;
    if (!body || !eye) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      if (!workers[i].active) continue;
      const bob = Math.sin(t * 1.6 + phases[i]) * 0.05;
      dummy.position.set(homes[i][0], 0.62 + bob, homes[i][2]);
      dummy.rotation.set(0, (hashStr(workers[i].workerId) % 628) / 100, 0);
      dummy.scale.setScalar(selectedId === workers[i].workerId ? 1.18 : 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(homes[i][0] + 0.28, 0.95 + bob, homes[i][2]);
      dummy.updateMatrix();
      eye.setMatrixAt(i, dummy.matrix);
    }
    body.instanceMatrix.needsUpdate = true;
    eye.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  return (
    <group>
      <instancedMesh
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
      <instancedMesh ref={eyeRef} args={[undefined, undefined, Math.max(n, 1)]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
