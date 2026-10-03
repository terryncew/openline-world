/**
 * OpenLine World visualization — the receiver gate.
 * frontend/src/viz/scene/ReceiverGate.tsx
 *
 * The threshold machine: a handcrafted brass-and-stone customs gate, the
 * most consequential object in the room. Heavier architecture than the
 * old lintel-on-pillars: stepped stone plinths, a fixed deep lintel with
 * cornice and keystone, a portcullis grille that does the moving, a brass
 * seal slot where the rule is read, an indicator band on the lintel, and
 * lantern beads on the pillar caps that fire at decision time.
 *
 * Behavior is unchanged and purely data-driven (the verdict is data;
 * every duration below is stage direction):
 *   ALLOWED — the portcullis rises with mechanical weight, green decision
 *             lighting fires, the packet passes the threshold and fades.
 *   STOPPED — the grille slams shut (or shudders against the closed gate),
 *             red decision lighting fires, the threshold plane activates,
 *             the packet halts AT the threshold and dissolves in place
 *             (see ProposalPackets). The refusal is the room's biggest
 *             beat and must be unmissable.
 *
 * Nothing here is sci-fi: matte stone, wood, brass; light only fires at
 * decision time and dies back to dark.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VizProposal } from "../protocol";
import { GATE_X, GATE_Z } from "./layout";
import { PAL } from "./VizCanvas";

const ALLOW_GREEN = "#3f9e63";
const STOP_RED = "#b03a2e";
const LAMP_RED = "#c23b2a";
const LAMP_GREEN = "#4da768";
const DARK_STONE = "#3a332a";
const SLOT_DARK = "#2e2620";

const GRILLE_CLOSED_Y = 0.08;
const GRILLE_OPEN_Y = 2.38;
// Anim-seconds the gate stands open on ALLOWED. Long enough that the
// open state is unmistakable; the gate is the most important doorway,
// it does not hurry.
const GRILLE_HOLD_S = 12;

export function ReceiverGate({
  proposals,
  onSelectGate,
}: {
  proposals: VizProposal[];
  onSelectGate?: () => void;
}) {
  const grilleRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const flash2Ref = useRef<THREE.Mesh>(null);
  const bandBeadRef = useRef<THREE.Mesh>(null);
  const lampBeadLRef = useRef<THREE.Mesh>(null);
  const lampBeadRRef = useRef<THREE.Mesh>(null);
  const nosingMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const lastDecision = useMemo(() => {
    const decided = proposals
      .filter((p) => p.status !== "in-flight" && p.decisionSeq != null)
      .sort((a, b) => (b.decisionSeq ?? 0) - (a.decisionSeq ?? 0))[0];
    return decided ?? null;
  }, [proposals]);
  const flashStart = useRef(-1);
  const seenDecisionSeq = useRef<number | null>(null);
  const grilleY = useRef(GRILLE_CLOSED_Y);
  const grilleWasOpen = useRef(false);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    // No dt clamp: damp() is exponential and cannot overshoot, so raw dt
    // keeps the motion wall-time-correct at any frame rate (SwiftShader
    // runs ~2fps in captures; clamping would slow-motion the gate there
    // while real 60fps hardware is unaffected).
    const d = dt;
    const seq = lastDecision?.decisionSeq ?? null;
    if (seq !== seenDecisionSeq.current) {
      seenDecisionSeq.current = seq;
      // Edge-triggered on a real decision. Scrubbing to an undecided
      // state must NOT replay a verdict flash — there is no decision
      // in state, so the gate stays dark.
      flashStart.current = seq != null ? t : -1;
    }
    const decided = flashStart.current >= 0;
    const age = decided ? t - flashStart.current : Infinity;
    const stopped = lastDecision?.status !== "allowed";
    const allowed = lastDecision?.status === "allowed";

    // --- portcullis: the moving part. Heavy rise on ALLOWED; slam or
    // shudder on STOPPED. Visual only; the verdict is already data.
    const grille = grilleRef.current;
    if (grille) {
      let target = GRILLE_CLOSED_Y;
      let lambda = 3.2;
      if (allowed && age < GRILLE_HOLD_S) {
        target = GRILLE_OPEN_Y; // rise with weight, hold while the packet passes
        lambda = 2.0;
      } else if (stopped && decided && grilleWasOpen.current && age < 1.4) {
        target = GRILLE_CLOSED_Y; // slam shut
        lambda = 14;
      }
      grilleY.current = THREE.MathUtils.damp(grilleY.current, target, lambda, d);
      let y = grilleY.current;
      let x = 0;
      if (stopped && decided && age < 0.9) {
        const s = Math.exp(-age * 7);
        if (grilleWasOpen.current) {
          y += Math.abs(Math.sin(age * 34)) * 0.09 * s; // settle bounce off the sill
        } else {
          x = Math.sin(age * 46) * 0.035 * s; // refusal shudder against the closed gate
        }
      }
      grille.position.y = y;
      grille.position.x = x;
      grilleWasOpen.current = grilleY.current > 0.9;
    }

    // --- verdict rings: the primary ring plus a delayed second pulse.
    // STOPPED is bigger, brighter, longer — the refusal must be unmissable.
    const setRing = (
      ref: React.RefObject<THREE.Mesh | null>,
      delay: number,
      life: number,
      s0: number,
      s1: number,
      o0: number
    ) => {
      const m = ref.current;
      if (!m) return;
      const a = age - delay;
      if (!decided || a < 0 || a > life) {
        m.visible = false;
        return;
      }
      const k = a / life;
      m.visible = true;
      m.scale.setScalar(s0 + (s1 - s0) * k);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = o0 * (1 - k);
      mat.color.set(stopped ? STOP_RED : ALLOW_GREEN);
    };
    setRing(flashRef, 0, stopped ? 2.8 : 2.2, stopped ? 1.2 : 0.8, stopped ? 5.4 : 3.4, stopped ? 0.9 : 0.6);
    setRing(flash2Ref, 0.35, 2.0, stopped ? 0.9 : 0.6, stopped ? 4.4 : 2.8, stopped ? 0.55 : 0.4);

    // --- decision lighting: lamp beads + threshold nosing + one point
    // light. Fires at decision time, dies back to dark. Matte hues only.
    const pulse = decided && age < 2.6 ? Math.exp(-age * 1.7) : 0;
    for (const ref of [bandBeadRef, lampBeadLRef, lampBeadRRef]) {
      const b = ref.current;
      if (!b) continue;
      const mat = b.material as THREE.MeshStandardMaterial;
      mat.emissive.set(stopped ? LAMP_RED : LAMP_GREEN);
      mat.emissiveIntensity = (stopped ? 2.6 : 1.6) * pulse;
    }
    const nm = nosingMatRef.current;
    if (nm) {
      nm.emissive.set(stopped ? STOP_RED : ALLOW_GREEN);
      nm.emissiveIntensity = decided && age < 2.4 ? 1.7 * Math.exp(-age * 1.9) : 0;
    }
    const pl = lightRef.current;
    if (pl) {
      const p = decided && age < 3 ? Math.exp(-age * 2.3) : 0;
      pl.color.set(stopped ? "#ff6a4d" : "#8fdca8");
      pl.intensity = (stopped ? 16 : 6) * p;
    }
  });

  const selectGate = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelectGate?.();
  };

  return (
    <group position={[GATE_X, 0, GATE_Z]}>
      {/* decision light: fires only at verdict time */}
      <pointLight ref={lightRef} position={[0, 2.6, 0]} distance={11} decay={2} intensity={0} />

      {/* pillars: stepped stone plinths, cream shafts, terracotta bands */}
      {[-1.35, 1.35].map((z) => (
        <group key={z}>
          <mesh position={[0, 0.25, z]} onClick={selectGate}>
            <boxGeometry args={[1.7, 0.5, 1.7]} />
            <meshStandardMaterial color="#e6d5ae" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.62, z]} onClick={selectGate}>
            <boxGeometry args={[1.5, 0.35, 1.5]} />
            <meshStandardMaterial color="#efe2c4" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.3, z]} onClick={selectGate}>
            <boxGeometry args={[1.35, 3.0, 1.35]} />
            <meshStandardMaterial color="#efe2c4" roughness={0.9} />
          </mesh>
          {[1.35, 3.15].map((y) => (
            <mesh key={y} position={[0, y, z]}>
              <boxGeometry args={[1.44, 0.3, 1.44]} />
              <meshStandardMaterial color={PAL.trim} roughness={0.8} />
            </mesh>
          ))}
          {/* brass cap */}
          <mesh position={[0, 3.91, z]}>
            <boxGeometry args={[1.62, 0.22, 1.62]} />
            <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
          </mesh>
          {/* gate lantern: brass cage, dark bead until a decision fires */}
          <group position={[0, 0, z]}>
            {[[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]].map(([px, pz], i) => (
              <mesh key={i} position={[px, 4.18, pz]}>
                <boxGeometry args={[0.05, 0.34, 0.05]} />
                <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.7} />
              </mesh>
            ))}
            <mesh position={[0, 4.39, 0]}>
              <boxGeometry args={[0.42, 0.09, 0.42]} />
              <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.7} />
            </mesh>
            <mesh ref={z < 0 ? lampBeadLRef : lampBeadRRef} position={[0, 4.18, 0]}>
              <sphereGeometry args={[0.13, 20, 16]} />
              <meshStandardMaterial color={DARK_STONE} roughness={0.6} emissive={LAMP_RED} emissiveIntensity={0} />
            </mesh>
          </group>
        </group>
      ))}

      {/* lintel: fixed and heavy — the portcullis does the moving now.
          Stepped cornice + keystone on the approach face. */}
      <mesh position={[0, 4.4, 0]}>
        <boxGeometry args={[1.6, 0.75, 4.6]} />
        <meshStandardMaterial color="#e6d5ae" roughness={0.85} />
      </mesh>
      <mesh position={[0, 4.9, 0]}>
        <boxGeometry args={[1.9, 0.28, 5.0]} />
        <meshStandardMaterial color={PAL.trim} roughness={0.8} />
      </mesh>
      <mesh position={[-0.82, 4.4, 0]}>
        <boxGeometry args={[0.28, 0.7, 0.5]} />
        <meshStandardMaterial color={PAL.trim} roughness={0.8} />
      </mesh>

      {/* seal slot on the west pillar's approach face: brass-framed slot
          with the rule plate half-inserted — where the rule is read. */}
      <mesh position={[-0.7, 2.1, -1.35]}>
        <boxGeometry args={[0.08, 1.0, 0.62]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[-0.74, 2.05, -1.35]}>
        <boxGeometry args={[0.05, 0.78, 0.4]} />
        <meshStandardMaterial color={SLOT_DARK} roughness={0.95} />
      </mesh>
      <mesh position={[-0.74, 2.52, -1.35]}>
        <boxGeometry args={[0.04, 0.55, 0.3]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.65} />
      </mesh>

      {/* portcullis grille: wood bars, brass shoe. Rises on ALLOWED,
          slams or shudders on STOPPED. Clickable: inspects the gate.
          Short enough to retract fully into the lintel when open. */}
      <group ref={grilleRef} position={[0, GRILLE_CLOSED_Y, 0]}>
        {Array.from({ length: 7 }, (_, i) => -0.54 + i * 0.18).map((z) => (
          <mesh key={z} position={[0, 1.15, z]} onClick={selectGate}>
            <boxGeometry args={[0.16, 2.0, 0.16]} />
            <meshStandardMaterial color={PAL.woodDark} roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0, 2.15, 0]} onClick={selectGate}>
          <boxGeometry args={[0.2, 0.26, 1.5]} />
          <meshStandardMaterial color={PAL.wood} roughness={0.85} />
        </mesh>
        {/* indicator band on the top rail's approach face: brass strip
            with a central lamp bead. It travels WITH the moving gate —
            rising on ALLOWED — and fires at decision time. Dark at rest. */}
        <mesh position={[-0.13, 2.15, 0]} onClick={selectGate}>
          <boxGeometry args={[0.08, 0.2, 1.3]} />
          <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
        </mesh>
        {[-0.5, 0.5].map((z) => (
          <mesh key={z} position={[-0.18, 2.15, z]}>
            <sphereGeometry args={[0.05, 12, 10]} />
            <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
          </mesh>
        ))}
        <mesh ref={bandBeadRef} position={[-0.19, 2.15, 0]}>
          <sphereGeometry args={[0.12, 20, 16]} />
          <meshStandardMaterial color={DARK_STONE} roughness={0.6} emissive={LAMP_RED} emissiveIntensity={0} />
        </mesh>
        <mesh position={[0, 0.28, 0]} onClick={selectGate}>
          <boxGeometry args={[0.2, 0.3, 1.5]} />
          <meshStandardMaterial color={PAL.wood} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.1, 0]} onClick={selectGate}>
          <boxGeometry args={[0.24, 0.09, 1.54]} />
          <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.7} />
        </mesh>
      </group>

      {/* threshold: stone step + brass nosing — the visible threshold
          plane. The nosing fires with the decision lighting. */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[1.3, 0.12, 3.0]} />
        <meshStandardMaterial color="#e2cfa5" roughness={0.9} />
      </mesh>
      <mesh position={[-0.58, 0.13, 0]}>
        <boxGeometry args={[0.14, 0.05, 3.0]} />
        <meshStandardMaterial
          ref={nosingMatRef}
          color={PAL.brass}
          roughness={0.35}
          metalness={0.7}
          emissive={STOP_RED}
          emissiveIntensity={0}
        />
      </mesh>

      {/* processional approach: raised stone apron with brass channel
          strips — the packet travels its legible channel into the gate. */}
      <mesh position={[-2.3, 0.05, 0]}>
        <boxGeometry args={[4.6, 0.1, 2.8]} />
        <meshStandardMaterial color="#e9d9b4" roughness={0.95} />
      </mesh>
      {[-1.05, 1.05].map((z) => (
        <mesh key={z} position={[-2.3, 0.12, z]}>
          <boxGeometry args={[4.6, 0.07, 0.14]} />
          <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.65} />
        </mesh>
      ))}

      {/* verdict rings: primary + delayed second pulse, facing the approach */}
      <mesh ref={flashRef} position={[0, 1.7, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <ringGeometry args={[0.8, 1.0, 48]} />
        <meshBasicMaterial color={ALLOW_GREEN} transparent opacity={0} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={flash2Ref} position={[0, 1.7, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <ringGeometry args={[0.8, 1.0, 48]} />
        <meshBasicMaterial color={ALLOW_GREEN} transparent opacity={0} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* brass plaque on the south pillar: tap the gate to inspect the receiver */}
      <mesh position={[-0.1, 1.9, 2.06]} onClick={selectGate}>
        <boxGeometry args={[0.7, 0.5, 0.06]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
      </mesh>
    </group>
  );
}
