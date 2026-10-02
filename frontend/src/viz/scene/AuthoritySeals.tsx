/**
 * OpenLine World visualization — authority seals.
 * frontend/src/viz/scene/AuthoritySeals.tsx
 *
 * One floating brass seal per active mandate, hovering above its worker —
 * visibly separate from the machine, tethered to the owner obelisk. This
 * is the owner-signed standing: the rule, not the worker.
 *
 * Revocation (real REVOKED mandate event only): the seal turns gray, sinks
 * to the ground, and its tether is cut. Worker replacement never touches
 * the seals of other mandates: history stays where it was.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VizAuthority, VizWorker } from "../protocol";
import { sealPos, workerHome } from "./layout";
import { OBELISK_ANCHOR, Tether } from "./OwnerObelisk";

const OWNER_GOLD = new THREE.Color("#c9a227");
const REVOKED_GRAY = new THREE.Color("#8b8f94");

export function AuthoritySeals({
  authorities,
  workers,
  selectedMandate,
  onSelect,
}: {
  authorities: VizAuthority[];
  workers: VizWorker[];
  selectedMandate: string | null;
  onSelect: (mandateId: string | null) => void;
}) {
  const sealRef = useRef<THREE.InstancedMesh>(null);
  const n = authorities.length;

  const workerIndex = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.workerId, i));
    return m;
  }, [workers]);

  const positions = useMemo(
    () =>
      authorities.map((a) => {
        const wi = workerIndex.get(a.workerId) ?? 0;
        const w = workers[wi];
        const home = w ? workerHome(wi, w.workerId) : ([0, 0, 0] as [number, number, number]);
        return sealPos(home, !a.active);
      }),
    [authorities, workers, workerIndex]
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = sealRef.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      const a = authorities[i];
      dummy.position.set(...positions[i]);
      dummy.rotation.set(Math.PI / 2.4, 0, 0);
      dummy.scale.setScalar(selectedMandate === a.mandateId ? 1.25 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, a.active ? OWNER_GOLD : REVOKED_GRAY);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [n, authorities, positions, selectedMandate, dummy]);

  // slow spin for active seals, small crowds only
  useFrame(({ clock }) => {
    if (n === 0 || n > 128) return;
    const mesh = sealRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      if (!authorities[i].active) continue;
      dummy.position.set(positions[i][0], positions[i][1] + Math.sin(t * 1.2 + i) * 0.07, positions[i][2]);
      dummy.rotation.set(Math.PI / 2.4, t * 0.5 + i, 0);
      dummy.scale.setScalar(selectedMandate === authorities[i].mandateId ? 1.25 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  return (
    <group>
      <instancedMesh
        ref={sealRef}
        args={[undefined, undefined, Math.max(n, 1)]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(authorities[e.instanceId ?? 0]?.mandateId ?? null);
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <torusGeometry args={[0.34, 0.11, 12, 28]} />
        <meshStandardMaterial roughness={0.35} metalness={0.7} />
      </instancedMesh>
      {/* tethers: active seals only, and only when few enough to stay cheap */}
      {n <= 64 &&
        authorities.map((a, i) =>
          a.active ? (
            <Tether
              key={a.mandateId}
              to={[positions[i][0], positions[i][1], positions[i][2]]}
            />
          ) : null
        )}
      {/* cut-tether stubs on the obelisk for revoked mandates: the rule was here */}
      {authorities
        .filter((a) => !a.active)
        .map((a) => (
          <mesh key={a.mandateId} position={[OBELISK_ANCHOR[0], 2.45, OBELISK_ANCHOR[2]]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshBasicMaterial color="#8b8f94" />
          </mesh>
        ))}
    </group>
  );
}
