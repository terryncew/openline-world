/**
 * Carrier vignette: a broad, low robot shuttling a timber beam between a
 * pile and a sawhorse. One loaded trip per loop, alternating direction —
 * the story is seamless by construction (it ends where the next loop
 * begins, timber in hand at the far end).
 *
 * Beats: rest → anticipate (crouch, reach) → grip → strain lift (tremor,
 * lean back) → turn → carry (heavy deliberate steps, beam sways) →
 * set down → release → straighten with follow-through → rest.
 *
 * Illustrative physical acting only. Not an OpenLine operation.
 */
import { PAL, matte, BlobShadow, Limb, Hinge, Foot } from "../kit";
import { loop, pulse, bump, tremor, gait, d } from "../acting";

const D = 16; // loop seconds

interface CarrierPose {
  rootX: number;
  rootY: number;
  lean: number; // forward lean, radians
  rock: number; // side rock while walking
  turnY: number; // facing
  armSwing: number; // shoulder rotation.x
  armSide: number; // shoulder rotation.z (reach toward beam)
  grip: number; // 0 open .. 1 closed
  legL: number;
  legR: number;
  headTilt: number;
  timberX: number;
  timberY: number;
  timberSway: number;
}

export function carrierPoseAt(t: number, sx: 1 | -1): CarrierPose {  const T = loop(t, D);
  // travel: -1.15 <-> +1.15 (mirrored per cycle)
  const travel = pulse(T, 5.4, 6.2, 8.4, 9.0, 1);
  const rootX = (-1.15 + 2.3 * travel) * sx;
  const walking = T > 5.4 && T < 9.0;
  const gaitPh = gait(T, 5.4, 9.0, 3); // 3 steps

  const crouch =
    pulse(T, 1.0, 1.8, 2.4, 3.0, 1) * 0.0 + // (anticipate uses lean, not full crouch)
    pulse(T, 1.0, 2.0, 4.2, 5.0, 0.26) + // anticipate crouch through lift
    pulse(T, 9.0, 9.6, 10.2, 11.0, 0.3); // set-down crouch
  const lifting = T > 3.0 && T < 4.8;

  return {
    rootX,
    rootY: -crouch + (walking ? Math.abs(gaitPh) * 0.03 : 0),
    lean:
      pulse(T, 1.0, 2.0, 2.6, 3.2, d(16)) + // anticipate lean-in
      pulse(T, 3.2, 4.0, 4.4, 5.2, d(-10)) + // strain lean-back
      (walking ? d(4) : 0) + // heavy forward hunch while carrying
      pulse(T, 9.0, 9.6, 10.2, 11.0, d(14)), // set-down lean
    rock: walking ? gaitPh * d(4) : 0,
    turnY: (Math.PI / 2) * sx, // faces travel direction; mirrored per cycle
    armSwing:
      pulse(T, 1.0, 2.2, 2.8, 3.4, d(-38)) + // reach forward-down
      pulse(T, 3.4, 4.4, 8.6, 9.4, d(-52)) + // hold beam at carry
      pulse(T, 9.4, 10.0, 10.6, 11.4, d(-30)) + // lower with beam
      bump(T, 11.4, 13.0, d(18)), // follow-through swing up past neutral
    armSide: d(24), // arms angled toward the beam at the carrier's side
    grip: pulse(T, 2.4, 3.0, 10.6, 11.4, 1),
    legL: walking ? gaitPh * d(22) : 0,
    legR: walking ? -gaitPh * d(22) : 0,
    headTilt:
      pulse(T, 1.0, 2.0, 2.8, 3.4, d(10)) + // look down at beam
      (lifting ? tremor(T, d(1.2)) : 0),
    timberX: (-1.15 + 2.3 * travel) * sx,
    timberY:
      0.26 +
      pulse(T, 3.2, 4.2, 8.8, 9.8, 0.54) + // lift to carry height, lower at set-down
      (lifting ? tremor(T, 0.012) : 0),
    timberSway: walking ? gait(T + 0.35, 5.4, 9.0, 3) * d(3) : 0,
  };
}

