/**
 * OpenLine World — square town.
 * frontend/src/square/scene/Town.tsx
 *
 * The explorable outer world: plaza, streets, five buildings, trees,
 * lamps, and the ambient robot cast. Everything here is scenery and
 * local animation — it reads no protocol state and writes none.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WANDERERS } from "../worldState";
import { Robot } from "./Robot";
import { Workshop, Exchange, Library, CourierDepot, RepairShop } from "./Buildings";

function Street({ from, to }: { from: [number, number]; to: [number, number] }) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  return (
    <mesh position={[(from[0] + to[0]) / 2, 0.015, (from[1] + to[1]) / 2]} rotation={[0, yaw, 0]}>
      <planeGeometry args={[1.9, len]} />
      <meshStandardMaterial color="#cbb894" roughness={1} />
    </mesh>
  );
}

function Tree({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.14, 0.2, 1.4, 10]} />
        <meshStandardMaterial color="#8a6a45" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.9, 0]}>
        <sphereGeometry args={[1.0, 18, 14]} />
        <meshStandardMaterial color="#7fb069" roughness={0.9} />
      </mesh>
      <mesh position={[0.5, 1.5, 0.3]}>
        <sphereGeometry args={[0.6, 14, 12]} />
        <meshStandardMaterial color="#8fc177" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Lamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 3.0, 8]} />
        <meshStandardMaterial color="#4a4a55" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <sphereGeometry args={[0.22, 14, 12]} />
        <meshStandardMaterial color="#fff3cf" emissive="#ffd97a" emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[0, 3.32, 0]}>
        <coneGeometry args={[0.34, 0.24, 10]} />
        <meshStandardMaterial color="#4a4a55" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Fountain() {
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) {
      (water.current.material as THREE.MeshStandardMaterial).opacity =
        0.55 + Math.sin(clock.elapsedTime * 1.6) * 0.1;
    }
  });
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[1.7, 1.9, 0.7, 24]} />
        <meshStandardMaterial color="#b8a888" roughness={0.95} />
      </mesh>
      <mesh ref={water} position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 24]} />
        <meshStandardMaterial color="#9fd4e8" transparent opacity={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.18, 0.26, 1.1, 12]} />
        <meshStandardMaterial color="#b8a888" roughness={0.95} />
      </mesh>
      {/* benches */}
      {[2.6, -2.6].map((x) => (
        <group key={x} position={[x, 0, 1.4]} rotation={[0, x > 0 ? -0.5 : 0.5, 0]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[1.6, 0.1, 0.5]} />
            <meshStandardMaterial color="#8a6a45" roughness={0.9} />
          </mesh>
          {[-0.6, 0.6].map((lx) => (
            <mesh key={lx} position={[lx, 0.22, 0]}>
              <boxGeometry args={[0.12, 0.44, 0.44]} />
              <meshStandardMaterial color="#6a5236" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function Town({ onEnterWorkshop }: { onEnterWorkshop: () => void }) {
  return (
    <group>
      {/* grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[26, 64]} />
        <meshStandardMaterial color="#a8c686" roughness={1} />
      </mesh>
      {/* plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[7, 48]} />
        <meshStandardMaterial color="#e8d9b0" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[6.7, 7, 48]} />
        <meshBasicMaterial color="#c9b98f" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* streets to each building */}
      <Street from={[0, -6.8]} to={[0, -8.6]} />
      <Street from={[6.8, 0]} to={[8.7, 0]} />
      <Street from={[-6.8, 0]} to={[-8.7, 0]} />
      <Street from={[0, 6.8]} to={[0, 8.6]} />

      <Fountain />

      {/* the one real destination */}
      <Workshop position={[0, 0, -11]} onEnter={onEnterWorkshop} />

      {/* scenery: future places, honestly unfinished or closed */}
      <Exchange position={[11, 0, 0]} yaw={-Math.PI / 2} />
      <Library position={[-11, 0, 0]} yaw={Math.PI / 2} />
      <CourierDepot position={[0, 0, 11]} yaw={Math.PI} />
      <RepairShop position={[-8, 0, 8]} yaw={Math.PI / 4 + Math.PI / 2} />

      {/* greenery + light */}
      <Tree position={[6.2, 0, -6.2]} s={1.1} />
      <Tree position={[-6.6, 0, 5.6]} s={0.9} />
      <Tree position={[7.2, 0, 6.4]} s={1.2} />
      <Tree position={[-5.2, 0, -7.6]} s={0.8} />
      <Tree position={[13.5, 0, -5]} s={1.0} />
      <Tree position={[-13.5, 0, -4]} s={1.15} />
      {[45, 135, 225, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return <Lamp key={deg} position={[Math.cos(a) * 6, 0, Math.sin(a) * 6]} />;
      })}

      {/* the ambient cast */}
      {WANDERERS.map((w) => (
        <Robot key={w.id} wanderer={w} />
      ))}
    </group>
  );
}
