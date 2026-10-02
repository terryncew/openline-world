/**
 * OpenLine World visualization — receipt tablets.
 * frontend/src/viz/scene/ReceiptTablets.tsx
 *
 * One stone tablet per receipt EVENT, laid into a persistent records arc
 * behind the gate. Tablets never move, never fade, and survive revocation
 * and worker replacement: the record outlives the worker.
 *
 * Color is the authority family (receiver-signed): deep green for ALLOWED,
 * muted red for STOPPED. Click a tablet to inspect the full signed record.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { VizReceipt } from "../protocol";
import { receiptSlot } from "./layout";

const ALLOW_TABLET = new THREE.Color("#4d7d5f");
const STOP_TABLET = new THREE.Color("#a0503c");

const dummy = new THREE.Object3D();

export function ReceiptTablets({
  receipts,
  selectedId,
  onSelect,
}: {
  receipts: VizReceipt[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = receipts.length;

  const slots = useMemo(() => receipts.map((_, i) => receiptSlot(i)), [receipts]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      const r = receipts[i];
      dummy.position.set(...slots[i]);
      dummy.rotation.set(0, -0.5, 0);
      dummy.scale.setScalar(selectedId === r.id ? 1.3 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, r.decision === "ALLOWED" ? ALLOW_TABLET : STOP_TABLET);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [n, receipts, slots, selectedId]);

  if (n === 0) return null;
  return (
    <group>
      {/* plinth under the records arc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[10.6, 0.02, 0]}>
        <planeGeometry args={[7.5, 11.5]} />
        <meshStandardMaterial color="#dccfae" roughness={1} />
      </mesh>
      <instancedMesh frustumCulled={false}
        ref={ref}
        args={[undefined, undefined, Math.max(n, 1)]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(receipts[e.instanceId ?? 0]?.id ?? null);
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <boxGeometry args={[0.55, 0.8, 0.14]} />
        <meshStandardMaterial roughness={0.8} metalness={0.05} />
      </instancedMesh>
      {/* seal dot on each tablet: the receiver's mark */}
      {n <= 200 &&
        receipts.map((r, i) => (
          <mesh key={r.id} position={[slots[i][0], slots[i][1] + 0.18, slots[i][2] + 0.09]}>
            <circleGeometry args={[0.09, 16]} />
            <meshBasicMaterial color={r.decision === "ALLOWED" ? "#2f6b45" : "#7d2f22"} />
          </mesh>
        ))}
    </group>
  );
}
