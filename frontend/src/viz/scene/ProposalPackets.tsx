/**
 * OpenLine World visualization — proposal packets.
 * frontend/src/viz/scene/ProposalPackets.tsx
 *
 * The packet is the CLAIM (agent-reported) — it carries the worker's
 * proposal to the receiver, in the claim color, and it never decides
 * anything by itself.
 *
 * In-flight packets are one instanced mesh arcing worker → gate, looping
 * while they wait. A packet resolves ONLY when a real decision event
 * lands in state; decided packets render as individual meshes (few at a
 * time) playing their 1.6s verdict animation:
 *   allowed — the packet passes the threshold and fades on the far side.
 *   stopped — the packet halts AT the threshold plane, shudders, and
 *             dissolves in place.
 * Nothing crosses the gate on animation alone.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hashStr, type VizProposal, type VizWorker } from "../protocol";
import { GATE_X, GATE_Z, proposalArc, workerHome } from "./layout";

/** Claim color: agent-reported. Cool slate — visibly not authority. */
export const CLAIM_COLOR = new THREE.Color("#7fa8c9");

/**
 * Verdict play-out for one decided packet. The 1.6s animation restarts
 * whenever the decided set changes (new decision live, or scrub/replay
 * moving the cursor) — driven by sceneKey, not mount time, so scrubbing
 * to a verdict replays its moment instead of showing a stale clock.
 */
function DecidedPacket({
  proposal,
  from,
  index,
  sceneKey,
  onSelect,
}: {
  proposal: VizProposal;
  from: [number, number, number];
  index: number;
  sceneKey: string;
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const t0 = useRef(performance.now() / 1000);
  const lastKey = useRef(sceneKey);
  if (lastKey.current !== sceneKey) {
    lastKey.current = sceneKey;
    t0.current = performance.now() / 1000;
  }

  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const age = performance.now() / 1000 - t0.current;
    if (age > 1.6) {
      m.visible = false;
      return;
    }
    m.visible = true;
    const k = age / 1.6;
    if (proposal.status === "allowed") {
      const pos = proposalArc(from, Math.min(1, k * 1.15));
      m.position.set(pos[0] + Math.max(0, k - 0.75) * 8, pos[1], pos[2]);
      m.scale.setScalar(Math.max(0.0001, 1 - k * 0.9));
    } else {
      // stopped: halt AT the threshold plane, shudder, dissolve in place.
      // The refusal happens at the gate, in frame — the packet never drifts
      // back out of the close-up.
      const shudder = Math.sin(Math.min(1, k) * Math.PI * 3) * 0.035 * (1 - k);
      const pos = proposalArc(from, Math.max(0.9, 0.97 - shudder));
      m.position.set(...pos);
      m.scale.setScalar(Math.max(0.0001, 1 - Math.max(0, k - 0.35) * 1.4));
    }
    m.rotation.set(age * 1.4 + index, age * 1.1, 0);
  });

  return (
    <mesh
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(proposal.id);
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <octahedronGeometry args={[0.45]} />
      <meshBasicMaterial color={CLAIM_COLOR} toneMapped={false} transparent opacity={0.92} />
    </mesh>
  );
}

export function ProposalPackets({
  proposals,
  workers,
  onSelect,
  homeFn = workerHome,
}: {
  proposals: VizProposal[];
  workers: VizWorker[];
  onSelect: (id: string | null) => void;
  /** Override worker positioning (authority-view staging). */
  homeFn?: (index: number, workerId: string) => [number, number, number];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const workerIndex = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.workerId, i));
    return m;
  }, [workers]);

  const inFlight = useMemo(() => proposals.filter((p) => p.status === "in-flight"), [proposals]);
  const decided = useMemo(() => proposals.filter((p) => p.status !== "in-flight"), [proposals]);
  // changes when the decided set changes: new verdict, or scrub/replay
  const decidedKey = useMemo(
    () => decided.map((p) => `${p.id}:${p.status}`).join("|"),
    [decided]
  );
  const n = inFlight.length;

  const homes = useMemo(
    () =>
      inFlight.map((p) => {
        const wi = workerIndex.get(p.workerId);
        return wi == null ? ([0, 0, 0] as [number, number, number]) : homeFn(wi, p.workerId);
      }),
    [inFlight, workerIndex, homeFn]
  );
  const decidedHomes = useMemo(
    () =>
      decided.map((p) => {
        const wi = workerIndex.get(p.workerId);
        return wi == null ? ([0, 0, 0] as [number, number, number]) : homeFn(wi, p.workerId);
      }),
    [decided, workerIndex, homeFn]
  );
  const phases = useMemo(
    () => inFlight.map((p) => (hashStr(p.id) % 1000) / 1000),
    [inFlight]
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);

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
  }, [n, homes, dummy]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || n === 0) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const from = homes[i];
      // waiting on the receiver: loop the arc, pulsing
      const tt = (t * 0.28 + phases[i]) % 1;
      const pos = proposalArc(from, tt);
      dummy.position.set(...pos);
      dummy.scale.setScalar(0.85 + Math.sin(t * 5 + phases[i] * 9) * 0.18);
      dummy.rotation.set(t * 1.4 + i, t * 1.1, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {n > 0 && (
        <instancedMesh
          frustumCulled={false}
          ref={ref}
          args={[undefined, undefined, Math.max(n, 1)]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(inFlight[e.instanceId ?? 0]?.id ?? null);
          }}
          onPointerMissed={() => onSelect(null)}
        >
          <octahedronGeometry args={[0.3]} />
          <meshBasicMaterial toneMapped={false} transparent opacity={0.92} />
        </instancedMesh>
      )}
      {decided.map((p, i) => (
        <DecidedPacket
          key={`${p.id}:${p.status}`}
          proposal={p}
          from={decidedHomes[i]}
          index={i}
          sceneKey={decidedKey}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

/** Where the gate mouth is, for camera focus. */
export const GATE_FOCUS: [number, number, number] = [GATE_X, 1.5, GATE_Z];
