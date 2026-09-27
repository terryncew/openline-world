import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HelperInfo, ReviewInfo } from "../api";

const CREAM = "#f3ecdc";
const BLUE = "#24405e";

const WOOD_DARK = "#7d5f36";
const BRASS = "#c9a227";
const RED = "#b03a2e";

const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function TLabel({ children, position }: { children: React.ReactNode; position: [number, number, number] }) {
  return (
    <Html position={position} center className="room-label" occlude="raycast">
      <div>{children}</div>
    </Html>
  );
}

/* ---------------- owner's rules board ----------------
   Persistent authority, visually owned by the owner: it never moves.
   Helper cards appear, flip to revoked, and get replaced on it —
   the board stays where it was. */

export function MandateBoard({ helpers }: { helpers: HelperInfo[] }) {
  const n = Math.max(helpers.length, 1);
  const boardH = Math.max(2.4, n * 1.05 + 0.7);
  return (
    <group position={[4.9, 0, 3.2]} rotation={[0, -0.5, 0]}>
      {[-1.15, 1.15].map((x) => (
        <mesh key={x} position={[x, boardH / 2, 0]}>
          <boxGeometry args={[0.18, boardH, 0.18]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, boardH / 2 + 0.1, 0]}>
        <boxGeometry args={[2.7, boardH, 0.14]} />
        <meshStandardMaterial color={BLUE} roughness={0.7} />
      </mesh>
      {helpers.map((h, i) => (
        <Html
          key={h.helper_id}
          position={[0, boardH - 0.55 - i * 1.05, 0.12]}
          center
          className="room-label"
          occlude="raycast"
        >
          <div className={`mandate-card ${h.active ? "active" : "revoked"}`}>
            <strong>{h.helper_id}</strong>
            <span className="scopes">{h.scopes.join(" · ") || "no scopes"}</span>
            <span className="status">{h.active ? "authorized" : "revoked"}</span>
          </div>
        </Html>
      ))}
      <TLabel position={[0, boardH + 0.75, 0]}>The owner's rules</TLabel>
    </group>
  );
}

/* ---------------- configuration target ----------------
   A physical object for config.write to aim at — and never reach. */

export function ConfigBox() {
  return (
    <group position={[-5.5, 0, -3.9]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[1.6, 0.16, 1.3]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[1.3, 1.4, 1.0]} />
        <meshStandardMaterial color="#3a4354" roughness={0.6} metalness={0.25} />
      </mesh>
      {[-0.3, 0, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.85, 0.52]}>
          <boxGeometry args={[0.12, 0.5, 0.04]} />
          <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      <TLabel position={[0, 1.95, 0]}>Configuration</TLabel>
    </group>
  );
}

/* ---------------- owner figure ----------------
   A plain marker for the owner, standing by the rules board.
   Static in tour mode; the walk-mode "you" avatar is separate. */

export function OwnerFigure() {
  return (
    <group position={[6.3, 0, 4.9]} rotation={[0, -0.9, 0]}>
      <mesh position={[0, 0.5, 0]}>
        <capsuleGeometry args={[0.3, 0.5, 8, 16]} />
        <meshStandardMaterial color={BRASS} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <sphereGeometry args={[0.26, 20, 20]} />
        <meshStandardMaterial color={CREAM} roughness={0.5} />
      </mesh>
      <TLabel position={[0, 1.72, 0]}>
        <span className="owner-tag">owner</span>
      </TLabel>
    </group>
  );
}

/* ---------------- action token ----------------
   Presentation only, driven by the real review state: when the backend
   records a new signed decision, a token carries the action from the
   helper to the gate. ALLOWED passes through to the workbench; STOPPED
   halts at the arch. The token never decides anything. */

const GATE_PT = new THREE.Vector3(0, 1.7, 4.5);
const BENCH_PT = new THREE.Vector3(-5.5, 1.3, 0.5);

const ease = (k: number) => 1 - Math.pow(1 - k, 3);

export function ActionToken({
  review,
  spots,
}: {
  review: ReviewInfo | null;
  spots: Record<string, [number, number, number]>;
}) {
  const [tokenKey, setTokenKey] = useState<string | null>(null);
  const g = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const st = useRef({ t: 0, active: false });
  const key = review ? `${review.receipt_id}|${review.decision}` : "";

  useEffect(() => {
    if (!key || reducedMotion) {
      setTokenKey(null);
      return;
    }
    st.current = { t: 0, active: true };
    setTokenKey(key);
  }, [key]);

  useFrame((_, dt) => {
    const s = st.current;
    const grp = g.current;
    if (!grp) return;
    if (!s.active || !tokenKey || !review) {
      grp.visible = false;
      return;
    }
    grp.visible = true;
    s.t += dt;
    const hs = spots[review.helper] ?? [0, 0, 2.2];
    const p0 = new THREE.Vector3(hs[0], 1.5, hs[2]);
    const pos = new THREE.Vector3();
    let scale = 1;
    let ringOp = 0;
    if (s.t < 1.1) {
      pos.lerpVectors(p0, GATE_PT, ease(Math.min(s.t / 1.1, 1)));
    } else if (review.decision === "ALLOWED") {
      const k = ease(Math.min((s.t - 1.1) / 1.0, 1));
      pos.lerpVectors(GATE_PT, BENCH_PT, k);
      if (s.t > 1.9) scale = 1 - (s.t - 1.9) / 0.5;
      if (s.t > 2.5) {
        s.active = false;
        setTokenKey(null);
      }
    } else {
      pos.copy(GATE_PT);
      pos.x += Math.sin(s.t * 38) * 0.09 * Math.max(0, 1 - (s.t - 1.1) / 1.2);
      ringOp = Math.min(1, (s.t - 1.1) * 3) * Math.max(0, 1 - (s.t - 1.1) / 1.5);
      if (s.t > 2.7) scale = 1 - (s.t - 2.7) / 0.4;
      if (s.t > 3.2) {
        s.active = false;
        setTokenKey(null);
      }
    }
    grp.position.copy(pos);
    grp.scale.setScalar(Math.max(scale, 0.001));
    if (ring.current) {
      (ring.current.material as THREE.MeshBasicMaterial).opacity = ringOp;
      ring.current.visible = ringOp > 0.01;
      ring.current.rotation.z = s.t * 2;
    }
  });

  if (!tokenKey || !review) return null;
  return (
    <group ref={g} visible={false}>
      <mesh>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.35} />
      </mesh>
      <mesh ref={ring} visible={false}>
        <torusGeometry args={[0.55, 0.07, 12, 32]} />
        <meshBasicMaterial color={RED} transparent opacity={0} />
      </mesh>
      <Html position={[0, 0.55, 0]} center className="room-label token">
        <div>{review.action}</div>
      </Html>
    </group>
  );
}
