/**
 * OpenLine World visualization — canvas shell.
 * frontend/src/viz/scene/VizCanvas.tsx
 *
 * The workshop is a storybook machine room: terracotta floor, cream walls
 * with a sage wainscot, warm daylight. The room is a partial shell — low
 * back walls only — so the diorama stays open and every camera view
 * (world, gate close-up, replacement payoff, records) keeps its sight
 * lines. Pixel ratio capped (2 desktop, 1.5 on small screens).
 */
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { GATE_X } from "./layout";

const isSmallScreen =
  typeof window !== "undefined" &&
  (window.innerWidth < 700 || /iPhone|iPad|Android/i.test(window.navigator.userAgent));

export const VIZ_SMALL_SCREEN = isSmallScreen;
export const VIZ_DPR_CAP = isSmallScreen ? 1.5 : 2;

// Square palette, carried inside: cream, terracotta, sage, warm wood.
export const PAL = {
  floor: "#c08552",
  floorInlay: "#f2e7cf",
  wall: "#f4e9d2",
  wainscot: "#7d8b6a",
  trim: "#b5651d",
  wood: "#8a5a33",
  woodDark: "#6e4525",
  brass: "#c9a227",
} as const;

/** Soft blob shadow: cheap contact grounding, no shadow maps. */
function Blob({
  position,
  radius,
  opacity = 0.22,
}: {
  position: [number, number, number];
  radius: number;
  opacity?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <circleGeometry args={[radius, 32]} />
      <meshBasicMaterial color="#4a3a24" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

export function VizCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      dpr={[1, VIZ_DPR_CAP]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 9.5, 15], fov: 42, near: 0.1, far: 120 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color("#f0dfc0"));
      }}
    >
      <fog attach="fog" args={["#f0dfc0", 28, 64]} />
      <hemisphereLight args={["#fff6e6", "#caa06a", 1.0]} />
      <directionalLight position={[8, 14, 6]} intensity={1.35} color="#fff2dd" />
      <directionalLight position={[-6, 6, -8]} intensity={0.35} color="#dfe8ff" />
      {/* terracotta workshop floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[17, 64]} />
        <meshStandardMaterial color={PAL.floor} roughness={0.95} />
      </mesh>
      {/* cream inlay lane: workers -> gate. The consequential path, in the floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.2, 0.0, 0.6]}>
        <planeGeometry args={[11.5, 1.7]} />
        <meshStandardMaterial color={PAL.floorInlay} roughness={0.95} />
      </mesh>
      {/* back wall behind the gate (east): cream, sage wainscot, terracotta trim.
          Kept low and behind the records arc so no camera view is blocked. */}
      <group position={[13.2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 1.6, 0]}>
          <boxGeometry args={[15, 3.2, 0.35]} />
          <meshStandardMaterial color={PAL.wall} roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.55, 0.19]}>
          <boxGeometry args={[15, 1.1, 0.04]} />
          <meshStandardMaterial color={PAL.wainscot} roughness={0.95} />
        </mesh>
        <mesh position={[0, 3.25, 0]}>
          <boxGeometry args={[15, 0.22, 0.42]} />
          <meshStandardMaterial color={PAL.trim} roughness={0.8} />
        </mesh>
      </group>
      {/* north wall stub: frames the worker benches without closing the room */}
      <group position={[-1, 0, -10.5]}>
        <mesh position={[0, 1.4, 0]}>
          <boxGeometry args={[13, 2.8, 0.35]} />
          <meshStandardMaterial color={PAL.wall} roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.5, 0.19]}>
          <boxGeometry args={[13, 1.0, 0.04]} />
          <meshStandardMaterial color={PAL.wainscot} roughness={0.95} />
        </mesh>
        <mesh position={[0, 2.85, 0]}>
          <boxGeometry args={[13, 0.22, 0.42]} />
          <meshStandardMaterial color={PAL.trim} roughness={0.8} />
        </mesh>
      </group>
      {/* contact grounding */}
      <Blob position={[GATE_X, 0.015, 0]} radius={3.0} />
      <Blob position={[-7.5, 0.015, -3.5]} radius={1.4} />
      <Blob position={[-2.2, 0.015, 1.2]} radius={4.2} opacity={0.14} />
      <Blob position={[10.6, 0.015, 0]} radius={4.6} opacity={0.14} />
      {children}
    </Canvas>
  );
}
