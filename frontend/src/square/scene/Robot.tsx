/**
 * OpenLine World — square robot.
 * frontend/src/square/scene/Robot.tsx
 *
 * A small characterful robot: capsule body, round head, eyes, antenna,
 * stubby legs. Pure decoration — it knows nothing about protocol.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { poseAt, type Wanderer } from "../worldState";

interface Props {
  wanderer: Wanderer;
}

export function Robot({ wanderer: w }: Props) {
  const g = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = poseAt(w, t);
    if (g.current) {
      g.current.position.set(p.x, p.bob, p.z);
      g.current.rotation.y = p.yaw;
    }
    const moving = w.path !== null;
    const swing = moving ? Math.sin(p.stride * Math.PI * 2) * 0.5 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (head.current) {
      // idle robots glance around; walkers look where they're going
      head.current.rotation.y = moving ? 0 : Math.sin(t * 0.5 + w.phase) * 0.45;
    }
  });

  const s = w.scale;
  return (
    <group ref={g} scale={s}>
      {/* legs */}
      <mesh ref={legL} position={[-0.14, 0.16, 0]}>
        <capsuleGeometry args={[0.09, 0.22, 4, 12]} />
        <meshStandardMaterial color="#6b5d4f" roughness={0.9} />
      </mesh>
      <mesh ref={legR} position={[0.14, 0.16, 0]}>
        <capsuleGeometry args={[0.09, 0.22, 4, 12]} />
        <meshStandardMaterial color="#6b5d4f" roughness={0.9} />
      </mesh>
      {/* body */}
      <mesh position={[0, 0.62, 0]}>
        <capsuleGeometry args={[0.3, 0.42, 6, 16]} />
        <meshStandardMaterial color={w.color} roughness={0.65} />
      </mesh>
      {/* belly light */}
      <mesh position={[0, 0.55, 0.29]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color="#fff8e0" emissive="#ffdf9e" emissiveIntensity={0.9} />
      </mesh>
      {/* head */}
      <group ref={head} position={[0, 1.18, 0]}>
        <mesh>
          <sphereGeometry args={[0.24, 20, 16]} />
          <meshStandardMaterial color={w.color} roughness={0.6} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.09, 0.04, 0.2]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
        <mesh position={[0.09, 0.04, 0.2]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
        <mesh position={[-0.09, 0.04, 0.245]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#2b2b33" roughness={0.3} />
        </mesh>
        <mesh position={[0.09, 0.04, 0.245]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#2b2b33" roughness={0.3} />
        </mesh>
        {/* antenna */}
        <mesh position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.18, 8]} />
          <meshStandardMaterial color="#6b5d4f" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={1.2} />
        </mesh>
      </group>
      {/* task props: crate for carriers, broom for the sweeper */}
      {w.task === "carry" && (
        <group position={[0, 0.72, 0.42]}>
          <mesh>
            <boxGeometry args={[0.42, 0.34, 0.34]} />
            <meshStandardMaterial color="#c89b6a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.001, 0.001]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.44, 0.05, 0.36]} />
            <meshStandardMaterial color="#8a6a45" roughness={0.9} />
          </mesh>
        </group>
      )}
      {w.task === "sweep" && (
        <group position={[0.3, 0, 0.35]} rotation={[0, 0, -0.35]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.9, 8]} />
            <meshStandardMaterial color="#8a6a45" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.3, 0.08, 0.06]} />
            <meshStandardMaterial color="#d8b24a" roughness={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}
