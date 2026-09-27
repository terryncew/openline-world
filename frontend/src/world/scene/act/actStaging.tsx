/**
 * actStaging.tsx — physical props for the character acts (Track 2).
 *
 * The workbench papers and the record-arrival flight. Every prop appears
 * only where real backend state puts it:
 *  - the papers appear only while someone is genuinely working (an
 *    agreement in "agreed" — the deterministic worker really is at work);
 *  - the record slip flies to the cabinet ONLY when the shared-receipt
 *    count actually increases — never invented.
 * The receiving tray is built into the ReviewStation (Track 3); the
 * hand-carried work object is the exchange thread's own token (Track 3's
 * AgreementToken), which rides the holder's figure — no second object.
 */
import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const CREAM = "#f3ecdc";
const PAPER = "#fffdf5";

const WOOD_DARK = "#7d5f36";
const BRASS = "#c9a227";

/** The workbench papers: a small stack plus a pen, on the bench where the
 *  figure works. Rendered ONLY while working === true. The top sheet
 *  shifts now and then — the figure visibly tidies as it writes. */
export function WorkPapers({ position, visible, reducedMotion }: {
  position: [number, number, number];
  visible: boolean;
  reducedMotion: boolean;
}) {
  const top = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!top.current || !visible || reducedMotion) return;
    const t = clock.getElapsedTime();
    const cyc = (t % 7) / 7;
    // the tidy beat, in sync with the figure's left-hand sweep
    const k = cyc > 0.86 ? Math.sin(((cyc - 0.86) / 0.14) * Math.PI) : 0;
    top.current.rotation.y = 0.12 + k * 0.22;
    top.current.position.x = k * 0.06;
  });
  if (!visible) return null;
  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[(i - 1) * 0.02, 0.012 + i * 0.008, (i % 2) * 0.03]} rotation={[0, (i - 1) * 0.1, 0]}>
          <boxGeometry args={[0.5, 0.012, 0.36]} />
          <meshStandardMaterial color={i === 2 ? PAPER : CREAM} roughness={0.95} />
        </mesh>
      ))}
      {/* the top sheet — the one being written on and tidied */}
      <mesh ref={top} position={[0, 0.04, 0]} rotation={[0, 0.12, 0]}>
        <boxGeometry args={[0.5, 0.012, 0.36]} />
        <meshStandardMaterial color={PAPER} roughness={0.95} />
      </mesh>
      {/* a few ink lines on the top sheet */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.12 + i * 0.02, 0.048, -0.08 + i * 0.07]} rotation={[-Math.PI / 2, 0, 0.04]}>
          <planeGeometry args={[0.2 - i * 0.04, 0.018]} />
          <meshStandardMaterial color="#5a6672" roughness={1} />
        </mesh>
      ))}
      {/* the pen */}
      <mesh position={[0.34, 0.05, 0.1]} rotation={[0, 0.5, Math.PI / 2 - 0.08]}>
        <cylinderGeometry args={[0.018, 0.018, 0.3, 8]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
      </mesh>
      <mesh position={[0.2, 0.045, 0.175]} rotation={[0, 0.5, Math.PI / 2 - 0.08]}>
        <coneGeometry args={[0.018, 0.06, 8]} />
        <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** A record arriving in the cabinet: a folded slip arcs from the review
 *  end to the cabinet top. Fires ONLY when the real shared-receipt count
 *  increases — the cabinet's own folders already count it; the flight is
 *  the visible arrival of that same real record. */
export function RecordFlight({
  count, from, to, reducedMotion,
}: {
  count: number;
  from: [number, number, number];
  to: [number, number, number];
  reducedMotion: boolean;
}) {
  const prev = useRef<number | null>(null);
  const [flying, setFlying] = useState(false);
  const slip = useRef<THREE.Group>(null);
  const t0 = useRef(0);
  const fromV = useMemo(() => new THREE.Vector3(...from), [from]);
  const toV = useMemo(() => new THREE.Vector3(...to), [to]);
  const mid = useMemo(() => fromV.clone().lerp(toV, 0.5).add(new THREE.Vector3(0, 1.3, 0)), [fromV, toV]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (prev.current === null) { prev.current = count; return; }
    if (count > prev.current && !flying) {
      prev.current = count;
      if (!reducedMotion) { setFlying(true); t0.current = t; }
      return;
    }
    prev.current = count;
    if (!flying || !slip.current) return;
    const k = Math.min(1, (t - t0.current) / 1.5);
    // quadratic bezier arc: review end -> high middle -> cabinet top
    const p0 = _r1.copy(fromV).lerp(mid, k);
    const p1 = _r2.copy(mid).lerp(toV, k);
    slip.current.position.copy(p0.lerp(p1, k));
    slip.current.rotation.y = k * 2.2;
    if (k >= 1) setFlying(false);
  });

  if (!flying) return null;
  return (
    <group ref={slip} position={from}>
      <mesh rotation={[0, 0.2, 0.1]}>
        <boxGeometry args={[0.3, 0.05, 0.22]} />
        <meshStandardMaterial color={PAPER} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 12]} />
        <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}
const _r1 = new THREE.Vector3();
const _r2 = new THREE.Vector3();
