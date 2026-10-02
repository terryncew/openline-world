/**
 * OpenLine World — square canvas shell.
 * frontend/src/square/scene/SquareCanvas.tsx
 *
 * Warm daylight town. Gentle auto-orbit that yields to the visitor:
 * drag to look, scroll to zoom. Pixel ratio capped like the viz.
 */
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const isSmallScreen =
  typeof window !== "undefined" &&
  (window.innerWidth < 700 || /iPhone|iPad|Android/i.test(window.navigator.userAgent));

export function SquareCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      dpr={[1, isSmallScreen ? 1.5 : 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [14, 13, 15], fov: 42, near: 0.1, far: 140 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color("#f7f0dd"));
      }}
    >
      <fog attach="fog" args={["#f7f0dd", 34, 80]} />
      <hemisphereLight args={["#fff8e8", "#9db884", 1.0]} />
      <directionalLight position={[10, 16, 8]} intensity={1.4} color="#fff2dd" />
      <directionalLight position={[-8, 8, -10]} intensity={0.35} color="#dfe8ff" />
      {children}
      <OrbitControls
        target={[0, 1.2, 0]}
        enablePan={false}
        minDistance={7}
        maxDistance={34}
        maxPolarAngle={1.38}
        minPolarAngle={0.35}
      />
    </Canvas>
  );
}
