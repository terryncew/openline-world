/**
 * The Square's buildings. Original miniature designs, matte materials.
 * frontend/src/town/buildings.tsx
 *
 * The workshop is the one real destination (physical entrance below).
 * Everything else is visibly non-operational scenery: the exchange is
 * shuttered and barred (CLEARLY no trading), the depot hatch is shut,
 * the repair shop's work sits under a tarp. The distinction between
 * imagined town and proven machinery is legible from PLACE, not prose.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { PAL, matte } from "./kit";

/** Painted wooden nameplate. Text is place-making (a building's name),
 *  never an explanation of OpenLine. */
export function Sign({
  text,
  width = 1.5,
  color = PAL.cream,
  bg = PAL.woodDark,
}: {
  text: string;
  width?: number;
  color?: string;
  bg?: string;
}) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 10;
    g.strokeRect(8, 8, 496, 112);
    g.fillStyle = color;
    g.font = "700 64px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text.toUpperCase(), 256, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, color, bg]);
  return (
    <mesh>
      <boxGeometry args={[width, width / 4, 0.06]} />
      <meshStandardMaterial map={tex} roughness={0.9} metalness={0} />
    </mesh>
  );
}

function Windows({
  color,
  lit,
  positions,
}: {
  color: string;
  lit: boolean;
  positions: [number, number, number][];
}) {
  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <boxGeometry args={[0.5, 0.6, 0.08]} />
            {lit ? (
              <meshStandardMaterial color={PAL.warm} emissive={PAL.warm} emissiveIntensity={0.55} roughness={0.6} />
            ) : (
              matte(color)
            )}
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <boxGeometry args={[0.06, 0.6, 0.02]} />
            {matte(PAL.woodDark)}
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <boxGeometry args={[0.5, 0.06, 0.02]} />
            {matte(PAL.woodDark)}
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PitchedRoof({ w, d, h, color }: { w: number; d: number; h: number; color: string }) {
  return (
    <mesh position={[0, h / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[Math.SQRT2 * Math.max(w, d) / 2, h, 4]} />
      {matte(color)}
    </mesh>
  );
}

/** THE WORKSHOP — the one real destination. Terracotta, arched wooden
 *  double door (the clickable entrance), warm windows. */
export function Workshop() {
  return (
    <group>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[3.4, 2.2, 2.6]} />
        {matte(PAL.terracotta)}
      </mesh>
      <group position={[0, 2.2, 0]}>
        <PitchedRoof w={3.8} d={3.0} h={1.2} color={PAL.terracottaDark} />
      </group>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[3.7, 0.12, 2.9]} />
        {matte(PAL.cream)}
      </mesh>
      {/* arched double door */}
      <group position={[0, 0, 1.31]}>
        <mesh position={[0, 0.75, 0]}>
          <boxGeometry args={[1.3, 1.5, 0.1]} />
          {matte(PAL.woodDark)}
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.65, 0.65, 0.1, 20, 1, false, 0, Math.PI]} />
          {matte(PAL.woodDark)}
        </mesh>
        <mesh position={[0, 0.75, 0.06]}>
          <boxGeometry args={[0.05, 1.4, 0.04]} />
          {matte(PAL.ink)}
        </mesh>
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} position={[x, 0.75, 0.06]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            {matte(PAL.warm)}
          </mesh>
        ))}
      </group>
      <Windows color={PAL.blueDark} lit positions={[[-1.15, 1.25, 1.31], [1.15, 1.25, 1.31]]} />
      <group position={[0, 2.62, 1.42]}>
        <Sign text="Workshop" width={1.7} />
      </group>
      {/* doorstep */}
      <mesh position={[0, 0.06, 1.75]}>
        <boxGeometry args={[1.7, 0.12, 0.9]} />
        {matte(PAL.stone)}
      </mesh>
    </group>
  );
}

/** THE EXCHANGE — visibly non-operational. Shuttered windows, a barred
 *  double door, empty stall frames, one tipped crate. Nothing to trade,
 *  nobody trading. The closure reads from the shutters and the bar. */
