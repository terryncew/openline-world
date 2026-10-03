/**
 * Secondary actors: the town's social density. Each does ONE legible
 * thing, on a simple deterministic loop — no wandering, no bobbing.
 *
 * - Waiter: stands by the workshop door, attention on it, shifting weight.
 * - Passerby: walks a lane segment carrying a parcel, turns, walks back.
 * - Helper: by the library cart, holding a book, glancing at the reader.
 *
 * Chunky manufactured bodies, matte, blob shadows. Pure functions of t.
 * Illustrative only. Not an OpenLine operation.
 */
import { PAL, matte, BlobShadow, Limb, Hinge, Foot } from "../kit";
import { loop, pulse, bump, gait, d } from "../acting";

/** Shared chunky leg: thigh -> knee hinge -> shin -> big foot. */
function ChunkLeg({ x, color, swing = 0 }: { x: number; color: string; swing?: number }) {
  return (
    <group position={[x, 0.34, 0]} rotation={[swing, 0, 0]}>
      <Limb length={0.17} radius={0.08} color={color} />
      <group position={[0, -0.17, 0]}>
        <Hinge r={0.075} color={PAL.ink} />
        <Limb length={0.15} radius={0.065} color={color} />
        <group position={[0, -0.15, 0.04]}>
          <Foot w={0.26} h={0.12} l={0.36} color={PAL.ink} />
        </group>
      </group>
    </group>
  );
}

/** Shared chunky arm: upper -> elbow hinge -> forearm -> hand. */
function ChunkArm({
  x,
  color,
  rx = 0,
  rz = 0,
}: {
  x: number;
  color: string;
  rx?: number;
  rz?: number;
}) {
  return (
    <group position={[x, 0.62, 0.06]} rotation={[rx, 0, rz]}>
      <mesh position={[0, -0.02, 0]}>
        <Hinge r={0.065} color={PAL.ink} />
      </mesh>
      <Limb length={0.14} radius={0.06} color={color} />
      <group position={[0, -0.14, 0]}>
        <Hinge r={0.06} color={PAL.ink} />
        <Limb length={0.12} radius={0.05} color={color} />
        <mesh position={[0, -0.15, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          {matte(PAL.cream)}
        </mesh>
      </group>
    </group>
  );
}

const DW = 12;

/** Waiting by the workshop door: weight shifts, head tracks the door,
 *  an occasional glance down the lane. Attention, not idleness. */
export function Waiter({
  t,
  position = [0, 0, 0] as [number, number, number],
  rotationY = 0,
}: {
  t: number;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const T = loop(t, DW);
  const shift = Math.sin((T / DW) * Math.PI * 2) * 0.035; // weight shift
  const glance = bump(T, 7.5, 9.5, 1); // looks down the lane, then back
  const headYaw = -glance * d(38) + Math.sin((T / DW) * Math.PI * 4) * d(3);
  const bob = Math.sin((T / DW) * Math.PI * 2) * d(1.5);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <BlobShadow r={0.42} />
      <group position={[shift, 0, 0]}>
        <ChunkLeg x={-0.14} color={PAL.blueDark} />
        <ChunkLeg x={0.14} color={PAL.blueDark} />
        <group position={[0, 0.72, 0]} rotation={[bob, 0, 0]}>
          {/* box torso: a different build from the vignette robots */}
          <mesh>
            <boxGeometry args={[0.44, 0.5, 0.34]} />
            {matte(PAL.sage)}
          </mesh>
          <mesh position={[0, 0.1, 0.18]}>
            <boxGeometry args={[0.2, 0.12, 0.04]} />
            {matte(PAL.sageDark)}
          </mesh>
          <ChunkArm x={-0.27} color={PAL.sageDark} rx={d(-8)} rz={d(8)} />
          <ChunkArm x={0.27} color={PAL.sageDark} rx={d(-8)} rz={d(-8)} />
          {/* dome head on a hinge neck, tracking the door */}
          <group position={[0, 0.42, 0]} rotation={[d(-4), headYaw, 0]}>
            <mesh position={[0, -0.1, 0]}>
              <Hinge r={0.09} color={PAL.ink} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              {matte(PAL.cream)}
            </mesh>
            <mesh position={[0, 0.0, 0]}>
              <cylinderGeometry args={[0.19, 0.19, 0.05, 16]} />
              {matte(PAL.blueDark)}
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.07, 0.06, 0.15]}>
                <sphereGeometry args={[0.032, 10, 8]} />
                <meshBasicMaterial color={PAL.ink} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

const DP = 18;

/** A passerby with a parcel: walks the lane with purpose, turns at the
 *  end, walks back. A delivery in progress, not a wander. */
export function Passerby({
  t,
  from = [0.2, 8.5] as [number, number],
  to = [1.0, 3.2] as [number, number],
}: {
  t: number;
  from?: [number, number];
  to?: [number, number];
}) {
  const T = loop(t, DP);
  const travel = pulse(T, 1.0, 2.0, 7.0, 8.0, 1); // out
  const travelBack = pulse(T, 9.5, 10.5, 15.5, 16.5, 1); // back
  const k = travel * (1 - travelBack) + (1 - travel) * travelBack;
  const moving = (T > 1 && T < 8) || (T > 9.5 && T < 16.5);
  const returning = T > 9.5 && T < 16.5;
  const gx = from[0] + (to[0] - from[0]) * k;
  const gz = from[1] + (to[1] - from[1]) * k;
  const face = Math.atan2(to[0] - from[0], to[1] - from[1]) + (returning ? Math.PI : 0);
  const ph = moving ? gait(T, 0, DP, 14) : 0;
  const lean = moving ? d(5) : 0;

  return (
    <group position={[gx, 0, gz]} rotation={[0, face, 0]}>
      <BlobShadow r={0.42} />
      <group rotation={[0, 0, 0]}>
        <ChunkLeg x={-0.13} color={PAL.terracottaDark} swing={ph * d(20)} />
        <ChunkLeg x={0.13} color={PAL.terracottaDark} swing={-ph * d(20)} />
        <group position={[0, 0.7, 0]} rotation={[lean + Math.abs(ph) * d(2), 0, 0]}>
          {/* tapered torso: yet another build */}
          <mesh>
            <cylinderGeometry args={[0.2, 0.26, 0.52, 12]} />
            {matte(PAL.blue)}
          </mesh>
          {/* the parcel, held in both hands */}
          <group position={[0, 0.02, 0.34]}>
            <mesh>
              <boxGeometry args={[0.34, 0.26, 0.26]} />
              {matte(PAL.wood)}
            </mesh>
            <mesh position={[0, 0.0, 0.0]}>
              <boxGeometry args={[0.35, 0.05, 0.27]} />
              {matte(PAL.creamDark)}
            </mesh>
          </group>
          <ChunkArm x={-0.26} color={PAL.blueDark} rx={d(-52)} rz={d(14)} />
          <ChunkArm x={0.26} color={PAL.blueDark} rx={d(-52)} rz={d(-14)} />
          {/* bucket head with a brim */}
          <group position={[0, 0.4, 0]}>
            <mesh position={[0, -0.09, 0]}>
              <Hinge r={0.085} color={PAL.ink} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[0.16, 0.17, 0.22, 14]} />
              {matte(PAL.terracotta)}
            </mesh>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.2, 0.2, 0.04, 14]} />
              {matte(PAL.terracottaDark)}
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.065, 0.02, 0.145]}>
                <sphereGeometry args={[0.03, 10, 8]} />
                <meshBasicMaterial color={PAL.ink} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

