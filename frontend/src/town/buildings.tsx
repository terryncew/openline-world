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

/** Flat triangular pediment gable, extruded. Deterministic. */
function Pediment({ w = 2.7, h = 0.55, y = 2.25, z = 1.0 }: { w?: number; h?: number; y?: number; z?: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false });
  }, [w, h]);
  return (
    <mesh geometry={geo} position={[0, y, z]}>
      {matte(PAL.stoneDark)}
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

/** THE WORKSHOP — the one real destination and the town's emotional
 *  anchor. Terracotta, stone portal arch, flanking door lanterns, warm
 *  windows, a chimney breaking the skyline. Entering here crosses from
 *  illustrative town into consequential space — the threshold is the
 *  clearest in town. */
export function Workshop() {
  return (
    <group>
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[3.4, 2.2, 2.6]} />
        {matte(PAL.terracotta)}
      </mesh>
      {/* painted base trim: a hand-painted darker band, slightly uneven */}
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[3.46, 0.28, 2.66]} />
        {matte(PAL.terracottaDark)}
      </mesh>
      <group position={[0, 2.2, 0]}>
        <PitchedRoof w={3.8} d={3.0} h={1.2} color={PAL.terracottaDark} />
      </group>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[3.7, 0.12, 2.9]} />
        {matte(PAL.cream)}
      </mesh>
      {/* chimney: interrupts the skyline */}
      <mesh position={[1.1, 3.1, -0.5]}>
        <boxGeometry args={[0.4, 1.1, 0.4]} />
        {matte(PAL.stoneDark)}
      </mesh>
      <mesh position={[1.1, 3.68, -0.5]}>
        <boxGeometry args={[0.52, 0.14, 0.52]} />
        {matte(PAL.stone)}
      </mesh>
      {/* stone portal arch: the strongest threshold in town */}
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} position={[x, 0.85, 1.42]}>
          <boxGeometry args={[0.42, 1.7, 0.5]} />
          {matte(PAL.stone)}
        </mesh>
      ))}
      <mesh position={[0, 1.85, 1.42]}>
        <boxGeometry args={[2.52, 0.42, 0.5]} />
        {matte(PAL.stone)}
      </mesh>
      <mesh position={[0, 1.62, 1.44]}>
        <boxGeometry args={[1.72, 0.1, 0.52]} />
        {matte(PAL.stoneDark)}
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
      {/* door lanterns: warm pools of light flanking the entrance */}
      {[-1.5, 1.5].map((x) => (
        <group key={x} position={[x, 0, 1.7]}>
          <mesh position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 2.0, 8]} />
            {matte(PAL.ink)}
          </mesh>
          <mesh position={[0, 2.05, 0]}>
            <boxGeometry args={[0.26, 0.3, 0.26]} />
            {matte(PAL.ink)}
          </mesh>
          <mesh position={[0, 2.05, 0]}>
            <sphereGeometry args={[0.1, 10, 8]} />
            <meshStandardMaterial color={PAL.warm} emissive={PAL.warm} emissiveIntensity={0.8} roughness={0.5} />
          </mesh>
          <mesh position={[0, 2.24, 0]}>
            <coneGeometry args={[0.2, 0.14, 4]} />
            {matte(PAL.ink)}
          </mesh>
        </group>
      ))}
      <Windows color={PAL.blueDark} lit positions={[[-1.15, 1.25, 1.31], [1.15, 1.25, 1.31]]} />
      <group position={[0, 2.62, 1.42]}>
        <Sign text="Workshop" width={1.7} />
      </group>
      {/* doorstep: two worn stone steps */}
      <mesh position={[0, 0.06, 1.95]}>
        <boxGeometry args={[2.4, 0.12, 1.3]} />
        {matte(PAL.stone)}
      </mesh>
      <mesh position={[0, 0.16, 1.65]}>
        <boxGeometry args={[2.0, 0.12, 0.7]} />
        {matte(PAL.stoneDark)}
      </mesh>
    </group>
  );
}

/** THE EXCHANGE — visibly non-operational, but with a distinct FORMAL
 *  public facade: stone pilasters, a pediment, worn steps. The closure
 *  reads from the shutters and the bar across the door. Shuttered
 *  windows, barred double door, empty stall frames, one tipped crate.
 *  Nothing to trade, nobody trading. */
