/**
 * OpenLine World visualization — workshop worker figures.
 * frontend/src/viz/scene/WorkerFigures.tsx
 *
 * The workshop workers ARE the town robots: the seven hand-authored
 * town silhouettes (carrier, tinkerer, reader, sweeper, waiter,
 * passerby, helper), rebuilt here in exact conformity — same
 * proportions, same construction language, same detailing, same town
 * kit (matte finish, blob shadows, barrel hinges, chunky limbs).
 * The only adaptation is posing: shoulder/elbow pivots, leg swings,
 * and head tilt are driven by workerMotion (reducer state), so the
 * worker still reads the ledger, assembles the packet, carries it
 * down the lane, presents it at the threshold, recoils on STOP,
 * settles on ALLOW, and powers down on revocation.
 *
 * Each worker is deterministically one family (hash of workerId), so
 * the same worker is the same robot every visit. The mandate lamp —
 * a brass-rimmed warm lamp on the chest, the town's own lamp
 * language — is bright while the mandate lives and dark when the
 * worker is revoked. Presentation only; protocol untouched.
 */
import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PAL as TPAL, matte, BlobShadow, Hinge, Limb, Foot } from "../../town/kit";
import { hashStr, type VizProposal, type VizReceipt, type VizSpeech, type VizWorker } from "../protocol";
import { PAL } from "./VizCanvas";
import {
  getMotion,
  hasRecentSpeech,
  stagePos,
  trackWorkers,
  type ArmPose,
} from "./workerMotion";

const CLAIM_DIM = new THREE.Color("#5a6a7a");
const dd = (d: number) => (d * Math.PI) / 180;

const ARM_ANGLES: Record<ArmPose, { sh: number; el: number }> = {
  hang: { sh: -0.08, el: -0.28 },
  read: { sh: -0.72, el: -0.55 },
  assemble: { sh: -0.95, el: -0.38 },
  carry: { sh: -0.82, el: -0.62 },
  present: { sh: -1.02, el: -0.28 },
  recoil: { sh: 0.18, el: -0.12 },
  dead: { sh: 0.02, el: -0.08 },
};

/** Motion pivot rig shared by the driver and every family body. */
interface Rig {
  legL: RefObject<THREE.Group | null>;
  legR: RefObject<THREE.Group | null>;
  shL: RefObject<THREE.Group | null>;
  shR: RefObject<THREE.Group | null>;
  elL: RefObject<THREE.Group | null>;
  elR: RefObject<THREE.Group | null>;
  head: RefObject<THREE.Group | null>;
}

interface BodyProps {
  rig: Rig;
  /** dimmed town color string: full life, or sinking toward claim grey when revoked */
  C: (c: string) => string;
  eyeMat: RefObject<THREE.MeshBasicMaterial | null>;
  onSelect: (e: { stopPropagation: () => void }) => void;
}

/** The mandate lamp: brass-rimmed, warm while the mandate lives, dark
 *  when revoked. The town's own lamp language, kept small. */
function MandateLamp({
  position,
  eyeMat,
}: {
  position: [number, number, number];
  eyeMat: RefObject<THREE.MeshBasicMaterial | null>;
}) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.052, 0.018, 8, 18]} />
        <meshStandardMaterial color={PAL.brass} roughness={0.4} metalness={0.65} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.034, 12, 10]} />
        <meshBasicMaterial ref={eyeMat} color="#ffe9b8" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Shared chunky leg (town Extras): thigh -> knee hinge -> shin -> big foot. */
