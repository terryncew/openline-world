/**
 * OpenLine World visualization — articulated worker figures.
 * frontend/src/viz/scene/WorkerFigures.tsx
 *
 * Small casts (<=8 workers) get handcrafted machine figures instead of
 * the instanced swarm: torso, head with eye light, and real shoulder /
 * elbow pivots. Every pose is driven by workerMotion (reducer state):
 * reading at the bench, assembling the packet, carrying it down the
 * lane, presenting it at the threshold, recoiling on STOP, settling on
 * ALLOW, walking back to file, powered down on revocation.
 *
 * Compact mechanical design, matte worker hues (wren teal, juniper
 * amber, others hash-derived) — gold is the owner's seal alone.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  workerHue,
  type VizProposal,
  type VizReceipt,
  type VizSpeech,
  type VizWorker,
} from "../protocol";
import { PAL } from "./VizCanvas";
import {
  getMotion,
  hasRecentSpeech,
  stagePos,
  trackWorkers,
  type ArmPose,
} from "./workerMotion";

const CLAIM_DIM = new THREE.Color("#5a6a7a");
const DARK_METAL = "#3a332a";

const ARM_ANGLES: Record<ArmPose, { sh: number; el: number }> = {
  hang: { sh: -0.08, el: -0.28 },
  read: { sh: -0.72, el: -0.55 },
  assemble: { sh: -0.95, el: -0.38 },
  carry: { sh: -0.82, el: -0.62 },
  present: { sh: -1.02, el: -0.28 },
  recoil: { sh: 0.18, el: -0.12 },
  dead: { sh: 0.02, el: -0.08 },
};

function Figure({
  worker,
  index,
  proposals,
  receipts,
  speeches,
  selected,
  onSelect,
}: {
  worker: VizWorker;
  index: number;
  proposals: VizProposal[];
  receipts: VizReceipt[];
  speeches: VizSpeech[];
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const shL = useRef<THREE.Group>(null);
  const shR = useRef<THREE.Group>(null);
  const elL = useRef<THREE.Group>(null);
  const elR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyeMat = useRef<THREE.MeshBasicMaterial>(null);

  const bodyColor = useMemo(() => {
    const c = new THREE.Color();
    c.setHSL(workerHue(worker.workerId), 0.42, worker.active ? 0.52 : 0.3);
    if (!worker.active) c.lerp(CLAIM_DIM, 0.55);
    return c;
  }, [worker.workerId, worker.active]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const nowMs = performance.now();
    const m = getMotion(worker, index, proposals, receipts, nowMs);
    const pos = stagePos(worker, index, proposals, receipts, nowMs);
    const g = root.current;
    if (!g) return;
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.y = m.facingY;
    g.scale.setScalar(selected ? 1.12 : 1);

    // walk + idle bob
    const bob =
      m.walkAmt > 0
        ? Math.abs(Math.sin(t * 7 + index)) * 0.05 * m.walkAmt
        : Math.sin(t * 1.6 + index * 2.1) * 0.03;
    g.position.y = pos[1] + bob;

    // legs: swing only while walking
    const swing = Math.sin(t * 7 + index) * 0.55 * m.walkAmt;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;

    // arms: pose targets, with a counter-swing while walking free-handed
    const a = ARM_ANGLES[m.armPose];
    const armSwing = m.walkAmt > 0 && m.armPose === "hang" ? Math.sin(t * 7 + index) * 0.18 : 0;
    if (shL.current) shL.current.rotation.x = a.sh + armSwing;
    if (shR.current) shR.current.rotation.x = a.sh - armSwing;
    if (elL.current) elL.current.rotation.x = a.el;
    if (elR.current) elR.current.rotation.x = a.el;

    // head: tilt from the pose; lift when the worker recently spoke
    const speaking = hasRecentSpeech(worker.workerId, speeches);
    if (head.current) head.current.rotation.x = speaking ? -0.18 : m.headTilt;

    // eye: bright while the mandate lives, dark when revoked
    if (eyeMat.current) eyeMat.current.color.set(m.eyeOn ? "#ffe9b8" : "#3c4148");
  });

  const select = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(worker.workerId);
  };

  return (
    <group ref={root}>
      {/* blob contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#4a3a24" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {/* legs */}
      {[-0.15, 0.15].map((x, i) => (
        <group key={x} ref={i === 0 ? legL : legR} position={[x, 0.52, 0]}>
          <mesh position={[0, -0.26, 0]}>
            <boxGeometry args={[0.16, 0.52, 0.18]} />
            <meshStandardMaterial color={DARK_METAL} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* torso */}
      <mesh position={[0, 0.95, 0]} onClick={select}>
        <capsuleGeometry args={[0.3, 0.42, 6, 14]} />
        <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.25} />
      </mesh>
      {/* brass collar */}
      <mesh position={[0, 1.24, 0]}>
        <torusGeometry args={[0.28, 0.055, 10, 24]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.65} />
      </mesh>
      {/* head + eye */}
      <group ref={head} position={[0, 1.5, 0]}>
        <mesh onClick={select}>
          <sphereGeometry args={[0.23, 20, 16]} />
          <meshStandardMaterial color={bodyColor} roughness={0.55} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.03, 0.19]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshBasicMaterial ref={eyeMat} color="#ffe9b8" toneMapped={false} />
        </mesh>
      </group>
      {/* arms: shoulder pivots + elbow pivots */}
      {[-0.38, 0.38].map((x, i) => (
        <group key={x} ref={i === 0 ? shL : shR} position={[x, 1.22, 0]}>
          <mesh position={[0, -0.21, 0]} onClick={select}>
            <boxGeometry args={[0.13, 0.42, 0.13]} />
            <meshStandardMaterial color={bodyColor} roughness={0.6} metalness={0.2} />
          </mesh>
          <group ref={i === 0 ? elL : elR} position={[0, -0.42, 0]}>
            <mesh position={[0, -0.2, 0]}>
              <boxGeometry args={[0.11, 0.4, 0.11]} />
              <meshStandardMaterial color={DARK_METAL} roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.44, 0]}>
              <sphereGeometry args={[0.09, 12, 10]} />
              <meshStandardMaterial color={DARK_METAL} roughness={0.7} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

export function WorkerFigures({
  workers,
  proposals,
  receipts,
  speeches,
  selectedId,
  onSelect,
}: {
  workers: VizWorker[];
  proposals: VizProposal[];
  receipts: VizReceipt[];
  speeches: VizSpeech[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  useFrame(() => {
    trackWorkers(workers, performance.now());
  });
  return (
    <group>
      {workers.map((w, i) => (
        <Figure
          key={w.workerId}
          worker={w}
          index={i}
          proposals={proposals}
          receipts={receipts}
          speeches={speeches}
          selected={selectedId === w.workerId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
