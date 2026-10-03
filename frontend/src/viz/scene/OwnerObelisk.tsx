/**
 * OpenLine World visualization — the owner's ledger desk.
 * frontend/src/viz/scene/OwnerObelisk.tsx
 *
 * The owner's standing in the room: a chunky wooden desk with a
 * brass-bound ledger. Mandates and revocations are written here.
 * Every mandate seal's tether anchors at the desk's brass plate, so
 * replacing a worker never moves the thing the authority hangs from.
 * (The export keeps its historic name; the anchor is unchanged.)
 */
import * as THREE from "three";
import { PAL } from "./VizCanvas";

export const OBELISK_POS: [number, number, number] = [-7.5, 0, -3.5];
export const OBELISK_ANCHOR: [number, number, number] = [-7.5, 2.6, -3.5];

export function OwnerObelisk({ onSelect }: { onSelect?: () => void }) {
  return (
    <group position={OBELISK_POS}>
      {/* plinth */}
      <mesh position={[0, 0.15, 0]} onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        <boxGeometry args={[1.7, 0.3, 1.7]} />
        <meshStandardMaterial color={PAL.trim} roughness={0.85} />
      </mesh>
      {/* desk body: warm wood */}
      <mesh position={[0, 1.0, 0]} onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        <boxGeometry args={[1.25, 1.45, 1.0]} />
        <meshStandardMaterial color={PAL.wood} roughness={0.85} />
      </mesh>
      {/* slanted ledger top */}
      <mesh position={[0, 1.85, 0.08]} rotation={[-0.28, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        <boxGeometry args={[1.35, 0.12, 1.1]} />
        <meshStandardMaterial color={PAL.woodDark} roughness={0.8} />
      </mesh>
      {/* the brass-bound ledger */}
      <mesh position={[0, 2.02, 0.02]} rotation={[-0.28, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        <boxGeometry args={[0.85, 0.1, 0.7]} />
        <meshStandardMaterial color="#f4e9d2" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.06, -0.18]} rotation={[-0.28, 0, 0]}>
        <boxGeometry args={[0.85, 0.14, 0.08]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.65} />
      </mesh>
      {/* anchor plate: the tether point, owner color */}
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[0.3, 0.5, 0.3]} />
        <meshStandardMaterial color={PAL.trim} roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, 2.6, 0]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#e8a34c" />
      </mesh>
    </group>
  );
}

/** Thin tether from the desk anchor to a point. Rendered only when the
 *  seal count is small (<=64) so distant/large scenes stay cheap. */
export function Tether({ to }: { to: [number, number, number] }) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...OBELISK_ANCHOR),
    new THREE.Vector3(...to),
  ]);
  return (
    <line>
      <primitive object={geo} attach="geometry" />
      <lineBasicMaterial color="#c9a227" transparent opacity={0.9} />
    </line>
  );
}