function ChunkLeg({
  x,
  color,
  C,
  rig,
  side,
}: {
  x: number;
  color: string;
  C: (c: string) => string;
  rig: Rig;
  side: -1 | 1;
}) {
  return (
    <group position={[x, 0.34, 0]} ref={side < 0 ? rig.legL : rig.legR}>
      <Limb length={0.17} radius={0.08} color={C(color)} />
      <group position={[0, -0.17, 0]}>
        <Hinge r={0.075} color={C(TPAL.ink)} />
        <Limb length={0.15} radius={0.065} color={C(color)} />
        <group position={[0, -0.15, 0.04]}>
          <Foot w={0.26} h={0.12} l={0.36} color={C(TPAL.ink)} />
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Family 0 — Carrier: broad low barrel, belt, brow head, grippers.     */
/* ------------------------------------------------------------------ */
function CarrierBody({ rig, C, eyeMat, onSelect }: BodyProps) {
  const gripper = () => {
    const a = dd(8) + 0.5 * dd(38); // neutral half-closed hand
    return (
      <group>
        <mesh position={[0, -0.05, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          {matte(C(TPAL.woodDark))}
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} rotation={[0, 0, s * a]}>
            <mesh position={[s * 0.055, -0.13, 0]}>
              <boxGeometry args={[0.055, 0.15, 0.07]} />
              {matte(C(TPAL.woodDark))}
            </mesh>
            <mesh position={[0, -0.05, 0]}>
              <Hinge r={0.05} color={C(TPAL.ink)} />
            </mesh>
          </group>
        ))}
      </group>
    );
  };
  const arm = (side: 1 | -1) => (
    <group
      key={side}
      position={[side * 0.44, 1.14, 0]}
      ref={side < 0 ? rig.shL : rig.shR}
    >
      <group rotation={[0, 0, -side * dd(6)]}>
        <mesh position={[0, -0.02, 0]}>
          <Hinge r={0.1} color={C(TPAL.terracottaDark)} />
        </mesh>
        <Limb length={0.3} radius={0.12} color={C(TPAL.terracottaDark)} />
        <group position={[0, -0.32, 0]} ref={side < 0 ? rig.elL : rig.elR}>
          <mesh position={[0, -0.02, 0]}>
            <Hinge r={0.085} color={C(TPAL.woodDark)} />
          </mesh>
          {gripper()}
        </group>
      </group>
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.62} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.22, 0.4, 0]} ref={s < 0 ? rig.legL : rig.legR}>
          <Limb length={0.26} radius={0.13} color={C(TPAL.blueDark)} />
          <group position={[0, -0.15, 0]}>
            <Hinge r={0.1} color={C(TPAL.ink)} />
          </group>
          <group position={[0, -0.3, 0.04]}>
            <Foot w={0.26} h={0.12} l={0.34} color={C(TPAL.ink)} />
          </group>
        </group>
      ))}
      <mesh position={[0, 0.92, 0]} onClick={onSelect}>
        <capsuleGeometry args={[0.36, 0.34, 8, 16]} />
        {matte(C(TPAL.blue))}
      </mesh>
      <mesh position={[0, 0.92, 0]} scale={[1.16, 0.7, 0.9]}>
        <capsuleGeometry args={[0.32, 0.28, 8, 16]} />
        {matte(C(TPAL.terracotta))}
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.1, 16]} />
        {matte(C(TPAL.woodDark))}
      </mesh>
      <MandateLamp position={[0, 1.0, 0.3]} eyeMat={eyeMat} />
      {arm(-1)}
      {arm(1)}
      <group position={[0, 1.5, 0]} ref={rig.head}>
        <mesh onClick={onSelect}>
          <sphereGeometry args={[0.22, 18, 14]} />
          {matte(C(TPAL.cream))}
        </mesh>
        <mesh position={[0, 0.11, 0.14]}>
          <boxGeometry args={[0.3, 0.07, 0.1]} />
          {matte(C(TPAL.terracottaDark))}
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.085, 0.0, 0.185]}>
            <sphereGeometry args={[0.038, 10, 8]} />
            <meshBasicMaterial color={C(TPAL.ink)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Family 1 — Tinkerer: tapered torso, panel bands, lens housing.       */
/* ------------------------------------------------------------------ */
function TinkererBody({ rig, C, eyeMat, onSelect }: BodyProps) {
  const arm = (side: 1 | -1) => (
    <group
      key={side}
      position={[side * 0.24, 1.04, 0]}
      ref={side < 0 ? rig.shL : rig.shR}
    >
      <group rotation={[0, 0, side * dd(10)]}>
        <mesh position={[0, -0.02, 0]}>
          <Hinge r={0.06} color={C(TPAL.ink)} />
        </mesh>
        <Limb length={0.14} radius={0.06} color={C(TPAL.sageDark)} />
        <group position={[0, -0.14, 0]} ref={side < 0 ? rig.elL : rig.elR}>
          <Hinge r={0.06} color={C(TPAL.ink)} />
          <Limb length={0.12} radius={0.05} color={C(TPAL.sageDark)} />
          <mesh position={[0, -0.14, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            {matte(C(TPAL.cream))}
          </mesh>
        </group>
      </group>
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.5} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.15, 0.42, 0]} ref={s < 0 ? rig.legL : rig.legR}>
          <Limb length={0.2} radius={0.075} color={C(TPAL.sageDark)} />
          <group position={[0, -0.2, 0]}>
            <Hinge r={0.075} color={C(TPAL.ink)} />
            <Limb length={0.16} radius={0.06} color={C(TPAL.sageDark)} />
            <mesh position={[0, -0.18, 0.04]}>
              <boxGeometry args={[0.19, 0.1, 0.28]} />
              {matte(C(TPAL.ink))}
            </mesh>
          </group>
        </group>
      ))}
      <mesh position={[0, 0.8, 0]} onClick={onSelect}>
        <cylinderGeometry args={[0.21, 0.13, 0.58, 14]} />
        {matte(C(TPAL.sage))}
      </mesh>
      {[0.62, 0.98].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.185, 0.185, 0.05, 14]} />
          {matte(C(TPAL.sageDark))}
        </mesh>
      ))}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.07, 14]} />
        {matte(C(TPAL.sageDark))}
      </mesh>
      <MandateLamp position={[0, 1.1, 0.23]} eyeMat={eyeMat} />
      {arm(-1)}
      {arm(1)}
      <group position={[0, 1.32, 0]} ref={rig.head}>
        <mesh position={[0, -0.08, 0]}>
          <Hinge r={0.09} color={C(TPAL.ink)} />
        </mesh>
        <mesh onClick={onSelect}>
          <sphereGeometry args={[0.17, 18, 14]} />
          {matte(C(TPAL.cream))}
        </mesh>
        <mesh position={[0.1, 0.03, 0.1]} rotation={[0, dd(24), 0]}>
          <boxGeometry args={[0.21, 0.21, 0.08]} />
          {matte(C(TPAL.ink))}
        </mesh>
        <mesh position={[0.1, 0.03, 0.14]}>
          <sphereGeometry args={[0.075, 14, 12]} />
          <meshBasicMaterial color="#faf6ec" />
        </mesh>
        <mesh position={[0.15, 0.03, 0.17]}>
          <sphereGeometry args={[0.032, 10, 8]} />
          <meshBasicMaterial color={C(TPAL.ink)} />
        </mesh>
        <mesh position={[-0.05, 0.2, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.18, 8]} />
          {matte(C(TPAL.terracottaDark))}
        </mesh>
        <mesh position={[-0.05, 0.3, 0]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          {matte(C(TPAL.warm))}
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Family 2 — Reader: ball torso, chest panel, visor head. Standing     */
/* adaptation of the town reader for bench work.                       */
/* ------------------------------------------------------------------ */
function ReaderBody({ rig, C, eyeMat, onSelect }: BodyProps) {
  const arm = (side: 1 | -1) => (
    <group
      key={side}
      position={[side * 0.24, 0.78, 0.1]}
      ref={side < 0 ? rig.shL : rig.shR}
    >
      <group rotation={[0, 0, side * dd(-18)]}>
        <mesh position={[0, -0.02, 0]}>
          <Hinge r={0.06} color={C(TPAL.ink)} />
        </mesh>
        <Limb length={0.11} radius={0.07} color={C(TPAL.blueDark)} />
        <group position={[0, -0.12, 0]} ref={side < 0 ? rig.elL : rig.elR}>
          <Hinge r={0.06} color={C(TPAL.ink)} />
          <Limb length={0.1} radius={0.05} color={C(TPAL.blueDark)} />
          <mesh position={[0, -0.13, 0]}>
            <sphereGeometry args={[0.085, 10, 8]} />
            {matte(C(TPAL.cream))}
          </mesh>
        </group>
      </group>
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.5} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.13, 0.32, 0]} ref={s < 0 ? rig.legL : rig.legR}>
          <Limb length={0.12} radius={0.065} color={C(TPAL.blueDark)} />
          <group position={[0, -0.12, 0]}>
            <Hinge r={0.055} color={C(TPAL.ink)} />
            <Limb length={0.1} radius={0.055} color={C(TPAL.blueDark)} />
            <mesh position={[0, -0.13, 0.03]}>
              <sphereGeometry args={[0.085, 10, 8]} />
              {matte(C(TPAL.ink))}
            </mesh>
          </group>
        </group>
      ))}
      <mesh position={[0, 0.66, 0]} onClick={onSelect}>
        <sphereGeometry args={[0.27, 20, 16]} />
        {matte(C(TPAL.blue))}
      </mesh>
      <mesh position={[0, 0.66, 0.24]}>
        <boxGeometry args={[0.18, 0.14, 0.05]} />
        {matte(C(TPAL.blueDark))}
      </mesh>
      <mesh position={[0, 0.66, 0.27]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 10]} />
        {matte(C(TPAL.warm))}
      </mesh>
      <MandateLamp position={[0, 0.48, 0.21]} eyeMat={eyeMat} />
      {arm(-1)}
      {arm(1)}
      <group position={[0, 1.0, 0.02]} ref={rig.head}>
        <mesh position={[0, -0.12, 0]}>
          <Hinge r={0.08} color={C(TPAL.ink)} />
        </mesh>
        <mesh onClick={onSelect}>
          <sphereGeometry args={[0.19, 20, 16]} />
          {matte(C(TPAL.cream))}
        </mesh>
        <mesh position={[0, 0.03, 0.1]}>
          <boxGeometry args={[0.34, 0.13, 0.13]} />
          {matte(C(TPAL.blueDark))}
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[s * 0.075, 0.03, 0.155]}>
              <sphereGeometry args={[0.045, 12, 10]} />
              <meshBasicMaterial color="#faf6ec" />
            </mesh>
            <mesh position={[s * 0.075, 0.03, 0.19]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <meshBasicMaterial color={C(TPAL.ink)} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Family 3 — Sweeper: squat capsule, sash, can head with brim.         */
/* ------------------------------------------------------------------ */
function SweeperBody({ rig, C, eyeMat, onSelect }: BodyProps) {
  const arm = (side: 1 | -1) => (
    <group
      key={side}
      position={[side * 0.26, 0.22, 0.08]}
      ref={side < 0 ? rig.shL : rig.shR}
    >
      <group rotation={[0, 0, side * dd(-12)]}>
        <mesh position={[0, -0.02, 0]}>
          <Hinge r={0.07} color={C(TPAL.ink)} />
        </mesh>
        <Limb length={0.13} radius={0.065} color={C(TPAL.cream)} />
        <group position={[0, -0.13, 0]} ref={side < 0 ? rig.elL : rig.elR}>
          <Hinge r={0.07} color={C(TPAL.ink)} />
          <Limb length={0.12} radius={0.055} color={C(TPAL.cream)} />
          <mesh position={[0, -0.14, 0]}>
            <sphereGeometry args={[0.09, 12, 10]} />
            {matte(C(TPAL.woodDark))}
          </mesh>
        </group>
      </group>
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.5} />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.13, 0.3, 0]} ref={s < 0 ? rig.legL : rig.legR}>
          <Limb length={0.15} radius={0.085} color={C(TPAL.terracottaDark)} />
          <group position={[0, -0.15, 0]}>
            <Hinge r={0.08} color={C(TPAL.ink)} />
            <Limb length={0.13} radius={0.07} color={C(TPAL.terracottaDark)} />
            <group position={[0, -0.13, 0.04]}>
              <Foot w={0.28} h={0.13} l={0.4} color={C(TPAL.ink)} />
            </group>
          </group>
        </group>
      ))}
      <group position={[0, 0.78, 0]}>
        <mesh onClick={onSelect}>
          <capsuleGeometry args={[0.25, 0.3, 8, 14]} />
          {matte(C(TPAL.cream))}
        </mesh>
        {[-1, 1].map((q) => (
          <mesh key={q} position={[q * 0.27, 0.22, 0.02]}>
            <sphereGeometry args={[0.1, 12, 10]} />
            {matte(C(TPAL.terracottaDark))}
          </mesh>
        ))}
        <mesh position={[0, 0.02, 0]} rotation={[0, 0, dd(12)]}>
          <boxGeometry args={[0.46, 0.09, 0.46]} />
          {matte(C(TPAL.blue))}
        </mesh>
        <mesh position={[0, 0.12, -0.22]}>
          <boxGeometry args={[0.2, 0.16, 0.04]} />
          {matte(C(TPAL.creamDark))}
        </mesh>
        <MandateLamp position={[0, 0.02, 0.24]} eyeMat={eyeMat} />
        {arm(-1)}
        {arm(1)}
        <group position={[0, 0.44, 0]} ref={rig.head}>
          <mesh>
            <cylinderGeometry args={[0.17, 0.18, 0.24, 18]} />
            {matte(C(TPAL.terracotta))}
          </mesh>
          <mesh position={[0, -0.13, 0]}>
            <Hinge r={0.1} color={C(TPAL.ink)} />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.185, 0.185, 0.05, 18]} />
            {matte(C(TPAL.blueDark))}
          </mesh>
          <mesh position={[0, 0.15, 0.12]} onClick={onSelect}>
            <boxGeometry args={[0.22, 0.03, 0.14]} />
            {matte(C(TPAL.blueDark))}
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.07, 0.0, 0.155]}>
              <sphereGeometry args={[0.032, 10, 8]} />
              <meshBasicMaterial color={C(TPAL.ink)} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Family 4 — Waiter: sage box torso, dome head on hinge neck.          */
