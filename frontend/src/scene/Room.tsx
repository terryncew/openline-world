import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { HelperInfo, ReviewInfo } from "../api";
import { ActionToken, ConfigBox, MandateBoard, OwnerFigure } from "./TourElements";

export type Station = "workbench" | "review" | "records" | "gate" | "board";

const CREAM = "#f3ecdc";
const OFFLINE_TINT = new THREE.Color("#33373d");
const BLUE = "#24405e";
const CORAL = "#e0714f";
const WOOD = "#a9834f";
const WOOD_DARK = "#7d5f36";
const BRASS = "#c9a227";
const INK = "#1d2430";

const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface Focus {
  pos: [number, number, number];
  target: [number, number, number];
}

export const OVERVIEW: Focus = { pos: [0, 15, 15], target: [0, 0, 0] };

export const STATION_FOCUS: Record<Station, Focus> = {
  workbench: { pos: [-9, 6.5, 8], target: [-5.5, 0.8, 0.5] },
  review: { pos: [0, 5.5, 9.5], target: [0, 1.2, -3] },
  records: { pos: [9, 6.5, 8], target: [5.5, 1.2, -2] },
  gate: { pos: [0, 5, 11], target: [0, 1.5, 4.5] },
  board: { pos: [5.2, 6.8, 13.8], target: [4.9, 1.2, 3.2] },
};

function Label({ children, position }: { children: React.ReactNode; position: [number, number, number] }) {
  return (
    <Html position={position} center className="room-label" occlude="raycast">
      <div>{children}</div>
    </Html>
  );
}

/* ---------------- helpers ---------------- */

const HELPER_COLORS: Record<string, string> = { wren: CORAL, juniper: BLUE };

function HelperFigure({
  info,
  position,
  targetPos,
  enterFrom,
  onSelect,
  selected,
  offline,
}: {
  info: HelperInfo;
  position: [number, number, number];
  /** tour mode: where the figure should drift to (revoked helpers leave) */
  targetPos?: [number, number, number];
  /** tour mode: where the figure starts on first appearance (new helpers arrive) */
  enterFrom?: [number, number, number];
  onSelect: (id: string) => void;
  selected: boolean;
  /** a successor is active: this worker is offline, not just revoked */
  offline?: boolean;
}) {
  const mover = useRef<THREE.Group>(null);
  const group = useRef<THREE.Group>(null);
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const headMat = useRef<THREE.MeshStandardMaterial>(null);
  const baseColor = info.active ? HELPER_COLORS[info.helper_id] ?? BRASS : "#8a8f96";
  const dimT = useRef(0);
  const phase = useRef(Math.random() * Math.PI * 2).current;
  const cur = useRef(new THREE.Vector3(...(enterFrom ?? position)));
  useFrame(({ clock }, dt) => {
    if (reducedMotion) return;
    const t = clock.getElapsedTime();
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.6 + phase) * 0.06;
      group.current.rotation.y = Math.sin(t * 0.5 + phase) * 0.25;
    }
    // drift toward the target spot; static when no target is given
    const tgt = new THREE.Vector3(...(targetPos ?? position));
    cur.current.lerp(tgt, 1 - Math.exp(-dt * 1.6));
    if (mover.current) mover.current.position.copy(cur.current);
    // smooth power-down when a successor takes over
    dimT.current = THREE.MathUtils.damp(dimT.current, offline ? 1 : 0, 4, dt);
    if (bodyMat.current) {
      bodyMat.current.color.set(baseColor).lerp(OFFLINE_TINT, dimT.current * 0.85);
    }
    if (headMat.current) {
      headMat.current.color.set(CREAM).lerp(OFFLINE_TINT, dimT.current * 0.6);
    }
  });
  return (
    <group ref={mover} position={enterFrom ?? position}>
      <group ref={group}>
        <mesh
          position={[0, 0.62, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(info.helper_id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => (document.body.style.cursor = "auto")}
        >
          <capsuleGeometry args={[0.34, 0.55, 8, 20]} />
          <meshStandardMaterial ref={bodyMat} color={baseColor} roughness={0.55} />
          {selected && <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={0.25} roughness={0.55} />}
        </mesh>
        <mesh position={[0, 1.28, 0]}>
          <sphereGeometry args={[0.3, 24, 24]} />
          <meshStandardMaterial ref={headMat} color={CREAM} roughness={0.5} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.11, 1.32, 0.26]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color={INK} />
        </mesh>
        <mesh position={[0.11, 1.32, 0.26]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshStandardMaterial color={INK} />
        </mesh>
        {/* feet */}
        <mesh position={[-0.16, 0.08, 0]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={INK} roughness={0.6} />
        </mesh>
        <mesh position={[0.16, 0.08, 0]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={INK} roughness={0.6} />
        </mesh>
        {!info.active && (
          <mesh position={[0, 1.62, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.5, 0.07, 0.07]} />
            <meshStandardMaterial color="#b03a2e" />
          </mesh>
        )}
      </group>
      <Html position={[0, 1.95, 0]} center className="room-label name" occlude="raycast">
        <div>
          {info.helper_id}
          {!info.active && (offline ? " · offline" : " · revoked")}
        </div>
      </Html>
    </group>
  );
}

/* ---------------- stations ---------------- */

function Workbench({ onSelect }: { onSelect: (s: Station) => void }) {
  return (
    <group position={[-5.5, 0, 0.5]} onClick={(e) => { e.stopPropagation(); onSelect("workbench"); }}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[3.4, 0.18, 1.8]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {[[-1.4, -0.7], [1.4, -0.7], [-1.4, 0.7], [1.4, 0.7]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.24, z]}>
          <boxGeometry args={[0.16, 0.48, 0.16]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
      ))}
      {/* papers */}
      {[[0.3, 0.1, 0.2], [-0.6, -0.2, -0.15], [0.9, -0.3, 0.45]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0.68, z]} rotation={[-Math.PI / 2, 0, r]}>
          <planeGeometry args={[0.7, 0.9]} />
          <meshStandardMaterial color="#fffdf5" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* mug */}
      <mesh position={[-1.1, 0.82, 0.4]}>
        <cylinderGeometry args={[0.11, 0.09, 0.24, 16]} />
        <meshStandardMaterial color={BRASS} roughness={0.4} />
      </mesh>
      <Label position={[0, 1.7, 0]}>Workbench — the task lives here</Label>
    </group>
  );
}

