/**
 * TownApp: the Square's decorative world, separately bundled.
 * frontend/src/town/TownApp.tsx
 *
 * Fixed theatrical composition (Wes Anderson frontal staging), matte
 * miniature palette, four authored vignettes. The ONLY outbound channel
 * is the workshop door's navigation intent (see ./protocol.ts).
 * No backend clients, no protocol imports, no shared state.
 */
import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PAL } from "./kit";
import { requestEnterWorkshop } from "./protocol";
import { Carrier } from "./robots/Carrier";
import { Tinkerer } from "./robots/Tinkerer";
import { Reader } from "./robots/Reader";
import { Sweeper } from "./robots/Sweeper";
import { Waiter, Passerby, Helper } from "./robots/Extras";
import { Workshop, Exchange, Library, Depot, RepairShop, Ground, Lamp, Fountain, AlleyClutter, DistantRoof, DepotYard, Mailbox, FenceCorner, Hedge, CartWheel, PropTrail, CharacterTree } from "./buildings";

function Sun() {
  return (
    <>
      <hemisphereLight args={["#fdf8ec", "#aeb89a", 0.65]} />
      <directionalLight position={[5, 9, 6]} intensity={1.7} color="#fff1da" />
      <directionalLight position={[-5, 3, 2]} intensity={0.3} color="#e8eef2" />
    </>
  );
}

/** Soft contact shadow under a building footprint: grounds the building
 *  without heavy ambient shading. */
function Footprint({
  x,
  z,
  sx,
  sz,
  opacity = 0.13,
}: {
  x: number;
  z: number;
  sx: number;
  sz: number;
  opacity?: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, z]} scale={[sx, sz, 1]}>
      <circleGeometry args={[1, 28]} />
      <meshBasicMaterial color="#3d3428" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** The workshop door: generous invisible hitbox + a soft wayfinding ring.
 *  Clicking/tapping sends the single navigation intent. */
