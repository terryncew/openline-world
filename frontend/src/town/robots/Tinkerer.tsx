/**
 * Tinkerer vignette: a compact manufactured robot fussing over a small pump
 * mechanism. Tapered torso with panel bands, square lens housing, exposed
 * joints — the one-eyed charm kept, the lanky human read removed.
 *
 * Beats: inspect (lean in) → reach → turn crank (spinner spins up) →
 * sputter (wobble, slow) → pause (head tilt, thinking) → retry (steady) →
 * spinner settles → satisfied nod.
 *
 * Illustrative physical acting only. Not an OpenLine operation.
 */
import { PAL, matte, BlobShadow, Hinge, Limb } from "../kit";
import { loop, pulse, bump, d } from "../acting";
import * as THREE from "three";

const D = 14;

/** Piecewise-linear ramp through [t, value] points, clamped. */
function piecewise(t: number, pts: [number, number][]): number {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, v0] = pts[i];
    const [t1, v1] = pts[i + 1];
    if (t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      return v0 + (v1 - v0) * u;
    }
  }
  return pts[pts.length - 1][1];
}

// crank turns completed by time t (the story of the mechanism)
function crankTurns(t: number): number {
  return piecewise(t, [
    [0, 0],
    [3.0, 0],
    [5.5, 2.5], // first attempt: spins up
    [6.5, 2.9], // sputter: barely advances
    [8.0, 2.9], // pause: still
    [10.0, 4.4], // retry: steady
    [12.0, 6.0], // settles into rhythm (integer turns: seamless loop)
    [14, 6.0],
  ]);
}

/** Stretchy limb between two points (for the hand tracking the crank). */
function StretchLimb({
  from,
  to,
  radius,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  radius: number;
  color: string;
}) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  return (
    <group position={mid} quaternion={quat}>
      <mesh>
        <capsuleGeometry args={[radius, len, 6, 10]} />
        {matte(color)}
      </mesh>
    </group>
  );
}

const CRANK_C: [number, number, number] = [0.95, 1.02, 0];
const CRANK_R = 0.2;

