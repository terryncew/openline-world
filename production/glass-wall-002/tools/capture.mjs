/** Deterministic frame capture. No realtime clocks or dropped-frame retiming. */
import {createServer} from '../../../frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(root,'../..');
const final=process.argv.includes('--final'),preview=process.argv.includes('--preview');
const width=final?1920:960,height=final?1080:540,quality=final?'final':'animatic';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const stageHash=sha(resolve(root,'tools/stage.js')),timelineHash=sha(resolve(root,'TIMELINE.json'));
const graphicsHash=sha(resolve(root,'GRAPHICS.json'));
mkdirSync(resolve(root,'source'),{recursive:true});mkdirSync(resolve(root,'review'),{recursive:true});
const errors=[];
const server=await createServer({root:resolve(repo,'frontend'),configFile:resolve(repo,'frontend/vite.config.ts'),server:{port:16030,host:'127.0.0.1',strictPort:true,fs:{allow:[repo]}},logLevel:'error'});
await server.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:16030/@fs${root}/tools/stage.html`);
 await page.waitForFunction(()=>typeof window.__renderAt==='function'&&window.__ready===true,null,{timeout:60000});
 await page.evaluate(timeline=>window.__setTimeline(timeline),JSON.parse(readFileSync(resolve(root,'TIMELINE.json'))));
 await page.evaluate(async ({root,width,height,graphics})=>{
   const load=src=>new Promise((r,j)=>{const im=new Image();im.onload=()=>r(im);im.onerror=j;im.src=src});
   window.__cards={end:await load('/@fs'+root+'/artwork/end-card.png'),receipt:await load('/@fs'+root+'/artwork/receipt.png')};
   const out=document.createElement('canvas');out.width=width;out.height=height;const ctx=out.getContext('2d');
   window.__compositeAt=t=>{
     if(window.__previewAt)window.__previewAt(t);else window.__renderAt(t);
     const source=window.__canvas;
     if(!source)throw Error('Stage canvas missing');
     ctx.globalAlpha=1;ctx.drawImage(source,0,0,width,height);
     if(t>=53.2&&t<55)ctx.drawImage(window.__cards.receipt,0,0,width,height);
     if(t>=58){ctx.globalAlpha=Math.min(1,(t-58)/.24);ctx.drawImage(window.__cards.end,0,0,width,height);ctx.globalAlpha=1;}
     const unit=width/1920;
     for(const item of graphics.items){
       if(t<item.start||t>=item.end)continue;
       const fade=Math.min(1,(t-item.start)/item.fade_seconds,(item.end-t)/item.fade_seconds);
       const [x,y,w,h]=item.rect.map(v=>v*unit);
       ctx.globalAlpha=Math.max(0,fade)*.96;ctx.fillStyle='#f3ecdc';ctx.fillRect(x,y,w,h);
       ctx.fillStyle='#af5139';ctx.fillRect(x,y,6*unit,h);
       ctx.fillStyle='#293d46';ctx.textAlign='left';ctx.textBaseline='middle';
       item.lines.forEach((line,i)=>{ctx.font=`500 ${item.font_sizes[i]*unit}px "Noto Sans", sans-serif`;ctx.fillText(line,x+28*unit,y+h*(i+.5)/item.lines.length);});
       ctx.globalAlpha=1;
     }
     return {jpg:out.toDataURL('image/jpeg',.96),telemetry:window.__telemetry??null};
   };
 },{root,width,height,graphics:JSON.parse(readFileSync(resolve(root,'GRAPHICS.json')))});
 if(preview){
   for(const t of [0,.9,4,7.2,12.8,18.4,23.5,27,29.5,30.2,30.5,30.8,31,31.3,32.5,34.8,37.5,38,38.15,39.5,41.5,43,45,46,48.5,51,53.8,56.5,60]){
     const d=await page.evaluate(t=>window.__compositeAt(t),t);
     writeFileSync(resolve(root,`review/preview-${t}.jpg`),Buffer.from(d.jpg.split(',')[1],'base64'));
   }
   if(errors.length)throw Error(errors.join('\n'));
   console.log('Preview frames rendered');
 }else{
   if(final){const review=JSON.parse(readFileSync(resolve(root,'review/ANIMATIC-REVIEW.json')));if(review.status!=='PASS'||review.stage_sha256!==stageHash||review.timeline_sha256!==timelineHash||review.graphics_sha256!==graphicsHash)throw Error('Current stage, timeline and graphics must have passed animatic review first');}
   const dest=resolve(root,`source/picture-${quality}.mp4`);
   const movie=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-vcodec','mjpeg','-i','pipe:0','-an','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-threads','2','-preset','fast','-crf',final?'16':'20','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',dest],{stdio:['pipe','inherit','inherit']});
   const done=new Promise((r,j)=>movie.on('exit',c=>c===0?r():j(Error('ffmpeg exit '+c))));
   const telemetry=[];
   for(let n=0;n<1920;n++){
     const d=await page.evaluate(t=>window.__compositeAt(t),n/30);
     if(!movie.stdin.write(Buffer.from(d.jpg.split(',')[1],'base64')))await new Promise(r=>movie.stdin.once('drain',r));
     if(n%3===0)telemetry.push({frame:n,time:n/30,...d.telemetry});
     if(n%150===0)console.log('CAPTURE',quality,n,'/1920');
   }
   movie.stdin.end();await done;
   if(errors.length)throw Error(errors.join('\n'));
   if(stageHash!==sha(resolve(root,'tools/stage.js'))||timelineHash!==sha(resolve(root,'TIMELINE.json'))||graphicsHash!==sha(resolve(root,'GRAPHICS.json')))throw Error('Source changed during capture; render must be repeated');
   writeFileSync(resolve(root,`source/CAPTURE-${quality}.json`),JSON.stringify({fps:30,frames:1920,width,height,seconds:64,deterministic:true,stage_sha256:stageHash,timeline_sha256:timelineHash,graphics_sha256:graphicsHash,picture_sha256:sha(dest),page_errors:errors,telemetry},null,2));
   console.log('CAPTURE PASS',quality);
 }
}finally{await browser.close();await server.close()}