export function Exchange() {
  return (
    <group>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[3.0, 2.0, 2.4]} />
        {matte(PAL.blue)}
      </mesh>
      {/* painted base trim */}
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[3.06, 0.26, 2.46]} />
        {matte(PAL.blueDark)}
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[3.3, 0.14, 2.7]} />
        {matte(PAL.blueDark)}
      </mesh>
      {/* formal pilasters across the front */}
      {[-1.35, -0.45, 0.45, 1.35].map((x) => (
        <group key={x} position={[x, 0, 1.22]}>
          <mesh position={[0, 0.95, 0]}>
            <boxGeometry args={[0.22, 1.9, 0.1]} />
            {matte(PAL.stone)}
          </mesh>
          <mesh position={[0, 1.92, 0]}>
            <boxGeometry args={[0.3, 0.1, 0.12]} />
            {matte(PAL.stoneDark)}
          </mesh>
        </group>
      ))}
      {/* formal crown: frieze band with the name, triangular pediment above */}
      <mesh position={[0, 2.1, 1.22]}>
        <boxGeometry args={[2.9, 0.3, 0.1]} />
        {matte(PAL.stone)}
      </mesh>
      <Pediment />
      <group position={[0, 2.1, 1.3]}>
        <Sign text="Exchange" width={1.5} />
      </group>
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
      {/* reading stoop: the library lends, visibly */}
      <LibraryStoop />
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
 *  a tarp. Still. Waiting. Walls are cream: terracotta belongs to the
 *  workshop alone. */
export function RepairShop() {
  return (
    <group>
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[2.8, 1.9, 2.2]} />
        {matte(PAL.cream)}
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[2.86, 0.26, 2.26]} />
        {matte(PAL.creamDark)}
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
        {/* scattered parts: someone works at this bench */}
        <PartsScatter />
      </group>
    </group>
  );
}

/** Ground: NO enclosing border, NO circular stage. A cream world that
 *  extends past every frame edge. Three legible zones: pale paths, muted
 *  green planted verges, cream floor — never one muddy field. The street
 *  network is one bending main lane (foreground -> workshop door) with a
 *  single branch toward the library; every lane runs offscreen or
 *  disappears behind buildings and trees. */
export function Ground() {
  const lanes: [number, number][][] = [
    // main lane: foreground -> bending toward the workshop door
    [[0.6, 11.5], [1.0, 7.5], [0.2, 5.0], [1.0, 2.6], [1.5, 0.2], [1.6, -2.4]],
    // branch: toward the library -> off the right edge
    [[1.5, 0.2], [3.4, -0.6], [5.4, -1.6], [8.5, -2.6]],
    // west lane: between depot and exchange -> off the left edge
    [[0.2, 5.0], [-2.6, 4.2], [-5.0, 3.0], [-9.0, 2.2]],
    // to repair -> off the right edge
    [[1.0, 7.5], [3.6, 6.8], [6.4, 6.0], [10.0, 5.6]],
    // behind the workshop: town continues
    [[3.4, -3.4], [6.0, -5.6], [9.5, -8.0]],
    // to the exchange door
    [[-2.6, 4.2], [-3.8, 2.0], [-4.4, -0.4]],
  ];
  const patches: [number, number, number, boolean][] = [
    // x, z, radius, sageDark?
    [-1.8, 7.8, 3.2, false],
    [3.6, 4.8, 2.2, true],
    [-3.6, -4.8, 3.0, false],
    [7.0, -5.0, 3.2, true],
    [-7.8, 6.8, 3.4, false],
    [7.6, 8.6, 3.0, true],
    [-0.5, -8.5, 4.0, false],
    [2.8, 10.8, 2.6, true],
  ];
  return (
    <group>
      {/* the world floor: cream, far past the frame on every side */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[90, 90]} />
        {matte(PAL.cream)}
      </mesh>
      {/* planted verges: muted green, deliberately asymmetric */}
      {patches.map(([x, z, r, dark], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, z]}>
          <circleGeometry args={[r, 26]} />
          {matte(dark ? PAL.sageDark : PAL.sage)}
        </mesh>
      ))}
      {/* the street network */}
      {lanes.map((pts, i) => (
        <mesh key={i} geometry={ribbonGeometry(pts, i === 0 ? 2.0 : 1.6)} position={[0, 0.008, 0]}>
          {matte(PAL.path)}
        </mesh>
      ))}
    </group>
  );
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

/** A distant rooftop at the frame edge: more town implied offscreen.
 *  Kept small and low — a hint, not a building. */