const DH = 12;

/** The library helper: holds a book, reads a line, glances at the
 *  reader's bench, shifts the book. Part of the library's story. */
export function Helper({
  t,
  position = [0, 0, 0] as [number, number, number],
  rotationY = 0,
}: {
  t: number;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const T = loop(t, DH);
  const readDown = pulse(T, 0.5, 1.5, 5.5, 6.5, 1);
  const glance = bump(T, 7.0, 9.0, 1); // looks at the reader
  const resettle = bump(T, 10.0, 11.0, 1); // shifts the book
  const headPitch = readDown * d(16) - glance * d(20);
  const headYaw = glance * d(30);
  const bookLift = readDown * 0.04 + resettle * 0.06;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <BlobShadow r={0.42} />
      <ChunkLeg x={-0.13} color={PAL.sageDark} />
      <ChunkLeg x={0.13} color={PAL.sageDark} />
      <group position={[0, 0.7, 0]}>
        {/* round torso: small and soft */}
        <mesh>
          <sphereGeometry args={[0.24, 16, 12]} />
          {matte(PAL.cream)}
        </mesh>
        <mesh position={[0, 0.0, 0.21]}>
          <boxGeometry args={[0.16, 0.12, 0.04]} />
          {matte(PAL.creamDark)}
        </mesh>
        <ChunkArm x={-0.26} color={PAL.creamDark} rx={d(-58)} rz={d(16)} />
        <ChunkArm x={0.26} color={PAL.creamDark} rx={d(-58)} rz={d(-16)} />
        {/* the held book */}
        <group position={[0, -0.05 + bookLift, 0.34]} rotation={[d(-18), 0, 0]}>
          <mesh>
            <boxGeometry args={[0.3, 0.36, 0.08]} />
            {matte(PAL.terracotta)}
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <boxGeometry args={[0.24, 0.3, 0.01]} />
            {matte(PAL.white)}
          </mesh>
        </group>
        {/* small dome head */}
        <group position={[0, 0.36, 0]} rotation={[headPitch, headYaw, 0]}>
          <mesh position={[0, -0.08, 0]}>
            <Hinge r={0.08} color={PAL.ink} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.16, 16, 12]} />
            {matte(PAL.sage)}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.06, 0.02, 0.135]}>
              <sphereGeometry args={[0.028, 10, 8]} />
              <meshBasicMaterial color={PAL.ink} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
