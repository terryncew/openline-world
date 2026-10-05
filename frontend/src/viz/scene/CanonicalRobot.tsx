/** Canonical worker identities used by every production Workshop sequence. */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const colors={wren:{body:"#8ba888",trim:"#6d8a6b",head:"#f3ead9"},juniper:{body:"#4a6f8a",trim:"#c26d4b",head:"#e2d5bd"},other:{body:"#a9805a",trim:"#6f5036",head:"#e2d5bd"}};
const M=({c}:{c:string})=><meshStandardMaterial color={c} roughness={.9} metalness={0}/>;

export function CanonicalRobot({id,active,admitted=true,phase=0,reaching=false,onReachComplete}:{id:string;active:boolean;admitted?:boolean;phase?:number;reaching?:boolean;onReachComplete?:()=>void}){
 const root=useRef<THREE.Group>(null), arm=useRef<THREE.Group>(null), done=useRef(false), start=useRef(0);
 const kind=id.toLowerCase()==="wren"?"wren":id.toLowerCase()==="juniper"?"juniper":"other"; const c=colors[kind]; const heavy=kind==="juniper";
 useFrame(({clock},dt)=>{const t=clock.elapsedTime;if(!root.current)return; root.current.position.y=.03+Math.sin(t*1.5+phase)*.025; if(reaching){if(!start.current)start.current=t;const a=t-start.current; const k=Math.sin(Math.min(1,a/1.5)*Math.PI); if(arm.current)arm.current.rotation.x=-.35-k*1.05;if(a>=1.5&&!done.current){done.current=true;onReachComplete?.()}}else{start.current=0;done.current=false;if(arm.current)arm.current.rotation.x=THREE.MathUtils.damp(arm.current.rotation.x,-.25,5,dt)}});
 const limb=(s:number,big=false)=><group position={[s*(heavy?.48:.35),1.18,0]}><mesh><sphereGeometry args={[big?.15:.11,12,10]}/><M c="#3d3428"/></mesh><mesh position={[0,-.27,0]}><capsuleGeometry args={[big?.12:.085,.35,6,10]}/><M c={c.trim}/></mesh><mesh position={[0,-.52,.03]}><sphereGeometry args={[big?.17:.12,12,10]}/><M c={c.head}/></mesh></group>;
 return <group ref={root} scale={admitted?1:.92}>
   <mesh position={[0,.03,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[heavy?.62:.48,24]}/><meshBasicMaterial color="#3d3428" transparent opacity={.2}/></mesh>
   {[-1,1].map(s=><group key={s} position={[s*(heavy?.24:.18),.38,0]}><mesh position={[0,.16,0]}><capsuleGeometry args={[.1,.25,6,10]}/><M c={c.trim}/></mesh><mesh position={[0,-.03,.08]}><boxGeometry args={[heavy?.34:.26,.13,.42]}/><M c="#3d3428"/></mesh></group>)}
   <mesh position={[0,.93,0]} scale={heavy?[1.22,1,1]:[.86,1.08,.82]}><capsuleGeometry args={[.34,.48,8,16]}/><M c={active?c.body:"#7f8179"}/></mesh>
   <mesh position={[0,.92,.34]}><boxGeometry args={[heavy?.55:.36,.16,.08]}/><M c={c.trim}/></mesh>
   <group ref={arm}>{limb(1,heavy)}</group>{limb(-1,heavy)}
   <group position={[0,1.62,0]}>
    <mesh scale={heavy?[1.25,.9,1]:[.92,1,1]}><boxGeometry args={[.58,.42,.5]}/><M c={c.head}/></mesh>
    {/* Wren binocular precision eyes; Juniper single reinforced visor */}
    {kind==="wren"?[-1,1].map(s=><mesh key={s} position={[s*.15,.04,.27]}><cylinderGeometry args={[.07,.07,.08,14]}/><meshBasicMaterial color="#314b47"/></mesh>):<mesh position={[0,.04,.27]}><boxGeometry args={[.38,.1,.07]}/><meshBasicMaterial color="#273d4b"/></mesh>}
    <mesh position={[heavy?.3:-.3,.18,0]}><cylinderGeometry args={[.035,.035,.35,8]}/><M c={c.trim}/></mesh>
   </group>
   {!active&&<mesh position={[0,2.05,0]}><torusGeometry args={[.22,.045,8,20]}/><meshBasicMaterial color={admitted?"#a63f32":"#77838a"}/></mesh>}
 </group>;
}
