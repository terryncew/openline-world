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
import { tremor, d } from "../acting";

import { carrierPoseAt, CARRIER_LOOP } from "./motion";

const D = CARRIER_LOOP;

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

export { CARRIER_LOOP, carrierPoseAt } from "./motion";
