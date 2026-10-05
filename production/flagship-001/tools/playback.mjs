/** Real browser playback, without pretending this agent can hear the stream. */
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';import {readFileSync,writeFileSync,statSync,mkdirSync,createReadStream} from 'node:fs';import {resolve,dirname,extname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const edits=JSON.parse(readFileSync(resolve(root,'EDITS.json'))).variants;
const results=[];const PORT=16009;
const server=createServer((req,res)=>{const name=decodeURIComponent((req.url||'/').split('?')[0]);const p=resolve(root,'.'+(name==='/'?'/WATCH.html':name));if(!p.startsWith(root+'/')){res.writeHead(403);res.end();return}try{const size=statSync(p).size;const type=extname(p)==='.mp4'?'video/mp4':extname(p)==='.html'?'text/html':extname(p)==='.jpg'?'image/jpeg':'application/octet-stream';const m=req.headers.range?.match(/bytes=(\d+)-(\d*)/);if(m){const lo=Number(m[1]),hi=m[2]?Math.min(Number(m[2]),size-1):size-1;res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':`bytes ${lo}-${hi}/${size}`,'Content-Length':hi-lo+1});createReadStream(p,{start:lo,end:hi}).pipe(res)}else{res.writeHead(200,{'Content-Type':type,'Content-Length':size,'Accept-Ranges':'bytes'});createReadStream(p).pipe(res)}}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',args:['--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const edit of edits){
  const full=true; // Watch every delivery cut at normal speed, including both endings.
  const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'load'});
  await page.evaluate(({src})=>{const v=document.querySelector('video');v.src=src;v.volume=1;v.muted=false;v.playbackRate=1;window.__ended=false;window.__mediaErrors=[];v.onended=()=>window.__ended=true;v.onerror=()=>window.__mediaErrors.push(v.error?.message);},{src:`/${edit.file}`});
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);await page.evaluate(()=>document.querySelector('video').play());
  const stamps=full?edit.segments.map(s=>({time:s.start+Math.min(s.seconds*.6,2),id:s.id})):edit.segments.filter(s=>['receipt-ui','end','developer','buyer'].includes(s.id)).map(s=>({time:s.start+s.seconds/2,id:s.id}));
  if(full){
   for(const s of stamps){await page.waitForFunction(t=>document.querySelector('video').currentTime>=t,s.time,{timeout:edit.seconds*1000+20000});await page.locator('video').screenshot({path:resolve(root,'review',`${edit.name}-${s.id}.png`)});}
   await page.waitForFunction(()=>window.__ended,null,{timeout:edit.seconds*1000+20000});
  }else{
   for(const s of stamps){await page.evaluate(t=>{document.querySelector('video').currentTime=t},s.time);await page.waitForFunction(()=>!document.querySelector('video').seeking);await page.locator('video').screenshot({path:resolve(root,'review',`${edit.name}-${s.id}.png`)});}
   await page.evaluate(()=>{document.querySelector('video').currentTime=document.querySelector('video').duration-1;document.querySelector('video').play()});await page.waitForFunction(()=>window.__ended,null,{timeout:10000});
  }
  const state=await page.evaluate(()=>{const v=document.querySelector('video');return {duration:v.duration,currentTime:v.currentTime,ended:v.ended,volume:v.volume,muted:v.muted,playbackRate:v.playbackRate,readyState:v.readyState,mediaErrors:window.__mediaErrors,decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames,droppedFrames:v.getVideoPlaybackQuality().droppedVideoFrames}});
  if(errors.length||state.mediaErrors.length||!state.ended)throw Error(JSON.stringify({errors,state}));
  results.push({name:edit.name,sha256:createHash('sha256').update(readFileSync(resolve(root,edit.file))).digest('hex'),method:full?'Full-duration realtime browser playback':'Proof/end visual seek review plus playback to ended; complete decode separately',...state,pageErrors:errors});writeFileSync(resolve(root,'review/PLAYBACK-QA.json'),JSON.stringify({audio:'Unmuted browser stream; subjective listening unavailable to this agent',results},null,2)+'\n');console.log('PLAYBACK PASS',edit.name,state.duration);await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
