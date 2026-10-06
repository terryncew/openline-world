/** Full normal-speed playback in Chromium, with a visual review frame from every cut. */
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,statSync,mkdirSync,createReadStream} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const T=JSON.parse(readFileSync(resolve(root,'TIMELINE.json')));const animatic=process.argv.includes('--animatic');
const editions=animatic?[['animatic','animatic/he-said-ceo-animatic.mp4']]:[['narrated','renders/he-said-ceo-narrated.mp4'],['muted','renders/he-said-ceo-muted.mp4']];
const results=[];const server=createServer((req,res)=>{
 const p=resolve(root,'.'+decodeURIComponent((req.url||'/').split('?')[0]));
 if(!p.startsWith(root+'/')){res.writeHead(403).end();return}
 try{const size=statSync(p).size;const type=extname(p)==='.mp4'?'video/mp4':'application/octet-stream';const m=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  if(m){const lo=+m[1],hi=m[2]?Math.min(+m[2],size-1):size-1;res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':`bytes ${lo}-${hi}/${size}`,'Content-Length':hi-lo+1});createReadStream(p,{start:lo,end:hi}).pipe(res)}
  else{res.writeHead(200,{'Content-Type':type,'Content-Length':size,'Accept-Ranges':'bytes'});createReadStream(p).pipe(res)}
 }catch{res.writeHead(404).end()}
});await new Promise(r=>server.listen(16027,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--autoplay-policy=no-user-gesture-required','--disable-gpu']});
try{
 for(const [name,file] of editions){
  const page=await browser.newPage({viewport:{width:430,height:940},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));const dir=resolve(root,'review','playback-'+name);mkdirSync(dir,{recursive:true});
  await page.setContent(`<html><body style="margin:0;background:#f3ecdc;display:grid;place-items:center;height:100vh"><video style="width:100%;height:auto" playsinline preload="auto" src="http://127.0.0.1:16027/${file}"></video></body></html>`);
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await page.evaluate(()=>{const v=document.querySelector('video');window.__samples=[];window.__mediaErrors=[];window.__ended=false;v.playbackRate=1;v.muted=false;v.volume=1;v.onended=()=>window.__ended=true;v.onerror=()=>window.__mediaErrors.push(v.error?.message);v.ontimeupdate=()=>window.__samples.push({time:v.currentTime,wall:performance.now()});v.play()});
  const begin=Date.now();const stamps=[];
  for(const s of T.shots){
   const at=(s.in_frame+s.out_frame)/60;
   await page.waitForFunction(t=>document.querySelector('video').currentTime>=t,at,{timeout:60000,polling:25});
   const actual=await page.evaluate(()=>document.querySelector('video').currentTime);
   await page.locator('video').screenshot({path:resolve(dir,s.id+'.png')});stamps.push({shot:s.id,target:at,actual});
  }
  await page.waitForFunction(()=>window.__ended,null,{timeout:10000});
  const state=await page.evaluate(()=>{const v=document.querySelector('video');const q=v.getVideoPlaybackQuality();return {duration:v.duration,currentTime:v.currentTime,ended:v.ended,playbackRate:v.playbackRate,muted:v.muted,volume:v.volume,decodedFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames,mediaErrors:window.__mediaErrors,samples:window.__samples}});
  if(errors.length||state.mediaErrors.length||!state.ended||state.currentTime!==43)throw Error(JSON.stringify({errors,state}));
  results.push({edition:name,file,sha256:createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex'),method:'Complete normal-speed browser playback from 0 to ended, no seeking; screenshot from every cut at phone viewport.',wall_seconds:(Date.now()-begin)/1000,stamps,...state,pageErrors:errors});
  writeFileSync(resolve(root,animatic?'animatic/PLAYBACK.json':'PLAYBACK-QA.json'),JSON.stringify({visual_review:'Browser screenshots from every cut inspected separately by the producing agent.',audio_review:'Unmuted stream decoded and played. Agent cannot hear audio; human listening remains unverified. Cue alignment, loudness, peak and silence measured separately.',results},null,2)+'\n');
  console.log('FULL PLAYBACK PASS',name,'43s',state.decodedFrames,'decoded frames; dropped',state.droppedFrames);await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