function ReviewStation({ review, onSelect }: { review: ReviewInfo | null; onSelect: (s: Station) => void }) {
  const stampColor = review ? (review.decision === "ALLOWED" ? "#2e7d4f" : "#b03a2e") : BRASS;
  return (
    <group position={[0, 0, -3]} onClick={(e) => { e.stopPropagation(); onSelect("review"); }}>
      {/* frame: two posts + beam */}
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 1.1, 0]}>
          <boxGeometry args={[0.22, 2.2, 0.22]} />
          <meshStandardMaterial color={BLUE} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 2.25, 0]}>
        <boxGeometry args={[2.9, 0.24, 0.24]} />
        <meshStandardMaterial color={BLUE} roughness={0.6} />
      </mesh>
      {/* pedestal + document */}
      <mesh position={[0, 0.5, 0.4]}>
        <boxGeometry args={[1.1, 1.0, 0.8]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.06, 0.4]} rotation={[-Math.PI / 2, 0, 0.06]}>
        <planeGeometry args={[0.8, 1.0]} />
        <meshStandardMaterial color="#fffdf5" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* stamp */}
      <mesh position={[0.18, 1.12, 0.55]} rotation={[-Math.PI / 2, 0, -0.25]}>
        <circleGeometry args={[0.22, 24]} />
        <meshStandardMaterial color={stampColor} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Label position={[0, 2.9, 0]}>Review station — every proposal is judged here</Label>
      {review && (
        <Html position={[0, 3.35, 0]} center className="room-label verdict" occlude="raycast">
          <div className={review.decision === "ALLOWED" ? "ok" : "no"}>
            {review.decision === "ALLOWED" ? "allowed" : "refused"}: {review.action}
          </div>
        </Html>
      )}
    </group>
  );
}

function RecordsCabinet({ count, onSelect }: { count: number; onSelect: (s: Station) => void }) {
  const folders = Math.min(count, 12);
  return (
    <group position={[5.5, 0, -2]} onClick={(e) => { e.stopPropagation(); onSelect("records"); }}>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[2.2, 2.0, 0.9]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      {[0.55, 1.15].map((y) => (
        <mesh key={y} position={[0, y, 0.46]}>
          <boxGeometry args={[2.0, 0.06, 0.06]} />
          <meshStandardMaterial color={WOOD} roughness={0.7} />
        </mesh>
      ))}
      {Array.from({ length: folders }).map((_, i) => {
        const row = Math.floor(i / 6);
        const col = i % 6;
        return (
          <mesh key={i} position={[-0.75 + col * 0.3, 0.28 + row * 0.6, 0.1]} rotation={[0, 0.12, 0]}>
            <boxGeometry args={[0.24, 0.42, 0.6]} />
            <meshStandardMaterial color={i % 2 ? CREAM : "#e8dcc2"} roughness={0.85} />
          </mesh>
        );
      })}
      <Label position={[0, 2.5, 0]}>Records — {count} signed receipt{count === 1 ? "" : "s"}</Label>
    </group>
  );
}

