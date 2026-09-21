import type { Span, Rule, Line, Grid, Cell } from "./model.ts";
const TOL = 2.6;
export function clusters(values: number[], tolerance = TOL): number[] {
  const groups: number[][] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const g = groups.at(-1);
    if (g && v - g[0] <= tolerance) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}
export function linesOf(spans: Span[]): Line[] {
  const lines: Line[] = [];
  for (const s of [...spans].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const l = [...lines]
      .reverse()
      .find((l) => Math.abs(l.y - s.y) < Math.min(2.5, s.size * 0.22));
    if (l) {
      l.spans.push(s);
      l.x = Math.min(l.x, s.x);
      l.right = Math.max(l.right, s.x + s.width);
      l.size = Math.max(l.size, s.size);
    } else
      lines.push({
        spans: [s],
        x: s.x,
        y: s.y,
        right: s.x + s.width,
        size: s.size,
      });
  }
  for (const l of lines) l.spans.sort((a, b) => a.x - b.x);
  return lines;
}
export function lineText(line: Line): string {
  let text = "",
    end = 0;
  for (const s of line.spans) {
    if (
      text &&
      !/\s$/.test(text) &&
      !/^\s/.test(s.text) &&
      s.x - end > s.size * 0.12
    )
      text += " ";
    text += s.text;
    end = s.x + s.width;
  }
  return text;
}
function horizontal(r: Rule) {
  return Math.abs(r.y1 - r.y2) < 1 && Math.abs(r.x2 - r.x1) > 3;
}
function vertical(r: Rule) {
  return Math.abs(r.x1 - r.x2) < 1 && Math.abs(r.y2 - r.y1) > 3;
}
function touches(a: Rule, b: Rule) {
  return (
    Math.min(a.x1, a.x2) <= Math.max(b.x1, b.x2) + TOL &&
    Math.max(a.x1, a.x2) >= Math.min(b.x1, b.x2) - TOL &&
    Math.min(a.y1, a.y2) <= Math.max(b.y1, b.y2) + TOL &&
    Math.max(a.y1, a.y2) >= Math.min(b.y1, b.y2) - TOL
  );
}
function covers(
  rules: Rule[],
  axis: "h" | "v",
  pos: number,
  start: number,
  end: number,
): boolean {
  const ranges = rules
    .filter((r) =>
      axis === "h"
        ? horizontal(r) && Math.abs(r.y1 - pos) <= TOL
        : vertical(r) && Math.abs(r.x1 - pos) <= TOL,
    )
    .map((r) =>
      axis === "h"
        ? [Math.min(r.x1, r.x2), Math.max(r.x1, r.x2)]
        : [Math.min(r.y1, r.y2), Math.max(r.y1, r.y2)],
    )
    .sort((a, b) => a[0] - b[0]);
  let cursor = start;
  for (const [a, b] of ranges) {
    if (a > cursor + TOL) break;
    if (b > cursor) cursor = b;
    if (cursor >= end - TOL) return true;
  }
  return false;
}
/** Infer grids from intersecting vector rules; no labels, templates or file names. */
export function detectTables(rules: Rule[], spans: Span[]): Grid[] {
  const candidates = rules.filter((r) => horizontal(r) || vertical(r));
  if (candidates.length > 3500)
    throw Error("This page has too many drawing rules to analyze safely.");
  const seen = new Set<number>(),
    tables: Grid[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (seen.has(i)) continue;
    const todo = [i],
      group: Rule[] = [];
    seen.add(i);
    while (todo.length) {
      const j = todo.pop()!;
      group.push(candidates[j]);
      for (let k = 0; k < candidates.length; k++)
        if (!seen.has(k) && touches(candidates[j], candidates[k])) {
          seen.add(k);
          todo.push(k);
        }
    }
    const hs = group.filter(horizontal),
      vs = group.filter(vertical);
    const xs = clusters(vs.map((r) => r.x1)),
      ys = clusters(hs.map((r) => r.y1));
    if (xs.length < 3 || ys.length < 3 || xs.length > 65 || ys.length > 180)
      continue;
    const x = xs[0],
      y = ys[0],
      width = xs.at(-1)! - x,
      height = ys.at(-1)! - y;
    if (width < 40 || height < 15) continue;
    const rows: Cell[][] = [];
    for (let r = 0; r < ys.length - 1; r++) {
      const row: Cell[] = [];
      let c = 0;
      while (c < xs.length - 1) {
        let end = c + 1;
        const mid = (ys[r] + ys[r + 1]) / 2;
        while (
          end < xs.length - 1 &&
          !vs.some(
            (v) =>
              Math.abs(v.x1 - xs[end]) <= TOL &&
              Math.min(v.y1, v.y2) <= mid + 1 &&
              Math.max(v.y1, v.y2) >= mid - 1,
          )
        )
          end++;
        row.push({
          col: c,
          span: end - c,
          rowSpan: 1,
          x: xs[c],
          y: ys[r],
          width: xs[end] - xs[c],
          height: ys[r + 1] - ys[r],
          spans: [],
          borders: {
            top: covers(group, "h", ys[r], xs[c], xs[end]),
            bottom: covers(group, "h", ys[r + 1], xs[c], xs[end]),
            left: covers(group, "v", xs[c], ys[r], ys[r + 1]),
            right: covers(group, "v", xs[end], ys[r], ys[r + 1]),
          },
        });
        c = end;
      }
      rows.push(row);
    }
    // Only rectangular vertical merges. Ambiguous nonrectangular regions stay separate.
    for (let r = 0; r < rows.length; r++)
      for (const cell of rows[r]) {
        if (cell.rowSpan === 0) continue;
        for (let n = r + 1; n < rows.length; n++) {
          const below = rows[n].find(
            (c) => c.col === cell.col && c.span === cell.span,
          );
          if (
            !below ||
            below.rowSpan === 0 ||
            covers(group, "h", ys[n], cell.x, cell.x + cell.width)
          )
            break;
          cell.rowSpan++;
          cell.height += below.height;
          cell.borders.bottom = below.borders.bottom;
          below.rowSpan = 0;
        }
      }
    const cells = rows.flat().filter((c) => c.rowSpan > 0);
    for (const s of spans) {
      const cx = s.x + Math.min(s.width / 2, 3),
        cy = s.y - s.size * 0.35;
      const cell = cells.find(
        (c) =>
          cx >= c.x - TOL &&
          cx < c.x + c.width + 0.1 &&
          cy >= c.y - 1 &&
          cy < c.y + c.height + 1,
      );
      if (cell) cell.spans.push(s);
    }
    if (cells.filter((c) => c.spans.length).length >= 2)
      tables.push({ x, y, width, height, xs, ys, rows });
  }
  return tables.sort((a, b) => a.y - b.y || a.x - b.x);
}
export function paragraphsOf(lines: Line[]): Line[][] {
  const groups: Line[][] = [];
  for (const line of lines) {
    const current = groups.at(-1),
      last = current?.at(-1);
    const bold = line.spans.filter((s) => s.text.trim()).every((s) => s.bold),
      prevBold = last?.spans.filter((s) => s.text.trim()).every((s) => s.bold);
    const newList = /^\s*(?:[-•▪]|\d+[.)])\s/.test(lineText(line));
    if (
      last &&
      line.y - last.y < Math.max(line.size, last.size) * 1.65 &&
      line.y - last.y > line.size * 0.5 &&
      Math.abs(line.x - last.x) < Math.max(12, line.size) &&
      bold === prevBold &&
      !newList
    )
      current!.push(line);
    else groups.push([line]);
  }
  return groups;
}
