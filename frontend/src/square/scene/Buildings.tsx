/**
 * OpenLine World — square buildings.
 * frontend/src/square/scene/Buildings.tsx
 *
 * Authored, colorful, simple forms. The workshop is the one real
 * destination (it opens the proven custody visualization). Every other
 * building is scenery: locked, quiet, parked, or unfinished — clearly
 * not simulating economic activity OpenLine has not demonstrated.
 */
import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function makeSignTexture(title: string, sub: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  // wooden board
  g.fillStyle = "#8a6a45";
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#f6efdd";
  const r = 28;
  g.beginPath();
  g.roundRect(14, 14, 484, 228, r);
  g.fill();
  g.fillStyle = "#4a3b2a";
  g.textAlign = "center";
  g.font = "bold 64px system-ui, sans-serif";
  g.fillText(title, 256, sub ? 108 : 148);
  if (sub) {
    g.font = "36px system-ui, sans-serif";
    g.fillStyle = "#7a6248";
    g.fillText(sub, 256, 178);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Sign({ title, sub, width = 3.2 }: { title: string; sub?: string; width?: number }) {
  const tex = useMemo(() => makeSignTexture(title, sub ?? ""), [title, sub]);
  return (
    <mesh position={[0, 0, 0.06]}>
      <planeGeometry args={[width, width / 2]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

/** freestanding shop sign on two posts — sits clear of the building */
function StandingSign({
  title,
  sub,
  position,
  yaw = 0,
  width = 3.0,
}: {
  title: string;
  sub?: string;
  position: [number, number, number];
  yaw?: number;
  width?: number;
}) {
  const h = width / 2;
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {[-width / 2 + 0.2, width / 2 - 0.2].map((x) => (
        <mesh key={x} position={[x, h / 2 + 0.35, 0]}>
          <cylinderGeometry args={[0.07, 0.07, h + 0.7, 8]} />
          <meshStandardMaterial color="#6a5236" roughness={0.9} />
        </mesh>
      ))}
      <group position={[0, h / 2 + 0.7, 0]}>
        <Sign title={title} sub={sub} width={width} />
      </group>
    </group>
  );
}

function Windows({ w, y, lit }: { w: number; y: number; lit?: boolean }) {
  const mat = lit
    ? { color: "#ffe9b8", emissive: "#ffca7a", emissiveIntensity: 0.9 }
    : { color: "#3a4a5a", emissive: "#000000", emissiveIntensity: 0 };
  return (
    <group position={[0, y, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 4), 0, 0.26]}>
          <planeGeometry args={[w / 5, 0.7]} />
          <meshStandardMaterial {...mat} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

interface WorkshopProps {
  position: [number, number, number];
  onEnter: () => void;
}

export function Workshop({ position, onEnter }: WorkshopProps) {
  const marker = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (marker.current) {
      const s = 1 + Math.sin(t * 2.4) * 0.08;
      marker.current.scale.set(s, s, s);
      (marker.current.material as THREE.MeshStandardMaterial).opacity = 0.65 + Math.sin(t * 2.4) * 0.25;
    }
  });
  return (
    <group position={position}>
      {/* main hall */}
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[6, 3.5, 4.6]} />
        <meshStandardMaterial color="#d98e5f" roughness={0.85} />
      </mesh>
      {/* roof slab + trim */}
      <mesh position={[0, 3.62, 0]}>
        <boxGeometry args={[6.5, 0.28, 5.1]} />
        <meshStandardMaterial color="#a85f3d" roughness={0.9} />
      </mesh>
      {/* glowing arched door */}
      <group position={[0, 0, 2.32]}>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[1.7, 1.8, 0.12]} />
          <meshStandardMaterial color="#ffd98a" emissive="#ffb703" emissiveIntensity={hover ? 1.4 : 0.85} />
        </mesh>
        <mesh position={[0, 1.8, 0]}>
          <circleGeometry args={[0.85, 24, 0, Math.PI]} />
          <meshStandardMaterial color="#ffd98a" emissive="#ffb703" emissiveIntensity={hover ? 1.4 : 0.85} />
        </mesh>
      </group>
      <group position={[0, 2.6, 2.32]}>
        <Windows w={6} y={0} lit />
      </group>
      {/* rooftop sign on posts: clear of the door, the windows, and the roof */}
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} position={[x, 4.15, 1.2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 8]} />
          <meshStandardMaterial color="#6a5236" roughness={0.9} />
        </mesh>
      ))}
      <group position={[0, 4.75, 1.2]}>
        <Sign title="WORKSHOP" sub="see how work gets approved" width={3.6} />
      </group>
      {/* gate motif by the door: two stone posts + lintel, echoing the viz */}
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x, 0.75, 3.4]}>
          <boxGeometry args={[0.4, 1.5, 0.4]} />
          <meshStandardMaterial color="#b8a888" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 1.62, 3.4]}>
        <boxGeometry args={[3.6, 0.3, 0.44]} />
        <meshStandardMaterial color="#b8a888" roughness={0.95} />
      </mesh>
      {/* pulsing entry marker, above the rooftop sign */}
      <mesh ref={marker} position={[0, 6.0, 1.2]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.09, 12, 32]} />
        <meshStandardMaterial color="#c9a227" emissive="#c9a227" emissiveIntensity={0.7} transparent opacity={0.8} />
      </mesh>
      {/* click target */}
      <mesh
        position={[0, 1.8, 2.4]}
        onClick={(e) => { e.stopPropagation(); onEnter(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <boxGeometry args={[4.4, 3.6, 1.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Exchange({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[5.4, 3.2, 4.2]} />
        <meshStandardMaterial color="#7fb6d9" roughness={0.85} />
      </mesh>
      {/* striped awning */}
      <group position={[0, 2.6, 2.35]} rotation={[0.25, 0, 0]}>
        {Array.from({ length: 7 }).map((_, i) => (
          <mesh key={i} position={[(i - 3) * 0.72, 0, 0]}>
            <boxGeometry args={[0.72, 0.08, 1.4]} />
            <meshStandardMaterial color={i % 2 ? "#f6efdd" : "#d94f3d"} roughness={0.9} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 3.35, 0]}>
        <boxGeometry args={[5.9, 0.28, 4.7]} />
        <meshStandardMaterial color="#4a7fa0" roughness={0.9} />
      </mesh>
      {/* closed door + honest standing sign out front */}
      <mesh position={[0, 0.95, 2.12]}>
        <boxGeometry args={[1.5, 1.9, 0.1]} />
        <meshStandardMaterial color="#5a4a3a" roughness={0.95} />
      </mesh>
      <StandingSign title="EXCHANGE" sub="opening soon — no trading yet" position={[3.4, 0, 3.2]} yaw={-0.4} width={3.4} />
      <group position={[0, 1.5, 2.14]}>
        <Windows w={5.4} y={0} />
      </group>
    </group>
  );
}

export function Library({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[4.6, 3.0, 4.0]} />
        <meshStandardMaterial color="#b08968" roughness={0.9} />
      </mesh>
      {/* pyramid roof */}
      <mesh position={[0, 3.85, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.6, 1.7, 4]} />
        <meshStandardMaterial color="#7f5539" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.9, 2.02]}>
        <boxGeometry args={[1.3, 1.8, 0.1]} />
        <meshStandardMaterial color="#4a3b2a" roughness={0.95} />
      </mesh>
      <StandingSign title="LIBRARY" sub="quiet, please" position={[3.0, 0, 2.8]} yaw={-0.5} width={2.8} />
      <group position={[0, 1.6, 2.04]}>
        <Windows w={4.6} y={0} />
      </group>
    </group>
  );
}

export function CourierDepot({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* open-front garage */}
      <mesh position={[-2.2, 1.4, 0]}>
        <boxGeometry args={[0.5, 2.8, 4.4]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.85} />
      </mesh>
      <mesh position={[2.2, 1.4, 0]}>
        <boxGeometry args={[0.5, 2.8, 4.4]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.9, 0]}>
        <boxGeometry args={[4.9, 0.3, 4.6]} />
        <meshStandardMaterial color="#a34a35" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.4, -2.05]}>
        <boxGeometry args={[4.9, 2.8, 0.4]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.85} />
      </mesh>
      {/* rooftop sign on posts */}
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} position={[x, 3.4, 0.4]}>
          <cylinderGeometry args={[0.06, 0.06, 0.8, 8]} />
          <meshStandardMaterial color="#6a5236" roughness={0.9} />
        </mesh>
      ))}
      <group position={[0, 4.15, 0.4]}>
        <Sign title="COURIER DEPOT" width={3.4} />
      </group>
      {/* parked couriers: static capsules, decoration only */}
      {[[-1.1, 0.6], [0.1, -0.5], [1.3, 0.7]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, (i - 1) * 0.5, 0]}>
          <mesh position={[0, 0.5, 0]}>
            <capsuleGeometry args={[0.28, 0.4, 6, 14]} />
            <meshStandardMaterial color={["#8fd0c2", "#a8c8f0", "#f0d888"][i]} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.02, 0]}>
            <sphereGeometry args={[0.2, 16, 12]} />
            <meshStandardMaterial color={["#8fd0c2", "#a8c8f0", "#f0d888"][i]} roughness={0.7} />
          </mesh>
          <mesh position={[-0.08, 1.04, 0.17]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color="#2b2b33" />
          </mesh>
          <mesh position={[0.08, 1.04, 0.17]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color="#2b2b33" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function RepairShop({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* half-built frame */}
      {[-1.8, 1.8].map((x) =>
        [-1.4, 1.4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.25, z]}>
            <boxGeometry args={[0.24, 2.5, 0.24]} />
            <meshStandardMaterial color="#9a8a72" roughness={0.95} />
          </mesh>
        ))
      )}
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[4.1, 0.22, 3.3]} />
        <meshStandardMaterial color="#9a8a72" roughness={0.95} />
      </mesh>
      {/* scaffolding poles */}
      {[-2.4, 2.4].map((x) => (
        <mesh key={x} position={[x, 1.5, 1.9]}>
          <cylinderGeometry args={[0.06, 0.06, 3.0, 8]} />
          <meshStandardMaterial color="#c9a227" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 2.4, 1.9]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 4.9, 8]} />
        <meshStandardMaterial color="#c9a227" roughness={0.8} />
      </mesh>
      {/* one finished wall, so it reads as a shop in progress */}
      <mesh position={[0, 0.9, -1.55]}>
        <boxGeometry args={[3.8, 1.8, 0.2]} />
        <meshStandardMaterial color="#c98f5f" roughness={0.9} />
      </mesh>
      <StandingSign title="REPAIR SHOP" sub="under construction" position={[3.2, 0, 2.8]} yaw={-0.5} width={3.0} />
    </group>
  );
}