export function DistantRoof({ position, color, s = 0.8 }: { position: [number, number, number]; color: string; s?: number }) {
  return (
    <group position={position} scale={s}>
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

/* ------------------------------------------------------------------ */
/* Story-cluster and neighborhood dressing.                             */
/* Every zone gets props that explain its function before any sign is  */
/* read: the depot loads, the repair bench holds parts, the library    */
/* lends, the street is lived on. Handcrafted: matte, slightly         */
/* irregular, softly painted.                                          */
/* ------------------------------------------------------------------ */

/** A gear: torus + spokes. A spare part. */
function Gear({ r = 0.16, color = PAL.woodDark }: { r?: number; color?: string }) {
  return (
    <group>
      <mesh>
        <torusGeometry args={[r, r * 0.28, 8, 16]} />
        {matte(color)}
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
          <boxGeometry args={[r * 1.9, r * 0.22, r * 0.2]} />
          {matte(color)}
        </mesh>
      ))}
    </group>
  );
}

/** Repair parts scattered on and around the workbench: gears, a small
 *  crate of bits, a wrench-like tool. Someone works here. */
export function PartsScatter() {
  return (
    <group>
      {/* on the bench top */}
      <group position={[0.25, 0.52, 0]} rotation={[Math.PI / 2, 0, 0.4]}>
        <Gear r={0.11} />
      </group>
      <group position={[-0.25, 0.5, 0.1]} rotation={[0, 0.5, 0]}>
        <mesh>
          <boxGeometry args={[0.22, 0.1, 0.16]} />
          {matte(PAL.terracottaDark)}
        </mesh>
      </group>
      <mesh position={[0.05, 0.48, -0.12]} rotation={[0, 0, Math.PI / 2 - 0.2]}>
        <boxGeometry args={[0.3, 0.05, 0.05]} />
        {matte(PAL.ink)}
      </mesh>
      {/* on the ground beside the bench */}
      <group position={[0.7, 0.11, 0.35]} rotation={[Math.PI / 2.2, 0, 0.7]}>
        <Gear r={0.14} color={PAL.blue} />
      </group>
      <mesh position={[-0.6, 0.08, 0.4]} rotation={[0, 0.9, 0]}>
        <boxGeometry args={[0.28, 0.16, 0.22]} />
        {matte(PAL.wood)}
      </mesh>
    </group>
  );
}

/** The depot's loading yard: canopy posts and a slanted canvas roof,
 *  parcel stacks, a lumber rack. The carrier's shuttle reads as LOADING
 *  here, not just carrying past. */
export function DepotYard() {
  return (
    <group>
      {/* canopy: four posts, slanted canvas roof */}
      {[
        [-1.0, -0.7],
        [1.0, -0.7],
        [-1.0, 0.7],
        [1.0, 0.7],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.85, z]}>
          <cylinderGeometry args={[0.07, 0.09, 1.7, 8]} />
          {matte(PAL.woodDark)}
        </mesh>
      ))}
      <group position={[0, 1.82, 0]} rotation={[0.1, 0, 0.06]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[-0.9 + i * 0.3, 0, 0]}>
            <boxGeometry args={[0.3, 0.05, 1.9]} />
            {matte(i % 2 ? PAL.cream : PAL.terracotta)}
          </mesh>
        ))}
      </group>
      {/* parcel stacks under the canopy */}
      {[
        [0.9, 0.2, -0.5, 0.4],
        [0.9, 0.56, -0.5, 0.32],
        [1.35, 0.17, -0.4, 0.34],
        [-0.7, 0.16, -0.6, 0.32],
        [-0.7, 0.44, -0.6, 0.24],
      ].map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, (i * 37) % 30, 0]}>
          <boxGeometry args={[s, s * 0.82, s]} />
          {matte(i % 2 ? PAL.creamDark : PAL.wood)}
        </mesh>
      ))}
      {/* lumber rack: two A-frames holding spare timber */}
      {[-0.9, -0.3].map((x, i) => (
        <group key={i} position={[x, 0, 0.75]}>
          {[-0.18, 0.18].map((dz) => (
            <mesh key={dz} position={[0, 0.3, dz]} rotation={[dz > 0 ? 0.35 : -0.35, 0, 0]}>
              <boxGeometry args={[0.08, 0.7, 0.08]} />
              {matte(PAL.woodDark)}
            </mesh>
          ))}
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.1, 0.06, 0.5]} />
            {matte(PAL.woodDark)}
          </mesh>
        </group>
      ))}
      {[0, 1].map((i) => (
        <mesh key={i} position={[-0.6, 0.62 + i * 0.14, 0.75]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 1.1, 8]} />
          {matte(PAL.wood)}
        </mesh>
      ))}
      {/* hand cart parked at the yard edge */}
      <group position={[1.9, 0, 0.9]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.7, 0.08, 0.45]} />
          {matte(PAL.wood)}
        </mesh>
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.06, 14]} />
            {matte(PAL.woodDark)}
          </mesh>
        ))}
        <mesh position={[0.42, 0.42, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.5, 0.05, 0.05]} />
          {matte(PAL.woodDark)}
        </mesh>
      </group>
    </group>
  );
}

