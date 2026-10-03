/**
 * Reader vignette: a small round robot on a bench, absorbed in a book.
 * Handles the book, follows the page, reaches, turns it physically,
 * pauses with attention — then closes the book as the loop's natural
 * seam and opens it fresh.
 *
 * Beats: open → read (lean in, gaze follows lines) → reach → page turn
 * (follow-through overshoot, settle) → read → look up (attention) →
 * look down → close → settle.
 *
 * Illustrative physical acting only. Not an OpenLine operation.
 */
import { PAL, matte, BlobShadow, Limb } from "../kit";
import { loop, pulse, bump, d } from "../acting";

const D = 14;

export function Reader({
  t,
  position = [0, 0, 0] as [number, number, number],
  rotationY = 0,
}: {
  t: number;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const T = loop(t, D);

  // book open amount: 0 closed .. 1 open
  const open =
    pulse(T, 0.2, 1.0, 10.2, 11.2, 1);
  // page turn progress 0..1: turns, holds, then untwists hidden inside the closing book
  const turnBase = pulse(T, 5.0, 6.0, 10.0, 10.8, 1);
  const turn = turnBase + bump(T, 6.0, 7.2, 0.1) * turnBase; // follow-through overshoot
  const lean = pulse(T, 1.2, 2.2, 8.6, 9.4, d(12)) - pulse(T, 9.0, 9.6, 10.4, 11.2, d(10));
  const gazeSway = Math.sin(T * 2.1) * d(4) * pulse(T, 1.5, 2.5, 8.0, 9.0, 1);
  const lookUp = pulse(T, 8.8, 9.4, 10.0, 10.8, 1);
  const reach = pulse(T, 4.0, 4.8, 5.2, 6.2, 1);
  const settle = pulse(T, 11.4, 12.4, 13.4, 14.0, 1);

  const pageAngle = -turn * Math.PI;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <BlobShadow r={0.5} />

      {/* bench */}
      <group position={[0, 0, -0.15]}>
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 0.22, 0]}>
            <boxGeometry args={[0.09, 0.44, 0.09]} />
            {matte(PAL.woodDark)}
          </mesh>
        ))}
        <mesh position={[0, 0.46, 0]}>
          <boxGeometry args={[1.1, 0.08, 0.42]} />
          {matte(PAL.wood)}
        </mesh>
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 0.72, -0.19]}>
            <boxGeometry args={[0.09, 0.5, 0.07]} />
            {matte(PAL.wood)}
          </mesh>
        ))}
        <mesh position={[0, 0.86, -0.2]}>
          <boxGeometry args={[1.1, 0.22, 0.06]} />
          {matte(PAL.wood)}
        </mesh>
      </group>

      {/* reader body: small and round, seated */}
      <group position={[0, 0.5, 0.05]} rotation={[lean * 0.4, 0, 0]}>
        {/* dangling legs */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.13, 0.08, 0.12]} rotation={[d(24) + Math.sin(T * 1.7 + s) * d(3), 0, 0]}>
            <Limb length={0.26} radius={0.06} color={PAL.blueDark} />
          </group>
        ))}
        {/* round torso */}
        <mesh position={[0, 0.32, 0]}>
          <sphereGeometry args={[0.26, 20, 16]} />
          {matte(PAL.blue)}
        </mesh>
        {/* arms cradling the book */}
        {[-1, 1].map((s) => (
          <group
            key={s}
            position={[s * 0.24, 0.42, 0.1]}
            rotation={[d(-52) + (s > 0 ? reach * d(-30) : 0), 0, s * d(-18)]}
          >
            <Limb length={0.24} radius={0.055} color={PAL.blueDark} />
            <mesh position={[0, -0.3, 0]}>
              <sphereGeometry args={[0.06, 10, 8]} />
              {matte(PAL.cream)}
            </mesh>
          </group>
        ))}
        {/* head */}
        <group position={[0, 0.66, 0.02]} rotation={[lean * 0.7 - lookUp * d(22) + settle * d(4), gazeSway, 0]}>
          <mesh>
            <sphereGeometry args={[0.19, 20, 16]} />
            {matte(PAL.cream)}
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.075, 0.03, 0.155]}>
                <sphereGeometry args={[0.045, 12, 10]} />
                <meshBasicMaterial color="#faf6ec" />
              </mesh>
              <mesh position={[s * 0.075 + gazeSway * 0.4, 0.03 - lookUp * 0.012, 0.19]}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color={PAL.ink} />
              </mesh>
            </group>
          ))}
        </group>

        {/* the book, held up */}
        <group position={[0, 0.42, 0.3]} rotation={[d(-24) - lean * 0.3, 0, 0]}>
          {/* spine */}
          <mesh position={[0, 0, -0.02]}>
            <boxGeometry args={[0.05, 0.3, 0.06]} />
            {matte(PAL.terracottaDark)}
          </mesh>
          {/* covers */}
          {[-1, 1].map((s) => (
            <group key={s} rotation={[0, s * open * d(148), 0]}>
              <mesh position={[s * 0.14, 0, 0]}>
                <boxGeometry args={[0.28, 0.3, 0.025]} />
                {matte(PAL.terracotta)}
              </mesh>
            </group>
          ))}
          {/* page block */}
          <mesh position={[0, 0, 0.012]} scale={[open, 1, 1]}>
            <boxGeometry args={[0.24, 0.26, 0.03]} />
            {matte(PAL.white)}
          </mesh>
          {/* the turning page */}
          <group rotation={[0, pageAngle, 0]}>
            <mesh position={[0.11, 0, 0.035]}>
              <boxGeometry args={[0.22, 0.25, 0.008]} />
              {matte(PAL.white)}
            </mesh>
            {/* faint text lines on the page */}
            {[0.06, 0.0, -0.06].map((y, i) => (
              <mesh key={i} position={[0.11, y, 0.041]}>
                <boxGeometry args={[0.15, 0.012, 0.002]} />
                <meshBasicMaterial color="#b9ac93" />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

export const READER_LOOP = D;
