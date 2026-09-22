import { isRotated } from "./geometry.ts";
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

type HorizontalBand = { y: number; left: number; right: number };

function mergeRanges(ranges: [number, number][], gap = 6): [number, number][] {
  const sorted = ranges
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + gap) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range] as [number, number]);
  }
  return merged;
}

function horizontalBands(rules: Rule[]): HorizontalBand[] {
  const hs = rules.filter(horizontal);
  const ys = clusters(hs.map((r) => r.y1), 1.5);
  return ys.flatMap((y) => {
    const merged = mergeRanges(
      hs
        .filter((r) => Math.abs(r.y1 - y) <= TOL)
        .map((r) => [r.x1, r.x2]),
    );
    if (!merged.length) return [];
    const [left, right] = merged.reduce((best, range) =>
      range[1] - range[0] > best[1] - best[0] ? range : best,
    );
    return right - left >= 80 ? [{ y, left, right }] : [];
  }).sort((a, b) => a.y - b.y);
}

function bandOverlap(a: HorizontalBand, b: HorizontalBand) {
  const intersection = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  return intersection / Math.max(1, Math.min(a.right - a.left, b.right - b.left));
}

function gridOverlap(a: Grid, b: Grid) {
  const left = Math.max(a.x, b.x), right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return ((right - left) * (bottom - top)) /
    Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

function stableColumnStarts(spans: Span[], ys: number[], left: number, right: number) {
  const rows = Math.max(1, ys.length - 1);
  const tolerance = Math.max(3, Math.min(6, Math.max(...spans.map((s) => s.size), 8) * 0.45));
  const groups: { values: number[]; rows: Set<number> }[] = [];
  for (const span of spans) {
    if (span.x < left - TOL || span.x > right + TOL) continue;
    const row = ys.findIndex((y, i) => i < ys.length - 1 && span.y > y && span.y <= ys[i + 1] + span.size);
    if (row < 0) continue;
    let group = groups.find((g) => Math.abs(g.values.reduce((a, b) => a + b, 0) / g.values.length - span.x) <= tolerance);
    if (!group) {
      group = { values: [], rows: new Set<number>() };
      groups.push(group);
    }
    group.values.push(span.x);
    group.rows.add(row);
  }
  const minimumRows = Math.max(3, Math.ceil(rows * 0.4));
  return groups
    .filter((g) => g.rows.size >= minimumRows)
    .map((g) => g.values.reduce((a, b) => a + b, 0) / g.values.length)
    .sort((a, b) => a - b);
}

/**
 * High-confidence hybrid tables: repeated horizontal row separators define
 * records while vertical rules may exist only in the header. This pattern is
 * common in statements, invoices, ledgers and ERP reports. Existing fully
 * ruled and simple aligned-table detection remains unchanged; this is an
 * additive fallback for the structural gap between those two cases.
 */
export function inferHybridRuledTables(rules: Rule[], spans: Span[]): Grid[] {
  spans = spans.filter((s) => !isRotated(s));
  if (spans.length < 9) return [];
  const bands = horizontalBands(rules);
  if (bands.length < 4) return [];

  const runs: HorizontalBand[][] = [];
  for (const band of bands) {
    const current = runs.at(-1), previous = current?.at(-1);
    const gapLimit = Math.max(90, Math.min(160, (band.right - band.left) * 0.28));
    if (
      previous &&
      band.y - previous.y > 2 &&
      band.y - previous.y <= gapLimit &&
      bandOverlap(previous, band) >= 0.9 &&
      Math.abs(previous.left - band.left) <= 10 &&
      Math.abs(previous.right - band.right) <= 10
    ) current!.push(band);
    else runs.push([band]);
  }

  const verticals = rules.filter(vertical);
  const tables: Grid[] = [];
  for (const run of runs) {
    if (run.length < 4 || run.length > 180) continue;
    const left = run.reduce((n, b) => n + b.left, 0) / run.length;
    const right = run.reduce((n, b) => n + b.right, 0) / run.length;
    const ys = run.map((b) => b.y);
    const width = right - left, height = ys.at(-1)! - ys[0];
    if (width < 120 || height < 30) continue;

    const inside = spans.filter((s) =>
      s.x + s.width >= left - TOL &&
      s.x <= right + TOL &&
      s.y >= ys[0] - s.size &&
      s.y <= ys.at(-1)! + s.size,
    );
    if (inside.length < 9) continue;

    const verticalXs = clusters(
      verticals
        .filter((v) => {
          const x = v.x1;
          const top = Math.min(v.y1, v.y2), bottom = Math.max(v.y1, v.y2);
          return x >= left - 6 && x <= right + 6 &&
            bottom >= ys[0] - 4 && top <= ys.at(-1)! + 4 &&
            bottom - top >= 12;
        })
        .map((v) => v.x1),
      3,
    );

    let xs = clusters([left, ...verticalXs, right], 3)
      .filter((x) => x >= left - 6 && x <= right + 6)
      .sort((a, b) => a - b);

    // Some generators draw no body/header verticals at all. In that case,
    // repeated text start positions across several rows provide conservative
    // column anchors. Convert those anchors to whitespace boundaries.
    if (xs.length < 4) {
      const starts = stableColumnStarts(inside, ys, left, right);
      if (starts.length >= 3) {
        const boundaries = [left];
        for (let i = 1; i < starts.length; i++)
          boundaries.push((starts[i - 1] + starts[i]) / 2);
        boundaries.push(right);
        xs = clusters(boundaries, 3).sort((a, b) => a - b);
      }
    }
    if (xs.length < 4 || xs.length > 32) continue;

    const rows: Cell[][] = [];
    for (let r = 0; r < ys.length - 1; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < xs.length - 1; c++) {
        const cell: Cell = {
          col: c, span: 1, rowSpan: 1,
          x: xs[c], y: ys[r],
          width: xs[c + 1] - xs[c], height: ys[r + 1] - ys[r],
          spans: [],
          borders: {
            top: covers(rules, "h", ys[r], xs[c], xs[c + 1]),
            bottom: covers(rules, "h", ys[r + 1], xs[c], xs[c + 1]),
            left: covers(rules, "v", xs[c], ys[r], ys[r + 1]),
            right: covers(rules, "v", xs[c + 1], ys[r], ys[r + 1]),
          },
          borderStyles: {},
        };
        for (const [side, axis, pos, start, end] of [
          ["top", "h", cell.y, cell.x, cell.x + cell.width],
          ["bottom", "h", cell.y + cell.height, cell.x, cell.x + cell.width],
          ["left", "v", cell.x, cell.y, cell.y + cell.height],
          ["right", "v", cell.x + cell.width, cell.y, cell.y + cell.height],
        ] as const) {
          const edge = rules.filter((rule) => axis === "h"
            ? horizontal(rule) && Math.abs(rule.y1 - pos) <= TOL &&
              Math.max(rule.x1, rule.x2) > start && Math.min(rule.x1, rule.x2) < end
            : vertical(rule) && Math.abs(rule.x1 - pos) <= TOL &&
              Math.max(rule.y1, rule.y2) > start && Math.min(rule.y1, rule.y2) < end)
            .sort((a, b) => b.width - a.width)[0];
          if (edge) cell.borderStyles![side] = { width: edge.width, color: edge.color, artwork: edge.artwork };
        }
        row.push(cell);
      }
      rows.push(row);
    }

    const cells = rows.flat();
    for (const span of inside) {
      const cx = span.x + Math.min(span.width / 2, 3);
      const cy = span.y - span.size * 0.35;
      const cell = cells.find((c) =>
        cx >= c.x - TOL && cx < c.x + c.width + 0.1 &&
        cy >= c.y - 1 && cy < c.y + c.height + 1,
      );
      if (cell) cell.spans.push(span);
    }

    const populatedRows = rows.filter((row) => row.filter((c) => c.spans.length).length >= 2);
    const populatedColumns = new Set(cells.filter((c) => c.spans.length).map((c) => c.col));
    if (
      populatedRows.length < Math.max(3, Math.ceil(rows.length * 0.5)) ||
      populatedColumns.size < 3
    ) continue;

    tables.push({
      x: xs[0], y: ys[0],
      width: xs.at(-1)! - xs[0], height,
      xs, ys, rows,
      inferred: true,
      hybrid: true,
    });
  }
  return tables;
}