export function Tinkerer({
  t,
  position = [0, 0, 0] as [number, number, number],
  rotationY = 0,
}: {
  t: number;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const T = loop(t, D);
  const turns = crankTurns(T);
  const theta = turns * Math.PI * 2;
  const sputtering = T > 5.5 && T < 6.5;

  const lean = pulse(T, 0.2, 1.2, 2.4, 3.2, d(14)) + pulse(T, 6.5, 7.2, 7.8, 8.6, d(-8));
  const reach = pulse(T, 2.0, 2.8, 10.8, 11.6, 1);
  const headTilt = pulse(T, 6.5, 7.2, 7.8, 8.6, d(-14)); // thinking tilt
  const nod = bump(T, 12.0, 13.2, d(9));
  const eyeWide = pulse(T, 0.2, 1.0, 2.6, 3.4, 1.35);

  // hand tracks the crank handle while reaching
  const hx = CRANK_C[0];
  const hy = CRANK_C[1] + Math.sin(theta) * CRANK_R;
  const hz = CRANK_C[2] + Math.cos(theta) * CRANK_R;
  const shoulder: [number, number, number] = [0.18, 1.22, 0.3];
  const hand: [number, number, number] = reach > 0.02 ? [hx, hy, hz] : [0.3, 0.66, 0.35];

  // spinner: geared 3x off the crank, wobbles while sputtering
  const spinnerAngle = theta * 3;
  const wobble = sputtering ? Math.sin(T * 25) * d(6) : 0;

  // two-segment leg: thigh -> exposed knee hinge -> shin -> block foot
  const leg = (s: 1 | -1) => (
    <group key={s} position={[s * 0.15, 0.42, 0]}>
      <Limb length={0.2} radius={0.075} color={PAL.sageDark} />
      <group position={[0, -0.2, 0]}>
        <Hinge r={0.075} color={PAL.ink} />
        <Limb length={0.16} radius={0.06} color={PAL.sageDark} />
        <mesh position={[0, -0.18, 0.04]}>
          <boxGeometry args={[0.19, 0.1, 0.28]} />
          {matte(PAL.ink)}
        </mesh>
      </group>
    </group>
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <BlobShadow r={0.5} />

      {/* the pump mechanism (scenery) */}
      <group position={[0.95, 0, 0]}>
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          {matte(PAL.woodDark)}
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 0.3, 12]} />
          {matte(PAL.blue)}
        </mesh>
        {/* crank disc + handle */}
        <group position={[0, 1.02, 0]} rotation={[theta, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.06, 18]} />
            {matte(PAL.terracottaDark)}
          </mesh>
          <mesh position={[0, CRANK_R, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.16, 10]} />
            {matte(PAL.wood)}
          </mesh>
        </group>
        {/* spinner flywheel on top */}
        <group position={[0, 0.92, 0]} rotation={[0, spinnerAngle, wobble]}>
          <mesh>
            <torusGeometry args={[0.16, 0.035, 10, 20]} />
            {matte(PAL.sage)}
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
              <boxGeometry args={[0.3, 0.03, 0.03]} />
              {matte(PAL.sageDark)}
            </mesh>
          ))}
        </group>
      </group>

      {/* tinkerer body: compact, manufactured */}
      <group position={[0, 0, 0]} rotation={[lean, 0, 0]}>
        {leg(-1)}
        {leg(1)}
        {/* tapered torso: wide shoulders, narrow waist, panel bands */}
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.21, 0.13, 0.58, 14]} />
          {matte(PAL.sage)}
        </mesh>
        {[0.62, 0.98].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <cylinderGeometry args={[0.185, 0.185, 0.05, 14]} />
            {matte(PAL.sageDark)}
          </mesh>
        ))}
        {/* collar ring */}
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.07, 14]} />
          {matte(PAL.sageDark)}
        </mesh>
        {/* idle arm: upper -> exposed elbow -> forearm -> hand */}
        <group position={[-0.24, 1.04, 0]} rotation={[bump(T, 4, 6, d(-8)), 0, d(10)]}>
          <mesh position={[0, -0.02, 0]}>
            <Hinge r={0.06} color={PAL.ink} />
          </mesh>
          <Limb length={0.14} radius={0.06} color={PAL.sageDark} />
          <group position={[0, -0.14, 0]}>
            <Hinge r={0.06} color={PAL.ink} />
            <Limb length={0.12} radius={0.05} color={PAL.sageDark} />
            <mesh position={[0, -0.14, 0]}>
              <sphereGeometry args={[0.07, 10, 8]} />
              {matte(PAL.cream)}
            </mesh>
          </group>
        </group>
        {/* head: square lens housing on a hinge neck */}
        <group position={[0, 1.32, 0]} rotation={[headTilt + nod, d(18), 0]}>
          <mesh position={[0, -0.08, 0]}>
            <Hinge r={0.09} color={PAL.ink} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.17, 18, 14]} />
            {matte(PAL.cream)}
          </mesh>
          {/* lens housing: a manufactured bezel, not a face */}
          <mesh position={[0.1, 0.03, 0.1]} rotation={[0, d(24), 0]}>
            <boxGeometry args={[0.21, 0.21, 0.08]} />
            {matte(PAL.ink)}
          </mesh>
          <mesh position={[0.1, 0.03, 0.14]} scale={[eyeWide, eyeWide, 1]}>
            <sphereGeometry args={[0.075, 14, 12]} />
            <meshBasicMaterial color="#faf6ec" />
          </mesh>
          <mesh position={[0.15, 0.03, 0.17]}>
            <sphereGeometry args={[0.032, 10, 8]} />
            <meshBasicMaterial color={PAL.ink} />
          </mesh>
          {/* antenna */}
          <mesh position={[-0.05, 0.2, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.18, 8]} />
            {matte(PAL.terracottaDark)}
          </mesh>
          <mesh position={[-0.05, 0.3, 0]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            {matte(PAL.warm)}
          </mesh>
        </group>
      </group>
      {/* working arm: stretches to the crank */}
      <StretchLimb from={shoulder} to={hand} radius={0.05} color={PAL.sageDark} />
      <mesh position={hand}>
        <sphereGeometry args={[0.08, 12, 10]} />
        {matte(PAL.cream)}
      </mesh>
    </group>
  );
}

export const TINKERER_LOOP = D;
export function tinkererPoseAt(t: number) {
  return { turns: crankTurns(loop(t, D)) };
}
