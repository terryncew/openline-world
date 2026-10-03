/**
 * OpenLine World visualization — the workroom.
 * frontend/src/viz/scene/Workroom.tsx
 *
 * The workshop's second space: where agents physically do the task.
 * Wooden benches with open task ledgers, sorting trays, and brass tools;
 * a partition wall with an arched passage so the workroom and the gate
 * room read as adjacent spaces in one building, and the eye can follow
 * the lane from bench to threshold. Same handcrafted language as the
 * gate room: matte cream, terracotta, sage, warm wood, brass.
 *
 * The partition never touches the gate room's threshold machine.
 */
import * as THREE from "three";
import { BENCH_DX, BENCH_SPOTS } from "./workerMotion";
import { PAL } from "./VizCanvas";

const SAGE = "#8a9a78";

function Blob({ position, radius }: { position: [number, number, number]; radius: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[position[0], 0.02, position[2]]}>
      <circleGeometry args={[radius, 32]} />
      <meshBasicMaterial color="#4a3a24" transparent opacity={0.18} depthWrite={false} />
    </mesh>
  );
}

function Bench({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* top + legs + shelf: warm wood */}
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[2.0, 0.14, 1.05]} />
        <meshStandardMaterial color={PAL.wood} roughness={0.85} />
      </mesh>
      {[[-0.88, -0.42], [0.88, -0.42], [-0.88, 0.42], [0.88, 0.42]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.43, lz]}>
          <boxGeometry args={[0.12, 0.86, 0.12]} />
          <meshStandardMaterial color={PAL.woodDark} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[1.7, 0.07, 0.8]} />
        <meshStandardMaterial color={PAL.woodDark} roughness={0.9} />
      </mesh>
      {/* open task ledger: two cream pages near the bench's west edge,
          where the worker stands */}
      <mesh position={[-0.55, 1.03, 0]} rotation={[0, 0.12, 0.03]}>
        <boxGeometry args={[0.42, 0.03, 0.6]} />
        <meshStandardMaterial color={PAL.wall} roughness={0.95} />
      </mesh>
      <mesh position={[-0.15, 1.03, 0]} rotation={[0, -0.12, -0.03]}>
        <boxGeometry args={[0.42, 0.03, 0.6]} />
        <meshStandardMaterial color={PAL.wall} roughness={0.95} />
      </mesh>
      {/* sage sorting tray with claim chips */}
      <mesh position={[0.62, 1.04, -0.25]}>
        <boxGeometry args={[0.5, 0.09, 0.36]} />
        <meshStandardMaterial color={SAGE} roughness={0.9} />
      </mesh>
      {[[-0.12, 0], [0.02, 0.05], [0.14, -0.04]].map(([cx, cz], i) => (
        <mesh key={i} position={[0.62 + cx, 1.1, -0.25 + cz]}>
          <boxGeometry args={[0.1, 0.05, 0.1]} />
          <meshStandardMaterial
            color={["#7fa8c9", "#e8a34c", "#a9c3d9"][i]}
            roughness={0.8}
          />
        </mesh>
      ))}
      {/* brass tools: a small mallet and a gear blank */}
      <mesh position={[-0.62, 1.06, 0.28]} rotation={[0, 0.5, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.34, 10]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.65} />
      </mesh>
      <mesh position={[-0.62, 1.12, 0.42]}>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 12]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.65} />
      </mesh>
      {/* stool behind the bench */}
      <mesh position={[-1.05, 0.32, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.1, 14]} />
        <meshStandardMaterial color={PAL.woodDark} roughness={0.9} />
      </mesh>
      <mesh position={[-1.05, 0.14, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.28, 8]} />
        <meshStandardMaterial color={PAL.woodDark} roughness={0.9} />
      </mesh>
      <Blob position={[0, 0, 0]} radius={1.5} />
    </group>
  );
}

/**
 * Partition wall between workroom (west) and gate room (east), with an
 * arched passage on the lane axis (z = 0.6). Low enough that every
 * camera keeps its sight lines; the gate stays legible through the arch.
 */
function PartitionWall() {
  const wall = (z0: number, z1: number) => {
    const len = z1 - z0;
    const zc = (z0 + z1) / 2;
    return (
      <group key={`${z0}-${z1}`} position={[2.2, 0, zc]}>
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[0.4, 3.0, len]} />
          <meshStandardMaterial color={PAL.wall} roughness={0.95} />
        </mesh>
        <mesh position={[-0.21, 0.55, 0]}>
          <boxGeometry args={[0.04, 1.1, len]} />
          <meshStandardMaterial color={PAL.wainscot} roughness={0.95} />
        </mesh>
        <mesh position={[0, 3.08, 0]}>
          <boxGeometry args={[0.48, 0.22, len]} />
          <meshStandardMaterial color={PAL.trim} roughness={0.8} />
        </mesh>
      </group>
    );
  };
  return (
    <group>
      {wall(-7, -0.6)}
      {wall(1.8, 7)}
      {/* lintel + arch trim over the passage */}
      <mesh position={[2.2, 3.35, 0.6]}>
        <boxGeometry args={[0.5, 0.5, 3.1]} />
        <meshStandardMaterial color={PAL.wall} roughness={0.95} />
      </mesh>
      <mesh position={[2.2, 2.95, 0.6]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.2, 0.1, 10, 24, Math.PI]} />
        <meshStandardMaterial color={PAL.trim} roughness={0.8} />
      </mesh>
      {/* brass room plate on the lintel's workroom face */}
      <mesh position={[1.93, 3.35, 0.6]}>
        <boxGeometry args={[0.06, 0.34, 0.9]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.35} metalness={0.7} />
      </mesh>
    </group>
  );
}

function WorkroomLamp() {
  return (
    <group position={[-8.2, 0, 4.8]}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.3, 0.36, 0.2, 12]} />
        <meshStandardMaterial color={PAL.woodDark} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2.2, 8]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 2.42, 0]}>
        <coneGeometry args={[0.42, 0.5, 14, 1, true]} />
        <meshStandardMaterial
          color="#e8c98a"
          roughness={0.7}
          emissive="#ffca7a"
          emissiveIntensity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Blob position={[0, 0, 0]} radius={0.7} />
    </group>
  );
}

export function Workroom({ workerCount }: { workerCount: number }) {
  const benches = BENCH_SPOTS.slice(0, Math.max(1, Math.min(4, workerCount)));
  return (
    <group>
      {/* wood floor inset under the benches: the workroom's ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-5.6, 0.005, 2.6]}>
        <planeGeometry args={[7.6, 5.8]} />
        <meshStandardMaterial color="#a9744f" roughness={1} />
      </mesh>
      {benches.map(([x, z], i) => (
        <Bench key={i} x={x + BENCH_DX} z={z} />
      ))}
      <PartitionWall />
      <WorkroomLamp />
    </group>
  );
}
