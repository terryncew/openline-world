/** Original UI components displaying the exact preserved actual-test records. */
import {createServer} from '../../../frontend/node_modules/vite/dist/node/index.js';
import {chromium} from '../../../frontend/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(root,'../..');
const run=JSON.parse(readFileSync(resolve(root,'evidence/run.json')));
const projection=JSON.parse(readFileSync(resolve(root,'evidence/ui-receipts.json')));
for(let i=0;i<2;i++)for(const key of Object.keys(projection.receipts[i]))if(JSON.stringify(projection.receipts[i][key])!==JSON.stringify(run.receipts[i][key]))throw Error('Projection mismatch '+key);
mkdirSync(resolve(root,'source'),{recursive:true});
const server=await createServer({root:resolve(repo,'frontend'),configFile:resolve(repo,'frontend/vite.config.ts'),server:{port:16026,host:'127.0.0.1',strictPort:true,fs:{allow:[repo]}},logLevel:'error'});await server.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--disable-gpu']});const errors=[],captures=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:1400}});page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/api/receipts',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(projection)}));
 await page.goto(`http://127.0.0.1:16026/@fs${root}/tools/stage.html`,{waitUntil:'networkidle'});
 await page.addStyleTag({content:`.feed{position:absolute;top:40px;left:40px;width:920px}.feed li{font-size:38px;padding:24px}.feed .prov{font-size:22px}.drawer{position:absolute;left:30px;right:auto;top:200px;bottom:auto;height:1150px;width:1340px;box-shadow:none}.drawer-head{font-size:28px;padding:24px}.receipt-list{width:420px;padding:24px}.receipt-list li button{font-size:30px;padding:22px;line-height:1.5}.receipt-list .who,.verify-note{font-size:24px;line-height:1.5}.receipt-detail{padding:32px}.receipt-detail .row{display:block;margin:0 0 26px}.receipt-detail .k{display:block;font-size:25px;margin-bottom:9px}.receipt-detail .v,.receipt-detail code.v{font-size:40px;line-height:1.35}.receipt-detail .sig{font-size:25px!important;line-height:1.35}.receipt-detail .fine{font-size:25px;line-height:1.4}`});
 const proposal=page.locator('.feed li');await proposal.screenshot({path:resolve(root,'source/proposal-row.png')});
 for(const [id,decision,action] of [['stopped','STOPPED','refund.execute:4800'],['allowed','ALLOWED','refund.execute:100']]){
  await page.getByRole('button',{name:new RegExp(decision+' '+action.replaceAll('.','\\.'))}).click();
  const detail=page.locator('.receipt-detail');const body=await detail.innerText();const receipt=run.receipts[id==='stopped'?0:1];
  if(!body.includes(action)||!body.includes(decision)||!body.includes(receipt.signature.value.slice(0,48)))throw Error('Wrong receipt');
  await detail.screenshot({path:resolve(root,`source/receipt-${id}-detail.png`)});
  await page.locator('.drawer').screenshot({path:resolve(root,`source/receipt-${id}-full-ui.png`)});
  const reason=detail.locator('.row').filter({hasText:'Reasons'});await reason.screenshot({path:resolve(root,`source/receipt-${id}-reason.png`)});
  captures.push({id,body,receipt_source:`evidence/receipt-${id}.json`,signature_ui_truncates:true,detail_bbox:await detail.boundingBox()});
 }
 await page.locator('.receipt-list').screenshot({path:resolve(root,'source/receipt-list.png')});
 const assets=['proposal-row','receipt-stopped-detail','receipt-stopped-full-ui','receipt-stopped-reason','receipt-allowed-detail','receipt-allowed-full-ui','receipt-allowed-reason','receipt-list'].map(n=>({path:`source/${n}.png`,sha256:createHash('sha256').update(readFileSync(resolve(root,`source/${n}.png`))).digest('hex')}));
 if(errors.length)throw Error(JSON.stringify(errors));
 writeFileSync(resolve(root,'evidence/UI-CAPTURE.json'),JSON.stringify({classification:'REAL CAPTURE / recorded-test replay',method:'Original EventFeed and ReceiptsPanel components. Exact frozen real rerun events and public receipt projection replayed read-only. No new decisions, fabricated data or live latency claim.',presentation:'Capture-only CSS font scaling and framing. Product source untouched; real values unchanged.',component_sources:['frontend/src/components/Panels.tsx','frontend/src/styles.css','backend/server.py:_public_receipt'],proposalText:await proposal.innerText(),captures,projection,assets,pageErrors:errors},null,2)+'\n');
 console.log('REAL UI CAPTURE PASS: original components; frozen verified pair; zero page exceptions.');
}finally{await browser.close();await server.close()}
