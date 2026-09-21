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
GlobalWorkerOptions.workerSrc = workerUrl;
export const LIMITS = {
  bytes: 30 * 1024 * 1024,
  pages: 60,
  characters: 400000,
  pagePixels: 3_000_000,
  operations: 180000,
  pageMs: 45000,
};
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
  if (file.size > LIMITS.bytes)
    throw Error("This experiment supports PDFs up to 30 MB.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes("%PDF-"))
    throw Error("This file is not a readable PDF.");
  const task = getDocument({
    data,
    fontExtraProperties: true,
    enableXfa: false,
    useSystemFonts: true,
  });
  const abort = () => void task.destroy();
  signal.addEventListener("abort", abort, { once: true });
  task.onPassword = () => {
    void task.destroy();
  };
  try {
    const pdf = await deadline(task.promise, 20000, "Reading the PDF");
    if (pdf.numPages > LIMITS.pages) {
      await pdf.loadingTask.destroy();
      throw Error("This experiment supports up to 60 pages.");
    }
    return pdf;
  } catch (e) {
    void task.destroy();
    if (signal.aborted) throw Error("Conversion cancelled.");
    if (String(e).match(/password|destroyed/i))
      throw Error(
        "Password-protected PDFs are not supported. Unlock a copy first.",
      );
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
    colors: { fill: string; stroke: string; width: number }[] = [];
  let matrix = [1, 0, 0, 1, 0, 0],
    fill = "000000",
    stroke = "000000",
    lineWidth = 0.5;
  const pathRules = new Map<number, Rule[]>(),
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
      colors.push({ fill, stroke, width: lineWidth });
    } else if (op === OPS.restore) {
      matrix = matrices.pop() || [1, 0, 0, 1, 0, 0];
      const c = colors.pop();
      if (c) {
        fill = c.fill;
        stroke = c.stroke;
        lineWidth = c.width;
      }
    } else if (op === OPS.transform) matrix = Util.transform(matrix, a);
    else if (op === OPS.paintFormXObjectBegin) {
      matrices.push([...matrix]);
      colors.push({ fill, stroke, width: lineWidth });
      if (a[0]) matrix = Util.transform(matrix, a[0]);
    } else if (op === OPS.paintFormXObjectEnd) {
      matrix = matrices.pop() || matrix;
      const c = colors.pop();
      if (c) {
        fill = c.fill;
        stroke = c.stroke;
        lineWidth = c.width;
      }
    } else if (op === OPS.setFillRGBColor) fill = String(a[0]).replace("#", "");
    else if (op === OPS.setStrokeRGBColor)
      stroke = String(a[0]).replace("#", "");
    else if (op === OPS.setLineWidth) lineWidth = a[0];
    else if (op === OPS.showText) {
      textColors.push({
        text: a[0]
          .filter((g: unknown) => typeof g === "object" && g !== null)
          .map((g: { unicode?: string }) => g.unicode || "")
          .join(""),
        color: fill,
      });
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
          n += 4;
          x = draw[n++];
          y = draw[n++];
          curved = true;
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
  let colorCursor = 0;
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
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
    throw Error(
      `Page ${page.pageNumber} has no extractable text. Scanned/image-only pages require local OCR, which is not included in this first digital-PDF prototype. No screenshot-only DOCX was created.`,
    );
  }
  if (meaningful.includes("\uFFFD") || /[\u0000-\u0008]/.test(meaningful))
    throw Error(
      `Page ${page.pageNumber} has unsupported text encoding. Conversion stopped to avoid missing or corrupt text.`,
    );
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
  // Render ONLY nontext artwork. Editable text is never in this image layer.
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
      !hiddenText.has(operators.fnArray[index]) && !suppress.has(index),
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
