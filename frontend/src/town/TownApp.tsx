/**
 * TownApp: the Square's decorative world, separately bundled.
 * frontend/src/town/TownApp.tsx
 *
 * Fixed theatrical composition (Wes Anderson frontal staging), matte
 * miniature palette, four authored vignettes. The ONLY outbound channel
 * is the workshop door's navigation intent (see ./protocol.ts).
 * No backend clients, no protocol imports, no shared state.
 */
import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PAL } from "./kit";
import { requestEnterWorkshop } from "./protocol";
import { Carrier } from "./robots/Carrier";
import { Tinkerer } from "./robots/Tinkerer";
import { Reader } from "./robots/Reader";
import { Sweeper } from "./robots/Sweeper";
import { Waiter, Passerby, Helper } from "./robots/Extras";
import { Workshop, Exchange, Library, Depot, RepairShop, Ground, Lamp, Fountain, AlleyClutter, DistantRoof, DepotYard, Mailbox, FenceCorner, Hedge, CartWheel, PropTrail, CharacterTree, Plinth, ToolRack } from "./buildings";
import { WORKSHOP_SPATIAL_CONTRACT as W } from "../spatial/workshopContract";

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
function WorkshopDoor({ paused, onEnter }: { paused: boolean; onEnter: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current && !paused) {
      const s = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.05;
      ring.current.scale.set(s, s, 1);
    }
  });
  const enter = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onEnter();
  };
  return (
    // off-axis: important, not city hall. The lane bends toward it.
    <group position={[1.6, W.floorElevation, -4.2]} rotation={[0, W.orientationY, 0]}>
      <Plinth w={3.8} d={3.0} />
      <Workshop />
      {/* generous tap target over the door */}
      <mesh
        position={[W.door.centerX, W.door.height / 2, W.door.facadeZ]}
        onClick={enter}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[W.door.width + 0.9, W.door.height + 0.35, 0.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* wayfinding ring on the doorstep */}
      <mesh ref={ring} position={[0, 0.13, W.door.facadeZ + W.thresholdDepth * 0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.68, 32]} />
        <meshBasicMaterial color={PAL.warm} transparent opacity={0.75} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Scene({ clockRef, paused, onEnter }: { clockRef: React.MutableRefObject<number>; paused: boolean; onEnter: () => void }) {
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
      <WorkshopDoor paused={paused} onEnter={onEnter} />
      {/* UNEVEN CLUSTERS: the workshop + library + repair frame a modest
          forecourt; depot + exchange form the quieter west cluster. No
          equal spacing, no ring. */}
      <group position={[-4.8, 0, -2.4]} rotation={[0, 0.9, 0]}>
        <Plinth w={3.4} d={2.8} />
        <Exchange />
      </group>
      <group position={[4.6, 0, -2.2]} rotation={[0, -0.55, 0]}>
        <Plinth w={3.0} d={2.6} />
        <Library />
      </group>
      <group position={[-4.6, 0, 2.8]} rotation={[0, 1.05, 0]}>
        <Plinth w={2.8} d={2.4} />
        <Depot />
      </group>
      <group position={[7.2, 0, -2.0]} rotation={[0, -0.55, 0]}>
        <Plinth w={3.2} d={2.6} />
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

      {/* workshop story: one waiting, attention on the door.
          Clear of the door lantern: silhouette must not merge. */}
      <Waiter t={t + 1.0} position={[2.3, 0, -1.8]} rotationY={-1.96} />
      {/* tools belong to the workshop: a rack beside the door */}
      <ToolRack position={[-0.4, 0, -2.8]} rotationY={0.35} />
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
  const [entering, setEntering] = useState(false);
  const [returning] = useState(
    () => new URLSearchParams(window.location.search).get("threshold") === "return"
  );
  const entryTimer = useRef<number | null>(null);
  const enterWorkshop = () => {
    if (entering) return;
    setEntering(true);
    // Let the camera physically reach the threshold before handing the
    // validated intent to the parent. Transient activation remains active.
    entryTimer.current = window.setTimeout(requestEnterWorkshop, reduced ? 80 : 850);
  };
  useEffect(() => () => {
    if (entryTimer.current !== null) window.clearTimeout(entryTimer.current);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: PAL.cream }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [2.4, 5.8, 12.8], fov: 38, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ camera }) => camera.lookAt(0.7, 0.9, -1.2)}
      >
        <SceneFrame clockRef={clockRef} paused={paused} entering={entering && !reduced} returning={returning && !reduced} onEnter={enterWorkshop} onTick={() => setTick((x) => x + 1)} />
      </Canvas>
      {/* Semantic twin of the 3D hitbox: same action, no new channel. It
          provides a reliable generous touch target and browser-test handle. */}
      <button
        className="town-workshop-entry"
        aria-label="Enter the workshop"
        onClick={enterWorkshop}
      />
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
        className="town-hint"
        style={{
          position: "absolute",
          bottom: "max(20px, env(safe-area-inset-bottom))",
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
          fontFamily: "Georgia, serif",
          fontSize: 13,
          color: PAL.ink,
        }}
      >
        <span>Tap the workshop door to see how work gets approved</span>
      </div>
      <style>{`@media (max-aspect-ratio: 9/10) {
        .town-workshop-entry {
          left: 51% !important;
          top: 29% !important;
          width: 38% !important;
          height: 28% !important;
        }
        .town-hint {
          left: 16px !important;
          right: 78px !important;
          bottom: max(18px, env(safe-area-inset-bottom)) !important;
        }
        .town-hint span {
          background: rgba(250, 246, 236, 0.94);
          border-radius: 999px;
          padding: 8px 14px;
          box-shadow: 0 1px 8px rgba(61, 52, 40, 0.22);
          font-size: 12px;
          white-space: nowrap;
        }
      }
      .town-workshop-entry {
        position: absolute;
        left: 45%;
        top: 25%;
        width: 22%;
        height: 34%;
        border: 0;
        padding: 0;
        background: transparent;
        cursor: pointer;
        touch-action: manipulation;
      }
      .town-workshop-entry:focus-visible {
        outline: 3px solid ${PAL.warm};
        outline-offset: 4px;
        border-radius: 18px;
      }`}</style>
    </div>
  );
}

