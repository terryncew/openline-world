/**
 * OpenLine World visualization — proposal packets.
 * frontend/src/viz/scene/ProposalPackets.tsx
 *
 * Instanced glowing packets arcing worker → gate along a curve. The packet
 * is the CLAIM (agent-reported) — it carries the worker's proposal to the
 * receiver, in the claim color, and it never decides anything by itself.
 *
 * In-flight: the packet loops along the arc, waiting. It resolves ONLY
 * when a real decision event lands in state:
 *   allowed — the packet passes the threshold and fades on the far side.
 *   stopped — the packet halts AT the threshold plane, rebounds, dissolves.
 * Nothing crosses the gate on animation alone.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hashStr, type VizProposal, type VizWorker } from "../protocol";
import { GATE_X, GATE_Z, proposalArc, workerHome } from "./layout";

/** Claim color: agent-reported. Cool slate — visibly not authority. */
export const CLAIM_COLOR = new THREE.Color("#7fa8c9");

const dummy = new THREE.Object3D();

export function ProposalPackets({
  proposals,
  workers,
  onSelect,
}: {
  proposals: VizProposal[];
  workers: VizWorker[];
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = proposals.length;
  // resolution animations already played out: proposal id -> true
  const doneRef = useRef(new Map<string, number>());

  const workerIndex = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.workerId, i));
    return m;
  }, [workers]);

  const homes = useMemo(
    () =>
      proposals.map((p) => {
        const wi = workerIndex.get(p.workerId);
        return wi == null ? ([0, 0, 0] as [number, number, number]) : workerHome(wi, p.workerId);
      }),
    [proposals, workerIndex]
  );
  const phases = useMemo(
    () => proposals.map((p) => (hashStr(p.id) % 1000) / 1000),
    [proposals]
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      mesh.setColorAt(i, CLAIM_COLOR);
      dummy.position.set(...homes[i]);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [n, homes]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || n === 0) return;
    const t = clock.elapsedTime;
    let dirty = false;
    for (let i = 0; i < n; i++) {
      const p = proposals[i];
      const from = homes[i];
      if (p.status === "in-flight") {
        // waiting on the receiver: loop the arc, pulsing
        const tt = (t * 0.28 + phases[i]) % 1;
        const pos = proposalArc(from, tt);
        dummy.position.set(...pos);
        dummy.scale.setScalar(0.85 + Math.sin(t * 5 + phases[i] * 9) * 0.18);
        dirty = true;
      } else {
        const start = doneRef.current.get(p.id);
        if (start == null) {
          doneRef.current.set(p.id, t);
          continue;
        }
        const age = t - start;
        if (age > 1.6) {
          dummy.scale.setScalar(0.0001);
          dummy.position.set(from[0], -5, from[2]); // parked below ground
        } else if (p.status === "allowed") {
          // through the gate, fading on the far side
          const k = age / 1.6;
          const pos = proposalArc(from, Math.min(1, k * 1.15));
          dummy.position.set(pos[0] + Math.max(0, k - 0.75) * 8, pos[1], pos[2]);
          dummy.scale.setScalar(Math.max(0.0001, 1 - k * 0.9));
        } else {
          // stopped: halt AT the threshold, rebound, dissolve
          const k = age / 1.6;
          const fwd = Math.min(0.985, k * 2.2);
          const back = Math.max(0, (k - 0.45) * 1.4);
          const tt = Math.max(0.15, fwd - back);
          const pos = proposalArc(from, tt);
          dummy.position.set(...pos);
          dummy.scale.setScalar(Math.max(0.0001, 1 - Math.max(0, k - 0.5) * 1.6));
        }
        dirty = true;
      }
      dummy.rotation.set(t * 1.4 + i, t * 1.1, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, Math.max(n, 1)]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(proposals[e.instanceId ?? 0]?.id ?? null);
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <octahedronGeometry args={[0.22]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.92} />
    </instancedMesh>
  );
}

/** Where the gate mouth is, for camera focus. */
export const GATE_FOCUS: [number, number, number] = [GATE_X, 1.5, GATE_Z];
