import { spawn, execFileSync, execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-launch.mjs";

const here=dirname(fileURLToPath(import.meta.url)), frontend=resolve(here,".."), repo=resolve(frontend,".."), out=resolve(frontend,"public","hero");
const raw=resolve(out,"raw"); mkdirSync(out,{recursive:true}); rmSync(raw,{recursive:true,force:true}); mkdirSync(raw);
const BP=18473, VP=15175, sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return}catch{}await sleep(250)}throw Error(`timeout: ${url}`)}
for(const p of [BP,VP])try{execSync(`fuser -k ${p}/tcp 2>/dev/null`)}catch{}
const backend=spawn("python3",["backend/server.py"],{cwd:repo,env:{...process.env,WORKSHOP_PORT:String(BP)},stdio:"ignore"});
const vite=spawn("npx",["vite","--port",String(VP),"--strictPort","--host","127.0.0.1"],{cwd:frontend,env:{...process.env,WORKSHOP_PORT:String(BP)},stdio:"ignore"});
const stop=()=>{backend.kill();vite.kill()}; process.on("exit",stop);
try{
 await wait(`http://127.0.0.1:${BP}/api/health`); await wait(`http://127.0.0.1:${VP}`);
 const browser=await chromium.launch(browserLaunchOptions());
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:raw,size:{width:1440,height:900}}});
 // Warmup (Muse presentation correction): a cold vite dev server leaves
 // seconds of blank frames at the head of the recording. Load once in a
 // throwaway page of the SAME recording context and discard its video, so
 // the kept recording starts against a warm server.
 const warm=await context.newPage();
 await warm.goto(`http://127.0.0.1:${VP}/?view=hero`,{waitUntil:"networkidle"});
 await warm.waitForFunction(()=>window.__heroDebug!==undefined,null,{timeout:30000});
 const warmVideo=await warm.video().path(); await warm.close(); rmSync(warmVideo,{force:true});
 const page=await context.newPage(), errors=[]; page.on("pageerror",e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${VP}/?view=hero`,{waitUntil:"networkidle"});
 await page.waitForFunction(()=>window.__heroDebug?.events?.some(e=>/revoked Wren/.test(e.summary)),null,{timeout:30000});
 await page.screenshot({path:resolve(out,"refusal-desktop.png")});
 await page.waitForFunction(()=>window.__heroDebug?.events?.some(e=>/reaches for the job/.test(e.summary)),null,{timeout:30000});
 assert.equal((await page.locator(".failure").count()),1,"pre-grant failure visible");
 await page.screenshot({path:resolve(out,"pre-grant-failure-desktop.png")});
 await page.waitForFunction(()=>window.__heroDebug?.complete===true,null,{timeout:30000}); await sleep(1800);
 const facts=await page.evaluate(()=>window.__heroDebug);
 assert.equal(facts.scene.receipts.length,3,"exactly three receiver receipts");
 assert.equal(facts.checkpoints.length,2,"exactly two checkpoints");
 assert.equal(facts.scene.job.jobId,"task-workshop-1","persistent job id");
 assert.equal(await page.getByTestId("owner-grant-record").count(),1,"owner grant record shown once");
 assert.match(await page.getByTestId("owner-grant-record").innerText(),/not a receipt/i);
 await page.screenshot({path:resolve(out,"poster.png")});
 assert.deepEqual(errors,[],`page errors: ${errors.join(" | ")}`);
 await page.close(); await context.close();
 const captured=resolve(raw,readdirSync(raw).find(x=>x.endsWith(".webm"))); copyFileSync(captured,resolve(out,"openline-hero.webm"));
 const portrait=await browser.newPage({viewport:{width:390,height:844}}); const portraitErrors=[]; portrait.on("pageerror",e=>portraitErrors.push(String(e)));
 await portrait.goto(`http://127.0.0.1:${VP}/?view=hero`,{waitUntil:"networkidle"});
 await portrait.waitForFunction(()=>window.__heroDebug?.complete===true,null,{timeout:50000}); await sleep(1000);
 await portrait.screenshot({path:resolve(out,"final-portrait.png")}); assert.deepEqual(portraitErrors,[],"portrait page errors"); await portrait.close(); await browser.close();
 execFileSync("ffmpeg",["-y","-i",resolve(out,"openline-hero.webm"),"-c:v","libx264","-crf","18","-pix_fmt","yuv420p","-movflags","+faststart","-an",resolve(out,"openline-hero.mp4")],{stdio:"ignore"});
 execFileSync("ffmpeg",["-y","-sseof","-12","-i",resolve(out,"openline-hero.mp4"),"-t","12","-c:v","libx264","-crf","20","-pix_fmt","yuv420p","-an",resolve(out,"openline-hero-social.mp4")],{stdio:"ignore"});
 console.log(`HERO PASS: ${facts.scene.receipts.length} receipts, ${facts.checkpoints.length} checkpoints; no page errors`);
} finally {stop()}