export function Exchange() {
  return (
    <group>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[3.0, 2.0, 2.4]} />
        {matte(PAL.blue)}
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[3.3, 0.14, 2.7]} />
        {matte(PAL.blueDark)}
      </mesh>
      {/* shuttered windows */}
      {[[-0.95, 1.2], [0.95, 1.2]].map(([x, y], i) => (
        <group key={i} position={[x, y, 1.21]}>
          <mesh>
            <boxGeometry args={[0.6, 0.7, 0.06]} />
            {matte(PAL.woodDark)}
          </mesh>
          {[0.18, 0.0, -0.18].map((dy, j) => (
            <mesh key={j} position={[0, dy, 0.045]} rotation={[d2(24), 0, 0]}>
              <boxGeometry args={[0.56, 0.1, 0.03]} />
              {matte(PAL.wood)}
            </mesh>
          ))}
        </group>
      ))}
      {/* barred double door */}
      <group position={[0, 0, 1.21]}>
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[1.2, 1.4, 0.08]} />
          {matte(PAL.blueDark)}
        </mesh>
        <mesh position={[0, 0.7, 0.07]} rotation={[0, 0, d2(8)]}>
          <boxGeometry args={[1.5, 0.12, 0.06]} />
          {matte(PAL.wood)}
        </mesh>
        <mesh position={[-0.45, 0.7, 0.07]}>
          <boxGeometry args={[0.16, 0.2, 0.08]} />
          {matte(PAL.ink)}
        </mesh>
      </group>
      <group position={[0, 2.35, 1.3]}>
        <Sign text="Exchange" width={1.6} />
      </group>
      {/* empty stall frames, one tipped */}
      {[[-1.7, 0.4, 0], [1.7, 0.2, d2(8)]].map(([x, z, rz], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, 0, rz as number]}>
          {[-0.5, 0.5].map((px) => (
            <mesh key={px} position={[px, 0.5, 0]}>
              <boxGeometry args={[0.08, 1.0, 0.08]} />
              {matte(PAL.woodDark)}
            </mesh>
          ))}
          <mesh position={[0, 1.0, 0]} rotation={[0, 0, d2(-4)]}>
            <boxGeometry args={[1.3, 0.06, 0.7]} />
            {matte(PAL.wood)}
          </mesh>
        </group>
      ))}
      {/* tipped empty crate */}
      <group position={[2.3, 0.2, 0.9]} rotation={[0, d2(30), d2(70)]}>
        <mesh>
          <boxGeometry args={[0.45, 0.45, 0.45]} />
          {matte(PAL.wood)}
        </mesh>
      </group>
    </group>
  );
}

function d2(deg: number) {
  return (deg * Math.PI) / 180;
}

/** THE LIBRARY — quiet, warm windows, a book cart outside. */
export function Library() {
  return (
    <group>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[2.6, 1.8, 2.2]} />
        {matte(PAL.sage)}
      </mesh>
      <group position={[0, 1.8, 0]}>
        <PitchedRoof w={3.0} d={2.6} h={1.0} color={PAL.sageDark} />
      </group>
      <Windows color={PAL.creamDark} lit positions={[[-0.8, 1.0, 1.11], [0.8, 1.0, 1.11]]} />
      <group position={[0, 0, 1.11]}>
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[0.9, 1.3, 0.08]} />
          {matte(PAL.woodDark)}
        </mesh>
      </group>
      <group position={[0, 2.2, 1.2]}>
        <Sign text="Library" width={1.4} />
      </group>
      {/* book cart */}
      <group position={[1.9, 0, 0.6]} rotation={[0, d2(-18), 0]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.7, 0.08, 0.45]} />
          {matte(PAL.wood)}
        </mesh>
        {[-0.28, 0.28].map((x) =>
          [-0.16, 0.16].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.14, z]}>
              <cylinderGeometry args={[0.09, 0.09, 0.09, 12]} />
              {matte(PAL.ink)}
            </mesh>
          ))
        )}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.2 + i * 0.18, 0.52, 0]} rotation={[0, 0, d2(-8)]}>
            <boxGeometry args={[0.1, 0.26, 0.18]} />
            {matte([PAL.terracotta, PAL.blue, PAL.cream][i])}
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** THE COURIER DEPOT — hatch shut, parcels waiting neatly. Nothing moves. */
export function Depot() {
  return (
    <group>
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2.4, 1.7, 2.0]} />
        {matte(PAL.cream)}
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[2.7, 0.14, 2.3]} />
        {matte(PAL.terracottaDark)}
      </mesh>
      {/* shut service hatch */}
      <group position={[0, 1.0, 1.01]}>
        <mesh>
          <boxGeometry args={[1.1, 0.8, 0.07]} />
          {matte(PAL.woodDark)}
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[0.9, 0.1, 0.04]} />
          {matte(PAL.wood)}
        </mesh>
        <mesh position={[0, 0.45, 0.03]}>
          <boxGeometry args={[1.3, 0.08, 0.12]} />
          {matte(PAL.stoneDark)}
        </mesh>
      </group>
      <group position={[0, 2.05, 1.1]}>
        <Sign text="Depot" width={1.2} />
      </group>
      {/* parcels waiting, neatly stacked, going nowhere */}
      {[
        [1.6, 0.18, 0.4, 0.36],
        [1.6, 0.5, 0.4, 0.28],
        [2.05, 0.15, 0.5, 0.3],
      ].map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, d2(i * 12), 0]}>
          <boxGeometry args={[s, s * 0.8, s]} />
          {matte(i % 2 ? PAL.creamDark : PAL.wood)}
        </mesh>
      ))}
    </group>
  );
}

