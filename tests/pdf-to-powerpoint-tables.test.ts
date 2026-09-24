import assert from "node:assert/strict";
import test from "node:test";
import { extractTables } from "../src/utils/pdfToPowerPoint/tables.ts";
import { collectRules, type Rule } from "../src/utils/pdfToPowerPoint/rules.ts";
import { PresentationPackage } from "../src/utils/pdfToPowerPoint/package.ts";
import { unzipSync, strFromU8 } from "fflate";
import type { SlideText } from "../src/utils/pdfToPowerPoint/model.ts";
const ops = {
  save: 1,
  restore: 2,
  transform: 3,
  constructPath: 4,
  stroke: 5,
  closeStroke: 6,
  setLineWidth: 7,
  setStrokeRGBColor: 8,
  setDash: 9,
  setGState: 10,
  clip: 11,
  eoClip: 12,
  paintFormXObjectBegin: 13,
  paintFormXObjectEnd: 14,
  beginGroup: 15,
};
const text = (x: number, y: number, value: string): SlideText => ({
  x,
  y,
  width: 30,
  height: 13,
  text: value,
  font: "Arial",
  size: 10,
  bold: false,
  italic: false,
  color: "000000",
  opacity: 1,
  rotation: 0,
  spacing: 0,
  rtl: false,
});
const rules: Rule[] = [
  ...[10, 110, 210].map((x) => ({ x1: x, x2: x, y1: 20, y2: 80 })),
  ...[20, 50, 80].map((y) => ({ x1: 10, x2: 210, y1: y, y2: y })),
].map((r, i) => ({ ...r, width: 1, color: "000000", operation: i }));
const texts = [
  text(15, 25, "A & B"),
  text(115, 25, "10.25"),
  text(15, 55, "Total"),
  text(115, 55, "10.25"),
];
test("PDF path snapshot honors transform, clipping, dash, restore and atomic curve fallback", () => {
  const path = [0, 0, 0, 1, 100, 0];
  const result = collectRules(
    [3, 1, 11, 4, 2, 4, 1, 9, 4, 2, 4, 4],
    [
      [2, 0, 0, 2, 10, 20],
      [],
      [],
      [5, [new Float32Array(path)]],
      [],
      [5, [new Float32Array(path)]],
      [],
      [[2, 2], 0],
      [5, [path]],
      [],
      [5, [[0, 0, 0, 1, 100, 0, 2, 1, 2, 3, 4, 5, 6]]],
      [5, [[0, 0, 0, 1, 0, 50]]],
    ],
    [1, 0, 0, -1, 0, 200],
    ops,
  );
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    x1: 10,
    y1: 180,
    x2: 210,
    y2: 180,
    width: 2,
    color: "000000",
    operation: 5,
  });
  assert.equal(result[1].y2, 80);
  assert.equal(path.length, 6, "never mutate PDF path data");
});
test("fully ruled cells preserve values and produce native table XML without duplicate text shapes", () => {
  const result = extractTables(rules, texts);
  assert.equal(result.tables.length, 1);
  assert.equal(result.texts.length, 0);
  assert.equal(result.omit.size, 6);
  assert.deepEqual(
    result.tables[0].cells.map((row) => row.map((t) => t?.text)),
    [
      ["A & B", "10.25"],
      ["Total", "10.25"],
    ],
  );
  const chunks: Uint8Array[] = [];
  const pack = new PresentationPackage({ width: 300, height: 200 }, (e, d) => {
    assert.equal(e, null);
    chunks.push(d);
  });
  pack.addPage({
    width: 300,
    height: 200,
    sourcePage: 1,
    texts: result.texts,
    tables: result.tables,
    lines: [],
    links: [],
    image: new Uint8Array([1]),
    imageType: "png",
  });
  pack.finish();
  const xml = strFromU8(
    unzipSync(Buffer.concat(chunks))["ppt/slides/slide1.xml"],
  );
  assert.equal((xml.match(/<a:tbl>/g) || []).length, 1);
  assert.equal((xml.match(/<a:tc>/g) || []).length, 4);
  assert.equal((xml.match(/<a:t /g) || []).length, 4);
  assert.match(xml, /A &amp; B/);
  assert.ok(
    xml.includes(
      'uri="http://schemas.openxmlformats.org/drawingml/2006/table"',
    ),
  );
  assert.match(xml, /<a:tr h="381000">/);
  assert.doesNotMatch(xml, /<p:sp>/);
});
test("ambiguous values, merged borders and shared decoration paths keep positioned text", () => {
  for (const candidate of [
    { rules, texts: [...texts, text(20, 27, "overlap")] },
    { rules, texts: [...texts, text(100, 30, "crosses border")] },
    { rules: rules.filter((_, i) => i !== 4), texts },
    {
      rules: [...rules, { ...rules[0], x1: 300, x2: 300, operation: 0 }],
      texts,
    },
    {
      rules: rules.map((r, i) => (i === 1 ? { ...r, color: "FF0000" } : r)),
      texts,
    },
  ]) {
    const r = extractTables(candidate.rules, candidate.texts);
    assert.equal(r.tables.length, 0);
    assert.equal(r.omit.size, 0);
    assert.deepEqual(r.texts, candidate.texts);
  }
});
test("dense vector paths skip optional table analysis", () => {
  assert.deepEqual(
    collectRules(
      [4],
      [[5, [new Float32Array(20001)]]],
      [1, 0, 0, 1, 0, 0],
      ops,
    ),
    [],
  );
  const partial = { ...rules[0], x1: 60, x2: 60, y1: 20, y2: 50, operation: 9 };
  assert.equal(extractTables([...rules, partial], texts).tables.length, 0);
});
test("empty cells are retained and nearby page text remains a text shape", () => {
  const outside = text(15, 100, "Footnote");
  const r = extractTables(rules, [texts[0], texts[3], outside]);
  assert.equal(r.tables.length, 1);
  assert.equal(r.tables[0].cells[0][1], null);
  assert.deepEqual(r.texts, [outside]);
});
