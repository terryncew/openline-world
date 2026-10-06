/** Capture the existing product UI against the actual completed Python fixture. */
import {createServer} from '../../../frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(root,'../..');
const run=JSON.parse(readFileSync(resolve(root,'evidence/run.json')));const errors=[];
mkdirSync(resolve(root,'source'),{recursive:true});mkdirSync(resolve(root,'work'),{recursive:true});
const server=await createServer({root:resolve(repo,'frontend'),configFile:resolve(repo,'frontend/vite.config.ts'),server:{port:16026,host:'127.0.0.1',strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:16025',changeOrigin:false}}},logLevel:'warn'});await server.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1320,height:1100},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('workshop-onboarded','1'));
 await page.goto('http://127.0.0.1:16026/?view=explore',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Records',exact:true}).waitFor();
 await page.addStyleTag({content:'.side{width:980px!important;position:absolute!important;left:170px!important;top:140px!important}.feed .sum{font-size:38px!important;line-height:1.4!important}.feed .prov{font-size:20px!important}.feed li{padding:22px!important}.drawer{width:1080px!important;left:120px!important;right:auto!important;top:40px!important;bottom:40px!important}.drawer-head{font-size:26px!important;padding:24px!important}.receipt-list{width:42%!important}.receipt-list button{font-size:24px!important;padding:16px!important}.receipt-list .who,.verify-note{font-size:20px!important}.receipt-detail{padding:24px!important}.receipt-detail .row{display:block!important;margin-bottom:20px!important}.receipt-detail .k{display:block!important;font-size:19px!important;margin-bottom:7px!important}.receipt-detail .v,.receipt-detail code.v{font-size:28px!important;line-height:1.3!important}.receipt-detail .sig{font-size:20px!important}.receipt-detail .fine{font-size:20px!important}'});
 const proposal=page.locator('.feed li').filter({hasText:'Wren proposes: refund.execute:4800.'});await proposal.waitFor();await proposal.screenshot({path:resolve(root,'source/proposal-row.png')});const proposalText=await proposal.innerText();
 await page.getByRole('button',{name:'Records',exact:true}).click();
 const api=await page.request.get('http://127.0.0.1:16026/api/receipts');const projection=await api.json();
 for(let i=0;i<2;i++){const r=run.receipts[i];const p=projection.receipts[i];for(const key of Object.keys(p))if(JSON.stringify(p[key])!==JSON.stringify(r[key]))throw Error('UI projection mismatch '+key);}
 const captures=[];
 for(const [id,decision,action] of [['stopped','STOPPED','refund.execute:4800'],['allowed','ALLOWED','refund.execute:100']]){
  await page.getByRole('button',{name:new RegExp(decision+' '+action.replaceAll('.','\\.'))}).click();
  const detail=page.locator('.receipt-detail');await detail.waitFor();const box=await detail.boundingBox();
  await page.screenshot({path:resolve(root,`source/receipt-${id}-detail.png`),clip:{x:box.x,y:box.y,width:box.width,height:Math.min(870,box.height)}});
  await page.locator('.drawer').screenshot({path:resolve(root,`source/receipt-${id}-full-ui.png`)});
  const body=await detail.innerText();if(!body.includes(decision)||!body.includes(action)||!body.includes(run.receipts[id==='stopped'?0:1].signature.value.slice(0,48)))throw Error('Selected receipt mismatch');
  captures.push({id,body,receipt_source:`evidence/receipt-${id}.json`,signature_ui_truncates:true});
 }
 await page.locator('.receipt-list').screenshot({path:resolve(root,'source/receipt-list.png')});
 writeFileSync(resolve(root,'evidence/UI-CAPTURE.json'),JSON.stringify({method:'Existing /?view=explore UI, unmodified React components, actual existing Handler and real completed PromptInjectionWorkshop. No intercepted or invented API data.',presentation:'Capture-only CSS font sizing and excerpt framing; values and fields unchanged.',proposalText,captures,projection,errors},null,2)+'\n');
 if(errors.length)throw Error(JSON.stringify(errors));console.log('REAL UI CAPTURE PASS: proposal and both genuine receipt projections, zero page exceptions.');
}finally{await browser.close();await server.close()}