function GateArch({ onSelect }: { onSelect: (s: Station) => void }) {
  return (
    <group position={[0, 0, 4.5]} onClick={(e) => { e.stopPropagation(); onSelect("gate"); }}>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x, 1.4, 0]}>
          <boxGeometry args={[0.3, 2.8, 0.3]} />
          <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 2.95, 0]}>
        <torusGeometry args={[1.6, 0.15, 12, 32, Math.PI]} />
        <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.4} />
      </mesh>
      <Label position={[0, 3.9, 0]}>The gate — every consequential action passes through</Label>
    </group>
  );
}

function Room() {
  return (
    <group>
      {/* platform */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[17, 0.5, 13]} />
        <meshStandardMaterial color="#d9cba8" roughness={0.9} />
      </mesh>
      {/* low walls */}
      <mesh position={[0, 0.75, -6.5]}>
        <boxGeometry args={[17, 1.5, 0.3]} />
        <meshStandardMaterial color={CREAM} roughness={0.95} />
      </mesh>
      <mesh position={[-8.5, 0.75, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[13, 1.5, 0.3]} />
        <meshStandardMaterial color={CREAM} roughness={0.95} />
      </mesh>
      <mesh position={[8.5, 0.75, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[13, 1.5, 0.3]} />
        <meshStandardMaterial color={CREAM} roughness={0.95} />
      </mesh>
      {/* rug */}
      <mesh position={[0, 0.01, 1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.2, 40]} />
        <meshStandardMaterial color="#e4d5b5" roughness={1} />
      </mesh>
      {/* lamp */}
      <mesh position={[-7, 1.5, -5]}>
        <cylinderGeometry args={[0.08, 0.12, 3, 12]} />
        <meshStandardMaterial color={INK} roughness={0.6} />
      </mesh>
      <mesh position={[-7, 3.1, -5]}>
        <coneGeometry args={[0.55, 0.6, 16, 1, true]} />
        <meshStandardMaterial color={CORAL} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[-7, 2.8, -5]} intensity={12} distance={9} color="#ffd9a0" />
      {/* plant */}
      <mesh position={[7.4, 0.35, -5.2]}>
        <cylinderGeometry args={[0.3, 0.24, 0.7, 12]} />
        <meshStandardMaterial color="#a8542f" roughness={0.8} />
      </mesh>
      <mesh position={[7.4, 1.1, -5.2]}>
        <sphereGeometry args={[0.55, 14, 14]} />
        <meshStandardMaterial color="#4d7c4d" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ---------------- camera ---------------- */

function CameraRig({ focus, walk, walkTarget }: { focus: Focus; walk: boolean; walkTarget: [number, number, number] }) {
  const { camera } = useThree();
  const dest = useRef({ pos: new THREE.Vector3(...focus.pos), target: new THREE.Vector3(...focus.target) });
  useFrame((_, dt) => {
    const p = walk ? new THREE.Vector3(walkTarget[0], 6.5, walkTarget[2] + 7) : new THREE.Vector3(...focus.pos);
    const t = walk ? new THREE.Vector3(...walkTarget) : new THREE.Vector3(...focus.target);
    if (reducedMotion) {
      dest.current.pos.copy(p);
      dest.current.target.copy(t);
    } else {
      const k = 1 - Math.exp(-dt * 3.2);
      dest.current.pos.lerp(p, k);
      dest.current.target.lerp(t, k);
    }
    camera.position.copy(dest.current.pos);
    camera.lookAt(dest.current.target);
  });
  return null;
}

/* ---------------- walk mode ---------------- */

const BOUNDS = { x: 7.5, zMin: -5.5, zMax: 5.5 };

function Player({
  position,
  onMove,
  walk,
  moveTarget,
  onArrive,
}: {
  position: [number, number, number];
  onMove: (p: [number, number, number]) => void;
  walk: boolean;
  moveTarget: [number, number, number] | null;
  onArrive: () => void;
}) {
  const keys = useRef<Record<string, boolean>>({});
  useFrame((_, dt) => {
    if (!walk) return;
    const speed = 4.5 * dt;
    let [x, y, z] = position;
    const k = keys.current;
    if (k["w"] || k["arrowup"]) z -= speed;
    if (k["s"] || k["arrowdown"]) z += speed;
    if (k["a"] || k["arrowleft"]) x -= speed;
    if (k["d"] || k["arrowright"]) x += speed;
    if (moveTarget) {
      const [tx, , tz] = moveTarget;
      const dx = tx - x, dz = tz - z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.15) onArrive();
      else {
        x += (dx / dist) * speed;
        z += (dz / dist) * speed;
      }
    }
    x = THREE.MathUtils.clamp(x, -BOUNDS.x, BOUNDS.x);
    z = THREE.MathUtils.clamp(z, BOUNDS.zMin, BOUNDS.zMax);
    if (x !== position[0] || z !== position[2]) onMove([x, y, z]);
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  return (
    <group position={position} visible={walk}>
      <mesh position={[0, 0.5, 0]}>
        <capsuleGeometry args={[0.3, 0.5, 8, 16]} />
        <meshStandardMaterial color={BRASS} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <sphereGeometry args={[0.26, 20, 20]} />
        <meshStandardMaterial color={CREAM} roughness={0.5} />
      </mesh>
      <Html position={[0, 1.7, 0]} center className="room-label name" occlude="raycast">
        <div>you</div>
      </Html>
    </group>
  );
}

/* ---------------- scene ---------------- */

export function WorkshopScene({
  helpers,
  review,
  receiptCount,
  focus,
  walk,
  tour,
  onSelectHelper,
  onSelectStation,
  onFloorTap,
  drift,
}: {
  helpers: HelperInfo[];
  review: ReviewInfo | null;
  receiptCount: number;
  focus: Focus;
  walk: boolean;
  /** tour mode: helpers visibly leave/arrive, owner marker shown */
  tour?: boolean;
  /** ambient slow auto-orbit for picture-in-picture use; camera only, never depicts decisions */
  drift?: boolean;
  onSelectHelper: (id: string) => void;
  onSelectStation: (s: Station) => void;
  onFloorTap: (p: [number, number, number]) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [playerPos, setPlayerPos] = useState<[number, number, number]>([0, 0, 5.5]);
  const [moveTarget, setMoveTarget] = useState<[number, number, number] | null>(null);
  const spots: Record<string, [number, number, number]> = {
    wren: [-3.2, 0, 2.2],
    juniper: [3.2, 0, 2.2],
  };
  const OFFSTAGE_LEFT: [number, number, number] = [-7.0, 0, 5.2];
  const OFFSTAGE_RIGHT: [number, number, number] = [7.0, 0, 5.2];

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: OVERVIEW.pos, fov: 42 }}>
      <color attach="background" args={["#10151c"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[8, 12, 6]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <Room />
      <Workbench onSelect={onSelectStation} />
      <ReviewStation review={review} onSelect={onSelectStation} />
      <RecordsCabinet count={receiptCount} onSelect={onSelectStation} />
      <GateArch onSelect={onSelectStation} />
      <MandateBoard helpers={helpers} />
      <ConfigBox />
      {tour && <OwnerFigure />}
      <ActionToken review={review} spots={spots} />
      {helpers.map((h) => (
        <HelperFigure
          key={h.helper_id}
          info={h}
          position={spots[h.helper_id] ?? [0, 0, 2.2]}
          targetPos={
            tour && h.helper_id === "wren" && !h.active ? OFFSTAGE_LEFT : undefined
          }
          enterFrom={tour && h.helper_id === "juniper" ? OFFSTAGE_RIGHT : undefined}
          selected={selected === h.helper_id}
          offline={!h.active && helpers.some((o) => o.active && o.helper_id !== h.helper_id)}
          onSelect={(id) => {
            setSelected(id);
            onSelectHelper(id);
          }}
        />
      ))}
      {walk && (
        <Player
          position={playerPos}
          onMove={setPlayerPos}
          walk={walk}
          moveTarget={moveTarget}
          onArrive={() => setMoveTarget(null)}
        />
      )}
      <mesh
        position={[0, 0.03, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          if (!walk) return;
          e.stopPropagation();
          setMoveTarget([e.point.x, 0, e.point.z]);
          onFloorTap([e.point.x, 0, e.point.z]);
        }}
      >
        <planeGeometry args={[16, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <CameraRig focus={focus} walk={walk} walkTarget={playerPos} />
      {!walk && <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.4} minDistance={6} maxDistance={30} autoRotate={!!drift && !reducedMotion} autoRotateSpeed={0.55} />}
      {!reducedMotion && !tour && (
        <Html position={[0, 0.02, 6.2]} center className="room-label caption" occlude="raycast">
          <div>helper movement is illustrative — only gate decisions are real</div>
        </Html>
      )}
    </Canvas>
  );
}
