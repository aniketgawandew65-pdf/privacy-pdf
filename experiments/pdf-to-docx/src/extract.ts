import {
  getDocument,
  GlobalWorkerOptions,
  OPS,
  Util,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageModel, Rule, Span } from "./model.ts";
import { detectTables } from "./layout.ts";
import { planTextPreservation, type GlyphRun } from "./text-policy.ts";
GlobalWorkerOptions.workerSrc = workerUrl;
const RANGE_CHUNK_SIZE = 256 * 1024;

export const LIMITS = {
  mobileBytes: 150 * 1024 * 1024,
  pagePixels: 3_000_000,
  operations: 180000,
  pageMs: 45000,
};

interface NavigatorSafetyLike extends Navigator {
  userAgentData?: {
    mobile?: boolean;
  };
}

export function isMobileSafetyEnvironment() {
  const nav = navigator as NavigatorSafetyLike;
  const ua = nav.userAgent || "";
  const platform = nav.platform || "";
  const maxTouchPoints = nav.maxTouchPoints || 0;

  const isIPad =
    /iPad/i.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1);

  if (isIPad || /iPhone|iPod/i.test(ua)) return true;
  if (/Android/i.test(ua)) return true;
  if (nav.userAgentData?.mobile === true) return true;

  return false;
}

class LocalBlobRangeTransport extends PDFDataRangeTransport {
  private readonly source: Blob;
  private stopped = false;

  constructor(source: Blob, initialData: Uint8Array) {
    super(source.size, initialData, false);
    this.source = source;
  }

  requestDataRange(begin: number, end: number) {
    if (this.stopped) return;

    const safeBegin = Math.max(0, Math.min(this.source.size, begin));
    const safeEnd = Math.max(
      safeBegin,
      Math.min(this.source.size, end),
    );

    void this.source
      .slice(safeBegin, safeEnd)
      .arrayBuffer()
      .then((buffer) => {
        if (!this.stopped) {
          this.onDataRange(safeBegin, new Uint8Array(buffer));
        }
      })
      .catch(() => {
        if (!this.stopped) {
          this.onDataRange(safeBegin, new Uint8Array(0));
        }
      });
  }

