/** Complete normal-speed browser playback and layout samples; no listening claim. */
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {statSync,createReadStream,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const animatic=process.argv.includes('--animatic');
const relative=animatic?'review/the-glass-wall-animatic.mp4':'renders/the-glass-wall-revised.mp4';
const file=resolve(root,relative),digest=createHash('sha256').update(readFileSync(file)).digest('hex');
const server=createServer((req,res)=>{
 const size=statSync(file).size,range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
 if(range){const lo=+range[1],hi=range[2]?Math.min(+range[2],size-1):size-1;res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${lo}-${hi}/${size}`,'Content-Length':hi-lo+1});createReadStream(file,{start:lo,end:hi}).pipe(res);}
 else{res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Accept-Ranges':'bytes'});createReadStream(file).pipe(res);}
});
await new Promise(r=>server.listen(16032,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--autoplay-policy=no-user-gesture-required','--disable-gpu']});
const results=[];
try{
 for(const [device,width,height] of [['phone',844,390],['laptop',1440,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.setContent('<body style="margin:0;background:#111"><video style="width:100vw;height:100vh;object-fit:contain" src="http://127.0.0.1:16032/film.mp4" preload="auto"></video></body>');
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await page.evaluate(async()=>{const v=document.querySelector('video');window.__times=[];window.__ended=false;window.__start=performance.now();v.onended=()=>{window.__ended=true;window.__end=performance.now()};v.ontimeupdate=()=>window.__times.push({media:v.currentTime,wall:performance.now()});v.playbackRate=1;v.volume=1;v.muted=false;await v.play()});
  const out=resolve(root,`review/playback-${animatic?'animatic':'final'}-${device}`);mkdirSync(out,{recursive:true});
  const stamps=[];
  let previousTime=0;
  for(const [name,time] of [['robot-question',7.0],['protected-actions',13.3],['handoff-approach',29.6],['handoff-contact',30.5],['owner-slider',31.2],['door-refusal',35.2],['bonk',38.0],['silence',39.2],['lawyer',51.2],['receipt',53.8],['title',60.0]]){
   await page.waitForFunction(t=>document.querySelector('video').currentTime>=t,time,{timeout:Math.max(15000,(time-previousTime)*1000+10000),polling:20});
   const actual=await page.evaluate(()=>document.querySelector('video').currentTime);
   await page.screenshot({path:resolve(out,`${name}.png`)});stamps.push({name,target:time,actual});previousTime=time;
  }
  await page.waitForFunction(()=>window.__ended,null,{timeout:15000});
  const result=await page.evaluate(()=>{const v=document.querySelector('video'),q=v.getVideoPlaybackQuality();return {ended:window.__ended,duration:v.duration,current_time:v.currentTime,width:v.videoWidth,height:v.videoHeight,wall_seconds:(window.__end-window.__start)/1000,quality:{totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,corruptedVideoFrames:q.corruptedVideoFrames},audio_track_present:!!v.webkitAudioDecodedByteCount,audio_bytes:v.webkitAudioDecodedByteCount,samples:window.__times,error:v.error?.message??null}});
  if(!result.ended||result.error||errors.length||!result.audio_track_present||Math.abs(result.wall_seconds-64)>.75||result.quality.totalVideoFrames!==1920)throw Error(JSON.stringify({result,errors}));
  results.push({...result,device,viewport:{width,height},stamps,status:'PASS',page_errors:errors});
  console.log('FULL PLAYBACK PASS',device,result.duration+'s',result.quality.totalVideoFrames+'frames','dropped',result.quality.droppedVideoFrames);
  await page.close();
 }
 writeFileSync(resolve(root,`review/PLAYBACK-${animatic?'animatic':'final'}.json`),JSON.stringify({status:'PASS',file:relative,sha256:digest,results,human_listening:'UNVERIFIED',limits:'Chromium layout/playback tests; not physical iPhone/Safari testing or human auditory review.'},null,2));
}finally{await browser.close();await server.close()}
