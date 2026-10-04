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
import type { VizJob, VizReceipt, VizProposal, VizCheckpoint } from "../protocol";
import { CRATE_POS, SIDE_TABLE_POS } from "./layout";
import { CLAIM_COLOR } from "./ProposalPackets";

const CRATE_COLOR = new THREE.Color("#a67c52");
const TICKET_COLOR = new THREE.Color("#f5eeda");
const SEAL_ALLOW = new THREE.Color("#2f6b45");
const SEAL_STOP = new THREE.Color("#7d2f22");
const TABLE_COLOR = new THREE.Color("#8d7a5f");
/** Checkpoint pieces: physical work product, warm brass — visibly not
 *  receipt seals (flat discs on the ticket). Each applied checkpoint adds
 *  one piece to the crate. */
const CHECKPOINT_COLOR = new THREE.Color("#b08d3e");

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

/** A checkpoint piece with scale-in; reports when its appear-animation
 *  settles (CP3 §4: scene-owned settle acknowledgment). */
function CheckpointPiece({
  position,
  onSettled,
}: {
  position: [number, number, number];
  onSettled: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const t0 = useRef<number | null>(null);
  const done = useRef(false);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    if (t0.current === null) t0.current = performance.now() / 1000;
    const k = Math.min(1, (performance.now() / 1000 - t0.current) / 0.4);
    const s = 1 - Math.pow(1 - k, 3);
    g.scale.setScalar(Math.max(0.001, s));
    if (k >= 1 && !done.current) {
      done.current = true;
      onSettled();
    }
  });
  return (
    <group ref={ref} position={position} scale={0.001}>
      <mesh>
        <boxGeometry args={[0.32, 0.22, 0.32]} />
        <meshStandardMaterial color={CHECKPOINT_COLOR} roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.1, 12]} />
        <meshStandardMaterial color={CHECKPOINT_COLOR} roughness={0.4} metalness={0.55} />
      </mesh>
    </group>
  );
}

export function JobCrate({
  job,
  receipts,
  checkpoints,
  onSettled,
}: {
  job: VizJob | null;
  receipts: VizReceipt[];
  /** Visible checkpoints, already filtered to the revealed seq. */
  checkpoints: VizCheckpoint[];
  /** Scene-owned (CP3 §4): called when the persistent job/ticket, all
   *  receipt marks (with the final stamp animation settled), and all
   *  checkpoint visuals are rendered and settled. */
  onSettled?: () => void;
}) {
  const sealRefs = useRef<(THREE.Mesh | null)[]>([]);
  // scale-in choreography per seal: first-appearance wall-clock
  const stampedAt = useRef(new Map<string, number>());
  const nowS = () => performance.now() / 1000;

  const ordered = useMemo(
    () => [...receipts].sort((a, b) => a.seq - b.seq),
    [receipts]
  );

  // CP3 §4: scene-owned settle; re-arms when the visual inputs change.
  // Checkpoint settle is tracked by ID and survives receipt additions —
  // a new seal stamping must not invalidate an already-settled checkpoint.
  const settledRef = useRef(false);
  const checkpointsSettledRef = useRef(new Set<string>());
  const jobId = job?.jobId ?? "";
  const jobIdRef = useRef(jobId);
  if (jobIdRef.current !== jobId) {
    jobIdRef.current = jobId;
    settledRef.current = false;
    checkpointsSettledRef.current = new Set();
  }
  const sealsInputs = `${jobId}:${ordered.length}`;
  const sealsInputsRef = useRef(sealsInputs);
  if (sealsInputsRef.current !== sealsInputs) {
    sealsInputsRef.current = sealsInputs;
    // new receipts → seals must re-stamp; checkpoints stay settled
    settledRef.current = false;
  }
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

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
    let sealsSettled = true;
    for (let i = 0; i < ordered.length; i++) {
      const m = sealRefs.current[i];
      if (!m) {
        sealsSettled = false;
        continue;
      }
      const t0 = stampedAt.current.get(ordered[i].id) ?? t;
      const k = Math.min(1, (t - t0) / 0.45);
      if (k < 1) sealsSettled = false;
      // stamp: quick grow with a slight overshoot, then settle
      const s = k < 1 ? 0.3 + 0.9 * (1 - Math.pow(1 - k, 3)) : 1;
      m.scale.setScalar(Math.max(0.001, s));
    }
    // CP3 §4: settled when the job/ticket exists, all receipt seals have
    // finished stamping, and all checkpoint pieces report settled
    const allCheckpointsSettled = checkpoints.every((c) =>
      checkpointsSettledRef.current.has(`${c.checkpoint}`)
    );
    if (!settledRef.current && sealsSettled && allCheckpointsSettled) {
      settledRef.current = true;
      queueMicrotask(() => onSettledRef.current?.());
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
      {/* checkpoint pieces: physical work product, BESIDE the crate —
          never on the receipt ticket. Each applied checkpoint adds one
          brass piece: Wren's change stays after Wren stops; Juniper's
          adds to the SAME job. Receipt history (what the receiver
          decided) and work checkpoints (what was executed) stay
          simultaneously visible and visually distinct. */}
      {checkpoints.map((c, i) => (
        <CheckpointPiece
          key={`${c.checkpoint}`}
          position={[1.05 + i * 0.55, 0.11, 0.75]}
          onSettled={() => {
            checkpointsSettledRef.current.add(`${c.checkpoint}`);
          }}
        />
      ))}
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
