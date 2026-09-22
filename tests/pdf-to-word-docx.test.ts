import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { makeDocx } from '../src/utils/pdfToWord/docx.ts';
import type { PageModel, Span } from '../src/utils/pdfToWord/model.ts';

const span = (text: string, x: number, y: number): Span => ({ text, x, y, width: 40, size: 10, font: 'Helvetica', bold: false, italic: false, color: '000000' });

test('header whitespace cannot move a real editable table away from page coordinates', async () => {
  const page: PageModel = {
    number: 1, width: 612, height: 792, pictures: [], warnings: [],
    spans: [span('Account', 40, 60), span('Date', 44, 110), span('Amount', 144, 110), span('First', 44, 145), span('Second', 144, 145), span('Footer', 40, 750)],
    rules: [
      ...[96, 120, 160].map((y) => ({ x1: 40, x2: 240, y1: y, y2: y, width: 0.5, color: '000000' })),
      ...[40, 140, 240].map((x) => ({ x1: x, x2: x, y1: 96, y2: 160, width: 0.5, color: '000000' })),
    ],
  };
  const { bytes } = await makeDocx([page, { ...page, number: 2 }]);
  const zip = unzipSync(new Uint8Array(bytes));
  const xml = strFromU8(zip['word/document.xml']);
  const positions = [...xml.matchAll(/<w:tblpPr\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(positions.length, 2);
  for (const position of positions) {
    assert.match(position, /w:horzAnchor="page"/);
    assert.match(position, /w:vertAnchor="page"/);
    assert.match(position, /w:tblpX="800"/);
    assert.match(position, /w:tblpY="1920"/);
  }
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 2);
  assert.equal((xml.match(/<w:sectPr>/g) || []).length, 2);
  assert.match(xml, /<w:gridCol w:w="2000"/);
  assert.match(xml, /<w:trHeight[^>]*w:hRule="exact"/);
  assert.match(xml, /w:w="12240" w:h="15840"/);
  for (const text of ['Account', 'Date', 'Amount', 'First', 'Second', 'Footer']) {
    assert.equal((xml.match(new RegExp(`>${text}</w:t>`, 'g')) || []).length, 2);
  }
  assert.doesNotMatch(xml, /documentProtection/);
  assert.match(xml, /w:ascii="Arial"/);
});

test('a page-edge table retains editable cells and source geometry in its own page container', async () => {
  const page: PageModel = {
    number: 1, width: 612, height: 792, pictures: [], warnings: [],
    spans: [span('Heading',40,50), ...[718,740,762,784].flatMap((y,n)=>[span(`Row${n}`,44,y),span(`REF-000${n}`,144,y)])],
    rules: [
      ...[704,726,748,770,792].map(y=>({x1:40,x2:240,y1:y,y2:y})),
      ...[40,140,240].map(x=>({x1:x,x2:x,y1:704,y2:792})),
    ],
  };
  const {bytes}=await makeDocx([page,{...page,number:2}]);
  const xml=strFromU8(unzipSync(new Uint8Array(bytes))['word/document.xml']);
  assert.doesNotMatch(xml,/<undefined>|<w:tblpPr/);
  assert.equal((xml.match(/<w:tbl>/g)||[]).length,2);
  assert.equal((xml.match(/<w:tc>/g)||[]).length,16);
  assert.equal((xml.match(/<w:sectPr>/g)||[]).length,2);
  assert.equal((xml.match(/<wp:posOffset>8940800<\/wp:posOffset>/g)||[]).length,2);
  for(let n=0;n<4;n++)assert.equal((xml.match(new RegExp(`>REF-000${n}</w:t>`,'g'))||[]).length,2);
  assert.doesNotMatch(xml,/documentProtection|<pic:pic/);
});


test('hybrid statement records render as one native editable Word table instead of overlapping frames', async()=>{
  const xs=[40,90,170,390,470,540], ys=[90,120,165,210,255,300];
  const spans=[
    span('S No.',44,106),span('Date',94,106),span('Remarks',174,106),span('Withdrawal',394,106),span('Balance',474,106),
    ...Array.from({length:4},(_,r)=>{
      const top=138+r*45;
      return [
        span(String(r+1),44,top),span('24.08.202'+r,94,top),
        span('Merchant '+(r+1),174,top),span('UPI/reference/'+(r+1)+'/long narrative',174,top+11),
        span(String((r+1)*20)+'.00',404,top),span(String(850-r*20)+'.75',484,top),
      ];
    }).flat(),
  ];
  const rules=[
    ...ys.flatMap(y=>xs.slice(0,-1).map((x,i)=>({x1:x,x2:xs[i+1],y1:y,y2:y,width:.5,color:'BBBBBB'}))),
    ...xs.map(x=>({x1:x,x2:x,y1:90,y2:120,width:.75,color:'888888'})),
  ];
  const {bytes}=await makeDocx([{number:1,width:595,height:842,spans,rules,pictures:[],warnings:[]}]);
  const xml=strFromU8(unzipSync(new Uint8Array(bytes))['word/document.xml']);
  assert.equal((xml.match(/<w:tbl>/g)||[]).length,1);
  assert.equal((xml.match(/<w:framePr/g)||[]).length,0);
  for(const text of ['Merchant 1','UPI/reference/1/long narrative','20.00','850.75'])
    assert.equal((xml.match(new RegExp('>'+text.replace(/[.*+?^$()|[\\]\\]/g,'\\test('diagonal watermark retains editable escaped text, ink bounds and source transparency', async()=>{')+'<\\/w:t>','g'))||[]).length,1);
});

test('diagonal watermark retains editable escaped text, ink bounds and source transparency', async()=>{
  const diagonal={...span('CONFIDENTIAL & <sample>',-50,400),width:650,size:50,rotation:323,opacity:.16,ink:{x:0,y:-36,width:650,height:36}};
  const {bytes}=await makeDocx([{number:1,width:612,height:792,spans:[diagonal,span('Account 00123 amount 456.78',40,200)],rules:[],pictures:[],warnings:[]}]);
  const xml=strFromU8(unzipSync(new Uint8Array(bytes))['word/document.xml']);
  assert.equal((xml.match(/string="CONFIDENTIAL &amp; &lt;sample&gt;"/g)||[]).length,1);
  assert.match(xml,/height:36pt;rotation:323;/);
  assert.match(xml,/<v:fill opacity="0.16"/);
  assert.match(xml,/>Account 00123 amount 456.78<\/w:t>/);
  assert.doesNotMatch(xml,/<pic:pic|<w:vanish/);
});