/** Infer grids from intersecting vector rules; no labels, templates or file names. */
export function detectTables(rules: Rule[], spans: Span[]): Grid[] {
  spans = spans.filter((s) => !isRotated(s));
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
    const xs = clusters(vs.map((r) => r.x1));
    let ys = clusters(hs.map((r) => r.y1));
    if (xs.length < 3 || ys.length < 3 || xs.length > 65 || ys.length > 180)
      continue;
    const x = xs[0],
      y = ys[0],
      width = xs.at(-1)! - x,
      height = ys.at(-1)! - y;
    if (width < 40 || height < 15) continue;
    // Statements often rule columns but leave transaction rows unruled.
    // Repeated baselines in multiple columns (including an outer column)
    // provide row anchors. Subdivide only tall bands with several anchors.
    const inferred = new Set<number>();
    if (xs.length >= 4) {
      for (let band = 0; band < ys.length - 1; band++) {
        const inside = spans.filter(
          (s) =>
            s.x >= x - TOL &&
            s.x < x + width &&
            s.y > ys[band] &&
            s.y < ys[band + 1],
        );
        const anchors = linesOf(inside).filter((l) => {
          const columns = new Set(
            l.spans.map((s) =>
              xs.findIndex(
                (edge, col) =>
                  col < xs.length - 1 &&
                  s.x + 1 >= edge &&
                  s.x + 1 < xs[col + 1],
              ),
            ),
          );
          columns.delete(-1);
          return (
            columns.size >= 2 && (columns.has(0) || columns.has(xs.length - 2))
          );
        });
        if (anchors.length < 3 || ys[band + 1] - ys[band] < anchors[0].size * 6)
          continue;
        for (let a = 1; a < anchors.length; a++) {
          if (anchors[a].y - anchors[a - 1].y < anchors[a].size * 1.8) continue;
          const boundary = anchors[a].y - anchors[a].size * 1.05;
          if (boundary > ys[band] + TOL && boundary < ys[band + 1] - TOL)
            inferred.add(boundary);
        }
      }
      ys = [...ys, ...inferred].sort((a, b) => a - b);
    }
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
            inferred.has(ys[n]) ||
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
    for (const c of cells) {
      c.borderStyles = {};
      for (const [side, axis, pos, start, end] of [
        ["top", "h", c.y, c.x, c.x + c.width],
        ["bottom", "h", c.y + c.height, c.x, c.x + c.width],
        ["left", "v", c.x, c.y, c.y + c.height],
        ["right", "v", c.x + c.width, c.y, c.y + c.height],
      ] as const) {
        const edge = group.filter((r) => axis === "h"
          ? horizontal(r) && Math.abs(r.y1 - pos) <= TOL && Math.max(r.x1,r.x2) > start && Math.min(r.x1,r.x2) < end
          : vertical(r) && Math.abs(r.x1 - pos) <= TOL && Math.max(r.y1,r.y2) > start && Math.min(r.y1,r.y2) < end)
          .sort((a,b) => b.width-a.width)[0];
        if (edge) c.borderStyles[side] = { width: edge.width, color: edge.color, artwork: edge.artwork };
      }
    }
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
  const occupied = new Set(tables.flatMap((t) => t.rows.flatMap((r) => r.flatMap((c) => c.spans))));
  const hybrid = inferHybridRuledTables(rules, spans.filter((s) => !occupied.has(s)))
    .filter((candidate) => !tables.some((existing) => gridOverlap(candidate, existing) > 0.55));
  tables.push(...hybrid);
  const occupiedAfterHybrid = new Set(tables.flatMap((t) => t.rows.flatMap((r) => r.flatMap((c) => c.spans))));
  tables.push(...inferAlignedTables(spans.filter((s) => !occupiedAfterHybrid.has(s))));
  return tables.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Conservative unruled grids: at least three aligned columns and three rows.
 * Two-column prose/address blocks deliberately remain independent paragraphs.
 * Ambiguous/multiline unruled layouts are left as editable positioned text.
 */
export function inferAlignedTables(spans: Span[]): Grid[] {
  const rows = linesOf(spans).map((line) => {
    const cells: Span[][] = [];
    let end = -Infinity;
    for (const span of line.spans) {
      if (span.x - end > Math.max(12, span.size * 1.5)) cells.push([]);
      cells.at(-1)!.push(span);
      end = span.x + span.width;
    }
    return { line, cells };
  });
  const tables: Grid[] = [];
  for (let start = 0; start < rows.length;) {
    const first = rows[start];
    if (first.cells.length < 3) { start++; continue; }
    let end = start + 1;
    while (end < rows.length && rows[end].cells.length === first.cells.length &&
      rows[end].line.y - rows[end-1].line.y < first.line.size * 4 &&
      rows[end].cells.every((c,i) => Math.abs(c[0].x-first.cells[i][0].x) < Math.max(3, first.line.size*0.3))) end++;
    if (end-start < 3) { start++; continue; }
    const group = rows.slice(start,end);
    const xs = first.cells.map((c) => c[0].x);
    xs.push(Math.max(...group.map((r) => r.line.right)) + first.line.size * 0.25);
    // Boundaries lie in the whitespace before the next column, rather than
    // through text. No made-up visible borders are introduced.
    for (let c=1;c<xs.length-1;c++) {
      const previousRight = Math.max(...group.flatMap((r)=>r.cells[c-1].map((s)=>s.x+s.width)));
      xs[c] = (previousRight+xs[c])/2;
    }
    xs[0] -= first.line.size*0.25;
    const ys = group.map((r)=>r.line.y-r.line.size);
    ys.push(group.at(-1)!.line.y+group.at(-1)!.line.size*0.3);
    const gridRows = group.map((r,i)=>r.cells.map((cell,c): Cell=>({
      col:c, span:1, rowSpan:1, x:xs[c], y:ys[i], width:xs[c+1]-xs[c], height:ys[i+1]-ys[i], spans:cell,
      borders:{top:false,bottom:false,left:false,right:false},
    })));
    tables.push({x:xs[0],y:ys[0],width:xs.at(-1)!-xs[0],height:ys.at(-1)!-ys[0],xs,ys,rows:gridRows,inferred:true});
    start=end;
  }
  return tables;
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

/** Separate side-by-side blocks before line grouping can interleave their text. */
export function flowRegions(spans: Span[], pageRight: number) {
  const bands: Span[][] = [];
  let bottom = -Infinity;
  for (const span of [...spans].sort((a, b) => a.y - a.size - (b.y - b.size))) {
    if (span.y - span.size > bottom + span.size * 0.9) bands.push([]);
    bands.at(-1)!.push(span);
    bottom = Math.max(bottom, span.y);
  }
  let columns = false;
  const regions = bands.flatMap((band) => {
    const groups: Span[][] = [];
    let right = -Infinity;
    const gutter = Math.max(20, Math.max(...band.map((s) => s.size)) * 2.5);
    for (const span of [...band].sort((a, b) => a.x - b.x)) {
      if (span.x > right + gutter) groups.push([]);
      groups.at(-1)!.push(span);
      right = Math.max(right, span.x + span.width);
    }
    if (groups.length > 1) columns = true;
    return groups.map((group, i) => ({
      spans: group,
      left: Math.min(...group.map((s) => s.x)),
      right: groups[i + 1]
        ? Math.min(...groups[i + 1].map((s) => s.x)) - 8
        : pageRight,
    }));
  });
  return { regions, columns };
}
