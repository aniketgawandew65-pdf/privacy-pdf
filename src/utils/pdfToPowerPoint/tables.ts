import type { SlideTable, SlideText } from "./model.ts";
import type { Rule } from "./rules.ts";
const near = (a: number, b: number) => Math.abs(a - b) < 0.15;
const unique = (values: number[]) =>
  values
    .sort((a, b) => a - b)
    .filter((v, i, all) => !i || !near(v, all[i - 1]));

/** Only complete grids with a single horizontal text run per cell are migrated.
 * No inferred rows, merged cells, partial borders or guessed financial values.
 * The caller must establish that all visible text and stacking are safe first. */
export function extractTables(rules: Rule[], texts: SlideText[]) {
  const tables: SlideTable[] = [],
    omit = new Set<number>(),
    used = new Set<SlideText>();
  if (rules.length > 2000 || texts.length > 2000)
    return { tables, omit, texts };
  const vertical = rules.filter((r) => near(r.x1, r.x2));
  const horizontal = rules.filter((r) => near(r.y1, r.y2));
  const visited = new Set<Rule>();
  for (const seed of vertical) {
    if (visited.has(seed)) continue;
    const top = Math.min(seed.y1, seed.y2),
      bottom = Math.max(seed.y1, seed.y2);
    const verts = vertical.filter(
      (r) =>
        near(Math.min(r.y1, r.y2), top) && near(Math.max(r.y1, r.y2), bottom),
    );
    verts.forEach((r) => visited.add(r));
    const xs = unique(verts.map((r) => r.x1));
    if (xs.length < 3 || xs.length > 41) continue;
    const left = xs[0],
      right = xs.at(-1)!;
    const hs = horizontal.filter(
      (r) =>
        near(Math.min(r.x1, r.x2), left) &&
        near(Math.max(r.x1, r.x2), right) &&
        r.y1 >= top - 0.15 &&
        r.y1 <= bottom + 0.15,
    );
    const ys = unique(hs.map((r) => r.y1));
    if (
      ys.length < 3 ||
      ys.length > 201 ||
      !near(ys[0], top) ||
      !near(ys.at(-1)!, bottom)
    )
      continue;
    const grid = [...verts, ...hs],
      operations = new Set(grid.map((r) => r.operation));
    // A partial internal border may indicate merged cells. Do not infer a grid
    // around it or leave that border behind in the background artwork.
    if (
      rules.some(
        (r) =>
          !grid.includes(r) &&
          Math.max(r.x1, r.x2) > left &&
          Math.min(r.x1, r.x2) < right &&
          Math.max(r.y1, r.y2) > top &&
          Math.min(r.y1, r.y2) < bottom,
      )
    )
      continue;
    // A PDF path may also draw a logo/decoration: never remove only part of it.
    if (rules.some((r) => operations.has(r.operation) && !grid.includes(r)))
      continue;
    if (grid.some((r) => r.color !== seed.color || !near(r.width, seed.width)))
      continue;
    const columns = xs.slice(1).map((x, i) => x - xs[i]),
      rows = ys.slice(1).map((y, i) => y - ys[i]);
    if (columns.some((w) => w < 8) || rows.some((h) => h < 8)) continue;
    const inside = texts.filter(
      (t) =>
        t.x < right &&
        t.x + t.width > left &&
        t.y < bottom &&
        t.y + t.height > top,
    );
    if (!inside.length || inside.some((t) => used.has(t))) continue;
    const cells: (SlideText | null)[][] = rows.map(() =>
      columns.map(() => null),
    );
    let valid = true;
    for (const t of inside) {
      const col = xs.findIndex(
        (x, i) =>
          i < columns.length &&
          t.x >= x + 0.25 &&
          t.x + t.width <= xs[i + 1] - 0.25,
      );
      const row = ys.findIndex(
        (y, i) =>
          i < rows.length &&
          t.y >= y + 0.25 &&
          t.y + t.height <= ys[i + 1] - 0.25,
      );
      if (
        row < 0 ||
        col < 0 ||
        cells[row][col] ||
        t.rotation ||
        t.rtl ||
        t.opacity !== 1
      ) {
        valid = false;
        break;
      }
      cells[row][col] = t;
    }
    if (!valid) continue;
    tables.push({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      columns,
      rows,
      cells,
      border: { width: seed.width, color: seed.color },
    });
    inside.forEach((t) => used.add(t));
    operations.forEach((i) => omit.add(i));
  }
  return { tables, omit, texts: texts.filter((t) => !used.has(t)) };
}
