/** Full native-speed MP4 decode/playback check. This does not claim human listening. */
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {statSync,createReadStream,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const animatic=process.argv.includes('--animatic');
const file=resolve(root,animatic?'review/the-glass-wall-animatic.mp4':'renders/the-glass-wall.mp4');
const server=createServer((req,res)=>{
 const size=statSync(file).size,range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
 if(range){const lo=+range[1],hi=range[2]?Math.min(+range[2],size-1):size-1;res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${lo}-${hi}/${size}`,'Content-Length':hi-lo+1});createReadStream(file,{start:lo,end:hi}).pipe(res);}
 else{res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Accept-Ranges':'bytes'});createReadStream(file).pipe(res);}
});
await new Promise(r=>server.listen(16031,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--autoplay-policy=no-user-gesture-required','--disable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:810}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setContent('<body style="margin:0"><video width="1440" height="810" src="http://127.0.0.1:16031/film.mp4" preload="auto"></video></body>');
 await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 await page.evaluate(async()=>{const v=document.querySelector('video');window.__times=[];window.__ended=false;window.__start=performance.now();v.onended=()=>{window.__ended=true;window.__end=performance.now()};v.ontimeupdate=()=>window.__times.push({media:v.currentTime,wall:performance.now()});v.playbackRate=1;v.volume=1;v.muted=false;await v.play()});
 for(let i=0;i<7;i++){
   await page.waitForTimeout(10000);
   if(await page.evaluate(()=>window.__ended))break;
   console.log('PLAYBACK',await page.evaluate(()=>document.querySelector('video').currentTime));
 }
 const result=await page.evaluate(()=>{const v=document.querySelector('video'),q=v.getVideoPlaybackQuality();return {ended:window.__ended,duration:v.duration,current_time:v.currentTime,width:v.videoWidth,height:v.videoHeight,wall_seconds:(window.__end-window.__start)/1000,quality:{totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,corruptedVideoFrames:q.corruptedVideoFrames},audio_track_present:!!v.webkitAudioDecodedByteCount,audio_bytes:v.webkitAudioDecodedByteCount,samples:window.__times,error:v.error?.message??null}});
 if(!result.ended||result.error||errors.length||Math.abs(result.wall_seconds-64)>.75)throw Error(JSON.stringify({result,errors}));
 result.status='PASS';result.human_listening='UNVERIFIED';result.page_errors=errors;
 mkdirSync(resolve(root,'review'),{recursive:true});writeFileSync(resolve(root,`review/PLAYBACK-${animatic?'animatic':'final'}.json`),JSON.stringify(result,null,2));console.log('FULL PLAYBACK PASS',JSON.stringify({...result,samples:result.samples.length}));
}finally{await browser.close();await server.close()}