/** THE REPAIR SHOP — striped awning, workbench, the work itself under
 *  a tarp. Still. Waiting. */
export function RepairShop() {
  return (
    <group>
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[2.8, 1.9, 2.2]} />
        {matte(PAL.terracotta)}
      </mesh>
      <group position={[0, 1.9, 0]}>
        <PitchedRoof w={3.2} d={2.6} h={1.0} color={PAL.woodDark} />
      </group>
      {/* striped awning */}
      <group position={[0, 1.7, 1.5]} rotation={[d2(18), 0, 0]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[-0.9 + i * 0.3, 0, 0]}>
            <boxGeometry args={[0.3, 0.04, 1.0]} />
            {matte(i % 2 ? PAL.cream : PAL.terracotta)}
          </mesh>
        ))}
      </group>
      <group position={[0, 2.3, 1.15]}>
        <Sign text="Repair" width={1.3} />
      </group>
      {/* workbench with tarp-covered work */}
      <group position={[-1.9, 0, 0.9]} rotation={[0, d2(14), 0]}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[1.2, 0.08, 0.6]} />
          {matte(PAL.wood)}
        </mesh>
        {[-0.5, 0.5].map((x) =>
          [-0.22, 0.22].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.2, z]}>
              <boxGeometry args={[0.08, 0.4, 0.08]} />
              {matte(PAL.woodDark)}
            </mesh>
          ))
        )}
        {/* the tarp: a draped shape, utterly still */}
        <mesh position={[0.1, 0.72, 0]} scale={[1, 0.75, 1]}>
          <sphereGeometry args={[0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          {matte(PAL.sage)}
        </mesh>
      </group>
    </group>
  );
}

/** Ground: NO enclosing border, NO circular stage. A cream world that
 *  extends past every frame edge, with irregular grass patches and a
 *  network of winding street ribbons that run offscreen and disappear
 *  behind buildings and trees. The plaza is the intersection of those
 *  streets, not a disc. */
export function Ground() {
  const patches = useMemo(
    () => [
      { g: blobGeometry(4.6, 0.4, 2.1), p: [-9.5, 0.004, -7.5] as [number, number, number] },
      { g: blobGeometry(5.2, 0.35, 5.7), p: [10.5, 0.004, 4.0] as [number, number, number] },
      { g: blobGeometry(3.8, 0.45, 8.9), p: [-6.0, 0.004, 10.5] as [number, number, number] },
      { g: blobGeometry(4.4, 0.38, 3.3), p: [8.0, 0.004, -10.5] as [number, number, number] },
      { g: blobGeometry(3.2, 0.5, 6.1), p: [-13.5, 0.004, 3.5] as [number, number, number] },
    ],
    []
  );
  const streets = useMemo(
    () => [
      // lane A: foreground edge -> winding up to the workshop door
      ribbonGeometry(
        [
          [0.4, 11.5],
          [1.0, 7.5],
          [-0.6, 4.5],
          [0.8, 2.0],
          [1.6, -0.8],
          [1.7, -2.6],
        ],
        2.0
      ),
      // lane B: plaza -> behind the library -> off the right edge
      ribbonGeometry(
        [
          [0.8, 2.0],
          [3.2, 0.5],
          [5.4, -1.8],
          [7.8, -3.6],
          [11.5, -5.5],
        ],
        1.7
      ),
      // lane C: between depot and exchange -> off the left edge
      ribbonGeometry(
        [
          [-0.6, 4.5],
          [-3.2, 3.6],
          [-5.8, 2.2],
          [-8.8, 1.2],
          [-12.5, 0.5],
        ],
        1.7
      ),
      // lane D: toward the repair shop -> off the right edge
      ribbonGeometry(
        [
          [1.0, 7.5],
          [4.0, 6.4],
          [7.0, 5.6],
          [10.5, 5.2],
        ],
        1.7
      ),
      // lane E: behind the workshop -> town continues off the back
      ribbonGeometry(
        [
          [3.4, -1.5],
          [5.8, -3.8],
          [8.5, -6.5],
          [11.5, -9.5],
        ],
        1.6
      ),
      // lane F: plaza -> exchange door
      ribbonGeometry(
        [
          [-3.2, 3.6],
          [-4.6, 1.6],
          [-5.4, -0.6],
        ],
        1.5
      ),
    ],
    []
  );
  return (
    <group>
      {/* the world floor: cream, far past the frame on every side */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[80, 80]} />
        {matte(PAL.cream)}
      </mesh>
      {/* irregular grass patches, deliberately asymmetric */}
      {patches.map((p, i) => (
        <mesh key={i} geometry={p.g} rotation={[-Math.PI / 2, 0, 0]} position={p.p}>
          {matte(PAL.sage)}
        </mesh>
      ))}
      {/* the street network */}
      {streets.map((g, i) => (
        <mesh key={i} geometry={g} position={[0, 0.008, 0]}>
          {matte(PAL.path)}
        </mesh>
      ))}
    </group>
  );
}