/** Frame driver: advances the vignette clock unless paused. */
function SceneFrame({
  clockRef,
  paused,
  entering,
  returning,
  onEnter,
  onTick,
}: {
  clockRef: React.MutableRefObject<number>;
  paused: boolean;
  entering: boolean;
  returning: boolean;
  onEnter: () => void;
  onTick: () => void;
}) {
  const seen = useRef(0);
  const entry = useRef(returning ? 1 : 0);
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
  // Composition is applied on every render-frame, including paused and
  // reduced-motion startup. Resize/rotation must never retain the camera
  // from the previous aspect ratio.
  useFrame(({ camera, clock, size }) => {
    const portrait = size.width / size.height < 0.9;
    const pc = camera as THREE.PerspectiveCamera;
      // portrait: its own authored staging — a low diagonal from the
      // south-west, at human height, looking up the lane. The workshop
      // sits off-center left; library and repair frame the midground;
      // a tree and the fence/cart give foreground occlusion. This is not
      // the landscape camera narrowed.
    entry.current = THREE.MathUtils.damp(entry.current, entering ? 1 : 0, 5.2, 1 / 60);
    const e = entry.current;
    const wantFov = THREE.MathUtils.lerp(portrait ? 52 : 38, 45, e);
    const wantX = THREE.MathUtils.lerp(portrait ? -4.7 : 2.4, 2.05, e);
    const wantY = THREE.MathUtils.lerp(portrait ? 3.6 : 5.8, 1.65, e);
    const wantZ = THREE.MathUtils.lerp(portrait ? 13.1 : 12.8, 0.1, e);
    if (pc.fov !== wantFov) {
      pc.fov = wantFov;
      pc.updateProjectionMatrix();
    }
    const sway = paused || entering ? 0 : portrait ? 0.12 : 0.25;
    camera.position.set(wantX + Math.sin(clock.elapsedTime * 0.11) * sway, wantY, wantZ);
    camera.lookAt(
      THREE.MathUtils.lerp(portrait ? 2.7 : 0.7, 1.6, e),
      THREE.MathUtils.lerp(portrait ? 0.65 : 0.9, 1.05, e),
      THREE.MathUtils.lerp(portrait ? -2.9 : -1.2, -1.1, e)
    );
  });
  return <Scene clockRef={clockRef} paused={paused} onEnter={onEnter} />;
}
