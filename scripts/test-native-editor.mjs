import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PDFDocument,PDFName,StandardFonts,rgb} from 'pdf-lib';
import {jsPDF} from 'jspdf';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../src/utils/nativeTextEditor.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('require','module','exports',compiled)(require,module,module.exports);
const {openTextEditor}=module.exports;
const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
async function textItems(bytes,page=1){const pdf=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;try{return (await (await pdf.getPage(page)).getTextContent()).items.filter(i=>'str'in i);}finally{await pdf.destroy();}}
const doc=await PDFDocument.create();
const font=await doc.embedFont(StandardFonts.Helvetica);
const page=doc.addPage([500,400]);
page.drawRectangle({x:30,y:160,width:400,height:100,color:rgb(.85,.95,.9)});
page.drawText('Project draft',{x:50,y:220,size:18,font});
page.drawText('Keep this line unchanged.',{x:50,y:180,size:12,font});
const original=await doc.save();
const editor=await openTextEditor(original);
assert.equal(editor.runs.length,2);
const first=editor.runs.find(r=>r.text==='Project draft');assert.ok(first);
const edited=await editor.export([{id:first.id,text:'Project plan'}]);
const reopened=await openTextEditor(edited);
assert.ok(reopened.runs.some(r=>r.text==='Project plan'));
assert.ok(!reopened.runs.some(r=>r.text==='Project draft'));
const before=await textItems(original),after=await textItems(edited);
assert.deepEqual(after.find(i=>i.str==='Keep this line unchanged.').transform,before.find(i=>i.str==='Keep this line unchanged.').transform);
assert.deepEqual(after.find(i=>i.str==='Project plan').transform,before.find(i=>i.str==='Project draft').transform);
await assert.rejects(()=>editor.export([{id:first.id,text:'An extremely long replacement that cannot fit'}]),/wider/);
await assert.rejects(()=>editor.export([{id:first.id,text:'😀'}]),/original font/);
await assert.rejects(()=>editor.export([{id:first.id,text:'a\nb'}]),/single line/);
await assert.rejects(()=>editor.export([{id:'bad',text:'x'}]),/no longer matches/);
assert.ok((await openTextEditor(await editor.export([]))).runs.some(r=>r.text==='Project draft'));

// TJ numeric kerning and subsequent relative text positioning must survive.
const tj=await PDFDocument.create();const tjFont=await tj.embedFont(StandardFonts.Helvetica);const p=tj.addPage([500,400]);
p.node.set(PDFName.of('Resources'),tj.context.obj({Font:{F1:tjFont.ref}}));
p.node.set(PDFName.of('Contents'),tj.context.register(tj.context.flateStream('BT /F1 18 Tf 2 Tc 3 Tw 90 Tz 50 200 Td [(Hello) -80 ( world)] TJ /F1 12 Tf ( next) Tj ET')));
const tjBytes=await tj.save(),tjEditor=await openTextEditor(tjBytes);
const tjEdited=await tjEditor.export([{id:tjEditor.runs[0].id,text:'Hi world'}]);
const tjBefore=await textItems(tjBytes),tjAfter=await textItems(tjEdited);
// A different font size keeps the following text item separate in PDF.js extraction.
assert.ok(tjAfter.map(i=>i.str).join('').includes('Hi world'));
assert.equal((await openTextEditor(tjEdited)).runs[1].text,' next');
assert.ok(tjBefore.length>0);
const followingBefore=tjBefore.find(i=>i.str.replace(/\s/g,'').includes('next')),followingAfter=tjAfter.find(i=>i.str.replace(/\s/g,'').includes('next'));
assert.ok(followingBefore&&followingAfter);
followingBefore.transform.forEach((value,i)=>assert.ok(Math.abs(value-followingAfter.transform[i])<0.0001,'Following text position changed'));

// Identity-H font map: subset glyphs can be reused, missing glyphs cannot be invented.
const cid=await PDFDocument.create();const cp=cid.addPage([300,300]);
const map=cid.context.register(cid.context.flateStream('begincmap 2 beginbfchar <0001> <0041> <0002> <0042> endbfchar endcmap'));
const descendant=cid.context.register(cid.context.obj({Type:'Font',Subtype:'CIDFontType2',BaseFont:'Subset',CIDSystemInfo:{Registry:cid.context.obj('Adobe'),Ordering:cid.context.obj('Identity'),Supplement:0},DW:600}));
const cidFont=cid.context.register(cid.context.obj({Type:'Font',Subtype:'Type0',BaseFont:'Subset',Encoding:'Identity-H',DescendantFonts:[descendant],ToUnicode:map}));
cp.node.set(PDFName.of('Resources'),cid.context.obj({Font:{F1:cidFont}}));cp.node.set(PDFName.of('Contents'),cid.context.register(cid.context.flateStream('BT /F1 12 Tf 50 200 Td <00010002> Tj ET')));
const ce=await openTextEditor(await cid.save());assert.equal(ce.runs[0].text,'AB');
assert.equal((await openTextEditor(await ce.export([{id:ce.runs[0].id,text:'BA'}]))).runs[0].text,'BA');
await assert.rejects(()=>ce.export([{id:ce.runs[0].id,text:'C'}]),/original font/);

const scan=await PDFDocument.create();scan.addPage();assert.equal((await openTextEditor(await scan.save())).runs.length,0);
// Optional local font fixture exercises a real embedded TrueType subset from another producer.
if(process.argv[2]) {
  const embedded=new jsPDF();
  embedded.addFileToVFS('fixture.ttf',(await readFile(process.argv[2])).toString('base64'));
  embedded.addFont('fixture.ttf','Fixture','normal');embedded.setFont('Fixture');embedded.setFontSize(18);
  embedded.text('Project draft and plan',20,30);embedded.text('Keep this line unchanged.',20,45);
  const eb=new Uint8Array(embedded.output('arraybuffer')),ee=await openTextEditor(eb);
  const er=ee.runs.find(r=>r.text==='Project draft and plan');assert.ok(er,'Embedded font text not detected');
  const result=await ee.export([{id:er.id,text:'Project plan'}]);
  const bi=await textItems(eb),ai=await textItems(result);
  assert.deepEqual(ai.find(i=>i.str==='Project plan').transform,bi.find(i=>i.str==='Project draft and plan').transform);
  assert.deepEqual(ai.find(i=>i.str==='Keep this line unchanged.').transform,bi.find(i=>i.str==='Keep this line unchanged.').transform);
  await writeFile('/tmp/1into1-embedded-font-original.pdf',eb);await writeFile('/tmp/1into1-embedded-font-edited.pdf',result);
  console.log('PASS: real embedded TrueType subset from jsPDF retains text and neighbouring positions.');
}
await writeFile('/tmp/1into1-text-editor-original.pdf',original);
await writeFile('/tmp/1into1-text-editor-edited.pdf',edited);
console.log('PASS: native replacement, original font/position, unchanged neighbouring text, TJ parsing, Identity-H subset reuse, missing glyph/width/newline rejection, undo source, and no-text detection.');
