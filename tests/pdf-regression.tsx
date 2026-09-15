import { RedactPdf } from '../src/components/RedactPdf';
import { MemoryRouter } from 'react-router-dom';
import { restoreToolWorkspaceState } from '../src/utils/localWorkspace';
import { scanRecordKey } from '../src/utils/piiScanStore';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { redactPDFToFile } from '../src/utils/streamingRedact';
import { loadPdfJsFromBlob } from '../src/utils/pdfjs';
import { verifyFinishedPdf } from '../src/utils/pdfSafetyVerifier';
import { localContentId } from '../src/utils/localProcessing';
import { readScanRecord, writeScanRecord } from '../src/utils/piiScanStore';
import { PrivatePiiRedactor } from '../src/components/PrivatePiiRedactor';
import { createRoot } from 'react-dom/client';
import React from 'react';

const results = document.querySelector('#results')!;
const log = (text: string) => results.textContent += '\n' + text;
function assert(value: unknown, message: string) { if (!value) throw new Error(message); log('PASS ' + message); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor(check: () => Promise<boolean> | boolean, label: string) {
  const start = Date.now();
  while (!await check()) { if (Date.now() - start > 180000) throw new Error('Timeout: ' + label); await sleep(100); }
}
const rect = { x: 0.1, y: 0.25, width: 0.6, height: 0.25 };
async function fixture() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 12; i++) {
    const page = doc.addPage([595.3, 842.7]);
    if (i === 1) page.setRotation(degrees(90));
    if (i === 2) page.setCropBox(20, 30, 500.3, 770.7);
    page.drawRectangle({ x: 0, y: 790, width: 70, height: 52, color: rgb(1, 0, 0) });
    page.drawRectangle({ x: 0, y: 0, width: 70, height: 52, color: rgb(0, 0, 1) });
    page.drawText('SYNTHETIC SECRET: alice@example.test', { x: 60, y: 550, size: 15 });
  }
  const field = doc.getForm().createTextField('secret-form');
  field.setText('SYNTHETIC FORM SECRET');
  field.addToPage(doc.getPage(0), { x: 80, y: 500, width: 280, height: 25 });
  await doc.attach(new Uint8Array([1, 2, 3]), 'synthetic-secret.bin');
  return new File([await doc.save() as BlobPart], `regression-${Date.now()}.pdf`, { type: 'application/pdf' });
}
async function testStreaming() {
  const file = await fixture();
  const sourceText = await file.text();
  const sourceXref = /startxref\s+(\d+)/.exec(sourceText)![1];
  let readBytes = 0;
  class TracedFile extends File {
    arrayBuffer(): Promise<ArrayBuffer> { throw new Error('Full file read is forbidden by this test'); }
    slice(start?: number, end?: number, type?: string) {
      const part = super.slice(start, end, type); readBytes += part.size; return part;
    }
  }
  const large = new TracedFile([file, '\n%', new Uint8Array(21 * 1024 * 1024).fill(32), `\nstartxref\n${sourceXref}\n%%EOF`], 'range-fixture.pdf');
  const rangeDoc = await loadPdfJsFromBlob(large);
  assert(rangeDoc.pdf.numPages === 12 && readBytes < large.size / 4, 'Large local source opens using requested ranges, without a full input read');
  await rangeDoc.dispose();
  const payload = Array.from({ length: 12 }, (_, pageIndex) => ({ pageIndex, rects: [rect] }));
  let interrupted = false;
  try { await redactPDFToFile(file, payload, current => { if (current === 3) throw new Error('Simulated interruption'); }); }
  catch (e) { interrupted = String(e).includes('Simulated interruption'); }
  assert(interrupted, 'Interrupted after two durable pages');
  const checkpoints = Object.keys(localStorage).filter(k => k.startsWith('oneinto1-redact-checkpoint-'));
  const key = checkpoints.find(k => JSON.parse(localStorage.getItem(k)!).outputName.includes(file.name.slice(0, -4)))!;
  const cp = JSON.parse(localStorage.getItem(key)!);
  assert(cp.nextPageIndex === 2, 'Checkpoint commits complete pages only');
  // Append junk after committed prefix to simulate death mid-page.
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(cp.directoryName);
  const handle: any = await dir.getFileHandle(cp.outputName);
  const w = await handle.createWritable({ keepExistingData: true });
  await w.seek(cp.byteOffset); await w.write('UNCOMMITTED-PRIVATE-TAIL'); await w.close();
  const progress: number[] = [];
  const output = await redactPDFToFile(file, payload, page => progress.push(page));
  assert(progress[0] === 3 && progress.length === 10, 'Resume skips completed pages');
  // This test reads the SMALL generated output; production does not do this.
  const bytes = new Uint8Array(await output.arrayBuffer());
  const raw = Array.from(bytes, x => String.fromCharCode(x)).join('');
  assert(!raw.includes('UNCOMMITTED-PRIVATE-TAIL'), 'Resume truncates uncommitted tail');
  assert(!raw.includes('SYNTHETIC SECRET') && !raw.includes('/EmbeddedFiles') && !raw.includes('/AcroForm'), 'Source streams, attachments and form objects are not copied');
  const xref = Number(/startxref\s+(\d+)/.exec(raw)![1]);
  assert(raw.slice(xref, xref + 4) === 'xref', 'startxref byte offset is valid');
  const entries = raw.slice(xref).split('\n');
  const count = Number(entries[1].split(' ')[1]);
  for (let id = 1; id < count; id++) {
    const offset = Number(entries[id + 2].slice(0, 10));
    if (!raw.slice(offset).startsWith(`${id} 0 obj`)) throw new Error(`Bad xref entry ${id}`);
  }
  assert(true, 'Every xref entry points to its object');
  const parsed = await PDFDocument.load(bytes);
  assert(parsed.getPageCount() === 12, 'Independent pdf-lib parser accepts page tree');
  const loaded = await loadPdfJsFromBlob(output);
  try {
    assert(loaded.pdf.numPages === 12, 'PDF.js accepts reconstructed PDF');
    const page = await loaded.pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const top = ctx.getImageData(20, 20, 1, 1).data;
    const bottom = ctx.getImageData(20, 820, 1, 1).data;
    assert(top[0] > 180 && top[2] < 80 && bottom[2] > 180 && bottom[0] < 80, 'JPEG strips preserve vertical orientation');
    // White strip boundary away from marks must stay white.
    const seam = ctx.getImageData(550, 460, 1, 6).data;
    assert([...seam].every(v => v > 230), 'No visible seam in uniform fixture region');
    canvas.width = canvas.height = 1;
  } finally { await loaded.dispose(); }
  const targets = payload.map(entry => ({ id: `${entry.pageIndex}`, value: 'synthetic', page: entry.pageIndex + 1, region: rect }));
  assert((await verifyFinishedPdf(output, targets)).passed, 'Every burned rectangle passes independent verification, including rotated/cropped pages');
  assert(!(await verifyFinishedPdf(output, [{ value: 'x', page: 99, region: rect }])).passed, 'Verifier rejects out-of-range target');
  assert(!(await verifyFinishedPdf(output, [{ value: 'x', page: 1, region: { ...rect, x: NaN } }])).passed, 'Verifier rejects NaN geometry');
  assert(!(await verifyFinishedPdf(output, [{ value: 'x', page: 1, region: rect }], undefined, { flattenedPages: new Set([2]) })).passed, 'Verifier rejects targets outside verified page set');
  assert(!(await verifyFinishedPdf(output, [{ value: 'x', page: 1, region: { x: 0.8, y: 0.1, width: 0.1, height: 0.1 } }])).passed, 'Verifier rejects missing blackout');
  assert(!(await verifyFinishedPdf(file, targets)).passed, 'Original selectable text/forms/attachments fail verification');
  const overlayDoc=await PDFDocument.create();const overlayPage=overlayDoc.addPage([300,300]);
  const overlayCanvas=document.createElement('canvas');overlayCanvas.width=overlayCanvas.height=300;
  const overlayContext=overlayCanvas.getContext('2d')!;overlayContext.fillStyle='white';overlayContext.fillRect(0,0,300,300);
  overlayContext.fillStyle='black';overlayContext.font='20px Arial';overlayContext.fillText('SYNTHETIC SECRET',40,120);
  const overlayImage=await overlayDoc.embedPng(overlayCanvas.toDataURL());
  overlayPage.drawImage(overlayImage,{x:0,y:0,width:300,height:300});
  overlayPage.drawRectangle({x:0,y:0,width:300,height:300,color:rgb(0,0,0)});
  overlayCanvas.width=overlayCanvas.height=1;
  assert(!(await verifyFinishedPdf(new Blob([await overlayDoc.save() as BlobPart]),[{value:'secret',page:1,region:rect}])).passed,'Verifier rejects black vector overlay over recoverable source image');

  let reused = 0; await redactPDFToFile(file, payload, () => reused++);
  assert(reused === 0, 'Finished output can refinalize without re-rendering after verification interruption');
  const modified = new File([file, '\n% changed'], file.name, { lastModified: file.lastModified });
  assert(await localContentId(file) !== await localContentId(modified), 'Content identity distinguishes replacement PDFs');
  await writeScanRecord('synthetic-id', 'ocr', 57, { findings: [], words: [['SYNTHETIC', 1, 2, 3, 4]] });
  assert((await readScanRecord<any>('synthetic-id', 'ocr', 57))?.words.length === 1, 'OCR page checkpoint round-trip');
}
async function testScanner() {
  const doc = await PDFDocument.create();
  doc.addPage().drawText('Email: digital@example.test Phone: +1 212 555 0198', { x: 40, y: 500, size: 15 });
  doc.addPage().drawText('abcde fghijk', { x: 40, y: 500, size: 15 });
  const c = document.createElement('canvas'); c.width = 952; c.height = 1347;
  const ctx = c.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0,0,c.width,c.height); ctx.fillStyle = 'black'; ctx.font = '30px Arial';
  ctx.fillText('Email: scanned@example.test', 65, 300); ctx.fillText('Email: boundary@example.test', 65, 1050);
  const image = await doc.embedPng(c.toDataURL('image/png')); c.width=c.height=1;
  const page = doc.addPage([595, 842]); page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  page.drawText('This digital header must not hide the scanned body', { x: 30, y: 810, size: 10 });
  const file = new File([await doc.save() as BlobPart], 'scanner-synthetic.pdf', { type: 'application/pdf' });
  const root = createRoot(document.querySelector('#scanner')!);
  root.render(<PrivatePiiRedactor />);
  await waitFor(() => !!document.querySelector('#scanner input[type=file]'), 'scanner mount');
  await sleep(500);
  const input = document.querySelector('#scanner input[type=file]') as HTMLInputElement;
  const dt = new DataTransfer(); dt.items.add(file); input.files=dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  const id = await localContentId(file);
  await waitFor(async () => !!await readScanRecord(id, 'complete'), 'actual OCR scanner completion');
  const sparse = await readScanRecord<any>(id,'native',2);
  const mixed = await readScanRecord<any>(id,'native',3);
  const ocr = await readScanRecord<any>(id,'ocr',3);
  assert(sparse.needsOcr && sparse.scale === 2, 'Former full-page fallback now uses tiled 2x route');
  assert(
    mixed.needsOcr &&
      Array.isArray(mixed.ocrRegions) &&
      mixed.ocrRegions.length > 0,
    'Readable header does not suppress image-body OCR'
  );
  assert(ocr.words.length > 0 && ocr.findings.some((f:any) => f.value.includes('scanned@')), 'Real local Tesseract produces cached geometry and email findings');
  assert(ocr.findings.some((f:any) => f.value.includes('boundary@')), 'PII near overlapping tile boundary survives');
  const elapsed = ocr.elapsedMs;
  root.unmount();
  const root2 = createRoot(document.querySelector('#scanner')!); root2.render(<PrivatePiiRedactor />);
  await sleep(500);
  assert((await readScanRecord<any>(id,'ocr',3)).elapsedMs === elapsed, 'Unmount/remount retains completed OCR records');
  root2.unmount();
  // Model a reload with only the first OCR page committed.
  const second = await readScanRecord<any>(id,'ocr',2);
  await new Promise<void>((resolve,reject) => {
    const req=indexedDB.open('oneinto1-pii-scan',1);
    req.onsuccess=()=>{const db=req.result;const tx=db.transaction('pages','readwrite');
      tx.objectStore('pages').delete(scanRecordKey(id,'complete'));
      tx.objectStore('pages').delete(scanRecordKey(id,'ocr',3));
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };req.onerror=()=>reject(req.error);
  });
  const root3=createRoot(document.querySelector('#scanner')!);root3.render(<PrivatePiiRedactor />);
  await waitFor(()=> [...document.querySelectorAll('#scanner button')].some(b=>b.textContent?.includes('Resume scan') && !(b as HTMLButtonElement).disabled),'resume button');
  ([...document.querySelectorAll('#scanner button')].find(b=>b.textContent?.includes('Resume scan')) as HTMLButtonElement).click();
  await waitFor(async()=>!!await readScanRecord(id,'complete'),'resumed scan complete');
  assert((await readScanRecord<any>(id,'ocr',2)).elapsedMs===second.elapsedMs,'Resume reuses completed OCR page without recognizing it again');
  assert((await readScanRecord<any>(id,'ocr',3)).findings.length>0,'Resume completes missing OCR page');
  root3.unmount();
}
async function testManual() {
  const file = await fixture();
  const initialRedactions = Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,[rect]]));
  const NativeWorker=window.Worker;
  let pdfWorkers=0,maxPdfWorkers=0;
  class TrackedWorker extends NativeWorker {
    private tracked: boolean;
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url,options);this.tracked=String(url).includes('pdf.worker');
      if(this.tracked){pdfWorkers++;maxPdfWorkers=Math.max(maxPdfWorkers,pdfWorkers);}
    }
    terminate(){if(this.tracked){pdfWorkers--;this.tracked=false;}super.terminate();}
  }
  window.Worker=TrackedWorker;
  let root=createRoot(document.querySelector('#scanner')!);
  const mount=(withGeometry:boolean)=>root.render(<MemoryRouter initialEntries={[{pathname:'/',state:withGeometry?{fromAutoRedactor:true,initialRedactions}:null}]}><RedactPdf file={file} onFileChange={()=>{}} /></MemoryRouter>);
  try {
    mount(true);
    await waitFor(()=>!!restoreToolWorkspaceState<any>('manual-redaction-geometry')?.pageRedactions?.[12],'manual geometry persisted');
    await waitFor(()=>[...document.querySelectorAll('#scanner button')].some(b=>b.textContent?.includes('Burn Blackouts') && !(b as HTMLButtonElement).disabled),'manual preview ready');
    root.unmount();await sleep(100);root=createRoot(document.querySelector('#scanner')!);mount(false);
    await waitFor(()=>document.querySelector('#scanner')!.textContent!.includes('12 blackouts placed'),'restored manual geometry');
    assert(true,'Manual boxes survive unmount/remount without route-state geometry');
    await waitFor(()=>[...document.querySelectorAll('#scanner button')].some(b=>b.textContent?.includes('Burn Blackouts') && !(b as HTMLButtonElement).disabled),'restored preview ready');
    ([...document.querySelectorAll('#scanner button')].find(b=>b.textContent?.includes('Burn Blackouts')) as HTMLButtonElement).click();
    await waitFor(()=>!!document.querySelector('#scanner a[download]'),'verified manual download');
    assert(document.querySelector('#scanner')!.textContent!.includes('All applied blackouts passed final verification'),'Manual Burn uses final verifier before offering download');
    assert(maxPdfWorkers<=1,'Manual preview and processing PDF.js workers never overlap');
  } finally {root.unmount();window.Worker=NativeWorker;}
}
document.querySelector('#run')!.addEventListener('click', async () => {
  results.textContent = 'Running…';
  try { await testStreaming(); await testScanner(); await testManual(); log('ALL TESTS PASSED'); }
  catch (error:any) { log('FAIL ' + error.stack); }
});