/* ------------------------------------------------------------------ */
function WaiterBody({ rig, C, eyeMat, onSelect }: BodyProps) {
  const arm = (side: 1 | -1) => (
    <group
      key={side}
      position={[side * 0.27, 1.02, 0.06]}
      ref={side < 0 ? rig.shL : rig.shR}
    >
      <group rotation={[0, 0, side * dd(8)]}>
        <mesh position={[0, -0.02, 0]}>
          <Hinge r={0.065} color={C(TPAL.ink)} />
        </mesh>
        <Limb length={0.14} radius={0.06} color={C(TPAL.sageDark)} />
        <group position={[0, -0.14, 0]} ref={side < 0 ? rig.elL : rig.elR}>
          <Hinge r={0.06} color={C(TPAL.ink)} />
          <Limb length={0.12} radius={0.05} color={C(TPAL.sageDark)} />
          <mesh position={[0, -0.15, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            {matte(C(TPAL.cream))}
          </mesh>
        </group>
      </group>
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.42} />
      <ChunkLeg x={-0.14} color={TPAL.blueDark} C={C} rig={rig} side={-1} />
      <ChunkLeg x={0.14} color={TPAL.blueDark} C={C} rig={rig} side={1} />
      <group position={[0, 0.72, 0]}>
        <mesh onClick={onSelect}>
          <boxGeometry args={[0.44, 0.5, 0.34]} />
          {matte(C(TPAL.sage))}
        </mesh>
        <mesh position={[0, 0.1, 0.18]}>
          <boxGeometry args={[0.2, 0.12, 0.04]} />
          {matte(C(TPAL.sageDark))}
        </mesh>
        <MandateLamp position={[0, -0.08, 0.19]} eyeMat={eyeMat} />
      </group>
      {arm(-1)}
      {arm(1)}
      <group position={[0, 1.14, 0]} ref={rig.head}>
        <mesh position={[0, -0.1, 0]}>
          <Hinge r={0.09} color={C(TPAL.ink)} />
        </mesh>
        <mesh onClick={onSelect}>
          <sphereGeometry args={[0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          {matte(C(TPAL.cream))}
        </mesh>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 0.05, 16]} />
          {matte(C(TPAL.blueDark))}
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.07, 0.06, 0.15]}>
            <sphereGeometry args={[0.032, 10, 8]} />
            <meshBasicMaterial color={C(TPAL.ink)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Family 5 — Passerby: tapered blue torso, bucket head with brim.      */
/* ------------------------------------------------------------------ */
function PasserbyBody({ rig, C, eyeMat, onSelect }: BodyProps) {
  const arm = (side: 1 | -1) => (
    <group
      key={side}
      position={[side * 0.26, 1.02, 0.06]}
      ref={side < 0 ? rig.shL : rig.shR}
    >
      <group rotation={[0, 0, side * dd(8)]}>
        <mesh position={[0, -0.02, 0]}>
          <Hinge r={0.065} color={C(TPAL.ink)} />
        </mesh>
        <Limb length={0.24} radius={0.06} color={C(TPAL.blueDark)} />
        <group position={[0, -0.24, 0]} ref={side < 0 ? rig.elL : rig.elR}>
          <Hinge r={0.06} color={C(TPAL.ink)} />
          <Limb length={0.2} radius={0.05} color={C(TPAL.blueDark)} />
          <mesh position={[0, -0.23, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            {matte(C(TPAL.cream))}
          </mesh>
        </group>
      </group>
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.42} />
      <ChunkLeg x={-0.13} color={TPAL.terracottaDark} C={C} rig={rig} side={-1} />
      <ChunkLeg x={0.13} color={TPAL.terracottaDark} C={C} rig={rig} side={1} />
      <group position={[0, 0.7, 0]}>
        <mesh onClick={onSelect}>
          <cylinderGeometry args={[0.2, 0.26, 0.52, 12]} />
          {matte(C(TPAL.blue))}
        </mesh>
        <MandateLamp position={[0, 0, 0.24]} eyeMat={eyeMat} />
      </group>
      {arm(-1)}
      {arm(1)}
      <group position={[0, 1.1, 0]} ref={rig.head}>
        <mesh position={[0, -0.09, 0]}>
          <Hinge r={0.085} color={C(TPAL.ink)} />
        </mesh>
        <mesh onClick={onSelect}>
          <cylinderGeometry args={[0.16, 0.17, 0.22, 14]} />
          {matte(C(TPAL.terracotta))}
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.04, 14]} />
          {matte(C(TPAL.terracottaDark))}
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.065, 0.02, 0.145]}>
            <sphereGeometry args={[0.03, 10, 8]} />
            <meshBasicMaterial color={C(TPAL.ink)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Family 6 — Helper: round soft torso, small sage dome head.          */
/* ------------------------------------------------------------------ */
function HelperBody({ rig, C, eyeMat, onSelect }: BodyProps) {
  const arm = (side: 1 | -1) => (
    <group
      key={side}
      position={[side * 0.26, 0.88, 0.06]}
      ref={side < 0 ? rig.shL : rig.shR}
    >
      <group rotation={[0, 0, side * dd(16)]}>
        <mesh position={[0, -0.02, 0]}>
          <Hinge r={0.065} color={C(TPAL.ink)} />
        </mesh>
        <Limb length={0.2} radius={0.06} color={C(TPAL.creamDark)} />
        <group position={[0, -0.2, 0]} ref={side < 0 ? rig.elL : rig.elR}>
          <Hinge r={0.06} color={C(TPAL.ink)} />
          <Limb length={0.16} radius={0.05} color={C(TPAL.creamDark)} />
          <mesh position={[0, -0.19, 0]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            {matte(C(TPAL.cream))}
          </mesh>
        </group>
      </group>
    </group>
  );
  return (
    <group>
      <BlobShadow r={0.42} />
      <ChunkLeg x={-0.13} color={TPAL.sageDark} C={C} rig={rig} side={-1} />
      <ChunkLeg x={0.13} color={TPAL.sageDark} C={C} rig={rig} side={1} />
      <group position={[0, 0.7, 0]}>
        <mesh onClick={onSelect}>
          <sphereGeometry args={[0.24, 16, 12]} />
          {matte(C(TPAL.cream))}
        </mesh>
        <mesh position={[0, 0.0, 0.21]}>
          <boxGeometry args={[0.16, 0.12, 0.04]} />
          {matte(C(TPAL.creamDark))}
        </mesh>
        <MandateLamp position={[0, -0.16, 0.2]} eyeMat={eyeMat} />
      </group>
      {arm(-1)}
      {arm(1)}
      <group position={[0, 1.06, 0]} ref={rig.head}>
        <mesh position={[0, -0.08, 0]}>
          <Hinge r={0.08} color={C(TPAL.ink)} />
        </mesh>
        <mesh onClick={onSelect}>
          <sphereGeometry args={[0.16, 16, 12]} />
          {matte(C(TPAL.sage))}
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.06, 0.02, 0.135]}>
            <sphereGeometry args={[0.028, 10, 8]} />
            <meshBasicMaterial color={C(TPAL.ink)} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Motion driver — identical choreography for every family.             */
/* ------------------------------------------------------------------ */

const FAMILIES = [
  CarrierBody,
  TinkererBody,
  ReaderBody,
  SweeperBody,
  WaiterBody,
  PasserbyBody,
  HelperBody,
];

function Figure({
  worker,
  index,
  proposals,
  receipts,
  speeches,
  selected,
  onSelect,
}: {
  worker: VizWorker;
  index: number;
  proposals: VizProposal[];
  receipts: VizReceipt[];
  speeches: VizSpeech[];
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const shL = useRef<THREE.Group>(null);
  const shR = useRef<THREE.Group>(null);
  const elL = useRef<THREE.Group>(null);
  const elR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyeMat = useRef<THREE.MeshBasicMaterial>(null);

  const rig: Rig = useMemo(
    () => ({ legL, legR, shL, shR, elL, elR, head }),
    []
  );
  const family = useMemo(
    () => hashStr(worker.workerId) % FAMILIES.length,
    [worker.workerId]
  );
  const C = useMemo(
    () => (c: string) =>
      worker.active ? c : new THREE.Color(c).lerp(CLAIM_DIM, 0.55).getStyle(),
    [worker.active]
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const nowMs = performance.now();
    const m = getMotion(worker, index, proposals, receipts, nowMs);
    const pos = stagePos(worker, index, proposals, receipts, nowMs);
    const g = root.current;
    if (!g) return;
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.y = m.facingY;
    g.scale.setScalar(selected ? 1.12 : 1);

    // walk + idle bob
    const bob =
      m.walkAmt > 0
        ? Math.abs(Math.sin(t * 7 + index)) * 0.05 * m.walkAmt
        : Math.sin(t * 1.6 + index * 2.1) * 0.03;
    g.position.y = pos[1] + bob;

    // legs: swing only while walking
    const swing = Math.sin(t * 7 + index) * 0.55 * m.walkAmt;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;

    // arms: pose targets, with a counter-swing while walking free-handed
    const a = ARM_ANGLES[m.armPose];
    const armSwing = m.walkAmt > 0 && m.armPose === "hang" ? Math.sin(t * 7 + index) * 0.18 : 0;
    if (shL.current) shL.current.rotation.x = a.sh + armSwing;
    if (shR.current) shR.current.rotation.x = a.sh - armSwing;
    if (elL.current) elL.current.rotation.x = a.el;
    if (elR.current) elR.current.rotation.x = a.el;

    // head: tilt from the pose; lift when the worker recently spoke
    const speaking = hasRecentSpeech(worker.workerId, speeches);
    if (head.current) head.current.rotation.x = speaking ? -0.18 : m.headTilt;

    // mandate lamp: warm while the mandate lives, dark when revoked
    if (eyeMat.current) eyeMat.current.color.set(m.eyeOn ? "#ffe9b8" : "#3c4148");
  });

  const select = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(worker.workerId);
  };

  const Family = FAMILIES[family];
  return (
    <group ref={root}>
      <Family rig={rig} C={C} eyeMat={eyeMat} onSelect={select} />
    </group>
  );
}

export function WorkerFigures({
  workers,
  proposals,
  receipts,
  speeches,
  selectedId,
  onSelect,
}: {
  workers: VizWorker[];
  proposals: VizProposal[];
  receipts: VizReceipt[];
  speeches: VizSpeech[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  useFrame(() => {
    trackWorkers(workers, performance.now());
  });
  return (
    <group>
      {workers.map((w, i) => (
        <Figure
          key={w.workerId}
          worker={w}
          index={i}
          proposals={proposals}
          receipts={receipts}
          speeches={speeches}
          selected={selectedId === w.workerId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}
