/**
 * OpenLine World visualization — the receiver gate.
 * frontend/src/viz/scene/ReceiverGate.tsx
 *
 * The threshold machine: the most consequential object in the room, so
 * the most built-up. Terracotta-banded pillars, brass caps, a brass
 * threshold plate the packet must not cross without a decision.
 * Behavior is unchanged and purely data-driven:
 *   ALLOWED  — the lintel lifts, a green ripple runs on the far side.
 *   STOPPED  — the packet halts at the threshold and dissolves in place
 *              (see ProposalPackets); a red ring marks the refusal.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VizProposal } from "../protocol";
import { GATE_X, GATE_Z } from "./layout";
import { PAL } from "./VizCanvas";

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
    // decision flash ring at the threshold. STOPPED holds longer and
    // larger — the refusal is the consequential beat and must be
    // unmissable. Durations here are visual; the verdict is data.
    const flash = flashRef.current;
    if (flash && flashStart.current >= 0) {
      const stopped = lastDecision?.status !== "allowed";
      const life = stopped ? 3.2 : 2.2;
      const age = t - flashStart.current;
      if (age < life) {
        const k = age / life;
        flash.visible = true;
        flash.scale.setScalar((stopped ? 0.9 : 0.6) + k * (stopped ? 3.4 : 2.6));
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
      {/* pillars: cream stone with terracotta bands */}
      {[-1.35, 1.35].map((z) => (
        <group key={z}>
          <mesh position={[0, 1.6, z]} onClick={(e) => { e.stopPropagation(); onSelectGate?.(); }}>
            <boxGeometry args={[1.05, 3.2, 1.05]} />
            <meshStandardMaterial color="#efe2c4" roughness={0.9} />
          </mesh>
          {/* terracotta bands */}
          {[0.7, 2.5].map((y) => (
            <mesh key={y} position={[0, y, z]}>
              <boxGeometry args={[1.14, 0.28, 1.14]} />
              <meshStandardMaterial color={PAL.trim} roughness={0.8} />
            </mesh>
          ))}
          {/* brass cap */}
          <mesh position={[0, 3.32, z]}>
            <boxGeometry args={[1.28, 0.22, 1.28]} />
            <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
          </mesh>
        </group>
      ))}
      {/* lintel — lifts on ALLOWED */}
      <mesh ref={lintelRef} position={[0, 3.35, 0]}>
        <boxGeometry args={[1.15, 0.55, 4.0]} />
        <meshStandardMaterial color="#e6d5ae" roughness={0.85} />
      </mesh>
      {/* brass threshold plate: the line nothing crosses without a decision */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[0.5, 3.2]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.75} />
      </mesh>
      {/* decision flash ring */}
      <mesh ref={flashRef} position={[0, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <ringGeometry args={[0.8, 1.0, 48]} />
        <meshBasicMaterial color={ALLOW_GREEN} transparent opacity={0} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* brass plaque on the west pillar: tap the gate to inspect the receiver */}
      <mesh position={[-0.56, 1.9, 1.35]} rotation={[0, -Math.PI / 2, 0]}
        onClick={(e) => { e.stopPropagation(); onSelectGate?.(); }}>
        <boxGeometry args={[0.7, 0.5, 0.06]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
      </mesh>
    </group>
  );
}
