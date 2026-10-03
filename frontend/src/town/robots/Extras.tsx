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

/** Shared chunky arm: upper -> elbow hinge -> forearm -> hand.
 *  sy: shoulder height; upper/fore: segment lengths; elbow: forearm
 *  bend (rotation.x, negative bends forward). Defaults preserve the
 *  original stubby arm. */
function ChunkArm({
  x,
  color,
  rx = 0,
  rz = 0,
  sy = 0.62,
  upper = 0.14,
  fore = 0.12,
  elbow = 0,
}: {
  x: number;
  color: string;
  rx?: number;
  rz?: number;
  sy?: number;
  upper?: number;
  fore?: number;
  elbow?: number;
}) {
  return (
    <group position={[x, sy, 0.06]} rotation={[rx, 0, rz]}>
      <mesh position={[0, -0.02, 0]}>
        <Hinge r={0.065} color={PAL.ink} />
      </mesh>
      <Limb length={upper} radius={0.06} color={color} />
      <group position={[0, -upper, 0]} rotation={[elbow, 0, 0]}>
        <Hinge r={0.06} color={PAL.ink} />
        <Limb length={fore} radius={0.05} color={color} />
        <mesh position={[0, -fore - 0.03, 0]}>
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
          <ChunkArm x={-0.27} color={PAL.sageDark} rx={d(-8)} rz={d(8)} sy={0.30} />
          <ChunkArm x={0.27} color={PAL.sageDark} rx={d(-8)} rz={d(-8)} sy={0.30} />
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

/** Smoothstep clamp 0..1. */
function sstep(u: number): number {
  u = Math.min(1, Math.max(0, u));
  return u * u * (3 - 2 * u);
}

/** A passerby with a parcel: idles with the parcel grounded, picks it up,
 *  walks the lane carrying, presents the parcel toward the workshop
 *  (handoff), turns smoothly, walks back, sets it down. No snaps,
 *  no moonwalking — the turn is a beat, not a pop. */
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
  // position: idle at from → walk out → hold at to (handoff + turn) → walk back → idle
  const k = sstep((T - 2.0) / 5.0) * (1 - sstep((T - 10.6) / 5.8));
  const moving = (T > 2.0 && T < 7.0) || (T > 10.6 && T < 16.4);
  const gx = from[0] + (to[0] - from[0]) * k;
  const gz = from[1] + (to[1] - from[1]) * k;
  // smooth turn in place at the far end, and back at the loop seam
  const turnS = sstep((T - 8.8) / 1.8);
  const turnBack = sstep((T - 16.6) / 1.4);
  const baseFace = Math.atan2(to[0] - from[0], to[1] - from[1]);
  const face = baseFace + (turnS - turnBack) * Math.PI;
  const gaitOut = gait(T, 2.0, 7.0, 12);
  const gaitBack = gait(T, 10.6, 16.4, 12);
  const ph = gaitOut + gaitBack;
  // the parcel: grounded at idle, lifted to the chest to carry, presented
  // at handoff. It lives in the root frame so it stays put while the torso bends.
  const liftK = sstep((T - 1.2) / 0.8) * (1 - sstep((T - 16.4) / 0.8));
  const handoff = sstep((T - 7.8) / 0.6) * (1 - sstep((T - 8.8) / 0.6));
  const bend =
    sstep((T - 1.2) / 0.8) * (1 - sstep((T - 2.0) / 0.8)) +
    sstep((T - 16.4) / 0.8) * (1 - sstep((T - 17.2) / 0.8));
  // arms: rest (hang, slight bend) → reach during the bend → carry
  // (elbows low, hands cup the parcel's lower sides) → handoff (extend)
  const carryK = Math.max(
    sstep((T - 1.8) / 0.4) * (1 - sstep((T - 7.4) / 0.8)),
    sstep((T - 10.2) / 1.0) * (1 - sstep((T - 16.0) / 0.8))
  );
  const armRx = d(-6) + bend * d(-42) + carryK * d(-8) + handoff * d(-24);
  const armElbow = d(-12) + bend * d(-6) + carryK * d(-40) + handoff * d(34);
  const lean = (moving ? d(5) : 0) + handoff * d(6) + bend * d(30);
  const parcelY =
    0.13 + (0.8 - 0.13) * liftK + handoff * 0.04 + (moving ? Math.abs(ph) * 0.02 : 0);
  const parcelZ = 0.48 + (0.34 - 0.48) * liftK + handoff * 0.1;

  return (
    <group position={[gx, 0, gz]} rotation={[0, face, 0]}>
      <BlobShadow r={0.42} />
      {/* the parcel, in the root frame: grounded, lifted, presented */}
      <group position={[0, parcelY, parcelZ]} rotation={[0, 0, moving ? ph * d(2) : 0]}>
        <mesh>
          <boxGeometry args={[0.34, 0.26, 0.26]} />
          {matte(PAL.wood)}
        </mesh>
        <mesh position={[0, 0.0, 0.0]}>
          <boxGeometry args={[0.35, 0.05, 0.27]} />
          {matte(PAL.creamDark)}
        </mesh>
      </group>
      <group rotation={[0, 0, 0]}>
        <ChunkLeg x={-0.13} color={PAL.terracottaDark} swing={ph * d(20)} />
        <ChunkLeg x={0.13} color={PAL.terracottaDark} swing={-ph * d(20)} />
        <group position={[0, 0.7, 0]} rotation={[lean + Math.abs(ph) * d(2), 0, 0]}>
          {/* tapered torso: yet another build */}
          <mesh>
            <cylinderGeometry args={[0.2, 0.26, 0.52, 12]} />
            {matte(PAL.blue)}
          </mesh>
          <ChunkArm
            x={-0.26}
            color={PAL.blueDark}
            rx={armRx}
            rz={d(8)}
            sy={0.32}
            upper={0.24}
            fore={0.2}
            elbow={armElbow}
          />
          <ChunkArm
            x={0.26}
            color={PAL.blueDark}
            rx={armRx}
            rz={d(-8)}
            sy={0.32}
            upper={0.24}
            fore={0.2}
            elbow={armElbow}
          />
          {/* bucket head with a brim — looks down at the parcel during the bend */}
          <group position={[0, 0.4, 0]} rotation={[bend * d(18), 0, 0]}>
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
        <ChunkArm x={-0.26} sy={0.18} upper={0.2} fore={0.16} elbow={d(-28)} color={PAL.creamDark} rx={d(-42)} rz={d(16)} />
        <ChunkArm x={0.26} sy={0.18} upper={0.2} fore={0.16} elbow={d(-28)} color={PAL.creamDark} rx={d(-42)} rz={d(-16)} />
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
