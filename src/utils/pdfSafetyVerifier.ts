import { loadPdfJsFromBlob, pdfjsLib } from './pdfjs';

export const normalizeForSafetyCheck = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
export type SafetyVerificationRegion = { x: number; y: number; width: number; height: number };
export type SafetyVerificationTarget = { id?: string; value: string; page?: number; region?: SafetyVerificationRegion };
export type FinalVerificationResult = { passed: boolean; leakedValues: string[]; failedTargetIds: string[]; selectableTextFound: boolean };
export type FinalVerificationOptions = { flattenedPages?: ReadonlySet<number> };

/** Restrict flattened pages to non-overlapping raster image paints. This rejects
 * a selectable-text-free image merely covered by a vector or another image.
 * Version-specific to pinned PDF.js 3.11 operator list; unknown paints fail shut. */
async function rasterOnlyPage(page: any): Promise<boolean> {
  const ops = await page.getOperatorList();
  const O = pdfjsLib.OPS;
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const images: number[][] = [];
  const [x0, y0, x1, y1] = page.view;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const op = ops.fnArray[i], args = ops.argsArray[i];
    if (op === O.dependency) continue;
    if (op === O.save) { stack.push([...matrix]); continue; }
    if (op === O.restore) { if (!stack.length) return false; matrix = stack.pop()!; continue; }
    if (op === O.transform) { matrix = pdfjsLib.Util.transform(matrix, args); continue; }
    if (op === O.constructPath) {
      // Only the page-sized clipping path emitted by the strip writer is allowed.
      if (args[0].length !== 1 || args[0][0] !== O.rectangle ||
          args[1].some((value: number, j: number) => Math.abs(value - [x0, y0, x1 - x0, y1 - y0][j]) > 0.001) ||
          matrix.some((value, j) => Math.abs(value - [1,0,0,1,0,0][j]) > 0.001)) return false;
      continue;
    }
    if (op === O.clip || op === O.endPath) continue;
    if (op !== O.paintImageXObject) return false;
    const [a,b,c,d,e,f] = matrix;
    if (![a,b,c,d,e,f].every(Number.isFinite) || Math.abs(b) > 0.001 || Math.abs(c) > 0.001 || a <= 0 || d <= 0) return false;
    const box = [e,f,e+a,f+d];
    // Only the subpixel ceil padding at the outer canvas edge may be clipped.
    if (box[0] < x0-1 || box[1] < y0-1 || box[2] > x1+1 || box[3] > y1+1) return false;
    if (images.some(other => Math.min(box[2],other[2])-Math.max(box[0],other[0]) > 0.001 &&
                            Math.min(box[3],other[3])-Math.max(box[1],other[1]) > 0.001)) return false;
    images.push(box);
  }
  return images.length > 0 && stack.length === 0;
}

/** Independently reopens the finished PDF. Checks flattened-page text/annotations
 * and the interior pixels of EVERY supplied rectangle. This verifies application
 * of selected boxes, not detector recall or absence of PII outside those boxes. */
