/** Production-only read-only stage. Reuses the canon; accepts frozen real events. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import * as Fiber from '@react-three/fiber';
import {reduceEvents} from '../../../frontend/src/viz/reducer';
import {VizCanvas} from '../../../frontend/src/viz/scene/VizCanvas';
import {OwnerObelisk} from '../../../frontend/src/viz/scene/OwnerObelisk';
import {WorkerSwarm} from '../../../frontend/src/viz/scene/WorkerSwarm';
import {AuthoritySeals} from '../../../frontend/src/viz/scene/AuthoritySeals';
import {ReceiverGate} from '../../../frontend/src/viz/scene/ReceiverGate';
import {ProposalPackets} from '../../../frontend/src/viz/scene/ProposalPackets';
import {JobCrate,SideTable} from '../../../frontend/src/viz/scene/JobCrate';
import {authorityWorkerHome} from '../../../frontend/src/viz/scene/layout';
import {proposalVisibility} from '../../../frontend/src/viz/proposalVisibility';
import {TownApp} from '../../../frontend/src/town/TownApp';
import {ReceiptsPanel} from '../../../frontend/src/components/Panels';
import '../../../frontend/src/styles.css';

const root=createRoot(document.getElementById('root')!);
const win=window as any;
win.__filmFiber=Fiber;
win.__filmFlush=flushSync;
win.__filmMount=(entry:any,state:any)=>{
 const scene=state?reduceEvents(state.events):null;
 if(entry.mode==='town'){
  flushSync(()=>root.render(<TownApp/>));return;
 }
 if(entry.mode==='receipt'){
  flushSync(()=>root.render(<div style={{background:'#f3ead9',height:'100vh'}}><ReceiptsPanel onClose={()=>{}}/></div>));return;
 }
 const cp=state.snapshot.job_state.checkpoints;
 const reach=entry.id==='arrival' && state.step===8;
 flushSync(()=>root.render(<VizCanvas>
  <OwnerObelisk/>
  <WorkerSwarm workers={scene.workers} selectedId={null} onSelect={()=>{}} homeFn={authorityWorkerHome} reachingWorkerId={reach?'juniper':null}/>
  <AuthoritySeals authorities={scene.authorities} workers={scene.workers} selectedMandate={null} onSelect={()=>{}} homeFn={authorityWorkerHome}/>
  <ReceiverGate proposals={scene.proposals.filter((p:any)=>proposalVisibility(p).gateDecision)}/>
  <ProposalPackets proposals={scene.proposals.filter((p:any)=>proposalVisibility(p).gateTravel)} workers={scene.workers} onSelect={()=>{}} homeFn={authorityWorkerHome}/>
  <JobCrate job={scene.job} receipts={scene.receipts} checkpoints={cp}/>
  <SideTable proposals={scene.proposals}/>
 </VizCanvas>));
 win.__filmFacts={step:state.step,job:scene.job,receipts:scene.receipts,workers:scene.workers,authorities:scene.authorities,checkpoints:cp};
};
win.__filmReady=true;
