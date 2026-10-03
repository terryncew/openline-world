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
import { Workshop, Exchange, Library, Depot, RepairShop, Ground, Tree, Lamp, Fountain } from "./buildings";

function Sun() {
  return (
    <>
      <hemisphereLight args={[PAL.cream, PAL.sageDark, 0.85]} />
      <directionalLight position={[6, 10, 7]} intensity={1.6} color="#fff2dd" />
      <directionalLight position={[-6, 4, -4]} intensity={0.35} color="#dfe8f0" />
    </>
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
    <group position={[0, 0, -4.5]}>
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
      <Ground />
      <Fountain />
      <WorkshopDoor />
      <group position={[-5.6, 0, -2.2]} rotation={[0, 0.55, 0]}>
        <Exchange />
      </group>
      <group position={[5.6, 0, -2.2]} rotation={[0, -0.55, 0]}>
        <Library />
      </group>
      <group position={[-4.1, 0, 2.6]} rotation={[0, 0.75, 0]}>
        <Depot />
      </group>
      <group position={[4.1, 0, 2.6]} rotation={[0, -0.75, 0]}>
        <RepairShop />
      </group>

      {/* the four vignettes, each on its own deterministic clock offset */}
      <Carrier t={t} position={[-2.6, 0, -3.1]} />
      <Tinkerer t={t + 4.0} position={[3.3, 0, -3.3]} />
      <Reader t={t + 8.0} position={[2.0, 0, 0.9]} rotationY={-0.35} />
      <Sweeper t={t + 2.0} position={[-1.1, 0, 3.2]} rotationY={0.3} />

      <Tree position={[-3.4, 0, 1.2]} s={1.1} />
      <Tree position={[3.6, 0, 1.6]} s={0.9} />
      <Tree position={[-6.8, 0, 1.8]} s={1.25} />
      <Tree position={[6.9, 0, 1.4]} s={1.05} />
      <Tree position={[0.5, 0, -6.8]} s={1.0} />
      <Lamp position={[-2.6, 0, 2.2]} />
      <Lamp position={[2.6, 0, 2.2]} />
      <Lamp position={[-2.1, 0, -3.9]} />
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
        camera={{ position: [0, 5.0, 11.6], fov: 40, near: 0.1, far: 60 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ camera }) => camera.lookAt(0, 1.25, -1)}
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
  useFrame(({ camera, clock }) => {
    if (!paused) {
      camera.position.x = Math.sin(clock.elapsedTime * 0.11) * 0.35;
      camera.lookAt(0, 1.25, -1);
    }
  });
  return <Scene clockRef={clockRef} />;
}
