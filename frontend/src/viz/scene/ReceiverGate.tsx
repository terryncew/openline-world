/**
 * OpenLine World visualization — the receiver gate.
 * frontend/src/viz/scene/ReceiverGate.tsx
 *
 * A stable stone gate: two pillars + a lintel. The receiver is the thing
 * that decides whether a consequence happens. Nothing passes the threshold
 * plane without a real decision event:
 *   ALLOWED  — the lintel lifts, a green ripple runs on the far side.
 *   STOPPED  — the packet halts at the threshold and rebounds (see
 *              ProposalPackets); a red ring marks the refusal.
 *
 * The flash and lintel react only to decision events already in state —
 * animation timing is visual, the verdict is data.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VizProposal } from "../protocol";
import { GATE_X, GATE_Z } from "./layout";

const ALLOW_GREEN = "#3f9e63";
const STOP_RED = "#b03a2e";

export function ReceiverGate({
  proposals,
  onSelectGate,
}: {
  proposals: VizProposal[];
  onSelectGate?: () => void;
}) {
  const lintelRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const lastDecision = useMemo(() => {
    const decided = proposals
      .filter((p) => p.status !== "in-flight" && p.decisionSeq != null)
      .sort((a, b) => (b.decisionSeq ?? 0) - (a.decisionSeq ?? 0))[0];
    return decided ?? null;
  }, [proposals]);
  const flashStart = useRef(-1);
  const seenDecisionSeq = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const seq = lastDecision?.decisionSeq ?? null;
    if (seq !== seenDecisionSeq.current) {
      seenDecisionSeq.current = seq;
      flashStart.current = t;
    }
    // lintel: lifts briefly on a real ALLOWED, otherwise rests
    const liftTarget =
      lastDecision?.status === "allowed" && t - flashStart.current < 4 ? 0.9 : 0;
    const lintel = lintelRef.current;
    if (lintel) {
      lintel.position.y = THREE.MathUtils.damp(lintel.position.y, 3.35 + liftTarget, 4, 0.016);
    }
    // decision flash ring at the threshold
    const flash = flashRef.current;
    if (flash && flashStart.current >= 0) {
      const age = t - flashStart.current;
      if (age < 2.2) {
        const k = age / 2.2;
        flash.visible = true;
        flash.scale.setScalar(0.6 + k * 2.6);
        (flash.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k);
        (flash.material as THREE.MeshBasicMaterial).color.set(
          lastDecision?.status === "allowed" ? ALLOW_GREEN : STOP_RED
        );
      } else {
        flash.visible = false;
      }
    }
  });

  return (
    <group position={[GATE_X, 0, GATE_Z]}>
      {/* pillars */}
      {[-1.35, 1.35].map((z) => (
        <mesh key={z} position={[0, 1.6, z]} onClick={(e) => { e.stopPropagation(); onSelectGate?.(); }}>
          <boxGeometry args={[0.9, 3.2, 0.9]} />
          <meshStandardMaterial color="#cfc2a0" roughness={0.85} />
        </mesh>
      ))}
      {/* pillar caps */}
      {[-1.35, 1.35].map((z) => (
        <mesh key={`c${z}`} position={[0, 3.35, z]}>
          <boxGeometry args={[1.15, 0.25, 1.15]} />
          <meshStandardMaterial color="#b3a67f" roughness={0.85} />
        </mesh>
      ))}
      {/* lintel — lifts on ALLOWED */}
      <mesh ref={lintelRef} position={[0, 3.35, 0]}>
        <boxGeometry args={[1.0, 0.55, 3.9]} />
        <meshStandardMaterial color="#d8cba6" roughness={0.8} />
      </mesh>
      {/* threshold plane marker: faint line the packet must not cross
          without a decision */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[0.18, 3.4]} />
        <meshBasicMaterial color="#8f8468" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* decision flash ring */}
      <mesh ref={flashRef} position={[0, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <ringGeometry args={[0.8, 1.0, 48]} />
        <meshBasicMaterial color={ALLOW_GREEN} transparent opacity={0} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* gate label stone */}
      <mesh position={[0, 0.35, 2.3]}>
        <boxGeometry args={[1.5, 0.7, 0.18]} />
        <meshStandardMaterial color="#c4b78f" roughness={0.9} />
      </mesh>
    </group>
  );
}