function WorkshopDoor() {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.05;
      ring.current.scale.set(s, s, 1);
    }
  });
  const enter = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    requestEnterWorkshop();
  };
  return (
    // off-axis: important, not city hall. The lane bends toward it.
    <group position={[1.6, 0, -4.2]} rotation={[0, -0.12, 0]}>
      <Workshop />
      {/* generous tap target over the door */}
      <mesh
        position={[0, 1.0, 1.45]}
        onClick={enter}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[2.2, 2.4, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* wayfinding ring on the doorstep */}
      <mesh ref={ring} position={[0, 0.13, 1.75]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.68, 32]} />
        <meshBasicMaterial color={PAL.warm} transparent opacity={0.75} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Scene({ clockRef }: { clockRef: React.MutableRefObject<number> }) {
  const t = clockRef.current;
  return (
    <>
      <Sun />
      <fog attach="fog" args={[PAL.cream, 26, 62]} />
      <Ground />
      {/* contact shadows under every building */}
      <Footprint x={1.6} z={-4.2} sx={2.4} sz={2.0} />
      <Footprint x={-4.8} z={-2.4} sx={2.2} sz={1.9} />
      <Footprint x={4.6} z={-2.2} sx={2.0} sz={1.8} />
      <Footprint x={-4.6} z={2.8} sx={1.9} sz={1.7} />
      <Footprint x={7.2} z={-2.0} sx={2.1} sz={1.8} />
      {/* fountain: the west cluster's gathering point */}
      <group position={[-3.4, 0, 3.4]}>
        <Fountain />
      </group>
      <WorkshopDoor />
      {/* UNEVEN CLUSTERS: the workshop + library + repair frame a modest
          forecourt; depot + exchange form the quieter west cluster. No
          equal spacing, no ring. */}
      <group position={[-4.8, 0, -2.4]} rotation={[0, 0.9, 0]}>
        <Exchange />
      </group>
      <group position={[4.6, 0, -2.2]} rotation={[0, -0.55, 0]}>
        <Library />
      </group>
      <group position={[-4.6, 0, 2.8]} rotation={[0, 1.05, 0]}>
        <Depot />
      </group>
      <group position={[7.2, 0, -2.0]} rotation={[0, -0.55, 0]}>
        <RepairShop />
      </group>

      {/* side alleys: crates and barrels where lanes slip behind buildings */}
      <AlleyClutter position={[-6.9, 0, 0.2]} rotationY={0.4} />
      <AlleyClutter position={[7.8, 0, 0.6]} rotationY={-0.5} />
      <AlleyClutter position={[9.2, 0, -5.2]} rotationY={-0.7} />

      {/* more town implied beyond every frame edge: small, low, distant */}
      <DistantRoof position={[-12.5, 0, -7.0]} color={PAL.blue} s={0.7} />
      <DistantRoof position={[11.0, 0, -3.0]} color={PAL.sage} />
      <DistantRoof position={[-8.5, 0, 8.0]} color={PAL.terracotta} />
      <DistantRoof position={[13.5, 0, 7.5]} color={PAL.blue} />
      <DistantRoof position={[-13.5, 0, -4.0]} color={PAL.sage} />

      {/* STORY CLUSTERS: each zone tells its labor story */}
      {/* depot yard: the carrier LOADS lumber under the depot canopy */}
      <group position={[-4.4, 0, 3.9]} rotation={[0, 0.35, 0]}>
        <DepotYard />
      </group>
      <Carrier t={t} position={[-3.2, 0, 3.4]} />
      {/* repair: the tinkerer retries the mechanism beside the parts bench */}
      <Tinkerer t={t + 4.0} position={[6.0, 0, -0.6]} rotationY={-0.5} />
      {/* library nook: the reader, the helper, the cart */}
      <Reader t={t + 8.0} position={[4.0, 0, -0.4]} rotationY={-0.9} />
      <Helper t={t + 3.0} position={[5.0, 0, 0.4]} rotationY={-2.36} />
      {/* street: the sweeper works the main lane */}
      <Sweeper t={t + 2.0} position={[-0.2, 0, 5.4]} rotationY={0.25} />

      {/* workshop story: one waiting, attention on the door */}
      <Waiter t={t + 1.0} position={[2.6, 0, -2.0]} rotationY={-1.96} />
      {/* a delivery in progress along the main lane */}
      <Passerby t={t + 5.0} from={[0.4, 9.0]} to={[1.2, 3.0]} />

      {/* stepping-stone trail leads the eye to the workshop door */}
      <PropTrail />

      {/* street furniture: the street is lived on */}
      <Mailbox position={[3.4, 0, 4.6]} rotationY={-0.4} />
      <Lamp position={[3.0, 0, 6.8]} />
      <Lamp position={[0.4, 0, 4.4]} />
      <Lamp position={[-2.8, 0, 3.0]} />
      <Lamp position={[4.8, 0, -1.2]} />
      <Lamp position={[-4.2, 0, -3.6]} />

      {/* foreground edge: fence corner + cart wheel + hedge imply more town */}
      <FenceCorner position={[-3.1, 0, 8.7]} rotationY={0.3} />
      <CartWheel position={[-2.2, 0, 8.9]} rotationY={0.5} />
      <Hedge position={[4.8, 0, 10.4]} w={1.8} />
      <Hedge position={[-6.2, 0, 9.0]} w={1.3} />

      {/* trees with character occlude the street ends: lanes vanish behind green */}
      <CharacterTree position={[-8.2, 0, 1.2]} s={1.2} seed={1} />
      <CharacterTree position={[7.8, 0, -3.4]} s={1.2} seed={2} />
      <CharacterTree position={[9.0, 0, 4.8]} s={1.0} seed={3} />
      <CharacterTree position={[-4.5, 0, 8.8]} s={1.1} seed={4} />
      <CharacterTree position={[5.5, 0, 9.2]} s={0.9} seed={5} />
      <CharacterTree position={[7.8, 0, -6.5]} s={1.0} seed={6} />
      <CharacterTree position={[-2.0, 0, -6.0]} s={1.0} seed={7} />
      <CharacterTree position={[-3.4, 0, 6.4]} s={0.85} seed={8} />
      <CharacterTree position={[-7.8, 0, -4.2]} s={1.15} seed={9} />
      <CharacterTree position={[10.6, 0, 0.6]} s={1.05} seed={10} />
    </>
  );
}

