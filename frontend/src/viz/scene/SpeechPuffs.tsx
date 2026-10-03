/**
 * OpenLine World visualization — speech puffs + unrecognized markers.
 * frontend/src/viz/scene/SpeechPuffs.tsx
 *
 * Agent-reported activity renders as a small pale puff above the worker —
 * visible, but it never travels to the gate and never becomes a receipt.
 * The "wren says done" beat is the point: speech is a claim, and only the
 * receiver mints receipts.
 *
 * Events the reducer could not place render as small gray "?" stones at
 * the world's edge: visibly unreadable, never silently dropped.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { hashStr, type VizProposal, type VizReceipt, type VizSpeech, type VizUnrecognized, type VizWorker } from "../protocol";
import { workerHome } from "./layout";
import { stagePos, useFigures } from "./workerMotion";

const dummy = new THREE.Object3D();

export function SpeechPuffs({
  speeches,
  workers,
  proposals,
  receipts,
}: {
  speeches: VizSpeech[];
  workers: VizWorker[];
  proposals: VizProposal[];
  receipts: VizReceipt[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // show only recent speech (last 4), older ones fade from the scene —
  // the event log keeps the record; the puff is just the moment
  const recent = speeches.slice(-4);
  const n = recent.length;
  const figured = useFigures(workers.length);

  const workerIndex = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.workerId, i));
    return m;
  }, [workers]);

  const speakerOf = useMemo(
    () =>
      recent.map((s) => {
        const wi = workerIndex.get(s.workerId) ?? 0;
        return { wi, workerId: s.workerId };
      }),
    [recent, workerIndex]
  );

  const liveAnchor = (i: number, out: { x: number; z: number }) => {
    const { wi, workerId } = speakerOf[i];
    const w = workers[wi];
    if (w && figured) {
      const p = stagePos(w, wi, proposals, receipts, performance.now());
      out.x = p[0];
      out.z = p[2];
    } else {
      const h = workerHome(wi, workerId);
      out.x = h[0];
      out.z = h[2];
    }
  };
  const anchorTmp = useMemo(() => ({ x: 0, z: 0 }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      liveAnchor(i, anchorTmp);
      dummy.position.set(anchorTmp.x, 2.1, anchorTmp.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, anchorTmp]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || n === 0) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const ph = (hashStr(recent[i].id) % 1000) / 1000 * Math.PI * 2;
      liveAnchor(i, anchorTmp);
      dummy.position.set(
        anchorTmp.x + Math.sin(t * 0.9 + ph) * 0.08,
        2.1 + Math.sin(t * 1.3 + ph) * 0.1,
        anchorTmp.z
      );
      dummy.scale.setScalar(0.9 + Math.sin(t * 2 + ph) * 0.08);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  return (
    <instancedMesh frustumCulled={false} ref={ref} args={[undefined, undefined, Math.max(n, 1)]}>
      {/* a small speech diamond: the claim, kept near its speaker */}
      <octahedronGeometry args={[0.3]} />
      <meshBasicMaterial color="#a9c3d9" transparent opacity={0.75} toneMapped={false} />
    </instancedMesh>
  );
}

export function UnrecognizedMarkers({ items }: { items: VizUnrecognized[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = items.length;
  const dummy2 = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      dummy2.position.set(Math.cos(a) * 14.5, 0.25, Math.sin(a) * 14.5);
      dummy2.scale.setScalar(1);
      dummy2.updateMatrix();
      mesh.setMatrixAt(i, dummy2.matrix);
      mesh.setColorAt(i, new THREE.Color("#9a9a9a"));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [n, dummy2]);

  if (n === 0) return null;
  return (
    <instancedMesh frustumCulled={false} ref={ref} args={[undefined, undefined, Math.max(n, 1)]}>
      <dodecahedronGeometry args={[0.28]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
}
