/** Production-path visual validation: Square -> its validated workshop intent -> production Workshop. */
import { spawn, execSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserLaunchOptions } from "./browser-launch.mjs";
const here=dirname(fileURLToPath(import.meta.url)),frontend=resolve(here,".."),repo=resolve(frontend,".."),out=resolve(frontend,"src/viz/screenshots/visual-canon"),raw=resolve(out,"raw");
mkdirSync(out,{recursive:true});rmSync(raw,{recursive:true,force:true});mkdirSync(raw);const BP=18476,VP=15178,sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return}catch{}await sleep(250)}throw Error(`timeout ${url}`)}
for(const p of [BP,VP])try{execSync(`fuser -k ${p}/tcp 2>/dev/null`)}catch{}
const backend=spawn("python3",["backend/server.py"],{cwd:repo,env:{...process.env,WORKSHOP_PORT:String(BP)},stdio:"ignore"});
const vite=spawn("npx",["vite","--port",String(VP),"--strictPort","--host","127.0.0.1"],{cwd:frontend,env:{...process.env,WORKSHOP_PORT:String(BP)},stdio:"ignore"});
const stop=()=>{backend.kill();vite.kill()};process.on("exit",stop);
try{await wait(`http://127.0.0.1:${BP}/api/health`);await wait(`http://127.0.0.1:${VP}`);const browser=await chromium.launch(browserLaunchOptions());
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:raw,size:{width:1440,height:900}}});const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${VP}/`,{waitUntil:"networkidle"});await sleep(1800);await page.screenshot({path:resolve(out,"square-before-entry.png")});
 const frame=page.frames().find(f=>f.url().includes("town.html"));assert.ok(frame,"sandboxed town frame");await frame.evaluate(()=>parent.postMessage({type:"openline:navigate",intent:"enter-workshop"},"*"));
 await page.locator(".viz-root").waitFor({timeout:10000});await sleep(1400);await page.screenshot({path:resolve(out,"workshop-after-entry.png")});await page.screenshot({path:resolve(out,"workshop-idle.png")});
 await page.waitForFunction(()=>window.__vizDebug?.decisions?.some(d=>d.status==="allowed"),null,{timeout:40000});await page.screenshot({path:resolve(out,"wren-working.png")});
 await page.waitForFunction(()=>window.__vizDebug?.decisions?.some(d=>d.status==="stopped"),null,{timeout:40000});await page.screenshot({path:resolve(out,"stopped.png")});
 await page.waitForFunction(()=>window.__vizDebug?.workers?.some(w=>w.id==="juniper"),null,{timeout:50000});await page.screenshot({path:resolve(out,"juniper-authorized.png")});
 await page.waitForFunction(()=>window.__vizDebug?.receipts?.length>=5,null,{timeout:60000});await sleep(1800);await page.screenshot({path:resolve(out,"continuation.png")});
 assert.deepEqual(errors.filter(e=>!/ResizeObserver/.test(e)),[],"page errors");await page.close();await context.close();const vid=readdirSync(raw).find(x=>x.endsWith(".webm"));assert.ok(vid);copyFileSync(resolve(raw,vid),resolve(out,"production-path.webm"));
 const portrait=await browser.newPage({viewport:{width:390,height:844}});const pe=[];portrait.on("pageerror",e=>pe.push(String(e)));await portrait.goto(`http://127.0.0.1:${VP}/`,{waitUntil:"networkidle"});const pf=portrait.frames().find(f=>f.url().includes("town.html"));assert.ok(pf);await pf.evaluate(()=>parent.postMessage({type:"openline:navigate",intent:"enter-workshop"},"*"));await portrait.locator(".viz-root").waitFor();await portrait.waitForFunction(()=>window.__vizDebug?.receipts?.length>=5,null,{timeout:80000});await portrait.screenshot({path:resolve(out,"final-portrait.png")});assert.deepEqual(pe,[]);await portrait.getByRole("button",{name:"Back to the Square"}).click();await portrait.locator("iframe").waitFor();await browser.close();console.log("VISUAL CANON PASS: production Square -> Workshop -> Square; no page errors");
}finally{stop()}
