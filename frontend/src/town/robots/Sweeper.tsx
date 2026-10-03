/**
 * Sweeper vignette: a squat manufactured robot with a broom working the plaza.
 * Short two-segment limbs with exposed hinge joints, oversized hands and
 * feet, a can-shaped head — unmistakably built, still soft and charming.
 *
 * Beats: ready → three strokes (body rocks with each) → reposition
 * (sidestep, broom drags) → rest (lean on broom, head down, HELD) →
 * straighten → two strokes → settle.
 *
 * Illustrative physical acting only. Not an OpenLine operation.
 */
import { PAL, matte, BlobShadow, Limb, Hinge, Foot } from "../kit";
import { loop, pulse, bump, d } from "../acting";

const D = 14;

export function Sweeper({
  t,
  position = [0, 0, 0] as [number, number, number],
  rotationY = 0,
}: {
  t: number;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const T = loop(t, D);

  // three deliberate strokes, then two more after the rest
  const strokes =
    bump(T, 1.0, 2.1, 1) + bump(T, 2.2, 3.3, 1) + bump(T, 3.4, 4.5, 1);
  const strokes2 = bump(T, 10.0, 11.1, 1) + bump(T, 11.2, 12.3, 1);
  const sweeping = strokes + strokes2;

  const reposition = pulse(T, 4.5, 5.2, 5.4, 6.2, 1);
  const resting = pulse(T, 6.2, 7.0, 8.4, 9.2, 1);
  const straighten = bump(T, 9.2, 10.2, 1);

  const lean =
    sweeping * d(11) + // rock into each stroke
    reposition * d(6) +
    resting * d(20) - // lean ON the broom
    straighten * d(6);
  const headDown = resting * d(24);
  const sideStep = pulse(T, 4.5, 5.2, 5.4, 6.2, 0.55);

  // broom: arcs with the strokes, drags on reposition, planted at rest
  const broomSwing = sweeping * d(-32);
  const broomDrag = reposition * d(18);
  const broomPlant = resting * d(8);

  // two-segment leg: thigh -> exposed knee hinge -> shin -> big foot
  const leg = (s: 1 | -1) => (
    <group key={s} position={[s * 0.13, 0.3, 0]} rotation={[reposition * s * d(14), 0, 0]}>
      <Limb length={0.15} radius={0.085} color={PAL.terracottaDark} />
      <group position={[0, -0.15, 0]}>
        <Hinge r={0.08} color={PAL.ink} />
        <Limb length={0.13} radius={0.07} color={PAL.terracottaDark} />
        <group position={[0, -0.13, 0.04]}>
          <Foot w={0.24} h={0.12} l={0.36} color={PAL.ink} />
        </group>
      </group>
    </group>
  );

  // two-segment arm: upper arm -> exposed elbow hinge -> forearm -> big hand
  const arm = (s: 1 | -1) => (
    <group
      key={s}
      position={[s * 0.26, 0.22, 0.08]}
      rotation={[d(-40) + sweeping * d(-14) - resting * d(22), 0, s * d(-12)]}
    >
      <mesh position={[0, -0.02, 0]}>
        <Hinge r={0.07} color={PAL.ink} />
      </mesh>
      <Limb length={0.13} radius={0.065} color={PAL.cream} />
      <group position={[0, -0.13, 0]}>
        <Hinge r={0.07} color={PAL.ink} />
        <Limb length={0.12} radius={0.055} color={PAL.cream} />
        <mesh position={[0, -0.14, 0]}>
          <sphereGeometry args={[0.09, 12, 10]} />
          {matte(PAL.woodDark)}
        </mesh>
      </group>
    </group>
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <BlobShadow r={0.5} />

      <group position={[sideStep, 0, 0]}>
        {leg(-1)}
        {leg(1)}
        {/* torso */}
        <group position={[0, 0.78, 0]} rotation={[lean, 0, sweeping * d(3)]}>
          <mesh>
            <capsuleGeometry args={[0.22, 0.3, 8, 14]} />
            {matte(PAL.cream)}
          </mesh>
          {/* sash */}
          <mesh position={[0, 0.02, 0]} rotation={[0, 0, d(12)]}>
            <boxGeometry args={[0.46, 0.09, 0.46]} />
            {matte(PAL.blue)}
          </mesh>
          {/* back vent panel: manufactured detail */}
          <mesh position={[0, 0.12, -0.22]}>
            <boxGeometry args={[0.2, 0.16, 0.04]} />
            {matte(PAL.creamDark)}
          </mesh>
          {arm(-1)}
          {arm(1)}
          {/* can head with cap brim */}
          <group position={[0, 0.44, 0]} rotation={[headDown - straighten * d(8), 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.17, 0.18, 0.24, 18]} />
              {matte(PAL.terracotta)}
            </mesh>
            <mesh position={[0, -0.13, 0]}>
              <Hinge r={0.1} color={PAL.ink} />
            </mesh>
            <mesh position={[0, 0.13, 0]}>
              <cylinderGeometry args={[0.185, 0.185, 0.05, 18]} />
              {matte(PAL.blueDark)}
            </mesh>
            <mesh position={[0, 0.15, 0.12]}>
              <boxGeometry args={[0.22, 0.03, 0.14]} />
              {matte(PAL.blueDark)}
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.07, 0.0, 0.155]}>
                <sphereGeometry args={[0.032, 10, 8]} />
                <meshBasicMaterial color={PAL.ink} />
              </mesh>
            ))}
          </group>
        </group>

        {/* the broom */}
        <group position={[0.28, 0, 0.3]} rotation={[broomSwing + broomDrag - broomPlant, 0, d(-6)]}>
          <mesh position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.24, 8]} />
            {matte(PAL.wood)}
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.1, 0.1, 0.08]} />
            {matte(PAL.terracotta)}
          </mesh>
          <mesh position={[0, -0.02, 0]}>
            <boxGeometry args={[0.26, 0.22, 0.1]} />
            {matte(PAL.sage)}
          </mesh>
          {[0.06, -0.06].map((x, i) => (
            <mesh key={i} position={[x, -0.1, 0]} rotation={[0, 0, x * 2]}>
              <boxGeometry args={[0.05, 0.14, 0.08]} />
              {matte(PAL.sageDark)}
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export const SWEEPER_LOOP = D;
