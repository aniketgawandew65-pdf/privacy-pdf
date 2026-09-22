import assert from 'node:assert/strict';
import path from 'node:path';
const {chromium,devices}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PREVIEW_URL || 'http://127.0.0.1:5194';
const root=path.resolve(process.env.WORD_QA_DIR || 'node_modules/.cache/pdf-to-word-qa');
const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();const uploads=[];
 // Disable the existing analytics bootstrap, so this checks document processing traffic.
 await page.route('**/gtag/js?*',route=>route.abort());
 page.on('request',r=>{if(r.method()!=='GET'&&r.method()!=='HEAD')uploads.push({path:new URL(r.url()).pathname, type:r.headers()['content-type'], bytes:r.postDataBuffer()?.length || 0})});
 await page.goto(base+'/pdf-to-word');
 const usage=()=>page.evaluate(async()=> (await import('/src/utils/usageTracker.ts')).getDailyUsage().anonymousRemaining);
 assert.equal(await usage(),2);
 await page.locator('#word-upload').setInputFiles(path.join(root,'inputs','no-text.pdf'));
 assert.equal(await usage(),2);
 await page.getByRole('button',{name:'Convert to Word',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'no extractable text'}).waitFor();assert.equal(await usage(),2);
 await page.getByRole('button',{name:'Remove file'}).click();
 // Hold reconstruction at its worker boundary so cancellation does not race
 // a tiny fixture's successful completion on a fast machine.
 let releaseWorker; const workerGate=new Promise(resolve=>{releaseWorker=resolve});
 const workerRoute=async route=>{await workerGate;await route.continue().catch(()=>{})};
 await page.route('**/reconstruct.worker.ts*',workerRoute);
 await page.locator('#word-upload').setInputFiles(path.join(root,'inputs','mixed-page-sizes.pdf'));
 await page.getByRole('button',{name:'Convert to Word',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Creating editable Word document'}).waitFor({timeout:90000});
 await page.getByRole('button',{name:'Cancel conversion'}).click();
 releaseWorker();await page.unroute('**/reconstruct.worker.ts*',workerRoute);
 await page.getByRole('status').filter({hasText:'cancelled'}).waitFor();assert.equal(await usage(),2);
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'Remove file'}).click();
  await page.locator('#word-upload').setInputFiles(path.join(root,'inputs','invoice.pdf'));
  await page.getByRole('button',{name:'Convert to Word',exact:true}).click();
  const link=page.getByRole('link',{name:'Download Word document'});await link.waitFor({timeout:90000});
  assert.equal(await usage(),1-i);
  const download=page.waitForEvent('download');await link.click();await download;assert.equal(await usage(),1-i);
 }
 await page.getByRole('button',{name:'Remove file'}).click();
 await page.locator('#word-upload').setInputFiles(path.join(root,'inputs','invoice.pdf'));
 await page.getByRole('button',{name:'Convert to Word',exact:true}).click();
 await page.getByRole('alert').waitFor();assert.equal(await usage(),0);
 assert.equal(uploads.length,0,'conversion must not upload data');
 console.log('UI: selection/failure/cancellation/download do not charge; success charges once; zero credits blocks; no uploads');
 await context.close();
 for(const name of ['iPhone 13','Pixel 7']){
  const ctx=await browser.newContext({...devices[name]});const p=await ctx.newPage();await p.goto(base+'/pdf-to-word');
  await p.locator('#word-upload').waitFor({state:'attached'});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const rejected=await p.evaluate(async()=>{
   const {openPdf}=await import('/src/utils/pdfToWord/extract.ts');const f=new File(['%PDF-'],'large.pdf');Object.defineProperty(f,'size',{value:151*1024*1024});
   try{await openPdf(f,new AbortController().signal);return false}catch(e){return /150 MB/.test(e.message)}
  });assert.ok(rejected);await ctx.close();
 }
 console.log('Emulated phone viewports: no overflow; shared 150 MB safety gate retained (not physical device testing)');
}finally{await browser.close()}
