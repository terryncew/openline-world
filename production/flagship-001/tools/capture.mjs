/** Offline cinematography over genuine frozen state; no mutating API calls. */
import {createServer} from '../../../frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const production=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(production,'../..'),frontend=resolve(repo,'frontend');
const plan=JSON.parse(readFileSync(resolve(production,'SHOTS.json'))),run=JSON.parse(readFileSync(resolve(production,'evidence/authority-run.json')));
const selected=(process.env.SHOTS||'').split(',').filter(Boolean),fps=plan.fps;
const port=16002;
const server=await createServer({root:frontend,configFile:resolve(frontend,'vite.config.ts'),server:{port,host:'127.0.0.1',strictPort:true,fs:{allow:[repo]}},resolve:{dedupe:['react','react-dom','three','@react-three/fiber']},logLevel:'warn'});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],reports=[];mkdirSync(resolve(production,'work'),{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function pageFor(){
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(String(e)));
 const now=Date.now();await page.clock.install({time:now});await page.clock.pauseAt(now);
 await page.route('**/api/receipts',route=>route.fulfill({status:200,contentType:'application/json',body:readFileSync(resolve(production,'evidence/ui-receipts.json'),'utf8')}));
 await page.goto(`http://127.0.0.1:${port}/@fs${production}/tools/stage.html`,{waitUntil:'load'});
 await page.waitForFunction(()=>window.__filmReady,null,{polling:100});
 // Block the automatic RAF loop. Only the exact original frame subscribers below animate the scene.
 await page.evaluate(()=>{let id=0;window.requestAnimationFrame=()=>++id;window.cancelAnimationFrame=()=>{}});return page;
}
async function storeReady(page){
 for(let n=0;n<200;n++){
  const ready=await page.evaluate(()=>!!window.__filmFiber?._roots.get(document.querySelector('canvas'))?.store);
  if(ready){await page.evaluate(()=>{const st=window.__filmFiber._roots.get(document.querySelector('canvas')).store.getState();st.setFrameloop('never');st.setDpr(1)});return;}
  await sleep(40);await page.clock.runFor(5);
 }
 throw Error('Canvas root failed to initialize');
}
function stateAt(n){return run.states[n-1]}
try{
 for(const shot of plan.shots){
  if(selected.length&&!selected.includes(shot.id))continue;
  const dest=resolve(production,shot.source);const probe=spawnSync('ffprobe',['-v','quiet','-show_format','-of','json',dest],{encoding:'utf8'});const complete=probe.status===0&&Math.abs(Number(JSON.parse(probe.stdout).format.duration)-shot.seconds)<.05;if(complete&&!process.env.RECAPTURE){console.log('Reusing',shot.id);continue}
  const page=await pageFor();await page.evaluate(({shot,state})=>window.__filmMount(shot,state),{shot,state:shot.initial_step?stateAt(shot.initial_step):null});
  await storeReady(page);
  if(shot.mode==='town')await page.evaluate(()=>window.__filmFiber._roots.get(document.querySelector('canvas')).store.getState().gl.setClearColor('#f3ead9',1));
  // Existing actors, seals and receipt marks start settled. Only new real state changes animate in the take.
  for(let w=0;w<108;w++){
   await page.clock.runFor(1000/fps);
   await page.evaluate(()=>{const st=window.__filmFiber._roots.get(document.querySelector('canvas')).store.getState();st.clock.elapsedTime=performance.now()/1000;window.__filmFlush(()=>{for(const sub of [...st.internal.subscribers])sub.ref.current(sub.store.getState(),1/24)});});
  }
  // Pure presentation: same canon meshes. Cast actual shadows to give the miniature physical grounding.
  await page.evaluate(()=>{const st=window.__filmFiber._roots.get(document.querySelector('canvas')).store.getState();
   st.scene.traverse(o=>{if(o.isMesh&&o.material&&!o.material.transparent){o.castShadow=true;o.receiveShadow=true}if(o.isDirectionalLight&&o.castShadow){o.shadow.mapSize.set(1024,1024);o.shadow.camera.left=-12;o.shadow.camera.right=12;o.shadow.camera.top=12;o.shadow.camera.bottom=-12;o.shadow.camera.near=.5;o.shadow.camera.far=45;o.shadow.bias=-.001;}});
  });
  const warm=await page.evaluate(()=>performance.now());let step=shot.initial_step,change=0;
  const movie=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',dest],{stdio:['pipe','inherit','inherit']});
  const movieDone=new Promise((res,rej)=>{movie.on('exit',c=>c===0?res():rej(Error('ffmpeg '+c)));movie.on('error',rej)});
  const frames=Math.round(shot.seconds*fps),keys=[];const begin=Date.now();
  for(let n=0;n<frames;n++){
   const t=n/fps;
   while(change<shot.changes.length&&t>=shot.changes[change][0]){step=shot.changes[change++][1];await page.evaluate(({shot,state})=>window.__filmMount(shot,state),{shot,state:stateAt(step)});}
   await page.clock.runFor(1000/fps);
   const data=await page.evaluate(({camera,k})=>{
    const st=window.__filmFiber._roots.get(document.querySelector('canvas')).store.getState(),t=performance.now()/1000;
    // Original animations use the exact fixed frame clock; facts are never generated by rendering.
    st.camera.fov=camera.fov;st.camera.position.set(...camera.start.map((a,i)=>a+(camera.end[i]-a)*k));st.camera.lookAt(...camera.target);st.camera.updateProjectionMatrix();
    st.clock.elapsedTime=t;window.__filmFlush(()=>{for(const sub of [...st.internal.subscribers])sub.ref.current(sub.store.getState(),1/24)});st.gl.render(st.scene,st.camera);
    // Render then export in the same JS task, before WebGL's drawing buffer is discarded.
    return {jpg:st.gl.domElement.toDataURL('image/jpeg',.97),facts:window.__filmFacts,workerPositions:['wren','juniper'].map(id=>({id,pos:st.scene.getObjectByName('worker-'+id)?.position.toArray()}))};
   },{camera:shot.camera,k:n/(frames-1)});
   const buffer=Buffer.from(data.jpg.split(',')[1],'base64');
   if(!movie.stdin.write(buffer))await new Promise(r=>movie.stdin.once('drain',r));
   if(n===0||n===Math.round(frames*.55)||n===frames-1){writeFileSync(resolve(production,'review',`${shot.id}-${n}.jpg`),buffer);keys.push({frame:n,seconds:t,facts:data.facts,workerPositions:data.workerPositions});}
   if(n%48===0)console.log(`${shot.id} ${n}/${frames} step=${step} wall=${((Date.now()-begin)/1000).toFixed(1)}s`);
  }
  movie.stdin.end();await movieDone;
  const report={id:shot.id,frames,fps,size:[1920,1080],seconds:shot.seconds,method:'fixed-clock offline render; automatic RAF disabled; original frame subscribers with exact 1/24s delta; original canon; real frozen events; editorial camera and shadows',keys};
  writeFileSync(resolve(production,'evidence',`capture-${shot.id}.json`),JSON.stringify(report,null,2)+'\n');reports.push(report);
  await page.close();
 }
 if(!selected.length||selected.includes('receipt-ui')){
  const page=await pageFor();await page.evaluate(()=>window.__filmMount({mode:'receipt'},null));await sleep(300);await page.clock.runFor(20);
  await page.getByRole('button',{name:/STOPPED notes.read/}).click({force:true});
  await page.addStyleTag({content:'.drawer{position:fixed!important;left:50%!important;right:auto!important;top:120px!important;bottom:120px!important;transform:translateX(-50%)!important;width:800px!important;max-width:none!important;box-shadow:0 30px 90px #3d34282a!important}.drawer-head{font-size:25px!important;padding:28px!important}.drawer-body{padding:28px!important;font-size:21px!important}.drawer-body .fine,.verify-note{font-size:17px!important;line-height:1.5!important}.receipt-list button{font-size:21px!important;padding:16px!important}.receipt-detail .row{padding:10px!important;font-size:20px!important}.receipt-detail .sig{font-size:16px!important}'});
  await page.screenshot({path:resolve(production,'source/receipt-ui.png')});
  writeFileSync(resolve(production,'evidence/receipt-ui-capture.json'),JSON.stringify({classification:'REAL CAPTURE',component:'frontend/src/components/Panels.tsx:ReceiptsPanel',data:'Exact saved real /api/receipts projection; static replay of verified signed artifacts',layout:'Capture-only centering and font scaling',body:await page.locator('.drawer').innerText(),pageErrors:errors},null,2)+'\n');await page.close();
 }
 if(errors.length)throw Error(JSON.stringify(errors));
 console.log('CAPTURE PASS',reports.length,'shots; zero page errors');
}finally{await browser.close();await server.close()}
