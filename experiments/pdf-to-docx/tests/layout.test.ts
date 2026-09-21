import test from "node:test";
import assert from "node:assert/strict";
import {
  detectTables,
  linesOf,
  paragraphsOf,
  lineText,
  flowRegions,
} from "../src/layout.ts";
import type { Rule, Span } from "../src/model.ts";
const h = (y: number, x1 = 0, x2 = 200): Rule => ({
  x1,
  y1: y,
  x2,
  y2: y,
  width: 0.5,
  color: "000000",
});
test("unruled transaction rows keep dates, descriptions and amounts together", () => {
  const spans = [s("Date", 4, 14), s("Details", 64, 14), s("Amount", 144, 14)];
  for (let i = 0; i < 3; i++) {
    const y = 34 + i * 32;
    spans.push(
      s(`D${i}`, 4, y),
      s(`Item${i}`, 64, y),
      s(`More${i}`, 64, y + 12),
      s(`${i}.00`, 144, y),
    );
  }
  const g = detectTables(
    [
      h(0),
      h(20),
      h(120),
      v(0, 0, 120),
      v(60, 0, 120),
      v(140, 0, 120),
      v(200, 0, 120),
    ],
    spans,
  )[0];
  assert.equal(g.rows.length, 4);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(
      g.rows[i + 1].map((c) => c.spans.map((s) => s.text)),
      [[`D${i}`], [`Item${i}`, `More${i}`], [`${i}.00`]],
    );
    assert.equal(g.rows[i + 1][0].borders.top, i === 0);
  }
});
test("side-by-side address blocks are grouped independently", () => {
  const result = flowRegions(
    [
      s("Left one", 10, 20),
      s("Left two", 10, 32),
      s("Right one", 200, 21),
      s("Right two", 200, 33),
    ],
    300,
  );
  assert.equal(result.columns, true);
  assert.deepEqual(
    result.regions.map((r) => r.spans.map((s) => s.text)),
    [
      ["Left one", "Left two"],
      ["Right one", "Right two"],
    ],
  );
});
const v = (x: number, y1 = 0, y2 = 80): Rule => ({
  x1: x,
  y1,
  x2: x,
  y2,
  width: 0.5,
  color: "000000",
});
const s = (text: string, x: number, y: number, bold = false): Span => ({
  text,
  x,
  y,
  size: 10,
  width: text.length * 5,
  font: "Arial",
  color: "000000",
  bold,
  italic: false,
});
test("ruled table has editable cell assignments and horizontal header merge", () => {
  const g = detectTables(
    [h(0), h(20), h(50), h(80), v(0), v(200), v(100, 20)],
    [
      s("Header", 60, 15),
      s("A", 5, 35),
      s("B", 105, 35),
      s("C", 5, 65),
      s("D", 105, 65),
    ],
  )[0];
  assert.equal(g.rows.length, 3);
  assert.equal(g.rows[0][0].span, 2);
  assert.equal(g.rows[1][1].spans[0].text, "B");
  assert.equal(
    g.rows.flat().reduce((n, c) => n + c.spans.length, 0),
    5,
  );
});
test("missing horizontal boundary creates a rectangular vertical merge", () => {
  const g = detectTables(
    [h(0), h(40, 100), h(80), v(0), v(100), v(200)],
    [s("Merged", 5, 15), s("A", 105, 15), s("B", 105, 60)],
  )[0];
  assert.equal(g.rows[0][0].rowSpan, 2);
  assert.equal(g.rows[1][0].rowSpan, 0);
});
test("isolated underline is not a table", () =>
  assert.equal(
    detectTables([h(20, 20, 150)], [s("Heading", 20, 18)]).length,
    0,
  ));
test("nearby duplicate rules collapse into a single grid boundary", () => {
  const g = detectTables(
    [h(0), h(1), h(40), h(41), h(80), v(0), v(1), v(100), v(101), v(200)],
    [s("A", 10, 20), s("B", 110, 60)],
  )[0];
  assert.equal(g.xs.length, 3);
  assert.equal(g.ys.length, 3);
});
test("paragraph grouping keeps line continuation together and separates headings and lists", () => {
  const lines = linesOf([
    s("Heading", 10, 15, true),
    s("First", 10, 30),
    s("paragraph", 40, 30),
    s("continued", 10, 42),
    s("- list", 10, 70),
  ]);
  assert.equal(lineText(lines[1]), "First paragraph");
  assert.deepEqual(
    paragraphsOf(lines).map((g) => g.length),
    [1, 2, 1],
  );
});