function usePrefersReducedMotion(): boolean {
  const [v] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
  return v;
}

export function TownApp() {
  const clockRef = useRef(0);
  const [, setTick] = useState(0); // re-render Scene each frame for t
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(reduced);

  return (
    <div style={{ position: "fixed", inset: 0, background: PAL.cream }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [2.4, 5.8, 12.8], fov: 38, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ camera }) => camera.lookAt(0.7, 0.9, -1.2)}
      >
        <SceneFrame clockRef={clockRef} paused={paused || reduced} onTick={() => setTick((x) => x + 1)} />
      </Canvas>
      {/* minimal chrome: brand mark + pause */}
      <div
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top))",
          left: 16,
          pointerEvents: "none",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 17, color: PAL.ink }}>OpenLine World</div>
        <div style={{ fontSize: 12, color: "#6d6252" }}>a town where agents work</div>
      </div>
      <button
        aria-label={paused ? "Resume town motion" : "Pause town motion"}
        onClick={() => setPaused((p) => !p)}
        style={{
          position: "absolute",
          bottom: "max(14px, env(safe-area-inset-bottom))",
          right: 14,
          width: 48,
          height: 48,
          borderRadius: 24,
          border: "none",
          background: "rgba(61,52,40,0.82)",
          color: "#faf6ec",
          fontSize: 18,
          cursor: "pointer",
          touchAction: "manipulation",
        }}
      >
        {paused ? "▶" : "⏸"}
      </button>
      <div
        style={{
          position: "absolute",
          bottom: "max(20px, env(safe-area-inset-bottom))",
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
          fontFamily: "Georgia, serif",
          fontSize: 13,
          color: "#6d6252",
        }}
      >
        Tap the workshop door to see how work gets approved
      </div>
    </div>
  );
}

/** Frame driver: advances the vignette clock unless paused. */
function SceneFrame({
  clockRef,
  paused,
  onTick,
}: {
  clockRef: React.MutableRefObject<number>;
  paused: boolean;
  onTick: () => void;
}) {
  const seen = useRef(0);
  useFrame((_, delta) => {
    if (!paused) {
      clockRef.current += delta;
      // re-render at ~30fps; vignette poses are pure functions of t
      seen.current += delta;
      if (seen.current > 1 / 30) {
        seen.current = 0;
        onTick();
      }
    }
  });
  // subtle camera sway for life (disabled when reduced motion: paused covers it)
  // responsive: portrait viewports pull back + widen so the square stays in frame
  useFrame(({ camera, clock, size }) => {
    if (!paused) {
      const portrait = size.width / size.height < 0.9;
      const pc = camera as THREE.PerspectiveCamera;
      const wantFov = portrait ? 52 : 38;
      const wantX = portrait ? 1.44 : 2.4;
      const wantY = portrait ? 7.6 : 5.8;
      const wantZ = portrait ? 18.0 : 12.8;
      if (pc.fov !== wantFov) {
        pc.fov = wantFov;
        pc.updateProjectionMatrix();
      }
      camera.position.set(
        wantX + Math.sin(clock.elapsedTime * 0.11) * 0.25,
        wantY,
        wantZ
      );
      camera.lookAt(portrait ? 0.5 : 0.7, 0.9, -1.2);
    }
  });
  return <Scene clockRef={clockRef} />;
}