/** Organic blob geometry: a disc with a wobbly radius. Deterministic. */
function blobGeometry(r: number, wobble: number, seed: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.sin(a * 3 + seed) * Math.sin(a * 2 + seed * 1.3));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape, 24);
}

/** Flat ribbon along a winding 2D path. Deterministic. */
function ribbonGeometry(pts: [number, number][], width: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const N = 42;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPoint(u);
    const tan = curve.getTangent(u);
    const nx = -tan.z;
    const nz = tan.x;
    positions.push(p.x + (nx * width) / 2, 0, p.z + (nz * width) / 2);
    positions.push(p.x - (nx * width) / 2, 0, p.z - (nz * width) / 2);
    if (i < N) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Crates and a barrel cluttering a side alley: a partial sightline into
 *  a little work area, implying the town continues. */
export function AlleyClutter({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.22, 0]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.44, 0.44, 0.44]} />
        {matte(PAL.wood)}
      </mesh>
      <mesh position={[0.42, 0.18, 0.2]} rotation={[0, -0.2, 0]}>
        <boxGeometry args={[0.36, 0.36, 0.36]} />
        {matte(PAL.woodDark)}
      </mesh>
      <mesh position={[0.1, 0.62, -0.1]} rotation={[0, 0.5, 0]}>
        <boxGeometry args={[0.34, 0.34, 0.34]} />
        {matte(PAL.creamDark)}
      </mesh>
      <mesh position={[-0.5, 0.26, 0.25]}>
        <cylinderGeometry args={[0.2, 0.23, 0.52, 12]} />
        {matte(PAL.terracottaDark)}
      </mesh>
    </group>
  );
}

/** A distant rooftop at the frame edge: more town implied offscreen. */
export function DistantRoof({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[3.2, 2.8, 2.6]} />
        {matte(color)}
      </mesh>
      <mesh position={[0, 3.4, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[2.5, 1.4, 4]} />
        {matte(PAL.woodDark)}
      </mesh>
      <mesh position={[0.9, 4.0, 0]}>
        <boxGeometry args={[0.35, 1.2, 0.35]} />
        {matte(PAL.stoneDark)}
      </mesh>
    </group>
  );
}

export function Tree({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.09, 0.13, 1.0, 8]} />
        {matte(PAL.woodDark)}
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.62, 14, 12]} />
        {matte(PAL.sage)}
      </mesh>
      <mesh position={[0.3, 1.05, 0.15]}>
        <sphereGeometry args={[0.4, 12, 10]} />
        {matte(PAL.sageDark)}
      </mesh>
    </group>
  );
}

export function Lamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 2.2, 8]} />
        {matte(PAL.ink)}
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color={PAL.warm} emissive={PAL.warm} emissiveIntensity={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.42, 0]}>
        <coneGeometry args={[0.24, 0.18, 8]} />
        {matte(PAL.ink)}
      </mesh>
    </group>
  );
}

/** Still stone fountain at the plaza center. */
export function Fountain() {
  return (
    <group position={[0, 0, 1.8]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[1.0, 1.15, 0.6, 20]} />
        {matte(PAL.stone)}
      </mesh>
      <mesh position={[0, 0.58, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.92, 20]} />
        <meshStandardMaterial color="#9db8c4" roughness={0.25} metalness={0} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 0.7, 12]} />
        {matte(PAL.stoneDark)}
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <sphereGeometry args={[0.24, 12, 10]} />
        {matte(PAL.stone)}
      </mesh>
    </group>
  );
}
