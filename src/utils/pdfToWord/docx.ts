import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  BorderStyle,
  WidthType,
  TableLayoutType,
  HeightRule,
  VerticalAlign,
  SectionType,
  LineRuleType,
  HeadingLevel,
  TabStopType,
  TableAnchorType,
  OverlapType,
  type IFrameOptions,
} from "docx";
import type {
  PageModel,
  Span,
  Line,
  Grid,
  Cell,
  PageSummary,
} from "./model.ts";
import {
  detectTables,
  linesOf,
  paragraphsOf,
  lineText,
  flowRegions,
} from "./layout.ts";
const tw = (pt: number) => Math.max(0, Math.round(pt * 20));
const run = (s: Span, text = s.text) =>
  new TextRun({
    text,
    // Helvetica is frequently substituted with Times in Word/LibreOffice.
    font: /Helvetica|Arial|sans/i.test(s.font) ? "Arial" : s.font,
    size: Math.round(s.size * 2),
    bold: s.bold,
    italics: s.italic,
    color: s.color,
    underline: s.underline ? {} : undefined,
  });
function alignment(lines: Line[], x: number, width: number) {
  const centered = lines.every(
    (l) =>
      Math.abs((l.x + l.right) / 2 - (x + width / 2)) <
      Math.max(3, width * 0.025),
  );
  const left = Math.min(...lines.map((l) => l.x));
  if (centered && left - x > 5) return AlignmentType.CENTER;
  if (lines.every((l) => x + width - l.right < 4) && left - x > width * 0.3)
    return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}