  abort() {
    this.stopped = true;
  }
}
export function deadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(Error(`${label} took too long. Try a smaller or simpler PDF.`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
export async function openPdf(
  file: File,
  signal: AbortSignal,
): Promise<PDFDocumentProxy> {
  if (
    isMobileSafetyEnvironment() &&
    file.size > LIMITS.mobileBytes
  ) {
    throw Error(
      "Mobile and tablet support PDFs up to 150 MB. Use Desktop for larger files.",
    );
  }

  const prefix = new Uint8Array(
    await file.slice(0, Math.min(file.size, 1024)).arrayBuffer(),
  );

  if (!new TextDecoder().decode(prefix).includes("%PDF-")) {
    throw Error("This file is not a readable PDF.");
  }

  const initialData = new Uint8Array(
    await file
      .slice(0, Math.min(file.size, RANGE_CHUNK_SIZE))
      .arrayBuffer(),
  );

  const rangeTransport = new LocalBlobRangeTransport(
    file,
    initialData,
  );

  const task = getDocument({
    range: rangeTransport,
    rangeChunkSize: RANGE_CHUNK_SIZE,
    disableRange: false,
    disableStream: true,
    disableAutoFetch: true,
    fontExtraProperties: true,
    enableXfa: false,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const abort = () => {
    rangeTransport.abort();
    void task.destroy();
  };

  signal.addEventListener("abort", abort, { once: true });

  task.onPassword = () => {
    rangeTransport.abort();
    void task.destroy();
  };

  try {
    return await deadline(task.promise, 20000, "Reading the PDF");
  } catch (e) {
    rangeTransport.abort();
    void task.destroy();

    if (signal.aborted) throw Error("Conversion cancelled.");

    if (String(e).match(/password|destroyed/i)) {
      throw Error(
        "Password-protected PDFs are not supported. Unlock a copy first.",
      );
    }

    throw e;
  }
}
function fontFamily(raw: string) {
  const name = raw
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/PSMT$|PS-BoldMT$|PS-ItalicMT$|PS-BoldItalicMT$/i, "")
    .replace(
      /[-,](BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular|Roman|Medium)$/i,
      "",
    );
  if (/TimesNewRoman/i.test(name)) return "Times New Roman";
  if (/HelveticaNeue/i.test(name)) return "Helvetica Neue";
  if (/Helvetica/i.test(name)) return "Helvetica";
  if (/Arial/i.test(name)) return "Arial";
  return name || "Arial";
}
export async function extractPage(
  page: PDFPageProxy,
  signal: AbortSignal,
): Promise<PageModel> {
  const viewport = page.getViewport({ scale: 1 }),
    model: PageModel = {
      number: page.pageNumber,
      width: viewport.width,
      height: viewport.height,
      spans: [],
      rules: [],
      pictures: [],
      warnings: [],
    };
  const [content, operators] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ]);
  if (content.items.length > 16000)
    throw Error(
      `Page ${page.pageNumber} has too many text fragments to reconstruct safely.`,
    );
  if (operators.fnArray.length > LIMITS.operations)
    throw Error(
      `Page ${page.pageNumber} has too many drawing operations for this experiment.`,
    );
  const matrices: number[][] = [],
    colors: { fill: string; stroke: string; width: number; font: string }[] =
      [];
  let matrix = [1, 0, 0, 1, 0, 0],
    fill = "000000",
    stroke = "000000",
    lineWidth = 0.5,
    currentFont = "";
  const pathRules = new Map<number, Rule[]>(),
    glyphRuns: GlyphRun[] = [],
    textColors: { text: string; color: string }[] = [];
  const point = (x: number, y: number) => {
    const p = [x, y];
    Util.applyTransform(p, matrix);
    return viewport.convertToViewportPoint(p[0], p[1]);
  };
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i],
      a = operators.argsArray[i];
    if (op === OPS.save) {
      matrices.push([...matrix]);
      colors.push({ fill, stroke, width: lineWidth, font: currentFont });
    } else if (op === OPS.restore) {
      matrix = matrices.pop() || [1, 0, 0, 1, 0, 0];
      const c = colors.pop();
      if (c) {
        fill = c.fill;
        stroke = c.stroke;
        lineWidth = c.width;
        currentFont = c.font;
      }
    } else if (op === OPS.transform) matrix = Util.transform(matrix, a);
    else if (op === OPS.paintFormXObjectBegin) {
      matrices.push([...matrix]);
      colors.push({ fill, stroke, width: lineWidth, font: currentFont });
      if (a[0]) matrix = Util.transform(matrix, a[0]);
    } else if (op === OPS.paintFormXObjectEnd) {
      matrix = matrices.pop() || matrix;
      const c = colors.pop();
      if (c) {
        fill = c.fill;
        stroke = c.stroke;
        lineWidth = c.width;
        currentFont = c.font;
      }
    } else if (op === OPS.setFillRGBColor) fill = String(a[0]).replace("#", "");
    else if (op === OPS.setStrokeRGBColor)
      stroke = String(a[0]).replace("#", "");
    else if (op === OPS.setLineWidth) lineWidth = a[0];
    else if (op === OPS.setFont) currentFont = a[0];
    else if (op === OPS.showText) {
      const text = a[0]
        .filter((g: unknown) => typeof g === "object" && g !== null)
        .map((g: { unicode?: string }) => g.unicode || "")
        .join("");
      textColors.push({ text, color: fill });
      glyphRuns.push({ text, fontName: currentFont, operatorIndex: i });
    } else if (op === OPS.constructPath) {
      const draw = a[1]?.[0] as ArrayLike<number> | undefined;
      if (!draw || typeof draw.length !== "number") continue;
      let x = 0,
        y = 0,
        sx = 0,
        sy = 0;
      const rules: Rule[] = [];
      let curved = false;
      const line = (nx: number, ny: number) => {
        const p = point(x, y),
          q = point(nx, ny);
        if (Math.abs(p[0] - q[0]) < 0.8 || Math.abs(p[1] - q[1]) < 0.8)
          rules.push({
            x1: p[0],
            y1: p[1],
            x2: q[0],
            y2: q[1],
            width: lineWidth,
            color: stroke,
          });
        else curved = true;
        x = nx;
        y = ny;
      };
      for (let n = 0; n < draw.length; ) {
        const code = draw[n++];
        if (code === 0) {
          sx = x = draw[n++];
          sy = y = draw[n++];
        } else if (code === 1) {
          line(draw[n++], draw[n++]);
        } else if (code === 2) {
          const cx1 = draw[n++],
            cy1 = draw[n++],
            cx2 = draw[n++],
            cy2 = draw[n++],
            nx = draw[n++],
            ny = draw[n++];
          // Small quarter-turn curves join table rules at rounded corners.
          // Extend the tangent segments to their square intersection for the
          // editable grid; do not mistake arbitrary curves for table borders.
          const dx = Math.abs(nx - x),
            dy = Math.abs(ny - y);
          if (
            dx > 0 &&
            dy > 0 &&
            dx <= 12 &&
            dy <= 12 &&
            ((Math.abs(cx1 - x) < 0.1 && Math.abs(cy2 - ny) < 0.1) ||
              (Math.abs(cy1 - y) < 0.1 && Math.abs(cx2 - nx) < 0.1))
          ) {
            if (Math.abs(cx1 - x) < 0.1) line(x, ny);
            else line(nx, y);
            line(nx, ny);
          } else {
            x = nx;
            y = ny;
            curved = true;
          }
        } else if (code === 3) {
          n += 2;
          x = draw[n++];
          y = draw[n++];
          curved = true;
        } else if (code === 4) line(sx, sy);
        else break;
      }
      // Only stroked axis-aligned paths infer borders. Fills remain artwork.
      if (
        [
          OPS.stroke,
          OPS.closeStroke,
          OPS.fillStroke,
          OPS.eoFillStroke,
        ].includes(a[0])
      ) {
        model.rules.push(...rules);
        if (!curved) pathRules.set(i, rules);
      }
    }
  }
  const items = content.items.filter((item) => "str" in item);
  const preservation = planTextPreservation(items, glyphRuns);
  if (preservation.artworkItems.size)
    model.warnings.push(
      `Page ${page.pageNumber}: ${preservation.artworkItems.size} barcode/symbol, decorative rule or unmapped text fragment(s) preserved as artwork. These fragments are not editable; readable text remains editable.`,
    );
  let colorCursor = 0;
  for (const [index, item] of items.entries()) {
    if (preservation.artworkItems.has(index) || !item.str.trim()) continue;
    const t = Util.transform(viewport.transform, item.transform),
      style = content.styles[item.fontName];
    let font: { name?: string; bold?: boolean; italic?: boolean } = {};
    try {
      font = page.commonObjs.get(item.fontName) || {};
    } catch {
      /* Font hints can be unavailable. */
    }
    const raw = font.name || style.fontFamily || "Arial",
      size = Math.hypot(t[2], t[3]);
    if (Math.abs(t[1]) > Math.abs(t[0]) * 0.08) {
      model.warnings.push(
        "Rotated text was converted in reading order; its rotation is not preserved.",
      );
    }
    let color = "000000";
    const clean = item.str.replace(/\s/g, "");
    for (
      let j = colorCursor;
      j < Math.min(textColors.length, colorCursor + 8);
      j++
    ) {
      if (textColors[j].text.replace(/\s/g, "").includes(clean)) {
        color = textColors[j].color;
        colorCursor = j;
        break;
      }
    }
    const span: Span = {
      text: item.str,
      x: t[4],
      y: t[5],
      width: Math.abs(item.width),
      size,
      font: fontFamily(raw),
      bold: !!font.bold || /bold|black|heavy/i.test(raw),
      italic:
        !!font.italic ||
        /italic|oblique/i.test(raw) ||
        Math.abs(t[2]) > size * 0.1,
      color: /^[0-9a-f]{6}$/i.test(color) ? color : "000000",
    };
    span.underline = model.rules.some(
      (r) =>
        Math.abs(r.y1 - r.y2) < 1 &&
        r.y1 > span.y &&
        r.y1 < span.y + size * 0.3 &&
        Math.min(r.x1, r.x2) <= span.x + 2 &&
        Math.max(r.x1, r.x2) >= span.x + span.width - 2 &&
        Math.abs(r.x2 - r.x1) < span.width * 1.4,
    );
    model.spans.push(span);
  }
  const meaningful = model.spans
    .map((s) => s.text)
    .join("")
    .trim();
  if (!meaningful) {
    if (preservation.artworkItems.size)
      throw Error(
        `Page ${page.pageNumber} has no recoverable editable text. Its font mappings need local text recognition, which this prototype does not yet support.`,
      );
    throw Error(
      `Page ${page.pageNumber} has no extractable text. Scanned/image-only pages require local OCR, which is not included in this first digital-PDF prototype. No screenshot-only DOCX was created.`,
    );
  }
  const tables = detectTables(model.rules, model.spans);
  const suppress = new Set<number>();
  for (const [index, rules] of pathRules)
    if (
      rules.length &&
      rules.every((r) =>
        tables.some(
          (t) =>
            Math.min(r.x1, r.x2) >= t.x - 3 &&
            Math.max(r.x1, r.x2) <= t.x + t.width + 3 &&
            Math.min(r.y1, r.y2) >= t.y - 3 &&
            Math.max(r.y1, r.y2) <= t.y + t.height + 3,
        ),
      )
    )
      suppress.add(index);
  // Preserve artwork and explicitly reported unmapped glyphs. Reconstructed
  // editable text is excluded, including when a drawing run has split items.
  const hiddenText = new Set<number>([
    OPS.showText,
    OPS.showSpacedText,
    OPS.nextLineShowText,
    OPS.nextLineSetSpacingShowText,
  ]);
  const scale = Math.min(
    1.6,
    Math.sqrt(LIMITS.pagePixels / (viewport.width * viewport.height)),
  );
  const v = page.getViewport({ scale }),
    canvas = document.createElement("canvas");
  canvas.width = Math.ceil(v.width);
  canvas.height = Math.ceil(v.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const task = page.render({
    canvas,
    canvasContext: ctx,
    viewport: v,
    background: "rgba(0,0,0,0)",
    annotationMode: 0,
    operationsFilter: (index) =>
      (!hiddenText.has(operators.fnArray[index]) ||
        preservation.artworkOperators.has(index)) &&
      !suppress.has(index),
  });
  const abort = () => task.cancel();
  signal.addEventListener("abort", abort, { once: true });
  try {
    await deadline(task.promise, LIMITS.pageMs, "Rendering page artwork");
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width,
      top = canvas.height,
      right = 0,
      bottom = 0;
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const k = (y * canvas.width + x) * 4;
        if (
          pixels[k + 3] > 20 &&
          (pixels[k] < 248 || pixels[k + 1] < 248 || pixels[k + 2] < 248)
        ) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    if (right > left && bottom > top) {
      const crop = document.createElement("canvas");
      crop.width = right - left + 1;
      crop.height = bottom - top + 1;
      crop
        .getContext("2d")!
        .drawImage(
          canvas,
          left,
          top,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height,
        );
      const blob = await new Promise<Blob>((resolve, reject) =>
        crop.toBlob(
          (b) =>
            b ? resolve(b) : reject(Error("Could not preserve page artwork.")),
          "image/png",
        ),
      );
      model.pictures.push({
        x: left / scale,
        y: top / scale,
        width: crop.width / scale,
        height: crop.height / scale,
        data: new Uint8Array(await blob.arrayBuffer()),
        background: true,
      });
      crop.width = crop.height = 0;
    }
  } finally {
    task.cancel();
    signal.removeEventListener("abort", abort);
    canvas.width = canvas.height = 0;
  }
  model.warnings = [...new Set(model.warnings)];
  page.cleanup();
  return model;
}