export async function verifyFinishedPdf(
  source: Uint8Array | Blob,
  selectedFindings: SafetyVerificationTarget[],
  onProgress?: (message: string) => void,
  options: FinalVerificationOptions = {},
): Promise<FinalVerificationResult> {
  const blob = source instanceof Blob ? source : new Blob([source as BlobPart], { type: 'application/pdf' });
  let loaded: Awaited<ReturnType<typeof loadPdfJsFromBlob>> | null = await loadPdfJsFromBlob(blob, { stopAtErrors: true });
  const targets = selectedFindings.map((target, index) => ({ ...target, id: target.id || `verification-${index}` }));
  const failed = new Set<string>();
  let selectableTextFound = false;
  let structureFailed = false;
  const validRegion = (r?: SafetyVerificationRegion) => !!r &&
    [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
    r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 &&
    r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001;
  try {
    const totalPages = loaded.pdf.numPages;
    const pages = options.flattenedPages ? [...options.flattenedPages] : Array.from({ length: totalPages }, (_, i) => i + 1);
    if (pages.some(p => !Number.isInteger(p) || p < 1 || p > totalPages)) structureFailed = true;
    const pageSet = new Set(pages);
    for (const target of targets) {
      if (!Number.isInteger(target.page) || !pageSet.has(target.page!) || !validRegion(target.region)) failed.add(target.id);
    }
    if (await loaded.pdf.getAttachments()) structureFailed = true;
    const validPages = pages.filter(p => Number.isInteger(p) && p >= 1 && p <= totalPages).sort((a, b) => a - b);
    for (let index = 0; index < validPages.length; index++) {
      if (index > 0 && index % 4 === 0) {
        await loaded.dispose();
        loaded = await loadPdfJsFromBlob(blob, { stopAtErrors: true });
      }
      const pageNumber = validPages[index];
      onProgress?.(`Verifying secure blackout page ${pageNumber} of ${totalPages}…`);
      const page = await loaded.pdf.getPage(pageNumber);
      const pageTargets = targets.filter(t => t.page === pageNumber && !failed.has(t.id));
      try {
        const content = await page.getTextContent();
        const hasText = content.items.some((item: any) => typeof item.str === 'string' && item.str.trim());
        const annotations = await page.getAnnotations();
        const rasterOnly = await rasterOnlyPage(page);
        if (hasText || annotations.length || !rasterOnly) {
          selectableTextFound ||= hasText;
          structureFailed = true;
          pageTargets.forEach(t => failed.add(t.id));
        }
        if (!pageTargets.length) continue;
        const viewport = page.getViewport({ scale: 1.15 });
        // Map against actual viewport dimensions, not ceil-rounded canvas size.
        const regions = pageTargets.map(t => {
          const r = t.region!;
          const insetX = Math.min(1, r.width * viewport.width / 4);
          const insetY = Math.min(1, r.height * viewport.height / 4);
          return { target: t, left: Math.ceil(r.x * viewport.width + insetX),
            top: Math.ceil(r.y * viewport.height + insetY),
            right: Math.floor((r.x + r.width) * viewport.width - insetX),
            bottom: Math.floor((r.y + r.height) * viewport.height - insetY), count: 0 };
        });
        const left = Math.max(0, Math.min(...regions.map(r => r.left)));
        const right = Math.min(Math.ceil(viewport.width), Math.max(...regions.map(r => r.right)));
        const top = Math.max(0, Math.min(...regions.map(r => r.top)));
        const bottom = Math.min(Math.ceil(viewport.height), Math.max(...regions.map(r => r.bottom)));
        const width = right - left;
        if (width <= 0 || width > 16384) { pageTargets.forEach(t => failed.add(t.id)); continue; }
        const stripHeight = Math.max(1, Math.floor(1_000_000 / width));
        for (let y = top; y < bottom; y += stripHeight) {
          const height = Math.min(stripHeight, bottom - y);
          const intersections = regions.filter(r => r.bottom > y && r.top < y + height && !failed.has(r.target.id));
          if (!intersections.length) continue;
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          try {
            const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
            if (!ctx) throw new Error('Unable to render final verification.');
            await page.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, -left, -y], background: '#ffffff' }).promise;
            for (const region of intersections) {
              const sampleTop = Math.max(y, region.top);
              const sampleBottom = Math.min(y + height, region.bottom);
              const w = region.right - region.left;
              if (w <= 0 || sampleBottom <= sampleTop) { failed.add(region.target.id); continue; }
              const data = ctx.getImageData(region.left - left, sampleTop - y, w, sampleBottom - sampleTop).data;
              region.count += data.length / 4;
              // Inspect every interior pixel; the old 82% dark threshold could
              // pass a region with substantial unredacted text/white space.
              for (let pixel = 0; pixel < data.length; pixel += 4) {
                if (data[pixel] > 64 || data[pixel + 1] > 64 || data[pixel + 2] > 64) {
                  failed.add(region.target.id); break;
                }
              }
            }
          } finally { canvas.width = 1; canvas.height = 1; canvas.remove(); }
        }
        regions.filter(r => r.count === 0).forEach(r => failed.add(r.target.id));
      } finally { page.cleanup(); }
    }
  } finally { await loaded?.dispose(); }
  return { passed: !structureFailed && !selectableTextFound && failed.size === 0,
    selectableTextFound, failedTargetIds: [...failed],
    leakedValues: targets.filter(t => failed.has(t.id)).map(t => t.value).filter(Boolean) };
}
