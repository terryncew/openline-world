/** Play every encoded frame in order at normal speed and save phone review frames. */
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,statSync,mkdirSync,createReadStream} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const T=JSON.parse(readFileSync(resolve(root,'TIMELINE.json')));
const animatic=process.argv.includes('--animatic');
const editions=animatic
  ? [['animatic','animatic/he-said-ceo-animatic.mp4']]
  : [['narrated','renders/he-said-ceo-narrated.mp4'],['muted','renders/he-said-ceo-muted.mp4']];
const results=[];
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent((req.url||'/').split('?')[0]));
  if(!path.startsWith(root+'/')){res.writeHead(403).end();return}
  try{
    const size=statSync(path).size;
    const type=extname(path)==='.mp4'?'video/mp4':'application/octet-stream';
    const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    if(range){
      const lo=+range[1],hi=range[2]?Math.min(+range[2],size-1):size-1;
      if(lo>hi||lo>=size){res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return}
      res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes',
        'Content-Range':'bytes '+lo+'-'+hi+'/'+size,'Content-Length':hi-lo+1});
      createReadStream(path,{start:lo,end:hi}).pipe(res);
    }else{
      res.writeHead(200,{'Content-Type':type,'Content-Length':size,'Accept-Ranges':'bytes'});
      createReadStream(path).pipe(res);
    }
  }catch{res.writeHead(404).end()}
});
await new Promise(r=>server.listen(16027,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',
  args:['--autoplay-policy=no-user-gesture-required','--disable-gpu']});
try{
  for(const [name,file] of editions){
    const page=await browser.newPage({viewport:{width:430,height:940},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    const directory=resolve(root,'review','playback-'+name);
    mkdirSync(directory,{recursive:true});
    await page.setContent('<html><body style="margin:0;background:#f3ecdc;display:grid;'
      +'place-items:center;height:100vh"><video style="width:100%;height:auto" playsinline '
      +'preload="auto" src="http://127.0.0.1:16027/'+file+'"></video></body></html>');
    await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
    await page.locator('video').screenshot({path:resolve(directory,'opening.png')});
    await page.evaluate(async()=>{
      const video=document.querySelector('video');
      window.__samples=[];window.__mediaErrors=[];window.__ended=false;
      window.__startWall=performance.now();
      video.playbackRate=1;video.muted=false;video.volume=1;
      video.onended=()=>{window.__ended=true;window.__endWall=performance.now()};
      video.onerror=()=>window.__mediaErrors.push(video.error?.message);
      video.ontimeupdate=()=>window.__samples.push({time:video.currentTime,wall:performance.now()});
      await video.play();
    });
    const proof=T.shots.find(shot=>shot.id==='proof');
    const reviewTargets=T.shots.map(shot=>({
      id:shot.id,target:(shot.in_frame+shot.out_frame)/(2*T.fps),
      limit:shot.out_frame/T.fps,kind:'shot midpoint'}));
    if(T.presentation){
      reviewTargets.push(
        {id:'gate-refused-before-push',target:242/T.fps,limit:249/T.fps,
          kind:'closed gate at the start of the restrained push'},
        {id:'argument-tight-composition',target:272/T.fps,limit:303/T.fps,
          kind:'completed push at the first argument beat'},
        {id:'proof-within-two-seconds',target:proof.in_frame/T.fps+1.8,
          limit:proof.in_frame/T.fps+2,kind:'proof hierarchy before two seconds'});
    }
    reviewTargets.sort((a,b)=>a.target-b.target);
    const stamps=[];
    for(const sample of reviewTargets){
      const {target}=sample;
      await page.waitForFunction(time=>document.querySelector('video').currentTime>=time,
        target,{timeout:60000,polling:25});
      const actual=await page.evaluate(()=>document.querySelector('video').currentTime);
      await page.locator('video').screenshot({path:resolve(directory,sample.id+'.png')});
      const captured=await page.evaluate(()=>document.querySelector('video').currentTime);
      if(captured>=sample.limit)throw Error('Missed review sample: '+sample.id);
      stamps.push({shot:sample.id,kind:sample.kind,target,actual,capture_completed_at:captured});
    }
    await page.waitForFunction(()=>window.__ended,null,{timeout:10000});
    const state=await page.evaluate(()=>{
      const video=document.querySelector('video');
      const quality=video.getVideoPlaybackQuality();
      return {duration:video.duration,currentTime:video.currentTime,ended:video.ended,
        playbackRate:video.playbackRate,muted:video.muted,volume:video.volume,
        decodedFrames:quality.totalVideoFrames,droppedFrames:quality.droppedVideoFrames,
        mediaErrors:window.__mediaErrors,samples:window.__samples,
        wall_seconds:(window.__endWall-window.__startWall)/1000};
    });
    if(errors.length||state.mediaErrors.length||!state.ended||state.playbackRate!==1
      ||Math.abs(state.duration-T.seconds)>.025||Math.abs(state.currentTime-T.seconds)>.025
      ||state.wall_seconds<T.seconds-.75||state.wall_seconds>T.seconds+5
      ||state.decodedFrames<T.frames||state.droppedFrames>T.frames*.02){
      throw Error(JSON.stringify({errors,state}));
    }
    await page.locator('video').screenshot({path:resolve(directory,'ended.png')});
    results.push({edition:name,file,
      sha256:createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex'),
      method:'Complete normal-speed browser playback from 0 to ended, no seeking; '
        +'opening, every cut midpoint, visual-pass comparison points and ended screenshots '
        +'at 430×940 phone viewport. Proof hierarchy is sampled before two seconds.',
      target_frames:T.frames,target_seconds:T.seconds,stamps,...state,pageErrors:errors});
    writeFileSync(resolve(root,animatic?'animatic/PLAYBACK.json':'PLAYBACK-QA.json'),
      JSON.stringify({
        timeline_sha256:createHash('sha256').update(readFileSync(resolve(root,'TIMELINE.json'))).digest('hex'),
        visual_review:'Screenshots generated for separate producing-agent inspection; '
          +'browser completion alone does not establish editorial quality.',
        audio_review:'Unmuted stream decoded and played. Agent cannot hear audio; human '
          +'listening remains unverified. Cue alignment, loudness, peak and silence measured separately.',
        results
      },null,2)+'\n');
    console.log('FULL PLAYBACK PASS',name,T.seconds+'s',state.decodedFrames,
      'decoded frames; dropped',state.droppedFrames);
    await page.close();
  }
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