function paragraph(
  lines: Line[],
  x: number,
  width: number,
  before = 0,
  inCell = false,
  frame?: IFrameOptions,
): Paragraph {
  const children: TextRun[] = [],
    stops: number[] = [];
  const align = alignment(lines, x, width);
  for (let n = 0; n < lines.length; n++) {
    if (n) {
      if (inCell) children.push(new TextRun({ break: 1 }));
      else if (!/[-\u2010\u00ad]$/.test(lineText(lines[n - 1])))
        children.push(run(lines[n].spans[0], " "));
    }
    let end = lines[n].x;
    for (let k = 0; k < lines[n].spans.length; k++) {
      const s = lines[n].spans[k],
        gap = s.x - end;
      if (k && gap > s.size * 1.3 && align === AlignmentType.LEFT) {
        stops.push(tw(s.x - x));
        children.push(new TextRun("\t"));
      } else if (
        k &&
        gap > s.size * 0.12 &&
        !/\s$/.test(lines[n].spans[k - 1].text) &&
        !/^\s/.test(s.text)
      )
        children.push(run(s, " "));
      children.push(run(s));
      end = s.x + s.width;
    }
  }
  const size = Math.max(...lines.map((l) => l.size));
  const deltas = lines
    .slice(1)
    .map((l, i) => l.y - lines[i].y)
    .sort((a, b) => a - b);
  const lineHeight = deltas.length
    ? deltas[Math.floor(deltas.length / 2)]
    : size * 1.12;
  const bold = lines.every((l) =>
    l.spans.filter((s) => s.text.trim()).every((s) => s.bold),
  );
  return new Paragraph({
    frame,
    children,
    alignment: align,
    heading:
      !inCell && bold && lines.length === 1
        ? HeadingLevel.HEADING_2
        : undefined,
    tabStops: [...new Set(stops)]
      .sort((a, b) => a - b)
      .map((position) => ({ type: TabStopType.LEFT, position })),
    spacing: {
      before: tw(before),
      after: 0,
      line: tw(lineHeight),
      lineRule: LineRuleType.EXACT,
    },
    widowControl: false,
    keepNext: false,
    keepLines: false,
    indent:
      align === AlignmentType.LEFT
        ? { left: tw(Math.max(0, Math.min(...lines.map((l) => l.x)) - x)) }
        : undefined,
  });
}
const noBorder = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
function cellParagraphs(c: Cell): Paragraph[] {
  const lines = linesOf(c.spans);
  if (!lines.length)
    return [
      new Paragraph({
        children: [],
        spacing: { after: 0, before: 0, line: 1, lineRule: LineRuleType.EXACT },
      }),
    ];
  const top = Math.max(0, lines[0].y - lines[0].size * 0.82 - c.y);
  // Preserve the source baselines inside cells; group lines into editable paragraphs.
  return paragraphsOf(lines).map((group, i, groups) =>
    paragraph(
      group,
      c.x + 4,
      c.width - 8,
      i
        ? Math.max(
            0,
            group[0].y - groups[i - 1].at(-1)!.y - group[0].size * 1.12,
          )
        : top,
      true,
    ),
  );
}
function table(grid: Grid): Table {
  return new Table({
    width: { size: tw(grid.width), type: WidthType.DXA },
    columnWidths: grid.xs.slice(1).map((x, i) => tw(x - grid.xs[i])),
    layout: TableLayoutType.FIXED,
    // PDF viewport coordinates are page-relative points. Word table positions
    // use twips; unlike flow spacers, these cannot accumulate paragraph height.
    float: {
      horizontalAnchor: TableAnchorType.PAGE,
      verticalAnchor: TableAnchorType.PAGE,
      absoluteHorizontalPosition: tw(grid.x),
      absoluteVerticalPosition: tw(grid.y),
      topFromText: 0, bottomFromText: 0, leftFromText: 0, rightFromText: 0,
      overlap: OverlapType.OVERLAP,
    },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    },
    rows: grid.rows.map(
      (row, index) =>
        new TableRow({
          height: {
            value: tw(grid.ys[index + 1] - grid.ys[index]),
            rule: HeightRule.EXACT,
          },
          cantSplit: true,
          children: row
            .filter((c) => c.rowSpan > 0)
            .map(
              (c) =>
                new TableCell({
                  width: { size: tw(c.width), type: WidthType.DXA },
                  columnSpan: c.span,
                  rowSpan: c.rowSpan,
                  verticalAlign: VerticalAlign.TOP,
                  margins: { top: 0, bottom: 0, left: tw(4), right: tw(4) },
                  borders: Object.fromEntries(
                    Object.entries(c.borders).map(([side, on]) => [
                      side,
                      on
                        ? {
                            style: BorderStyle.SINGLE,
                            size: 4,
                            color: "000000",
                          }
                        : noBorder,
                    ]),
                  ),
                  children: cellParagraphs(c),
                }),
            ),
        }),
    ),
  });
}
function spacer(points: number) {
  return new Paragraph({
    children: [],
    spacing: {
      before: 0,
      after: 0,
      line: Math.max(1, tw(points)),
      lineRule: LineRuleType.EXACT,
    },
    widowControl: false,
  });
}
export async function makeDocx(
  pages: PageModel[],
): Promise<{ bytes: ArrayBuffer; summaries: PageSummary[] }> {
  const summaries: PageSummary[] = [];
  const sections = pages.map((p) => {
    const tables = detectTables(p.rules, p.spans),
      used = new Set(
        tables.flatMap((t) => t.rows.flatMap((r) => r.flatMap((c) => c.spans))),
      );
    const unused = p.spans.filter((s) => !used.has(s));
    const regions = flowRegions(
      unused,
      Math.min(p.width - 8, Math.max(...p.spans.map((s) => s.x + s.width))),
    );
    // Text over fixed forms/backgrounds must stay at its source position;
    // otherwise flowing paragraphs drift across the preserved rules.
    const positioned =
      tables.length > 0 ||
      regions.columns ||
      p.pictures.some(
        (pic) =>
          pic.background &&
          unused.some(
            (s) =>
              s.x < pic.x + pic.width &&
              s.x + s.width > pic.x &&
              s.y > pic.y &&
              s.y - s.size < pic.y + pic.height,
          ),
      );
    const flow = positioned
      ? regions.regions.flatMap((r) =>
          paragraphsOf(linesOf(r.spans)).map((lines) => ({
            lines,
            left: r.left,
            right: r.right,
          })),
        )
      : paragraphsOf(linesOf(unused)).map((lines) => ({
          lines,
          left: 0,
          right: 0,
        }));
    const elements = [
      ...tables.map((t) => ({
        y: t.y,
        bottom: t.y + t.height,
        grid: t,
        lines: null,
        left: 0,
        right: 0,
      })),
      ...flow.map(({ lines, left, right }) => ({
        y: lines[0].y - lines[0].size * 0.82,
        bottom: lines.at(-1)!.y + lines.at(-1)!.size * 0.3,
        grid: null,
        lines,
        left,
        right,
      })),
    ].sort((a, b) => a.y - b.y);
    const left = Math.max(
      0,
      Math.min(
        ...p.spans.map((s) => s.x),
        ...tables.map((t) => t.x),
        ...p.pictures.map((i) => i.x),
      ),
    );
    const right = Math.min(
      p.width,
      Math.max(
        ...p.spans.map((s) => s.x + s.width),
        ...tables.map((t) => t.x + t.width),
        ...p.pictures.map((i) => i.x + i.width),
      ),
    );
    const top = Math.max(
      0,
      Math.min(elements[0]?.y ?? 36, ...p.pictures.map((i) => i.y)),
    );
    const children: (Paragraph | Table)[] = [];
    let cursor = top;
    const images = p.pictures.map(
      (pic) =>
        new ImageRun({
          type: "png",
          data: pic.data,
          transformation: {
            width: (pic.width * 96) / 72,
            height: (pic.height * 96) / 72,
          },
          altText: {
            name: "Preserved PDF artwork",
            description:
              "Nontext image or decorative material from the source PDF",
            title: "PDF artwork",
          },
          floating: {
            horizontalPosition: {
              relative: "page",
              offset: Math.round(pic.x * 12700),
            },
            verticalPosition: {
              relative: "page",
              offset: Math.round(pic.y * 12700),
            },
            behindDocument: true,
            allowOverlap: true,
            lockAnchor: true,
          },
        }),
    );
    if (images.length) {
      children.push(
        new Paragraph({
          children: images,
          spacing: {
            line: 1,
            lineRule: LineRuleType.EXACT,
            after: 0,
            before: 0,
          },
        }),
      );
      cursor += 0.05;
    }
    for (const e of elements) {
      const gap = Math.max(0, e.y - cursor);
      if (e.grid) {
        children.push(table(e.grid));
        // A floating table does not advance the main text story.
        children.push(spacer(0.05));
        continue;
      } else if (positioned) {
        children.push(
          paragraph(e.lines!, e.left, e.right - e.left, 0, true, {
            type: "absolute",
            position: { x: tw(e.left), y: tw(e.y) },
            width: tw(e.right - e.left),
            height: tw(e.bottom - e.y),
            anchor: { horizontal: "page", vertical: "page" },
            wrap: "none",
            rule: HeightRule.ATLEAST,
          }),
        );
        continue;
      } else children.push(paragraph(e.lines!, left, right - left, gap));
      cursor = e.bottom;
    }
    if (children.at(-1) instanceof Table) children.push(spacer(0.05));
    summaries.push({
      page: p.number,
      textCharacters: p.spans.reduce((n, s) => n + s.text.length, 0),
      tables: tables.length,
      cells: tables.reduce(
        (n, t) => n + t.rows.flat().filter((c) => c.rowSpan > 0).length,
        0,
      ),
      mergedCells: tables.reduce(
        (n, t) =>
          n +
          t.rows
            .flat()
            .filter((c) => c.rowSpan > 0 && (c.rowSpan > 1 || c.span > 1))
            .length,
        0,
      ),
      pictures: p.pictures.length,
      paragraphs: flow.length,
      warnings: p.warnings,
    });
    return {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: tw(p.width), height: tw(p.height) },
          margin: {
            top: tw(top),
            left: tw(left),
            right: tw(p.width - right),
            bottom: tw(Math.max(8, Math.min(36, p.height - cursor - 10))),
            header: 0,
            footer: 0,
          },
        },
      },
      children,
    };
  });
  const document = new Document({
    creator: "1into1 PDF",
    title: "Converted PDF",
    description: "Locally reconstructed editable content",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
          paragraph: { spacing: { after: 0, before: 0 } },
        },
        heading2: {
          run: { color: "000000" },
          paragraph: { spacing: { before: 0, after: 0 }, keepNext: false },
        },
      },
    },
    sections,
  });
  const escapeXml = (s: string) =>
    s.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
    );
  const fonts = [...new Set(pages.flatMap((p) => p.spans.map((s) => s.font)))];
  const fontTable =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    fonts
      .map((name) => {
        const sans = /Arial|Helvetica|sans|Calibri|Aptos/i.test(name),
          mono = /Courier|mono/i.test(name);
        return `<w:font w:name="${escapeXml(name)}"><w:altName w:val="${mono ? "Courier New" : sans ? "Arial" : "Times New Roman"}"/><w:family w:val="${mono ? "modern" : sans ? "swiss" : "roman"}"/><w:pitch w:val="${mono ? "fixed" : "variable"}"/></w:font>`;
      })
      .join("") +
    "</w:fonts>";
  const blob = await Packer.toBlob(document, false, [
    { path: "word/fontTable.xml", data: fontTable },
  ]);
  return { bytes: await blob.arrayBuffer(), summaries };
}