function Gripper({ closed, color }: { closed: number; color: string }) {
  const a = d(8) + closed * d(38);
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <sphereGeometry args={[0.085, 12, 10]} />
        {matte(color)}
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} rotation={[0, 0, s * a]}>
          <mesh position={[s * 0.055, -0.13, 0]}>
            <boxGeometry args={[0.055, 0.15, 0.07]} />
            {matte(color)}
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <Hinge r={0.05} color={PAL.ink} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Carrier({
  t,
  position = [0, 0, 0] as [number, number, number],
}: {
  t: number;
  position?: [number, number, number];
}) {
  const cycle = Math.floor(t / D) % 2;
  const sx = (cycle === 0 ? 1 : -1) as 1 | -1;
  const p = carrierPoseAt(t, sx);
  const strainShake = p.lean < -0.05 ? tremor(t, 0.008) : 0;

  const arm = (side: 1 | -1) => (
    <group position={[side * 0.44, 1.14, 0]} rotation={[p.armSwing, 0, side * -p.armSide]}>
      <group position={[0, -0.02, 0]}>
        <Hinge r={0.1} color={PAL.terracottaDark} />
      </group>
      <Limb length={0.3} radius={0.12} color={PAL.terracottaDark} />
      <group position={[0, -0.32, 0]}>
        <Hinge r={0.085} color={PAL.woodDark} />
        <Gripper closed={p.grip} color={PAL.woodDark} />
      </group>
    </group>
  );

  return (
    <group position={position}>
      {/* timber pile */}
      {[-1.15, -1.15, -1.15].map((x, i) => (
        <mesh key={i} position={[x, 0.15 + i * 0.15, -0.55 + (i % 2) * 0.12]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 1.6, 10]} />
          {matte(PAL.wood)}
        </mesh>
      ))}
      {/* sawhorse at the drop end */}
      <group position={[1.15, 0, 0]}>
        {[-0.25, 0.25].map((dz, i) => (
          <group key={i} position={[0, 0, dz]}>
            <mesh position={[0, 0.22, 0]}>
              <boxGeometry args={[0.08, 0.44, 0.08]} />
              {matte(PAL.woodDark)}
            </mesh>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[0.3, 0.06, 0.1]} />
              {matte(PAL.woodDark)}
            </mesh>
          </group>
        ))}
      </group>

      {/* the beam being shuttled */}
      <group position={[p.timberX, p.timberY, 0.12]} rotation={[0, 0, Math.PI / 2 + p.timberSway]}>
        <mesh>
          <cylinderGeometry args={[0.075, 0.075, 1.9, 10]} />
          {matte(PAL.wood)}
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.078, 0.078, 0.03, 10]} />
          {matte(PAL.woodDark)}
        </mesh>
      </group>

      {/* carrier body: broad low barrel */}
      <group position={[p.rootX, p.rootY + strainShake, 0.42]} rotation={[p.lean, p.turnY, p.rock]}>
        <BlobShadow r={0.62} />
        {/* short chunky legs with knee hinges */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.22, 0.4, 0]} rotation={[(s < 0 ? p.legL : p.legR), 0, 0]}>
            <Limb length={0.26} radius={0.13} color={PAL.blueDark} />
            <group position={[0, -0.15, 0]}>
              <Hinge r={0.1} color={PAL.ink} />
            </group>
            <group position={[0, -0.3, 0.04]}>
              <Foot w={0.26} h={0.12} l={0.34} color={PAL.ink} />
            </group>
          </group>
        ))}
        {/* broad barrel torso */}
        <mesh position={[0, 0.92, 0]}>
          <capsuleGeometry args={[0.36, 0.34, 8, 16]} />
          {matte(PAL.blue)}
        </mesh>
        <mesh position={[0, 0.92, 0]} scale={[1.16, 0.7, 0.9]}>
          <capsuleGeometry args={[0.32, 0.28, 8, 16]} />
          {matte(PAL.terracotta)}
        </mesh>
        {/* belt */}
        <mesh position={[0, 0.66, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 0.1, 16]} />
          {matte(PAL.woodDark)}
        </mesh>
        {arm(-1)}
        {arm(1)}
        {/* head with brow */}
        <group position={[0, 1.5, 0]} rotation={[p.headTilt, 0, 0]}>
          <mesh>
            <sphereGeometry args={[0.22, 18, 14]} />
            {matte(PAL.cream)}
          </mesh>
          <mesh position={[0, 0.11, 0.14]}>
            <boxGeometry args={[0.3, 0.07, 0.1]} />
            {matte(PAL.terracottaDark)}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.085, 0.0, 0.185]}>
              <sphereGeometry args={[0.038, 10, 8]} />
              <meshBasicMaterial color={PAL.ink} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export const CARRIER_LOOP = D;
