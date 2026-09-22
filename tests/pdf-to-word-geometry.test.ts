import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFont, fontProfile, advanceScale } from '../src/utils/pdfToWord/fonts.ts';
import { twips, emu, textBoxGeometry, verticalTextFlow, isObliqueTransform } from '../src/utils/pdfToWord/geometry.ts';
import { detectTables, inferAlignedTables } from '../src/utils/pdfToWord/layout.ts';
import { makeDocx } from '../src/utils/pdfToWord/docx.ts';
import { unzipSync, strFromU8 } from 'fflate';
import type { Span } from '../src/utils/pdfToWord/model.ts';
const s=(text:string,x=40,y=80):Span=>({text,x,y,width:60,size:10,font:'OpaqueSubset',color:'123456',bold:false,italic:false,ascent:.8,descent:.2});

test('font descriptors and generic fallback families classify opaque subset names',()=>{
 assert.equal(classifyFont({name:'ABCDEF+F1',fallbackName:'sans-serif'}),'sans-serif');
 assert.equal(classifyFont({name:'ABCDEF+F2',fallbackName:'serif'}),'serif');
 assert.equal(classifyFont({name:'F3',flags:1}),'monospace');
 assert.equal(classifyFont({name:'F4',flags:2}),'serif');
 for(const family of ['Gotham','Aptos','HelveticaNeue','UnknownSubset']) assert.equal(fontProfile({name:family}).fallback,'Arial');
 assert.equal(fontProfile({name:'SomeMono'}).fallback,'Courier New');
 assert.equal(fontProfile({name:'Symbol'}).fontClass,'symbolic');
 assert.equal(advanceScale(54,60),90);
});
test('signed page coordinates and rotated centres convert without drift',()=>{
 assert.equal(twips(-3.5),-70);assert.equal(emu(72),914400);
 assert.equal(verticalTextFlow(89.99999),'vert');assert.equal(verticalTextFlow(-90),'vert270');
 assert.equal(isObliqueTransform([1,0,.2,-1]),true);
 assert.equal(isObliqueTransform([0,1,1,.2]),true);
 for(const rotation of [0,90,180,270,30]){
  const b=textBoxGeometry({...s('label'),rotation});
  const angle=rotation*Math.PI/180;
  assert.equal(isObliqueTransform([Math.cos(angle),Math.sin(angle),Math.sin(angle),-Math.cos(angle)]),false);
  const centreX=b.x+b.width/2,centreY=b.y+b.height/2;
  assert.ok(Math.abs(centreX-(40+Math.cos(angle)*30-Math.sin(angle)*-3))<1e-8);
  assert.ok(Math.abs(centreY-(80+Math.sin(angle)*30+Math.cos(angle)*-3))<1e-8);
 }
});
test('aligned unruled data becomes a table but two-column prose does not',()=>{
 const cells=Array.from({length:4},(_,r)=>[s(`A${r}`,40,100+r*25),s(`B${r}`,170,100+r*25),s(`C${r}`,300,100+r*25)]).flat();
 const grids=inferAlignedTables(cells);assert.equal(grids.length,1);assert.equal(grids[0].rows.length,4);assert.ok(grids[0].rows.flat().every(c=>!c.borders.top));
 assert.equal(inferAlignedTables(cells.filter((_,i)=>i%3!==2)).length,0);
 assert.equal(inferAlignedTables(cells.slice(0,6)).length,0);
});
test('table border style survives while rounded chrome stays in artwork',async()=>{
 const spans=[s('a',44,110),s('b',144,110),s('c',44,140),s('d',144,140)];
 const rules=[...[96,120,160].map(y=>({x1:40,x2:240,y1:y,y2:y,width:1.5,color:'225588',artwork:y===96})),...[40,140,240].map(x=>({x1:x,x2:x,y1:96,y2:160,width:.75,color:'AA3322'}))];
 const grid=detectTables(rules,spans)[0];assert.equal(grid.rows[0][0].borderStyles?.top?.artwork,true);
 const result=await makeDocx([{number:1,width:612,height:792,spans,rules,pictures:[],warnings:[]}]);
 const xml=strFromU8(unzipSync(new Uint8Array(result.bytes))['word/document.xml']);
 assert.match(xml,/w:color="225588"/);assert.match(xml,/w:sz="12"/);assert.match(xml,/w:color="AA3322"/);
});
test('rotated text stays editable exactly once and carries source rotation',async()=>{
 const spans=[0,90,180,270,30].map((rotation,i)=>({...s(`Label${i}`,80+i*70,300),rotation}));
 const result=await makeDocx([{number:1,width:612,height:792,spans,rules:[],pictures:[],warnings:[]}]);
 const xml=strFromU8(unzipSync(new Uint8Array(result.bytes))['word/document.xml']);
 for(let i=0;i<5;i++)assert.equal((xml.match(new RegExp(`>Label${i}</w:t>`,'g'))||[]).length,1);
 for(const rotation of [180,30])assert.ok(xml.includes(`rot="${rotation*60000}"`));
 assert.equal((xml.match(/<w:txbxContent>/g)||[]).length,4);
 assert.ok(xml.includes('vert="vert"'));assert.ok(xml.includes('vert="vert270"'));
 assert.ok(result.summaries[0].warnings.some(w=>w.includes('180-degree')));
});

test('tight editable cells keep explicit source line breaks and reserve font substitution room',async()=>{
 const spans=[{...s('First source line',43,110),width:94}, {...s('Second source line',43,122),width:94},s('Value',145,110),s('Next row',43,152),s('Value',145,152)];
 const rules=[...[96,140,164].map(y=>({x1:40,x2:240,y1:y,y2:y,width:1,color:'000000'})),...[40,140,240].map(x=>({x1:x,x2:x,y1:96,y2:164,width:1,color:'000000'}))];
 const result=await makeDocx([{number:1,width:612,height:792,spans,rules,pictures:[],warnings:[]}]);
 const xml=strFromU8(unzipSync(new Uint8Array(result.bytes))['word/document.xml']);
 assert.match(xml,/<w:br\/>/);
 assert.equal((xml.match(/>First source line<\/w:t>/g)||[]).length,1);
 const scales=[...xml.matchAll(/<w:w w:val="(\d+)"\/>/g)].map(m=>Number(m[1]));
 assert.ok(scales.some(n=>n<100 && n>80));
 assert.match(xml,/<w:trHeight[^>]*w:hRule="exact"/);
});

test('positioned multiline paragraphs anchor their first baseline using the actual line spacing',async()=>{
 const spans=[{...s('Line one',40,100),size:12},{...s('Line two',40,118),size:12},s('Footer',40,700)];
 const result=await makeDocx([{number:1,width:612,height:792,spans,rules:[],pictures:[],warnings:[]}]);
 const xml=strFromU8(unzipSync(new Uint8Array(result.bytes))['word/document.xml']);
 // First baseline 100pt, line advance 18pt, descent 12pt * 0.2:
 // the paragraph starts at 84.4pt, not at the natural-font top of 90.4pt.
 assert.match(xml,/<w:framePr[^>]*w:y="1688"/);
 assert.match(xml,/<w:spacing[^>]*w:line="360"/);
});
