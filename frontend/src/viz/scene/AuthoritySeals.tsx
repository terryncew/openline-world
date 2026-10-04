/**
 * OpenLine World visualization — authority seals.
 * frontend/src/viz/scene/AuthoritySeals.tsx
 *
 * One floating seal per mandate. The seal is OWNER-SIGNED standing: the
 * rule, not the worker. It must read at a glance as "the owner's thing":
 * large, warm gold, emissive, slowly rotating — materially unlike
 * anything the worker carries (matte machines), the claim packets
 * (slate-blue), or the receipts (stone green/red). Nothing else in the
 * scene uses gold.
 *
 * A thick gold tether runs from each live seal to the owner obelisk.
 * Revocation (real REVOKED mandate event only): the seal turns gray and
 * sinks to the ground over ~1s into a dead ring. A newly onboarded seal
 * descends from the obelisk's direction and locks above its worker.
 * Worker replacement never touches the seals of other mandates.
 *
 * All motion here is render-state choreography keyed off first-appearance
 * in state. The verdicts and standings are data; the animation is not.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VizAuthority, VizWorker } from "../protocol";
import { sealPos, workerHome } from "./layout";
import { OBELISK_ANCHOR } from "./OwnerObelisk";

const DESCENT_FROM: [number, number, number] = [-7.5, 6.5, -3.5];
const DESCENT_SECS = 1.2;
const SINK_SECS = 1.0;

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) =>
  k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

export function AuthoritySeals({
  authorities,
  workers,
  selectedMandate,
  onSelect,
  homeFn = workerHome,
}: {
  authorities: VizAuthority[];
  workers: VizWorker[];
  selectedMandate: string | null;
  onSelect: (mandateId: string | null) => void;
  /** Override worker positioning (authority-view staging). Defaults to
   *  the shared workerHome layout. */
  homeFn?: (index: number, workerId: string) => [number, number, number];
}) {
  const activeRef = useRef<THREE.InstancedMesh>(null);
  const revokedRef = useRef<THREE.InstancedMesh>(null);
  // one tube-tether mesh per live seal; transforms set per frame
  const tetherRefs = useRef<Array<THREE.Mesh | null>>([]);
  const upVec = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const anchorVec = useMemo(() => new THREE.Vector3(...OBELISK_ANCHOR), []);
  const dirVec = useMemo(() => new THREE.Vector3(), []);

  // wall-clock first-appearance, for descent/sink choreography only
  const bornAtRef = useRef(new Map<string, number>());
  const revokedAtRef = useRef(new Map<string, number>());

  const workerIndex = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.workerId, i));
    return m;
  }, [workers]);

  const active = useMemo(() => authorities.filter((a) => a.active), [authorities]);
  const revoked = useMemo(() => authorities.filter((a) => !a.active), [authorities]);

  const homeOf = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    for (const a of authorities) {
      const wi = workerIndex.get(a.workerId) ?? 0;
      const w = workers[wi];
      m.set(a.mandateId, w ? homeFn(wi, w.workerId) : ([0, 0, 0] as [number, number, number]));
    }
    return m;
  }, [authorities, workers, workerIndex, homeFn]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const nowS = () => performance.now() / 1000;

  // track first-appearance; forget entries that leave state (scrub back)
  useLayoutEffect(() => {
    const t = nowS();
    const born = bornAtRef.current;
    const died = revokedAtRef.current;
    for (const a of active) {
      if (!born.has(a.mandateId)) born.set(a.mandateId, t);
      died.delete(a.mandateId);
    }
    for (const a of revoked) {
      if (!died.has(a.mandateId)) died.set(a.mandateId, t);
      born.delete(a.mandateId);
    }
    for (const id of [...born.keys()]) {
      if (!active.some((a) => a.mandateId === id)) born.delete(id);
    }
    for (const id of [...died.keys()]) {
      if (!revoked.some((a) => a.mandateId === id)) died.delete(id);
    }
  }, [active, revoked]);

  // per-frame: animated seal positions (descent for newborn, sink for revoked)
  const animatedPos = (
    mandateId: string,
    target: [number, number, number],
    isActive: boolean,
    t: number,
    out: THREE.Vector3
  ): THREE.Vector3 => {
    if (isActive) {
      const b0 = bornAtRef.current.get(mandateId);
      const age = b0 == null ? 99 : t - b0;
      if (age < DESCENT_SECS) {
        const k = easeOutCubic(Math.max(0, age / DESCENT_SECS));
        out.set(
          DESCENT_FROM[0] + (target[0] - DESCENT_FROM[0]) * k,
          DESCENT_FROM[1] + (target[1] - DESCENT_FROM[1]) * k,
          DESCENT_FROM[2] + (target[2] - DESCENT_FROM[2]) * k
        );
        return out;
      }
      out.set(target[0], target[1] + Math.sin(t * 1.2) * 0.07, target[2]);
      return out;
    }
    const r0 = revokedAtRef.current.get(mandateId);
    const age = r0 == null ? 99 : t - r0;
    if (age < SINK_SECS) {
      const k = easeInOut(Math.max(0, age / SINK_SECS));
      out.set(target[0], 2.35 + (0.22 - 2.35) * k, target[2]);
      return out;
    }
    out.set(target[0], 0.22, target[2]);
    return out;
  };

  const tmpV = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const t = nowS();
    const aMesh = activeRef.current;
    const rMesh = revokedRef.current;
    if (aMesh && active.length <= 128) {
      for (let i = 0; i < active.length; i++) {
        const a = active[i];
        const home = homeOf.get(a.mandateId) ?? [0, 0, 0];
        const target = sealPos(home as [number, number, number], false);
        animatedPos(a.mandateId, target, true, t, tmpV);
        const b0 = bornAtRef.current.get(a.mandateId);
        const bornK = b0 == null ? 1 : Math.min(1, (t - b0) / DESCENT_SECS);
        dummy.position.copy(tmpV);
        dummy.rotation.set(Math.PI / 2.4, t * 0.5 + i, 0);
        dummy.scale.setScalar(
          (selectedMandate === a.mandateId ? 1.25 : 1) * (0.6 + 0.4 * easeOutCubic(Math.max(0, bornK)))
        );
        dummy.updateMatrix();
        aMesh.setMatrixAt(i, dummy.matrix);
        // tether tube: obelisk anchor -> live seal tip
        const tube = tetherRefs.current[i];
        if (tube) {
          dirVec.copy(tmpV).sub(anchorVec);
          const len = Math.max(0.001, dirVec.length());
          tube.position.copy(anchorVec).addScaledVector(dirVec, 0.5);
          tube.scale.set(1, len, 1);
          tube.quaternion.setFromUnitVectors(upVec, dirVec.normalize());
        }
      }
      aMesh.instanceMatrix.needsUpdate = true;
    }
    if (rMesh) {
      for (let i = 0; i < revoked.length; i++) {
        const a = revoked[i];
        const home = homeOf.get(a.mandateId) ?? [0, 0, 0];
        const target = sealPos(home as [number, number, number], true);
        animatedPos(a.mandateId, target, false, t, tmpV);
        dummy.position.copy(tmpV);
        dummy.rotation.set(Math.PI / 2.4, 0.4, 0);
        dummy.scale.setScalar(selectedMandate === a.mandateId ? 1.25 : 1);
        dummy.updateMatrix();
        rMesh.setMatrixAt(i, dummy.matrix);
      }
      rMesh.instanceMatrix.needsUpdate = true;
    }
  });

  const selectAt = (list: VizAuthority[], instanceId: number | undefined) =>
    onSelect(list[instanceId ?? 0]?.mandateId ?? null);

  return (
    <group>
      {active.length > 0 && (
        <instancedMesh frustumCulled={false}
          ref={activeRef}
          args={[undefined, undefined, Math.max(active.length, 1)]}
          onClick={(e) => {
            e.stopPropagation();
            selectAt(active, e.instanceId);
          }}
          onPointerMissed={() => onSelect(null)}
        >
          <torusGeometry args={[0.52, 0.17, 14, 32]} />
          <meshStandardMaterial
            color="#c9a227"
            emissive="#c9a227"
            emissiveIntensity={0.5}
            metalness={0.85}
            roughness={0.3}
          />
        </instancedMesh>
      )}
      {revoked.length > 0 && (
        <instancedMesh frustumCulled={false}
          ref={revokedRef}
          args={[undefined, undefined, Math.max(revoked.length, 1)]}
          onClick={(e) => {
            e.stopPropagation();
            selectAt(revoked, e.instanceId);
          }}
          onPointerMissed={() => onSelect(null)}
        >
          <torusGeometry args={[0.52, 0.17, 14, 32]} />
          <meshStandardMaterial color="#8b8f94" metalness={0.2} roughness={0.8} />
        </instancedMesh>
      )}
      {/* thick gold tethers: obelisk anchor -> live seal, updated per frame.
          Only the owner's seals get tethers; nothing the worker carries
          is ever tethered to the obelisk. */}
      {active.length <= 64 &&
        active.map((a, i) => (
          <mesh
            key={a.mandateId}
            ref={(m) => {
              tetherRefs.current[i] = m;
            }}
          >
            <cylinderGeometry args={[0.035, 0.035, 1, 6]} />
            <meshBasicMaterial color="#c9a227" transparent opacity={0.9} toneMapped={false} />
          </mesh>
        ))}
      {/* cut-tether stubs on the obelisk for revoked mandates: the rule was here */}
      {revoked.map((a) => (
        <mesh key={a.mandateId} position={[OBELISK_ANCHOR[0], 2.45, OBELISK_ANCHOR[2]]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial color="#8b8f94" />
        </mesh>
      ))}
    </group>
  );
}