/** Library reading stoop: a low platform with book stacks and an open
 *  book. The library lends, visibly. */
export function LibraryStoop() {
  return (
    <group position={[0, 0, 1.9]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[1.8, 0.16, 1.0]} />
        {matte(PAL.stone)}
      </mesh>
      {/* book stacks, slightly irregular */}
      {[
        [-0.55, 0.16, 0.1, 3],
        [0.5, 0.16, -0.1, 2],
      ].map(([x, y, z, n], i) => (
        <group key={i} position={[x, y, z]}>
          {Array.from({ length: n as number }, (_, j) => (
            <mesh key={j} position={[(j % 2) * 0.03 - 0.015, 0.05 + j * 0.09, 0]} rotation={[0, (j * 23 + i * 40) * 0.01, 0]}>
              <boxGeometry args={[0.3, 0.08, 0.22]} />
              {matte([PAL.terracotta, PAL.blue, PAL.sage][(i + j) % 3])}
            </mesh>
          ))}
        </group>
      ))}
      {/* one open book */}
      <group position={[0.05, 0.2, 0.15]} rotation={[0, -0.3, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.11, 0.03, 0]} rotation={[0, 0, s * -0.22]}>
            <boxGeometry args={[0.22, 0.02, 0.3]} />
            {matte(PAL.white)}
          </mesh>
        ))}
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.05, 0.02, 0.3]} />
          {matte(PAL.terracottaDark)}
        </mesh>
      </group>
    </group>
  );
}

/** A beveled stone plinth under a building: shared construction detail.
 *  Slight batter (wider at the base) softens the sharp box footprints and
 *  gives every building the same finished footing. */
export function Plinth({ w, d, h = 0.16 }: { w: number; d: number; h?: number }) {
  return (
    <mesh position={[0, h / 2 - 0.02, 0]} scale={[w / 2, 1, d / 2]}>
      <cylinderGeometry args={[1, 1.14, h, 4, 1]} />
      {matte(PAL.stoneDark)}
    </mesh>
  );
}

/** A tool rack beside the workshop door: hanging wrench and hammer
 *  silhouettes. Tools belong to the workshop. */
export function ToolRack({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <boxGeometry args={[0.08, 0.9, 0.08]} />
          {matte(PAL.woodDark)}
        </mesh>
      ))}
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[0.76, 0.07, 0.07]} />
        {matte(PAL.woodDark)}
      </mesh>
      {/* hanging wrench */}
      <group position={[-0.18, 0.62, 0.02]}>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[0.05, 0.22, 0.04]} />
          {matte(PAL.ink)}
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <torusGeometry args={[0.055, 0.025, 8, 12, Math.PI * 1.5]} />
          {matte(PAL.ink)}
        </mesh>
      </group>
      {/* hanging hammer */}
      <group position={[0.16, 0.62, 0.02]}>
        <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[0.045, 0.24, 0.045]} />
          {matte(PAL.wood)}
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.16, 0.07, 0.06]} />
          {matte(PAL.stoneDark)}
        </mesh>
      </group>
      {/* a small parts crate below */}
      <mesh position={[0, 0.1, 0.1]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.3, 0.2, 0.26]} />
        {matte(PAL.wood)}
      </mesh>
    </group>
  );
}

/** A mailbox on a post: the street is lived on. */
export function Mailbox({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 1.1, 8]} />
        {matte(PAL.woodDark)}
      </mesh>
      <group position={[0, 1.15, 0]}>
        <mesh>
          <boxGeometry args={[0.3, 0.24, 0.42]} />
          {matte(PAL.blue)}
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.42, 12, 1, false, 0, Math.PI]} />
          {matte(PAL.blueDark)}
        </mesh>
        {/* little red flag, up: mail waiting */}
        <mesh position={[0.18, 0.1, 0]}>
          <boxGeometry args={[0.03, 0.22, 0.03]} />
          {matte(PAL.ink)}
        </mesh>
        <mesh position={[0.18, 0.2, 0.08]}>
          <boxGeometry args={[0.03, 0.08, 0.14]} />
          {matte(PAL.terracotta)}
        </mesh>
      </group>
    </group>
  );
}

