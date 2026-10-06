/** Canonical production workers. Positions and motion are derived only from authoritative worker state. */
import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VizWorker } from "../protocol";
import { workerHome, VISITOR_POS } from "./layout";
import { Nameplate } from "./Nameplate";
import { CanonicalRobot } from "./CanonicalRobot";

function WorkerFigure({worker,home,index,reaching,onReachComplete,onSelect,showNameplates}:{worker:VizWorker;home:[number,number,number];index:number;reaching:boolean;onReachComplete?:(id:string)=>void;onSelect:(id:string|null)=>void;showNameplates:boolean}){
 const group=useRef<THREE.Group>(null); const [born]=useState(()=>performance.now()/1000);
 useFrame((_,dt)=>{if(!group.current)return; const k=Math.min(1,(performance.now()/1000-born)/1.1); const ease=1-Math.pow(1-k,3); group.current.position.x=THREE.MathUtils.damp(group.current.position.x,-8.5+(home[0]+8.5)*ease,8,dt); group.current.position.y=home[1]; group.current.position.z=home[2];});
 return <group name={`worker-${worker.workerId}`} ref={group} position={[-8.5,home[1],home[2]]} onClick={e=>{e.stopPropagation();onSelect(worker.workerId)}}>
   <CanonicalRobot id={worker.workerId} active={worker.active} admitted={worker.admitted} phase={index*.9} reaching={reaching} onReachComplete={()=>onReachComplete?.(worker.workerId)}/>
   {showNameplates && <Nameplate text={worker.workerId === "wren" ? "Wren" : worker.workerId === "juniper" ? "Juniper" : worker.workerId} position={[0,3.1,0]} accent={worker.workerId === "wren" ? "#4a9e5c" : "#c9a84c"} scale={0.85} />}
 </group>;
}

export function WorkerSwarm({workers,selectedId: _selectedId,onSelect,homeFn=workerHome,reachingWorkerId=null,onReachComplete,showNameplates=false}:{workers:VizWorker[];selectedId:string|null;onSelect:(id:string|null)=>void;homeFn?:(index:number,workerId:string)=>[number,number,number];reachingWorkerId?:string|null;onReachComplete?:(workerId:string)=>void;showNameplates?:boolean}){
 const homes=useMemo(()=>workers.map((w,i)=>w.admitted?homeFn(i,w.workerId):VISITOR_POS),[workers,homeFn]);
 return <group>{workers.map((w,i)=><WorkerFigure key={w.workerId} worker={w} home={homes[i]} index={i} reaching={reachingWorkerId===w.workerId} onReachComplete={onReachComplete} onSelect={onSelect} showNameplates={showNameplates}/>)}</group>;
}
