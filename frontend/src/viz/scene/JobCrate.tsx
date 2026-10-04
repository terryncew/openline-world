/**
 * OpenLine World visualization — the persistent job (WORLD-AUTHORITY-001).
 * frontend/src/viz/scene/JobCrate.tsx
 *
 * One physical crate + one attached ticket for the whole story. The crate
 * is the job; the ticket carries its history as small stamped seals in
 * chronological order — one per receipt event. The seals belong to the
 * job, not to whichever worker is currently attached to it: they survive
 * revocation and replacement because they were never the worker's.
 *
 * Also renders the side table: a secondary surface where an unadmitted
 * proposal rests — visible, never stamped, never in the work path.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VizJob, VizReceipt, VizProposal } from "../protocol";
import { CRATE_POS, SIDE_TABLE_POS } from "./layout";
import { CLAIM_COLOR } from "./ProposalPackets";

const CRATE_COLOR = new THREE.Color("#a67c52");
const TICKET_COLOR = new THREE.Color("#f5eeda");
const SEAL_ALLOW = new THREE.Color("#2f6b45");
const SEAL_STOP = new THREE.Color("#7d2f22");
const TABLE_COLOR = new THREE.Color("#8d7a5f");

/** Seal slot on the ticket face, chronological left→right, top→bottom.
 *  The ticket lies on top of the crate (the camera looks down); seals
 *  stamp onto its upper face. Ticket top surface is at crate-local y=1.26.
 */
function sealSlot(i: number): [number, number, number] {
  const perRow = 4;
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  return [-0.33 + col * 0.22, 1.29, -0.30 + row * 0.24];
}

export function JobCrate({
  job,
  receipts,
}: {
  job: VizJob | null;
  receipts: VizReceipt[];
}) {
  const sealRefs = useRef<(THREE.Mesh | null)[]>([]);
  // scale-in choreography per seal: first-appearance wall-clock
  const stampedAt = useRef(new Map<string, number>());
  const nowS = () => performance.now() / 1000;

  const ordered = useMemo(
    () => [...receipts].sort((a, b) => a.seq - b.seq),
    [receipts]
  );

  useLayoutEffect(() => {
    const t = nowS();
    for (const r of ordered) {
      if (!stampedAt.current.has(r.id)) stampedAt.current.set(r.id, t);
    }
    for (const id of [...stampedAt.current.keys()]) {
      if (!ordered.some((r) => r.id === id)) stampedAt.current.delete(id);
    }
  }, [ordered]);

  useFrame(() => {
    const t = nowS();
    for (let i = 0; i < ordered.length; i++) {
      const m = sealRefs.current[i];
      if (!m) continue;
      const t0 = stampedAt.current.get(ordered[i].id) ?? t;
      const k = Math.min(1, (t - t0) / 0.45);
      // stamp: quick grow with a slight overshoot, then settle
      const s = k < 1 ? 0.3 + 0.9 * (1 - Math.pow(1 - k, 3)) : 1;
      m.scale.setScalar(Math.max(0.001, s));
    }
  });

  if (!job) return null;
  return (
    <group position={CRATE_POS}>
      {/* the crate: the job itself */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.6, 1.2, 1.6]} />
        <meshStandardMaterial color={CRATE_COLOR} roughness={0.9} />
      </mesh>
      {/* crate slats */}
      <mesh position={[0, 0.95, 0.81]}>
        <boxGeometry args={[1.7, 0.12, 0.04]} />
        <meshStandardMaterial color="#8a653d" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.25, 0.81]}>
        <boxGeometry args={[1.7, 0.12, 0.04]} />
        <meshStandardMaterial color="#8a653d" roughness={0.9} />
      </mesh>
      {/* the ticket: lies on top of the crate, carries the history.
          The camera looks down, so the top face is the legible one. */}
      <mesh position={[0, 1.23, 0]}>
        <boxGeometry args={[1.1, 0.06, 1.1]} />
        <meshStandardMaterial color={TICKET_COLOR} roughness={0.85} />
      </mesh>
      {/* receipt seals, stamped in chronological order */}
      {ordered.map((r, i) => {
        const [sx, sy, sz] = sealSlot(i);
        return (
          <mesh
            key={r.id}
            ref={(m) => {
              sealRefs.current[i] = m;
            }}
            position={[sx, sy, sz]}
          >
            <cylinderGeometry args={[0.09, 0.09, 0.05, 16]} />
            <meshStandardMaterial
              color={r.decision === "ALLOWED" ? SEAL_ALLOW : SEAL_STOP}
              roughness={0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function SideTable({
  proposals,
}: {
  proposals: VizProposal[];
}) {
  const resting = proposals.filter((p) => p.unadmitted);
  if (resting.length === 0) return null;
  return (
    <group position={SIDE_TABLE_POS}>
      {/* table */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 0.1, 20]} />
        <meshStandardMaterial color={TABLE_COLOR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.55, 10]} />
        <meshStandardMaterial color="#6f6046" roughness={0.9} />
      </mesh>
      {/* the unadmitted packets: at rest, never in the work path */}
      {resting.map((p, i) => (
        <mesh key={p.id} position={[(i % 2) * 0.45 - 0.22, 0.72, Math.floor(i / 2) * 0.4 - 0.2]} rotation={[0.4, 0.7, 0.2]}>
          <octahedronGeometry args={[0.28]} />
          <meshBasicMaterial color={CLAIM_COLOR} toneMapped={false} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  );
}
