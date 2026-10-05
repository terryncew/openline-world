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
import { WorkshopInterior } from "./WorkshopInterior";

const isSmallScreen =
  typeof window !== "undefined" &&
  (window.innerWidth < 700 || /iPhone|iPad|Android/i.test(window.navigator.userAgent));

export const VIZ_SMALL_SCREEN = isSmallScreen;
export const VIZ_DPR_CAP = isSmallScreen ? 1.5 : 2;

export function VizCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      dpr={[1, VIZ_DPR_CAP]}
      shadows
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 9.5, 15], fov: 42, near: 0.1, far: 120 }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color("#718596"));
      }}
    >
      <fog attach="fog" args={["#718596", 30, 70]} />
      <hemisphereLight args={["#fff1d2", "#655846", 1.15]} />
      <directionalLight castShadow position={[8, 14, 6]} intensity={1.5} color="#fff2dd" />
      <directionalLight position={[-6, 6, -8]} intensity={0.35} color="#dfe8ff" />
      <WorkshopInterior />
      {children}
    </Canvas>
  );
}
