import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeCorpus } from '../tests/pdf-to-word/corpus.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(process.env.WORD_QA_DIR || 'node_modules/.cache/pdf-to-word-qa');
const base=process.env.PREVIEW_URL || 'http://127.0.0.1:5194';
const manifest=await makeCorpus(path.join(root,'inputs'));
for(const [name,key] of [['statement','STATEMENT_PDF'],['payslip','PAYSLIP_PDF'],['bond','BOND_PDF']]) if(process.env[key]) manifest.push({name,file:process.env[key]});
await mkdir(path.join(root,'outputs'),{recursive:true});
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true});
try {
 const page=await browser.newPage();
 // Corpus conversions are isolated from the development server's hot reload
 // channel (even documentation edits can trigger Tailwind refreshes).
 await page.routeWebSocket('**',()=>{});
 await page.goto(base+'/pdf-to-word');
 await page.locator('#word-upload').waitFor({state:'attached'});
 await page.evaluate(()=>{const e=document.createElement('input');e.type='file';e.id='qa-pdf';document.body.append(e)});
 for(const sample of manifest.filter(s=>!process.env.WORD_SAMPLES || process.env.WORD_SAMPLES.split(',').includes(s.name))){
  await page.locator('#qa-pdf').setInputFiles(sample.file);
  const result=await page.evaluate(async()=>{
   const file=document.getElementById('qa-pdf').files[0];
   const {openPdf,extractPage}=await import('/src/utils/pdfToWord/extract.ts');
   const {detectTables}=await import('/src/utils/pdfToWord/layout.ts');
   const {convertPdfToWord}=await import('/src/utils/pdfToWord/convert.ts');
   const signal=new AbortController().signal;
   const pdf=await openPdf(file,signal);const source=[];
   for(let i=1;i<=pdf.numPages;i++){
    const p=await extractPage(await pdf.getPage(i),signal);
    source.push({...p,pictures:p.pictures.map(({data,...geometry})=>geometry),tables:detectTables(p.rules,p.spans)});
   }
   await pdf.loadingTask.destroy();
   const {blob,report}=await convertPdfToWord(file,signal,()=>{});
   return {bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),report,source};
  });
  await writeFile(path.join(root,'outputs',sample.name+'.docx'),new Uint8Array(result.bytes));
  delete result.bytes;
  await writeFile(path.join(root,'outputs',sample.name+'.json'),JSON.stringify(result));
  console.log(sample.name, result.source.length,'pages', result.report.pages.reduce((n,p)=>n+p.tables,0),'tables');
 }
 // A scan cannot be counted as successful conversion.
 // Isolate the negative case from renderer/browser state left by a long corpus.
 await page.goto(base+'/pdf-to-word');
 await page.locator('#word-upload').waitFor({state:'attached'});
 await page.evaluate(()=>{const e=document.createElement('input');e.type='file';e.id='qa-pdf';document.body.append(e)});
 await page.locator('#qa-pdf').setInputFiles(path.join(root,'inputs','no-text.pdf'));
 const rejected=await page.evaluate(async()=>{
  const {convertPdfToWord}=await import('/src/utils/pdfToWord/convert.ts');
  try{await convertPdfToWord(document.getElementById('qa-pdf').files[0],new AbortController().signal,()=>{});return false}
  catch(e){return /no extractable text|image-only/.test(e.message)}
 });
 if(!rejected) throw Error('Image-only input was not rejected');
 console.log('Image-only rejection passed');
 await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
}finally{await browser.close()}
