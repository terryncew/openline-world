/** Permanent miniature Workshop architecture. Pure presentation: no state or writers. */
import { RoundedBox } from "@react-three/drei";

const C = { cream:"#f3ead9", plaster:"#d8c9ad", blue:"#4a6f8a", blueDark:"#38536a", terra:"#c26d4b", wood:"#a9805a", woodDark:"#6f5036", ink:"#3d3428", warm:"#e8a34f", sage:"#8ba888" };
const mat = (color:string) => <meshStandardMaterial color={color} roughness={0.92} metalness={0}/>;

function Window({ x }:{x:number}) {
  return <group position={[x,3.9,-5.82]}>
    <mesh><boxGeometry args={[2.35,2.25,.16]}/>{mat(C.blueDark)}</mesh>
    <mesh position={[0,0,.1]}><boxGeometry args={[1.82,1.72,.08]}/><meshStandardMaterial color="#8eb1bd" roughness={.65} emissive="#6f8fa0" emissiveIntensity={.08}/></mesh>
    <mesh position={[0,0,.17]}><boxGeometry args={[.11,1.78,.08]}/>{mat(C.woodDark)}</mesh>
    <mesh position={[0,0,.17]}><boxGeometry args={[1.88,.11,.08]}/>{mat(C.woodDark)}</mesh>
  </group>;
}

export function WorkshopInterior(){
  return <group>
    {/* timber floor, plaster rear wall and side walls make this a room, not a stage */}
    <mesh position={[0,-.13,0]} receiveShadow><boxGeometry args={[22,.25,16]}/>{mat(C.wood)}</mesh>
    {[-7.2,-4.8,-2.4,0,2.4,4.8,7.2].map(x=><mesh key={x} position={[x,.01,0]}><boxGeometry args={[.055,.03,15.8]}/>{mat(C.woodDark)}</mesh>)}
    <mesh position={[0,3.5,-6]} receiveShadow><boxGeometry args={[22,7,.35]}/>{mat(C.plaster)}</mesh>
    <mesh position={[-10.8,3.2,0]}><boxGeometry args={[.35,6.4,12]}/>{mat(C.terra)}</mesh>
    <mesh position={[10.8,3.2,0]}><boxGeometry args={[.35,6.4,12]}/>{mat(C.blue)}</mesh>
    <Window x={-4.4}/><Window x={3.2}/>
    {/* roof ribs echo the exterior Workshop gable */}
    {[-8,-4,0,4,8].map(x=><group key={x} position={[x,6.55,-1.2]} rotation={[0,0,Math.PI/2]}>
      <mesh rotation={[0,0,.42]} position={[0,2.2,0]}><boxGeometry args={[.18,5,.2]}/>{mat(C.woodDark)}</mesh>
      <mesh rotation={[0,0,-.42]} position={[0,-2.2,0]}><boxGeometry args={[.18,5,.2]}/>{mat(C.woodDark)}</mesh>
    </group>)}
    {/* workbench and tools */}
    <group position={[-1.2,0,3.4]}>
      <RoundedBox args={[4.4,.22,2.7]} radius={.08} position={[0,.72,0]}>{mat(C.woodDark)}</RoundedBox>
      {[-1.8,1.8].map(x=><mesh key={x} position={[x,.34,0]}><boxGeometry args={[.22,.72,2.2]}/>{mat(C.ink)}</mesh>)}
      <mesh position={[0,.87,-1.13]}><boxGeometry args={[3.8,.18,.18]}/>{mat(C.terra)}</mesh>
    </group>
    {/* shelves and believable quiet props */}
    <group position={[-5.8,2.0,-5.45]}>
      {[0,1.1,2.2].map(y=><mesh key={y} position={[0,y,0]}><boxGeometry args={[3.1,.16,.72]}/>{mat(C.woodDark)}</mesh>)}
      {[-1.1,-.35,.45,1.1].map((x,i)=><mesh key={x} position={[x,.35+(i%2)*1.1,.08]}><boxGeometry args={[.42,.55,.42]}/>{mat(i%2?C.sage:C.terra)}</mesh>)}
    </group>
    <group position={[4.4,1.2,-5.55]}>{[-1.2,-.6,0,.6,1.2].map((x,i)=><mesh key={x} position={[x,0,0]} rotation={[0,0,(i-2)*.08]}><boxGeometry args={[.18,1.25,.14]}/>{mat(i%2?C.terra:C.blue)}</mesh>)}</group>
    {/* practical lamps */}
    {[-2.4,3.8].map(x=><group key={x} position={[x,5.9,-1.2]}><mesh><cylinderGeometry args={[.05,.05,1.1,10]}/>{mat(C.ink)}</mesh><mesh position={[0,-.65,0]}><coneGeometry args={[.55,.42,16]}/>{mat(C.ink)}</mesh><pointLight position={[0,-.85,0]} color="#ffd99a" intensity={18} distance={7}/></group>)}
  </group>;
}
