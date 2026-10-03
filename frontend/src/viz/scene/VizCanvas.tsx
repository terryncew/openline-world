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
import { WORKSHOP_SPATIAL_CONTRACT as W } from "../../spatial/workshopContract";

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
      camera={{ position: [0, 1.55, W.door.facadeZ + 1.9], fov: 45, near: 0.1, far: 120 }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(new THREE.Color(W.palette.cream));
        camera.lookAt(W.door.centerX, W.door.height / 2, W.door.facadeZ);
      }}
    >
      <fog attach="fog" args={[W.palette.cream, 26, 60]} />
      <hemisphereLight args={["#fff6e6", "#cbb98f", 1.05]} />
      <directionalLight position={[8, 14, 6]} intensity={1.35} color="#fff2dd" />
      <directionalLight position={[-6, 6, -8]} intensity={0.35} color="#dfe8ff" />
      {children}
    </Canvas>
  );
}
