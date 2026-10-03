/**
 * Shared palette and construction kit for the Square.
 * frontend/src/town/kit.tsx
 *
 * Restrained miniature palette: cream, terracotta, blue, sage, with small
 * warm accents. Everything matte (roughness ~0.9, metalness 0) for the
 * handcrafted Henson-like warmth. No gloss, no neon, no emissive signage.
 */
import type { ReactNode } from "react";

export const PAL = {
  cream: "#f3ead9",
  creamDark: "#e2d5bd",
  terracotta: "#c26d4b",
  terracottaDark: "#9d5236",
  blue: "#4a6f8a",
  blueDark: "#38536a",
  sage: "#8ba888",
  sageDark: "#6d8a6b",
  wood: "#a9805a",
  woodDark: "#7d5f40",
  stone: "#cfc4ae",
  stoneDark: "#a89a80",
  ink: "#3d3428",
  warm: "#e8a34f", // small warm accents only (lamps, window glow)
  white: "#faf6ec",
} as const;

/** Matte standard material shorthand. */
export function matte(color: string, roughness = 0.92) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={0} />;
}

/** A soft blob shadow: grounds characters without real shadow maps. */
export function BlobShadow({ r = 0.55, opacity = 0.22 }: { r?: number; opacity?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <circleGeometry args={[r, 24]} />
      <meshBasicMaterial color="#3d3428" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** Simple capsule limb pivoted at its top (shoulder/hip). */
export function Limb({
  length = 0.5,
  radius = 0.09,
  color,
  children,
}: {
  length?: number;
  radius?: number;
  color: string;
  children?: ReactNode;
}) {
  return (
    <group>
      <mesh position={[0, -length / 2, 0]} castShadow>
        <capsuleGeometry args={[radius, length, 6, 12]} />
        {matte(color)}
      </mesh>
      {children}
    </group>
  );
}

/**
 * Soft barrel hinge: a visible joint with mechanical logic, kept matte
 * and warm — built, not hard sci-fi. Place at a limb's pivot; the barrel
 * axis lies along the bend axis (X for limbs that swing in the XY plane).
 */
export function Hinge({ r = 0.085, color, axis = "x" }: { r?: number; color: string; axis?: "x" | "z" }) {
  return (
    <mesh rotation={axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r * 0.82, r * 0.82, r * 1.15, 12]} />
      {matte(color)}
    </mesh>
  );
}

/** Chunky rounded foot: oversized slightly, reads as built. */
export function Foot({ w = 0.24, h = 0.11, l = 0.32, color }: { w?: number; h?: number; l?: number; color: string }) {
  return (
    <mesh position={[0, -h / 2 + 0.02, 0.05]}>
      <boxGeometry args={[w, h, l]} />
      {matte(color)}
    </mesh>
  );
}

export { PAL as default };
