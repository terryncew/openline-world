/**
 * Scene-native identity nameplates (WORLD-AUTHORITY-001 repair §4).
 *
 * Small, restrained text sprites attached to physical objects: "Wren",
 * "Juniper", "Owner". These are identity cues, NOT explanatory captions —
 * no prose, no arrows, no infographic panels. The sprite always faces the
 * camera; the color family matches the object's identity (worker greens/
 * tans vs owner gold), keeping gold authority visually distinct.
 */
import { useMemo } from "react";
import * as THREE from "three";

function makeLabelTexture(text: string, accent: string): THREE.CanvasTexture {
  const pad = 18;
  const font = "600 44px system-ui, sans-serif";
  const meas = document.createElement("canvas").getContext("2d")!;
  meas.font = font;
  const w = Math.ceil(meas.measureText(text).width) + pad * 2;
  const h = 76;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // pill background
  ctx.fillStyle = "rgba(20, 18, 14, 0.72)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  // accent underline
  ctx.fillStyle = accent;
  ctx.fillRect(pad, h - 14, w - pad * 2, 6);
  // text
  ctx.font = font;
  ctx.fillStyle = "#f5f1e8";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, h / 2 - 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function Nameplate({
  text,
  position,
  accent,
  scale = 1,
}: {
  text: string;
  position: [number, number, number];
  accent: string;
  scale?: number;
}) {
  const tex = useMemo(() => makeLabelTexture(text, accent), [text, accent]);
  // plane aspect from canvas: width/height
  const aspect = tex.image.width / tex.image.height;
  const h = 0.42 * scale;
  const w = h * aspect;
  return (
    <sprite name={`nameplate-${text}`} position={position} scale={[w, h, 1]}>
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  );
}
