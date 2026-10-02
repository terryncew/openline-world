/**
 * OpenLine World visualization — canvas shell.
 * frontend/src/viz/scene/VizCanvas.tsx
 *
 * Warm, bright, legible. One hemisphere light + one directional, no shadows,
 * no postprocessing. Fog for depth. Pixel ratio capped (2 desktop, 1.5 on
 * small screens) — the adaptive-fidelity floor for mobile.
 */
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

const isSmallScreen =
  typeof window !== "undefined" &&
  (window.innerWidth < 700 || /iPhone|iPad|Android/i.test(window.navigator.userAgent));

export const VIZ_SMALL_SCREEN = isSmallScreen;
export const VIZ_DPR_CAP = isSmallScreen ? 1.5 : 2;

export function VizCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      dpr={[1, VIZ_DPR_CAP]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 9.5, 15], fov: 42, near: 0.1, far: 120 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color("#f4ead6"));
      }}
    >
      <fog attach="fog" args={["#f4ead6", 26, 60]} />
      <hemisphereLight args={["#fff6e6", "#cbb98f", 1.05]} />
      <directionalLight position={[8, 14, 6]} intensity={1.35} color="#fff2dd" />
      <directionalLight position={[-6, 6, -8]} intensity={0.35} color="#dfe8ff" />
      {/* soft ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[17, 64]} />
        <meshStandardMaterial color="#e9dcc0" roughness={1} />
      </mesh>
      {/* faint world ring: the boundary of the visible world */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[16.4, 16.7, 96]} />
        <meshBasicMaterial color="#c9b98f" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      {children}
    </Canvas>
  );
}
