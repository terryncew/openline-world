/** Capture the real route with wall-clock frame and event timestamps.
 * Output is outside the checkout; assembly uses measured visual cues.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-launch.mjs";
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(frontend, "..");
const out = process.env.EVIDENCE_DIR || "/workspace/openline-final-review/capture";
mkdirSync(resolve(out,"frames"), { recursive:true });
const BP=18480, VP=15180, pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url, child) {
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error("service exited");try{if((await fetch(url)).ok)return}catch{}await pause(200)}
 throw Error(`timeout ${url}`);
}
const backend=spawn(process.env.PYTHON||resolve(repo,".venv/bin/python"),["backend/server.py"],{cwd:repo,env:{...process.env,WORKSHOP_PORT:String(BP),WORLD_DATA_DIR:resolve(out,"world")},stdio:"ignore"});
const vite=spawn(resolve(frontend,"node_modules/.bin/vite"),["--port",String(VP),"--strictPort","--host","127.0.0.1"],{cwd:frontend,env:{...process.env,WORKSHOP_PORT:String(BP)},stdio:"ignore"});
const stop=()=>{backend.kill();vite.kill()}; process.on("exit",stop);
let browser;
try {
 await wait(`http://127.0.0.1:${BP}/api/health`,backend);await wait(`http://127.0.0.1:${VP}/api/health`,vite);
 browser=await chromium.launch(browserLaunchOptions());
 const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const warm=await context.newPage();await warm.goto(`http://127.0.0.1:${VP}/?scenario=prompt-injection`);await pause(2200);await warm.close();
 const page=await context.newPage(),errors=[],marks={},frames=[];
 page.on("pageerror",e=>errors.push(String(e)));
 await page.exposeBinding("captureCue",(_,{key,time})=>{if(!Object.hasOwn(marks,key))marks[key]=time});
 await page.addInitScript(()=>{
   let debug;
   Object.defineProperty(window,"__promptInjectionDebug",{configurable:true,get:()=>debug,set:value=>{
     debug=value;
     const emit=key=>window.captureCue({key,time:(performance.timeOrigin+performance.now())/1000});
     if(value.scene?.job && value.scene?.workers.length===1)emit("establish");
     if(value.snapshot?.scenario?.step>=1)emit("content");
     if(value.snapshot?.scenario?.step>=2)emit("read");
     if(value.scene?.proposals.length)emit("proposal");
     if(value.scene?.receipts.length)emit("stop");
     if(value.snapshot?.scenario?.step>=5)emit("history");
     if(value.events?.some(e=>e.summary==="PROMPT CONTROL IS NOT AUTHORITY."))emit("wide");
     if(value.complete)emit("end");
   }});
 });
 const cdp=await context.newCDPSession(page);
 cdp.on("Page.screencastFrame",async frame=>{
   const file=resolve(out,"frames",`${String(frames.length).padStart(6,"0")}.jpg`);
   writeFileSync(file,Buffer.from(frame.data,"base64"));
   frames.push({file,time:frame.metadata.timestamp});
   await cdp.send("Page.screencastFrameAck",{sessionId:frame.sessionId});
 });
 await cdp.send("Page.startScreencast",{format:"jpeg",quality:94,maxWidth:1280,maxHeight:800,everyNthFrame:1});
 await page.goto(`http://127.0.0.1:${VP}/?scenario=prompt-injection`,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.__promptInjectionDebug?.scene?.workers.length===1);
 // Software GPU capture: keep the production scene intact while reducing
 // only the internal raster resolution. DOM cards retain full resolution.
 await page.evaluate(async()=>{
   const url=performance.getEntriesByType("resource").map(e=>e.name).find(n=>n.includes("/@react-three_fiber.js?v="));
   const {_roots}=await import(url);
   for(let i=0;i<100;i++){
     const root=_roots.get(document.querySelector("canvas"));
     if(root){root.store.getState().setDpr(.65);return}
     await new Promise(r=>setTimeout(r,30));
   }
   throw Error("capture renderer not initialized");
 });
 await page.waitForFunction(()=>window.__promptInjectionDebug?.complete===true,null,{timeout:45000});
 await pause(1000);
 await cdp.send("Page.stopScreencast");
 const facts=await page.evaluate(()=>window.__promptInjectionDebug);
 assert.deepEqual(errors,[]);assert.equal(facts.scene.receipts.length,1);assert.equal(facts.scene.receipts[0].decision,"STOPPED");assert.deepEqual(facts.snapshot.job_state.checkpoints,[]);
 for(const key of ["establish","content","read","proposal","stop","history","wide","end"])assert.ok(marks[key],`cue ${key}`);
 writeFileSync(resolve(out,"capture.json"),JSON.stringify({marks,frames,errors,facts},null,2));
 console.log(`CAPTURE PASS: ${frames.length} timestamped production frames; cues ${JSON.stringify(marks)}`);
 await context.close();
} finally {if(browser)await browser.close();stop()}
