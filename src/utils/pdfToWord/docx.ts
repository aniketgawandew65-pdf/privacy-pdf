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
  ImportedXmlComponent,
  type IFrameOptions,
} from "docx";
import JSZip from "jszip";
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
  flowRegions,
} from "./layout.ts";
import { twips as tw, emu, isRotated, baselineOffset, lineHeight, textBoxGeometry, verticalTextFlow } from "./geometry.ts";
import { fontProfile } from "./fonts.ts";
const fontFor = (s: Span) => s.outputFont || fontProfile({ name: s.font }).fallback;
const run = (s: Span, text = s.text) =>
  new TextRun({
    text,
    font: fontFor(s),
    scale: s.scale,
    rightToLeft: s.direction === "rtl",
    sizeComplexScript: Math.round(s.size * 2),
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
function paragraphLineHeight(lines: Line[]) {
  const deltas = lines.slice(1).map((line, i) => line.y - lines[i].y).sort((a, b) => a - b);
  return deltas.length ? deltas[Math.floor(deltas.length / 2)] : Math.max(...lines[0].spans.map(lineHeight));
}
function paragraphTop(lines: Line[]) {
  const height = paragraphLineHeight(lines);
  return Math.min(...lines[0].spans.map((s) => s.y - baselineOffset(s, height)));
}
function paragraph(
  lines: Line[],
  x: number,
  width: number,
  before = 0,
  inCell = false,
  frame?: IFrameOptions,
  borderInset = 0,
): Paragraph {
  const children: TextRun[] = [],
    stops: number[] = [];
  const align = alignment(lines, x, width);
  for (let n = 0; n < lines.length; n++) {
    if (n) {
      // Keep source line breaks inside editable paragraphs. Joining lines can
      // add a wrapped line and displace an otherwise correctly placed footer.
      children.push(new TextRun({ break: 1 }));
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
      const sourceExtent = lines[n].right - x;
      // A receiving editor can substitute a slightly wider font than the
      // browser measured. Reserve half an em at a cell's right edge, only
      // compressing source lines that would otherwise consume that space.
      const editingRoom = frame ? 0 : Math.max(...lines[n].spans.map((s) => s.size)) / 2;
      const fit = inCell ? Math.min(1, Math.max(1, width - borderInset - editingRoom) / Math.max(1, sourceExtent)) : 1;
      children.push(run({ ...s, scale: Math.max(1, Math.floor((s.scale ?? 100) * fit)) }));
      end = s.x + s.width;
    }
  }
  const paragraphHeight = paragraphLineHeight(lines);
  const bold = lines.every((l) =>
    l.spans.filter((s) => s.text.trim()).every((s) => s.bold),
  );
  return new Paragraph({
    frame,
    children,
    bidirectional: lines[0].spans[0].direction === "rtl",
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
      line: tw(paragraphHeight),
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
  const padding = cellPadding(c);
  // Preserve the source baselines inside cells; group lines into editable paragraphs.
  return paragraphsOf(lines).map((group, i, groups) =>
    paragraph(
      group,
      c.x + padding.left,
      c.width - padding.left - padding.right,
      i
        ? Math.max(
            0,
            paragraphTop(group) - Math.max(...groups[i - 1].at(-1)!.spans.map((s) => s.y + s.size * (s.descent ?? 0.2))),
          )
        : Math.max(0, paragraphTop(group) - c.y),
      true,
      undefined,
      ((c.borderStyles?.left?.width ?? 0) + (c.borderStyles?.right?.width ?? 0)) / 2,
    ),
  );
}
function cellPadding(c: Cell) {
  if (!c.spans.length) return { left: 0, right: 0 };
  // The PDF's visible text extent, not a fixed four-point Word margin.
  const left = Math.max(0, Math.min(...c.spans.map((s) => s.x)) - c.x);
  const right = Math.max(0, c.x + c.width - Math.max(...c.spans.map((s) => s.x + s.width)));
  // Keep some editing room; source indentation lives in paragraph geometry.
  const align = alignment(linesOf(c.spans), c.x, c.width);
  // Left-aligned PDF runs already encode their exact advance. An additional
  // right margin consumes that advance (Word also reserves border space).
  return { left: Math.min(left, c.width * 0.05), right: align === AlignmentType.LEFT ? 0 : Math.min(right, c.width * 0.05) };
}
function table(grid: Grid, floating = true): Table {
  return new Table({
    width: { size: tw(grid.width), type: WidthType.DXA },
    columnWidths: grid.xs.slice(1).map((x, i) => tw(x - grid.xs[i])),
    layout: TableLayoutType.FIXED,
    // PDF viewport coordinates are page-relative points. Word table positions
    // use twips; unlike flow spacers, these cannot accumulate paragraph height.
    float: floating ? {
      horizontalAnchor: TableAnchorType.PAGE,
      verticalAnchor: TableAnchorType.PAGE,
      absoluteHorizontalPosition: tw(grid.x),
      absoluteVerticalPosition: tw(grid.y),
      topFromText: 0, bottomFromText: 0, leftFromText: 0, rightFromText: 0,
      overlap: OverlapType.OVERLAP,
    } : undefined,
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
                  margins: { top: 0, bottom: 0, left: tw(cellPadding(c).left), right: tw(cellPadding(c).right) },
                  borders: Object.fromEntries(
                    Object.entries(c.borders).map(([side, on]) => [
                      side,
                      on && !c.borderStyles?.[side as keyof Cell["borders"]]?.artwork
                        ? {
                            style: BorderStyle.SINGLE,
                            size: Math.max(2, Math.min(96, Math.round((c.borderStyles?.[side as keyof Cell["borders"]]?.width ?? 0.5) * 8))),
                            color: c.borderStyles?.[side as keyof Cell["borders"]]?.color || "000000",
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

/**
 * Word section breaks normally preserve one source PDF page per DOCX page.
 * LibreOffice 25.2 can collapse an otherwise valid nextPage section when the
 * reconstructed page is dominated by positioned content. Reinforce each
 * intermediate section paragraph with an explicit page break as well.
 */
async function reinforceSourcePageBreaks(
  bytes: Uint8Array,
  expectedBoundaries: number,
): Promise<Uint8Array> {
  if (!expectedBoundaries) return bytes;

  const archive = await JSZip.loadAsync(bytes);
  const documentFile = archive.file("word/document.xml");
  if (!documentFile)
    throw Error("Generated DOCX is missing word/document.xml.");

  const xml = await documentFile.async("string");
  let boundaries = 0;

  const reinforced = xml.replace(
    /(<w:p><w:pPr><w:sectPr\b[\s\S]*?<\/w:sectPr><\/w:pPr>)(<\/w:p>)/g,
    (_match, start: string, end: string) => {
      boundaries += 1;
      return `${start}<w:r><w:br w:type="page"/></w:r>${end}`;
    },
  );

  if (boundaries !== expectedBoundaries)
    throw Error(
      `Generated DOCX has ${boundaries} intermediate page boundaries; expected ${expectedBoundaries}.`,
    );

  archive.file("word/document.xml", reinforced);

  return archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

const xmlText = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** A native table touching the page edge must not paginate into the next
 * source page. A page-anchored text box contains its real editable cells.
 * Interior tables retain the existing floating-table representation.
 */
function containedTable(grid: Grid, id: number): Paragraph {
  const element = (name: string, attributes: Record<string, string>, children: (ImportedXmlComponent | string)[] = []) => {
    const node = new ImportedXmlComponent(name, attributes);
    children.forEach((child) => node.push(child));
    return node;
  };
  const content = new ImportedXmlComponent("w:txbxContent");
  content.push(table(grid, false));
  content.push(spacer(0.05));
  // Allow the outer border's half-stroke and mandatory final paragraph.
  const width = emu(grid.width + 1), height = emu(grid.height + 1);
  const shape = element("wps:wsp", {}, [
    element("wps:cNvSpPr", { txBox: "1" }),
    element("wps:spPr", {}, [
      element("a:xfrm", {}, [element("a:off", { x: "0", y: "0" }), element("a:ext", { cx: String(width), cy: String(height) })]),
      element("a:prstGeom", { prst: "rect" }, [element("a:avLst", {})]),
      element("a:noFill", {}), element("a:ln", {}, [element("a:noFill", {})]),
    ]),
    element("wps:txbx", {}, [content]),
    element("wps:bodyPr", { rot: "0", vert: "horz", wrap: "none", lIns: "0", tIns: "0", rIns: "0", bIns: "0", anchor: "t" }, [element("a:noAutofit", {})]),
  ]);
  const anchor = element("wp:anchor", {
    "xmlns:wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "xmlns:a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "xmlns:wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    distT: "0", distB: "0", distL: "0", distR: "0", simplePos: "0", relativeHeight: "2",
    behindDoc: "0", locked: "1", layoutInCell: "0", allowOverlap: "1",
  }, [
    element("wp:simplePos", { x: "0", y: "0" }),
    element("wp:positionH", { relativeFrom: "page" }, [element("wp:posOffset", {}, [String(emu(grid.x))])]),
    element("wp:positionV", { relativeFrom: "page" }, [element("wp:posOffset", {}, [String(emu(grid.y))])]),
    element("wp:extent", { cx: String(width), cy: String(height) }),
    element("wp:effectExtent", { l: "0", t: "0", r: "0", b: "0" }),
    element("wp:wrapNone", {}),
    element("wp:docPr", { id: String(id), name: "Editable page-edge PDF table" }),
    element("wp:cNvGraphicFramePr", {}),
    element("a:graphic", {}, [element("a:graphicData", { uri: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape" }, [shape])]),
  ]);
  const host = spacer(0.05);
  host.addChildElement(element("w:r", {}, [element("w:drawing", {}, [anchor])]));
  return host;
}

const usesWordArt = (span: Span) => {
  const angle = textBoxGeometry(span).angle;
  return Math.abs(angle - Math.round(angle / 90) * 90) > 0.5;
};

/** WordArt's text path rotates in readers which ignore textbox rotation.
 * It remains native editable text, not a raster or duplicate hidden text.
 * Unlike a paragraph box, its extent describes glyph ink, not line leading.
 */
function diagonalText(span: Span, id: number): Paragraph {
  const angle = textBoxGeometry(span).angle, rad = angle * Math.PI / 180;
  const ink = span.ink ?? { x: 0, y: -span.size * 0.75, width: span.width, height: span.size };
  const width = Math.max(1, ink.width), height = Math.max(1, ink.height);
  const dx = ink.x + width / 2, dy = ink.y + height / 2;
  const x = span.x + Math.cos(rad) * dx - Math.sin(rad) * dy - width / 2;
  const y = span.y + Math.sin(rad) * dx + Math.cos(rad) * dy - height / 2;
  const p = spacer(0.05);
  p.addChildElement(ImportedXmlComponent.fromXmlString(`<w:r><w:pict xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <v:shapetype id="PDFTextPath${id}" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,0l@8,0m@5,21600l@6,21600e">
    <v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/></v:formulas>
    <v:path textpathok="t"/><v:textpath on="t" fitshape="t"/></v:shapetype>
    <v:shape id="PDFDiagonal${id}" type="#PDFTextPath${id}" style="position:absolute;margin-left:${x}pt;margin-top:${y}pt;width:${width}pt;height:${height}pt;rotation:${angle};z-index:1;mso-position-horizontal-relative:page;mso-position-vertical-relative:page" fillcolor="#${span.color}" stroked="f">
    <v:fill opacity="${span.opacity ?? 1}"/><v:textpath style="font-family:&quot;${xmlText(fontFor(span))}&quot;;font-size:${span.size}pt;font-weight:${span.bold ? "bold" : "normal"};font-style:${span.italic ? "italic" : "normal"}" string="${xmlText(span.text)}"/>
    </v:shape></w:pict></w:r>`));
  return p;
}

/** DrawingML textboxes keep rotated text editable. Both the shape transform
 * and its anchor use the same viewport geometry; text must not wrap merely
 * because fallback advance widths round differently in a receiving editor.
 */
function rotatedText(span: Span, id: number): Paragraph {
  if (usesWordArt(span)) return diagonalText(span, id);
  const sourceBox = textBoxGeometry(span);
  // Orthogonal text flow is supported by more Word readers than shape rotation.
  // Swap the rectangle about the same centre, then rotate its editable text flow.
  const vertical = verticalTextFlow(sourceBox.angle);
  const quarterTurn = vertical !== "horz";
  const box = quarterTurn ? {
    ...sourceBox,
    x: sourceBox.x + (sourceBox.width - sourceBox.height) / 2,
    y: sourceBox.y + (sourceBox.height - sourceBox.width) / 2,
    width: sourceBox.height, height: sourceBox.width, angle: 0,
  } : sourceBox;
  const p = spacer(0.05);
  const font = xmlText(fontFor(span));
  p.addChildElement(ImportedXmlComponent.fromXmlString(`<w:r><w:drawing>
    <wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
      distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="1" layoutInCell="0" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.x)}</wp:posOffset></wp:positionH>
      <wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.y)}</wp:posOffset></wp:positionV>
      <wp:extent cx="${emu(box.width)}" cy="${emu(box.height)}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>
      <wp:docPr id="${id + 1000000}" name="Editable rotated PDF text ${id}"/>
      <wp:cNvGraphicFramePr/>
      <a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <wps:wsp><wps:cNvSpPr txBox="0"/>
        <wps:spPr><a:xfrm rot="${Math.round(box.angle * 60000)}"><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>
        <wps:txbx><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${tw(sourceBox.height)}" w:lineRule="exact"/></w:pPr>
        <w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>
        <w:sz w:val="${Math.round(span.size * 2)}"/><w:color w:val="${span.color}"/><w:w w:val="${span.scale ?? 100}"/>
        ${span.bold ? '<w:b/>' : ''}${span.italic ? '<w:i/>' : ''}${span.underline ? '<w:u w:val="single"/>' : ''}
        </w:rPr><w:t xml:space="preserve">${xmlText(span.text)}</w:t></w:r></w:p></w:txbxContent></wps:txbx>
        <wps:bodyPr rot="0" vert="${vertical}" upright="0" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></wps:bodyPr>
        </wps:wsp>
      </a:graphicData></a:graphic>
    </wp:anchor></w:drawing></w:r>`));
  return p;
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
    const rotated = p.spans.filter(isRotated);
    const unused = p.spans.filter((s) => !used.has(s) && !isRotated(s));
    const regions = flowRegions(
      unused,
      p.width,
    );
    // Text over fixed forms/backgrounds must stay at its source position;
    // otherwise flowing paragraphs drift across the preserved rules.
    const sourceLines = linesOf(unused);
    const intentionalGap = sourceLines.some((line, index) => index > 0 &&
      line.y - sourceLines[index - 1].y > Math.max(line.size, sourceLines[index - 1].size) * 2.5);
    const positioned =
      intentionalGap ||
      rotated.length > 0 ||
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
        y: paragraphTop(lines),
        bottom: Math.max(...lines.at(-1)!.spans.map((s) => s.y + s.size * (s.descent ?? 0.2))),
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
              offset: emu(pic.x),
            },
            verticalPosition: {
              relative: "page",
              offset: emu(pic.y),
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
    for (const [index, span] of rotated.entries()) children.push(rotatedText(span, p.number * 20000 + index));
    for (const [elementIndex, e] of elements.entries()) {
      const gap = Math.max(0, e.y - cursor);
      if (e.grid) {
        children.push(e.grid.y + e.grid.height > p.height - 36
          ? containedTable(e.grid, 3000000 + p.number * 20000 + elementIndex)
          : table(e.grid));
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
      warnings: [...p.warnings,
        ...(rotated.some((s) => !usesWordArt(s) && verticalTextFlow(s.rotation ?? 0) === "horz") ? ["180-degree text uses editable Word shape rotation. Some editors, including the tested LibreOffice renderer, display this text horizontally. Review orientation in your Word editor."] : []),
        ...(rotated.some(usesWordArt) ? ["Diagonal text is preserved as editable WordArt. Font weight and text-path editing support can differ between Word editors."] : []),
        ...(tables.some((t) => t.hybrid) ? ["Some partially ruled tables were reconstructed from repeated row separators and column alignment. Review their cell boundaries."] : []),
        ...(tables.some((t) => t.inferred && !t.hybrid) ? ["Some unruled tables were inferred from repeated alignment. Review their cell boundaries."] : []),
      ],
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
  const fonts = [...new Set(pages.flatMap((p) => p.spans.map(fontFor)))];
  const fontTable =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    fonts
      .map((name) => {
        const profile = fontProfile({ name });
        const sans = profile.fontClass === "sans-serif", mono = profile.fontClass === "monospace";
        return `<w:font w:name="${escapeXml(name)}"><w:altName w:val="${mono ? "Courier New" : sans ? "Arial" : "Times New Roman"}"/><w:family w:val="${mono ? "modern" : sans ? "swiss" : "roman"}"/><w:pitch w:val="${mono ? "fixed" : "variable"}"/></w:font>`;
      })
      .join("") +
    "</w:fonts>";
  const blob = await Packer.toBlob(document, false, [
    { path: "word/fontTable.xml", data: fontTable },
  ]);
  const packed = new Uint8Array(await blob.arrayBuffer());
  const reinforced = await reinforceSourcePageBreaks(
    packed,
    Math.max(0, pages.length - 1),
  );
  const bytes = reinforced.buffer.slice(
    reinforced.byteOffset,
    reinforced.byteOffset + reinforced.byteLength,
  ) as ArrayBuffer;
  return { bytes, summaries };
}
