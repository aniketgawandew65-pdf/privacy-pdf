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