/** A weathered fence corner: foreground depth, more town implied. */
export function FenceCorner({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[
        [0, 0, 0],
        [1.1, 0, 0.06],
        [0.06, 0, 1.1],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, 0.45 + y, z]} rotation={[0, 0, (i % 2 ? -1 : 1) * 0.03]}>
          <boxGeometry args={[0.12, 0.95, 0.12]} />
          {matte(PAL.woodDark)}
        </mesh>
      ))}
      <mesh position={[0.55, 0.72, 0.03]} rotation={[0, 0, 0.02]}>
        <boxGeometry args={[1.25, 0.09, 0.06]} />
        {matte(PAL.wood)}
      </mesh>
      <mesh position={[0.55, 0.38, 0.03]}>
        <boxGeometry args={[1.25, 0.09, 0.06]} />
        {matte(PAL.wood)}
      </mesh>
      <mesh position={[0.03, 0.72, 0.58]} rotation={[0, Math.PI / 2, -0.02]}>
        <boxGeometry args={[1.25, 0.09, 0.06]} />
        {matte(PAL.wood)}
      </mesh>
      <mesh position={[0.03, 0.38, 0.58]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[1.25, 0.09, 0.06]} />
        {matte(PAL.wood)}
      </mesh>
    </group>
  );
}

/** A lumpy hedge: irregular, handcrafted green. */
export function Hedge({ position, w = 1.6 }: { position: [number, number, number]; w?: number }) {
  return (
    <group position={position}>
      {[
        [-0.4, 0.3, 0, 0.42],
        [0, 0.38, 0.1, 0.52],
        [0.45, 0.3, -0.05, 0.4],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x * w, y, z * w]}>
          <sphereGeometry args={[r * w, 12, 10]} />
          {matte(i % 2 ? PAL.sage : PAL.sageDark)}
        </mesh>
      ))}
    </group>
  );
}

/** A cart wheel leaning on the fence: someone left work here. */
export function CartWheel({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group rotation={[0.22, 0, 0]}>
        <mesh position={[0, 0.42, 0]}>
          <torusGeometry args={[0.38, 0.055, 10, 20]} />
          {matte(PAL.woodDark)}
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 0.42, 0]} rotation={[0, 0, (i * Math.PI) / 4]}>
            <boxGeometry args={[0.72, 0.05, 0.05]} />
            {matte(PAL.wood)}
          </mesh>
        ))}
        <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.12, 10]} />
          {matte(PAL.ink)}
        </mesh>
      </group>
    </group>
  );
}

/** A trail of worn stepping stones along the main lane toward the
 *  workshop door: the path itself leads the eye there. */
export function PropTrail() {
  const stones: [number, number, number][] = [
    [0.6, 10.8, 0.3],
    [1.0, 8.8, -0.2],
    [0.4, 6.8, 0.4],
    [0.0, 5.2, -0.3],
    [0.8, 3.6, 0.2],
    [1.3, 1.8, -0.25],
    [1.55, 0.0, 0.2],
    [1.6, -1.6, -0.15],
  ];
  return (
    <group>
      {stones.map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0.02, z]} rotation={[0, r * 3, 0]}>
          <cylinderGeometry args={[0.3 + (i % 3) * 0.04, 0.34 + (i % 3) * 0.04, 0.05, 9]} />
          {matte(i % 2 ? PAL.stone : PAL.stoneDark)}
        </mesh>
      ))}
    </group>
  );
}

/** A tree with character: lean and canopy vary by seed. No two alike. */
export function CharacterTree({
  position,
  s = 1,
  seed = 1,
}: {
  position: [number, number, number];
  s?: number;
  seed?: number;
}) {
  const lean = ((seed * 37) % 10) * 0.012 - 0.05;
  const leanZ = ((seed * 53) % 10) * 0.012 - 0.05;
  const c1: [number, number, number] = [((seed * 11) % 5) * 0.05 - 0.1, 1.35, ((seed * 17) % 5) * 0.05 - 0.1];
  const c2: [number, number, number] = [0.32 - ((seed * 7) % 5) * 0.04, 1.0, 0.14];
  const r1 = 0.58 + ((seed * 13) % 5) * 0.03;
  return (
    <group position={position} scale={s} rotation={[leanZ, (seed * 0.7) % 6.28, lean]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.09, 0.14, 1.0, 8]} />
        {matte(PAL.woodDark)}
      </mesh>
      <mesh position={c1}>
        <sphereGeometry args={[r1, 14, 12]} />
        {matte(PAL.sage)}
      </mesh>
      <mesh position={c2}>
        <sphereGeometry args={[r1 * 0.62, 12, 10]} />
        {matte(PAL.sageDark)}
      </mesh>
      <mesh position={[-0.28, 1.12, -0.1]}>
        <sphereGeometry args={[r1 * 0.5, 12, 10]} />
        {matte(PAL.sage)}
      </mesh>
    </group>
  );
}
