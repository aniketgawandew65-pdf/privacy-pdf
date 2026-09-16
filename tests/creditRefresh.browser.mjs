/**
 * Isolated browser regression suite; no project dependency or app UI changes.
 * Install Playwright separately, including its WebKit browser, then run:
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/creditRefresh.browser.mjs
 * Optional CHROME_EXECUTABLE overrides the Chromium executable.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { PDFDocument } from 'pdf-lib';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseline = process.env.CREDIT_USAGE_SOURCE ? await fs.readFile(process.env.CREDIT_USAGE_SOURCE, 'utf8') : null;
const html = `<!doctype html><title>Credit persistence regression</title>
<button id="use">Record completed task</button><output id="credits">Loading</output>
<script type="module">
import {getDailyUsage,recordActionExecution,checkActionAllowed} from '/src/utils/usageTracker.ts';
const draw=()=>{const s=getDailyUsage();document.querySelector('#credits').textContent=s.remaining+'/'+s.max;};
window.usage={getDailyUsage,recordActionExecution,checkActionAllowed};
document.querySelector('#use').onclick=()=>{if(checkActionAllowed().allowed)recordActionExecution();draw();};draw();
</script>`;
const server = await createServer({
  server: {host:'127.0.0.1',port:5187,strictPort:true},
  plugins: [{ name:'credit-test-fixture',
    enforce:'pre',
    transform(code,id) { if(baseline && id.endsWith('/src/utils/usageTracker.ts'))return baseline; },
    configureServer(vite) {vite.middlewares.use((req,res,next)=>{
      if(req.url?.split('?')[0]!=='/__credit_test')return next();
      res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');res.end(html);
    });},
  }],
});
const base='http://127.0.0.1:5187';
const profiles=[];
let tests=0;
async function expectCounter(page,count) {
  await page.waitForFunction(expected=>document.querySelector('#credits')?.textContent===expected,`${count}/4`,{timeout:15000});
}
async function hardReload(page,context,engine) {
  if(engine==='chromium') {
    const cdp=await context.newCDPSession(page);
    await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Page.reload',{ignoreCache:true});
    await page.waitForLoadState('load');await cdp.detach();
  } else {
    // Playwright routing disables the HTTP cache for WebKit. Reload destroys the
    // document and all module memory, while preserving the private session.
    const bypass=route=>route.continue();
    await context.route('**/*',bypass);await page.reload();await context.unroute('**/*',bypass);
  }
}
async function exercise(context,engine,label,mode='ok') {
  console.log(`RUN ${label} [${mode}]`);
  context.setDefaultTimeout(30000);
  const page=await context.newPage();
  page.on('pageerror',error=>console.log('PAGE ERROR',error.message));
  if(mode!=='ok')await page.addInitScript(mode=>{
    if(mode==='denied')Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Restricted storage','SecurityError');}});
    else {const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){
      if(this===window.localStorage)throw new DOMException('No local quota','QuotaExceededError');return set.call(this,key,value);
    };}
  },mode);
  await page.goto(base+'/__credit_test');await expectCounter(page,4);
  for(let remaining=3;remaining>=0;remaining--) {
    await page.locator('#use').click();await expectCounter(page,remaining);
    await page.reload();await expectCounter(page,remaining);
    await hardReload(page,context,engine);await expectCounter(page,remaining);
    console.log(`  retained ${remaining}/4 after both reloads`);
  }
  assert.equal(await page.evaluate(()=>window.usage.checkActionAllowed().allowed),false);
  await page.locator('#use').click();await expectCounter(page,0);
  // Check the real app's existing counter after full route/app initialization.
  await page.goto(base+'/compress-pdf');
  await page.getByText('0 of 4 remaining',{exact:true}).waitFor();
  await page.reload();await page.getByText('0 of 4 remaining',{exact:true}).waitFor();
  await hardReload(page,context,engine);await page.getByText('0 of 4 remaining',{exact:true}).waitFor();
  console.log(`PASS ${label} [${mode}]: all decrements, reload, cache-bypassing reload, zero-credit gate and real app counter`);tests++;
}
async function compression(context,label) {
  const pdf=await PDFDocument.create();pdf.addPage().drawText('Synthetic credit persistence test');
  const page=await context.newPage();await page.goto(base+'/compress-pdf');
  await page.getByText('4 of 4 remaining',{exact:true}).waitFor();
  await page.locator('input[type=file]').setInputFiles({name:'credit-fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.getByRole('button',{name:'Compress PDF',exact:true}).click();
  await page.getByText('Compression Complete',{exact:true}).waitFor({timeout:120000});
  await page.getByText('3 of 4 remaining',{exact:true}).waitFor();
  await page.reload();await page.getByText('3 of 4 remaining',{exact:true}).waitFor();
  console.log(`PASS ${label}: real successful compression consumes one credit and reload retains 3/4`);tests++;
}
await server.listen();
console.log('Test server ready');
try {
  for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
    const executablePath=engine==='chromium'?(process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'):undefined;
    console.log(`Launching ${engine}`);
    const browser=await type.launch({headless:true,executablePath});
    try {
      for(const mobile of [false,true])for(const mode of ['ok','quota','denied']) {
        const context=await browser.newContext(mobile?{isMobile:true,hasTouch:true,viewport:{width:390,height:844}}:{});
        try {await exercise(context,engine,`${engine} private ${mobile?'mobile':'desktop'}`,mode);} finally {await context.close();}
      }
      const context=await browser.newContext();
      try {await compression(context,`${engine} private`);}finally{await context.close();}
    } finally {await browser.close();}
    const profile=await fs.mkdtemp(path.join(os.tmpdir(),'credit-normal-'));profiles.push(profile);
    let normal=await type.launchPersistentContext(profile,{headless:true,executablePath});
    try {await exercise(normal,engine,`${engine} normal persistent`);}finally{await normal.close();}
    normal=await type.launchPersistentContext(profile,{headless:true,executablePath});
    try {
      const page=await normal.newPage();await page.goto(base+'/__credit_test');await expectCounter(page,0);
      console.log(`PASS ${engine} normal browser restart retains 0/4`);tests++;
    } finally {await normal.close();}
  }
  console.log(`ALL ${tests} BROWSER SCENARIOS PASSED`);
} finally {
  await server.close();
  for(const profile of profiles)await fs.rm(profile,{recursive:true,force:true});
}
