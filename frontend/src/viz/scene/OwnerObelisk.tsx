/**
 * OpenLine World visualization — the owner obelisk.
 * frontend/src/viz/scene/OwnerObelisk.tsx
 *
 * A small fixed stone marker: the owner's principal continuity. Every
 * mandate seal's tether anchors here, so replacing a worker never moves
 * the thing the authority hangs from.
 */
import * as THREE from "three";

export const OBELISK_POS: [number, number, number] = [-7.5, 0, -3.5];
export const OBELISK_ANCHOR: [number, number, number] = [-7.5, 2.6, -3.5];

export function OwnerObelisk({ onSelect }: { onSelect?: () => void }) {
  return (
    <group position={OBELISK_POS}>
      {/* fixed painted-metal authority cabinet: external to every worker */}
      <mesh position={[0, 1.35, -0.35]}>
        <boxGeometry args={[2.15, 3.1, 1.1]} />
        <meshStandardMaterial color="#38536a" roughness={0.94} />
      </mesh>
      <mesh position={[0, 1.5, 0.23]}>
        <boxGeometry args={[1.55, 1.5, 0.12]} />
        <meshStandardMaterial color="#f3ead9" roughness={0.95} />
      </mesh>
      {[-0.45, 0, 0.45].map((x) => <mesh key={x} position={[x,1.68,.31]}><cylinderGeometry args={[.09,.09,.05,12]}/><meshStandardMaterial color={x===0?"#e8a34f":"#8ba888"} roughness={.8}/></mesh>)}
      {/* plinth */}
      <mesh position={[0, 0.15, 0]} onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        <boxGeometry args={[1.5, 0.3, 1.5]} />
        <meshStandardMaterial color="#b8a67e" roughness={0.9} />
      </mesh>
      {/* owner seal press */}
      <mesh position={[0, 1.35, 0]} onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        <boxGeometry args={[0.85, 2.1, 0.85]} />
        <meshStandardMaterial color="#d8c9a3" roughness={0.85} />
      </mesh>
      {/* cap: owner color */}
      <mesh position={[0, 2.55, 0]} onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
        <octahedronGeometry args={[0.42]} />
        <meshStandardMaterial color="#b5651d" roughness={0.5} metalness={0.35} />
      </mesh>
      {/* anchor point glow */}
      <mesh position={[0, 2.6, 0]}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#e8a34c" />
      </mesh>
    </group>
  );
}

/** Thin tether from the obelisk anchor to a point. Rendered only when the
 *  seal count is small (<=64) so distant/large scenes stay cheap. */
export function Tether({ to }: { to: [number, number, number] }) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...OBELISK_ANCHOR),
    new THREE.Vector3(...to),
  ]);
  return (
    <line>
      <primitive object={geo} attach="geometry" />
      <lineBasicMaterial color="#b5651d" transparent opacity={0.45} />
    </line>
  );
}
