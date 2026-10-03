/** Physical shell shared in proportion and palette with the Square workshop. */
import { WORKSHOP_SPATIAL_CONTRACT as W } from "../../spatial/workshopContract";

const mat = (color: string) => <meshStandardMaterial color={color} roughness={0.92} metalness={0} />;

function EntrancePortal() {
  const jambX = W.door.width / 2 + 0.2;
  return (
    <group
      name={W.id}
      position={[W.door.centerX, W.floorElevation, W.door.facadeZ]}
      rotation={[0, Math.atan2(W.entranceAxis[0], -W.entranceAxis[2]), 0]}
    >
      {/* The recognizable exterior portal, seen from its interior side. */}
      {[-jambX, jambX].map((x) => (
        <mesh key={x} position={[x, W.door.height / 2, 0]}>
          <boxGeometry args={[0.4, W.door.height, 0.42]} />
          {mat(W.palette.stone)}
        </mesh>
      ))}
      <mesh position={[0, W.door.height + 0.2, 0]}>
        <boxGeometry args={[W.door.width + 0.8, 0.4, 0.42]} />
        {mat(W.palette.stone)}
      </mesh>
      {/* Open double doors fold against the jambs: the threshold stays visible. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (W.door.width / 2 + 0.05), W.door.height / 2, -0.05]} rotation={[0, side * -1.28, 0]}>
          <mesh position={[side * -W.door.width / 4, 0, 0]}>
            <boxGeometry args={[W.door.width / 2, W.door.height, 0.1]} />
            {mat(W.palette.woodDark)}
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, -W.thresholdDepth / 2]}>
        <boxGeometry args={[W.door.width + 0.8, W.thresholdDepth, 0.04]} />
        {mat(W.palette.stoneDark)}
      </mesh>
      {[-1.35, 1.35].map((x) => (
        <group key={x} position={[x, 1.75, -0.15]}>
          <mesh><boxGeometry args={[0.24, 0.3, 0.24]} />{mat(W.palette.ink)}</mesh>
          <mesh><sphereGeometry args={[0.09, 10, 8]} />
            <meshStandardMaterial color={W.palette.warm} emissive={W.palette.warm} emissiveIntensity={0.75} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function WorkshopInterior() {
  return (
    <group>
      <EntrancePortal />
      {/* Continuous matte floor: workroom west/center, gate room east. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1, W.floorElevation - 0.025, 0]}>
        <planeGeometry args={[22, 12]} />
        {mat(W.palette.cream)}
      </mesh>
      {/* Terracotta entrance wall returns establish the facade thickness. */}
      {[-1, 1].map((side) => {
        const wallWidth = 7.2;
        return (
        <mesh key={side} position={[side * (W.exterior.width / 2 + wallWidth / 2), 1.4, W.door.facadeZ + 0.15]}>
          <boxGeometry args={[wallWidth, 2.8, 0.34]} />
          {mat(W.palette.terracotta)}
        </mesh>
        );
      })}
      {/* Side walls and overhead beams imply the long building beyond frame. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 8.8, 1.25, 0]}>
          <boxGeometry args={[0.28, 2.5, 10.4]} />
          {mat(side < 0 ? W.palette.sage : W.palette.blue)}
        </mesh>
      ))}
      {[-3.8, 0.2, 4.2].map((z) => (
        <mesh key={z} position={[0, 3.25, z]}>
          <boxGeometry args={[18, 0.18, 0.24]} />
          {mat(W.palette.woodDark)}
        </mesh>
      ))}
      {/* Physical zoning, not tabs: work benches lead toward the receiver gate. */}
      <group position={[-3.6, 0, 0.5]}>
        <mesh position={[0, 0.48, 0]}><boxGeometry args={[3.8, 0.12, 1.25]} />{mat(W.palette.wood)}</mesh>
        {[-1.65, 1.65].flatMap((x) => [-0.46, 0.46].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.23, z]}><boxGeometry args={[0.12, 0.46, 0.12]} />{mat(W.palette.woodDark)}</mesh>
        )))}
        <mesh position={[0, 0.58, 0]}><boxGeometry args={[1.2, 0.12, 0.7]} />{mat(W.palette.sage)}</mesh>
      </group>
      <mesh position={[3.8, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.4, 2.5, 40, 1, -Math.PI / 2, Math.PI]} />
        <meshBasicMaterial color={W.palette.terracottaDark} />
      </mesh>
    </group>
  );
}
