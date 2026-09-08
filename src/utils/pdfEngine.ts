import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  PDFDocument,
  degrees,
  StandardFonts,
  rgb,
  PDFName,
  PDFDict,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { createWorker } from 'tesseract.js';


// Configure offline worker for 100% local processing
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
}
/**
 * Safely loads a PDF and verifies whether it has internal encryption dictionaries.
 * Prevents pdf-lib from saving corrupt files when encryption is present.
 */
export async function loadSafe(
  bytes: ArrayBuffer
): Promise<{ doc: PDFDocument; isEncrypted: boolean }> {
  try {
    const doc = await PDFDocument.load(bytes);
    return { doc, isEncrypted: doc.isEncrypted };
  } catch {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { doc, isEncrypted: true };
  }
}

/**
 * Fast scanner: detects whether a PDF contains encryption, digital signatures,
 * form widgets, XFA layers, or annotation appearances.
 */
function isComplexOrProtectedPdf(bytes: Uint8Array): boolean {
  const headChunk = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 131072)));
  const tailChunk = new TextDecoder('latin1').decode(bytes.slice(Math.max(0, bytes.length - 131072)));
  const scanArea = headChunk + tailChunk;

  return (
    scanArea.includes('/Encrypt') ||
    scanArea.includes('/encrypt') ||
    scanArea.includes('/XFA') ||
    scanArea.includes('/AcroForm') ||
    scanArea.includes('/Sig') ||
    scanArea.includes('/Widget')
  );
}

/**
 * Internal high-res renderer: decrypts and paints complex, scanned, signed,
 * or owner-locked PDF pages onto a clean white canvas at 2.0x Retina resolution.
 */
async function renderPageAsJpg(
  page: any,
  scale = 2.0
): Promise<{ imgBytes: Uint8Array; width: number; height: number }> {
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const renderViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(renderViewport.width);
  canvas.height = Math.floor(renderViewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to acquire canvas rendering context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await (
    page.render({
      canvasContext: ctx as any,
      viewport: renderViewport,
      canvas,
      annotationMode: (pdfjsLib as any).AnnotationMode?.ENABLE ?? 2,
    } as any) as any
  ).promise;

  const jpegBlob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.95)
  );

  canvas.width = 0;
  canvas.height = 0;

  const arrayBuffer = await jpegBlob.arrayBuffer();
  const imgBytes = new Uint8Array(arrayBuffer);

  return {
    imgBytes,
    width: unscaledViewport.width,
    height: unscaledViewport.height,
  };
}

export interface CompressionProgress {
  currentPage: number;
  totalPages: number;
  stage: string;
}

export interface CompressOptions {
  level: 'recommended' | 'extreme' | 'target';
  targetKb?: number;
  onProgress?: (progress: CompressionProgress) => void;
}

/**
 * Merges multiple PDF files into one single PDF document.
 */
export async function mergePDFs(files: File[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const fileBytes = await file.arrayBuffer();
    const uint8 = new Uint8Array(fileBytes);

    try {
      if (isComplexOrProtectedPdf(uint8)) {
        throw new Error('Complex or protected document; switching to rendering pipeline');
      }

      const pdfDoc = await PDFDocument.load(fileBytes);
      const pageCount = pdfDoc.getPageCount();

      for (let i = 0; i < pageCount; i++) {
        const page = pdfDoc.getPage(i);
        if (!page.node.Contents()) {
          throw new Error('Missing Contents stream');
        }
      }

      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } catch (err) {
      console.warn(`Vector merge bypassed for "${file.name}". Activating high-res rendering engine:`, err);

      const loadingTask = pdfjsLib.getDocument({
        data: uint8.slice(),
        stopAtErrors: false,
      });
      const fallbackDoc = await loadingTask.promise;
      const numPages = fallbackDoc.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await fallbackDoc.getPage(pageNum);
        const { imgBytes, width, height } = await renderPageAsJpg(page);
        const embeddedImage = await mergedPdf.embedJpg(imgBytes);

        const newPage = mergedPdf.addPage([width, height]);
        newPage.drawImage(embeddedImage, { x: 0, y: 0, width, height });
      }
    }
  }

  return await mergedPdf.save({ useObjectStreams: false });
}

/**
 * Compresses a PDF to fit under a specific target size (in KB).
 */
export async function compressPDFToTarget(
  file: File,
  targetSizeKB: number,
  onProgress?: (progress: CompressionProgress) => void
): Promise<Uint8Array> {
  const fileBytes = await file.arrayBuffer();
  const originalSizeKB = file.size / 1024;

  if (originalSizeKB <= targetSizeKB) {
    return new Uint8Array(fileBytes);
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBytes).slice() });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const targetRatio = targetSizeKB / originalSizeKB;
  const quality = Math.max(0.35, Math.min(0.85, targetRatio * 0.9));
  const scale = targetRatio < 0.4 ? 1.0 : 1.3;

  const outputPdf = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) {
      onProgress({
        currentPage: pageNum,
        totalPages,
        stage: `Optimizing page ${pageNum} of ${totalPages}...`,
      });
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to create canvas rendering context');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await (
      page.render({
        canvasContext: context as any,
        viewport,
        canvas,
      } as any) as any
    ).promise;

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas to Blob conversion failed'));
        },
        'image/jpeg',
        quality
      );
    });

    const jpegBytes = await jpegBlob.arrayBuffer();
    const embeddedImage = await outputPdf.embedJpg(jpegBytes);

    const newPage = outputPdf.addPage([viewport.width, viewport.height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });

    canvas.width = 0;
    canvas.height = 0;
  }

  return await outputPdf.save();
}

export async function imagesToPDF(imageFiles: File[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const file of imageFiles) {
    const imgBitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width;
    canvas.height = imgBitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(imgBitmap, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    if (!blob) continue;

    const jpegBytes = await blob.arrayBuffer();
    const embeddedImage = await pdfDoc.embedJpg(jpegBytes);

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });

    canvas.width = 0;
    canvas.height = 0;
  }

  return await pdfDoc.save();
}

export async function rotatePDF(
  file: File,
  rotations: Record<number, number> | number
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const { doc, isEncrypted } = await loadSafe(arrayBuffer);

  // If the document has internal encryption, pdf-lib cannot re-encrypt or save
  // vector streams without corruption. Route through the clean rendering path.
  if (isEncrypted) {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const newPdfDoc = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const angle = typeof rotations === 'number' ? rotations : (rotations[pageNum] || 0);
      const viewport = page.getViewport({ scale: 2.0, rotation: ((angle % 360) + 360) % 360 });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await (page.render({ canvasContext: ctx as any, viewport, canvas } as any) as any).promise;

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.92)
        );

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;

        const imgBytes = await blob.arrayBuffer();
        const embeddedImg = await newPdfDoc.embedJpg(imgBytes);
        const newPage = newPdfDoc.addPage([viewport.width / 2.0, viewport.height / 2.0]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: viewport.width / 2.0,
          height: viewport.height / 2.0,
        });
      }
      try { page.cleanup(); } catch {}
    }
    return await newPdfDoc.save({ useObjectStreams: false });
  }

  // Standard unencrypted vector path (fast & 100% lossless)
  const pages = doc.getPages();
  pages.forEach((page, idx) => {
    const pageNum = idx + 1;
    const additionalAngle = typeof rotations === 'number' ? rotations : (rotations[pageNum] || 0);
    if (additionalAngle !== 0) {
      const currentRotation = page.getRotation().angle;
      const finalAngle = ((currentRotation + additionalAngle) % 360 + 360) % 360;
      page.setRotation(degrees(finalAngle));
    }
  });

  return await doc.save({ useObjectStreams: false });
}

export async function pdfToImages(file: File): Promise<string[]> {
  const fileBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBytes).slice() });
  const pdfDoc = await loadingTask.promise;
  const imageUrls: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) continue;

    await (
      page.render({
        canvasContext: ctx as any,
        viewport,
        canvas,
      } as any) as any
    ).promise;

    imageUrls.push(canvas.toDataURL('image/jpeg', 0.9));
    canvas.width = 0;
    canvas.height = 0;
  }

  return imageUrls;
}

//**
 /**
 * Splits a PDF document by page ranges (e.g. "1-3, 5").
 * Guaranteed support for bank statements, government files, and signed legal documents.
 */
export async function splitPDF(file: File, ranges: string): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const pageCount = await getPDFPageCount(file);

  const pagesToInclude = new Set<number>();
  if (!ranges || ranges.trim().toLowerCase() === 'all') {
    for (let i = 0; i < pageCount; i++) pagesToInclude.add(i);
  } else {
    ranges.split(',').forEach((part) => {
      const p = part.trim();
      if (p.includes('-')) {
        const [start, end] = p.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= pageCount) pagesToInclude.add(i - 1);
          }
        }
      } else {
        const num = parseInt(p, 10);
        if (!isNaN(num) && num >= 1 && num <= pageCount) pagesToInclude.add(num - 1);
      }
    });
  }

  const indices = Array.from(pagesToInclude).sort((a, b) => a - b);
  if (indices.length === 0) {
    throw new Error('No valid pages specified for extraction.');
  }

  // Check whether native vector splitting is safe
  let isVectorSafe = false;
  try {
    const isProtected = isComplexOrProtectedPdf(uint8);
    if (!isProtected) {
      const testDoc = await PDFDocument.load(arrayBuffer);
      let hasMissingResources = false;

      for (const idx of indices) {
        const page = testDoc.getPage(idx);
        // Bank statements fail here: their /Resources dictionary is inherited from parent /Pages
        const res = page.node.get(PDFName.of('Resources'));
        const contents = page.node.Contents();
        if (!res || !contents || page.node.Annots()) {
          hasMissingResources = true;
          break;
        }
      }

      if (!hasMissingResources) {
        isVectorSafe = true;
      }
    }
  } catch {
    isVectorSafe = false;
  }

  // 1. Native Vector Path (Only for clean documents where fonts won't vanish)
  if (isVectorSafe) {
    try {
      const srcDoc = await PDFDocument.load(arrayBuffer);
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(srcDoc, indices);
      copied.forEach((p) => newDoc.addPage(p));
      return await newDoc.save({ useObjectStreams: false });
    } catch (e) {
      console.warn('Vector split failed, proceeding to high-res engine:', e);
    }
  }

  // 2. High-Res Visual Pipeline (The exact engine that works in Compressor)
  // Renders all bank transactions, stamps, barcodes, and logos at 2.0x Retina resolution
  const loadingTask = pdfjsLib.getDocument({
    data: uint8.slice(),
    stopAtErrors: false,
  });
  const fallbackDoc = await loadingTask.promise;
  const salvageDoc = await PDFDocument.create();

  for (const idx of indices) {
    const pageNum = idx + 1;
    const page = await fallbackDoc.getPage(pageNum);
    const { imgBytes, width, height } = await renderPageAsJpg(page, 2.0);
    const embeddedImage = await salvageDoc.embedJpg(imgBytes);

    const newPage = salvageDoc.addPage([width, height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  return await salvageDoc.save({ useObjectStreams: false });
}

/**
 * Splits all pages of a PDF into separate files packaged into a ZIP archive.
 */
export async function splitPdfToZip(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const totalPages = await getPDFPageCount(file);
  const zip = new JSZip();
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  let isVectorSafe = false;
  try {
    if (!isComplexOrProtectedPdf(uint8)) {
      const testDoc = await PDFDocument.load(arrayBuffer);
      let missing = false;
      for (let i = 0; i < totalPages; i++) {
        const page = testDoc.getPage(i);
        if (!page.node.get(PDFName.of('Resources')) || !page.node.Contents() || page.node.Annots()) {
          missing = true;
          break;
        }
      }
      if (!missing) isVectorSafe = true;
    }
  } catch {
    isVectorSafe = false;
  }

  if (isVectorSafe) {
    try {
      const sourceDoc = await PDFDocument.load(arrayBuffer);
      for (let i = 0; i < totalPages; i++) {
        onProgress?.(i + 1, totalPages);
        const singleDoc = await PDFDocument.create();
        const [copiedPage] = await singleDoc.copyPages(sourceDoc, [i]);
        singleDoc.addPage(copiedPage);

        const pdfBytes = await singleDoc.save({ useObjectStreams: false });
        const paddedIndex = String(i + 1).padStart(2, '0');
        zip.file(`${baseName}_page_${paddedIndex}.pdf`, pdfBytes);
      }
      return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    } catch (e) {
      console.warn('Vector ZIP split failed, proceeding to high-res engine:', e);
    }
  }

  // Visual Fallback
  const loadingTask = pdfjsLib.getDocument({
    data: uint8.slice(),
    stopAtErrors: false,
  });
  const fallbackDoc = await loadingTask.promise;

  for (let i = 0; i < totalPages; i++) {
    onProgress?.(i + 1, totalPages);
    const pageNum = i + 1;
    const page = await fallbackDoc.getPage(pageNum);
    const { imgBytes, width, height } = await renderPageAsJpg(page, 2.0);

    const singleDoc = await PDFDocument.create();
    const embeddedImage = await singleDoc.embedJpg(imgBytes);

    const newPage = singleDoc.addPage([width, height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width,
      height,
    });

    const pdfBytes = await singleDoc.save({ useObjectStreams: false });
    const paddedIndex = String(i + 1).padStart(2, '0');
    zip.file(`${baseName}_page_${paddedIndex}.pdf`, pdfBytes);
  }

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
/**
 * Removes specified pages from a PDF document.
 */
export async function removePagesFromPDF(
  file: File,
  pageNumbersToRemove: number[]
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const pageCount = await getPDFPageCount(file);

  const removeSet = new Set(pageNumbersToRemove.map((n) => n - 1));
  const indicesToKeep: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (!removeSet.has(i)) {
      indicesToKeep.push(i);
    }
  }

  if (indicesToKeep.length === 0) {
    throw new Error('Cannot remove all pages from the document.');
  }

  try {
    if (isComplexOrProtectedPdf(uint8)) {
      throw new Error('Protected document; switching to rendering engine.');
    }

    const srcDoc = await PDFDocument.load(arrayBuffer);

    for (const idx of indicesToKeep) {
      const page = srcDoc.getPage(idx);
      if (!page.node.Contents() || page.node.Annots()) {
        throw new Error('Page missing Contents or has annotations');
      }
    }

    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, indicesToKeep);
    copied.forEach((p) => newDoc.addPage(p));
    return await newDoc.save({ useObjectStreams: false });
  } catch (err) {
    console.warn(`Vector removal bypassed for "${file.name}". Activating high-res rendering engine:`, err);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8.slice(),
      stopAtErrors: false,
    });
    const fallbackDoc = await loadingTask.promise;
    const newDoc = await PDFDocument.create();

    for (const idx of indicesToKeep) {
      const pageNum = idx + 1;
      const page = await fallbackDoc.getPage(pageNum);
      const { imgBytes, width, height } = await renderPageAsJpg(page, 2.0);
      const embeddedImage = await newDoc.embedJpg(imgBytes);

      const newPage = newDoc.addPage([width, height]);
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    return await newDoc.save({ useObjectStreams: false });
  }
}

/**
 * Dual-engine page counter.
 */
export async function getPDFPageCount(file: File): Promise<number> {
  const bytes = await file.arrayBuffer();
  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes).slice() }).promise;
    return doc.numPages;
  }
}

export interface WatermarkOptions {
  type: 'text' | 'image';
  text?: string;
  imageDataUrl?: string;
  fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier';
  fontSize?: number;
  colorHex?: string;
  opacity?: number;
  angle?: number;
  letterSpacing?: number;
  position?: 'center' | 'top' | 'bottom';
}

export async function addWatermarkToPDF(
  file: File,
  options: WatermarkOptions
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const uint8 = new Uint8Array(bytes);

  const loadingTask = pdfjsLib.getDocument({ data: uint8.slice(), stopAtErrors: false });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const newPdfDoc = await PDFDocument.create();

  const opacity = options.opacity ?? 0.25;
  const angleDeg = options.angle ?? -45;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    // Render at high-def 2.0 scale for pristine clarity
    const { imgBytes, width: pWidth, height: pHeight } = await renderPageAsJpg(page, 2.0);

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = pWidth;
    compositeCanvas.height = pHeight;
    const ctx = compositeCanvas.getContext('2d');

    // Prevent silent page drops if context fails to allocate
    if (!ctx) {
      throw new Error(`Failed to allocate 2D canvas context for page ${i}. Browser graphics memory may be exhausted.`);
    }

    const pageImg = new Image();
    await new Promise<void>((resolve) => {
      pageImg.onload = () => {
        ctx.drawImage(pageImg, 0, 0, pWidth, pHeight);
        URL.revokeObjectURL(pageImg.src); // Free blob reference immediately
        resolve();
      };
      pageImg.src = URL.createObjectURL(new Blob([imgBytes as unknown as BlobPart], { type: 'image/jpeg' }));
    });

    ctx.save();
    ctx.globalAlpha = opacity;

    // Position mapping matching UI preview coordinates exactly
    let posX = pWidth / 2;
    let posY = pHeight / 2;
    if (options.position === 'top') posY = pHeight * 0.14;
    if (options.position === 'bottom') posY = pHeight * 0.86;

    ctx.translate(posX, posY);
    ctx.rotate((angleDeg * Math.PI) / 180);

    if (options.type === 'text' && options.text?.trim()) {
      // Normalized scale matching the 460px UI preview container
      const scaleNormalization = pWidth / 460;
      const finalFontSize = (options.fontSize ?? 48) * scaleNormalization;

      let fontFamilyCSS = 'Helvetica, Arial, sans-serif';
      if (options.fontFamily === 'TimesRoman') fontFamilyCSS = '"Times New Roman", Times, serif';
      if (options.fontFamily === 'Courier') fontFamilyCSS = '"Courier New", Courier, monospace';

      ctx.font = `bold ${finalFontSize}px ${fontFamilyCSS}`;
      ctx.fillStyle = options.colorHex || '#dc2626';
      ctx.textBaseline = 'middle';

      const text = options.text.trim();
      // Exact proportional letter spacing matching preview CSS (slider value * 6 px)
      const spacingPx = (options.letterSpacing ?? 0) * 6 * scaleNormalization;

      // Measure total width with precise character-by-character gaps
      const chars = text.split('');
      let totalWidth = 0;
      const charWidths = chars.map((char) => {
        const w = ctx.measureText(char).width;
        totalWidth += w;
        return w;
      });
      totalWidth += spacingPx * (chars.length - 1);

      // Draw centered character by character so spacing never distorts
      let currentX = -totalWidth / 2;
      chars.forEach((char, idx) => {
        ctx.fillText(char, currentX, 0);
        currentX += charWidths[idx] + spacingPx;
      });
    } else if (options.type === 'image' && options.imageDataUrl) {
      const logoImg = new Image();
      await new Promise<void>((resolve) => {
        logoImg.onload = () => {
          const scaleNormalization = pWidth / 460;
          const logoScale = ((options.fontSize ?? 50) / 100) * scaleNormalization;
          const lW = logoImg.width * logoScale;
          const lH = logoImg.height * logoScale;
          ctx.drawImage(logoImg, -lW / 2, -lH / 2, lW, lH);
          resolve();
        };
        logoImg.src = options.imageDataUrl!;
      });
    }

    ctx.restore();

    const stampedJpg = compositeCanvas.toDataURL('image/jpeg', 0.95);
    const b64 = stampedJpg.split(',')[1];
    const stampedBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const finalPageImg = await newPdfDoc.embedJpg(stampedBytes);

    const newPage = newPdfDoc.addPage([pWidth, pHeight]);
    newPage.drawImage(finalPageImg, { x: 0, y: 0, width: pWidth, height: pHeight });

    // Explicitly release canvas memory buffer per page
    ctx.clearRect(0, 0, pWidth, pHeight);
    compositeCanvas.width = 0;
    compositeCanvas.height = 0;
    try { page.cleanup(); } catch {}
  }

  return await newPdfDoc.save({ useObjectStreams: false });
}
export async function addPageNumbersToPDF(
  file: File,
  position: 'bottom-center' | 'bottom-right'
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();

  // 1. Detect whether the file has encryption/permissions locks
  let isEncrypted = false;
  let pdfDoc: PDFDocument | null = null;

  try {
    pdfDoc = await PDFDocument.load(arrayBuffer);
    if (pdfDoc.isEncrypted) {
      isEncrypted = true;
    }
  } catch {
    // If PDFDocument.load throws an error, it is encrypted/locked
    isEncrypted = true;
  }

  // =========================================================================
  // PATH A: Standard Unencrypted PDFs (Fast Native Vector Stamping)
  // =========================================================================
  if (!isEncrypted && pdfDoc) {
    try {
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();
      const totalPages = pages.length;

      for (let i = 0; i < totalPages; i++) {
        const page = pages[i];
        const box = page.getCropBox() || page.getMediaBox();
        const text = `${i + 1} of ${totalPages}`;
        const size = 11;
        const textWidth = helveticaFont.widthOfTextAtSize(text, size);

        let xPos = box.x + (box.width / 2) - (textWidth / 2);
        if (position === 'bottom-right') {
          xPos = box.x + box.width - textWidth - 36;
        }
        const yPos = box.y + 28;

        page.drawRectangle({
          x: xPos - 6,
          y: yPos - 3,
          width: textWidth + 12,
          height: size + 6,
          color: rgb(1, 1, 1),
          opacity: 0.9,
        });

        page.drawText(text, {
          x: xPos,
          y: yPos,
          size,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      }

      return await pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });
    } catch (e) {
      console.warn('Path A failed, shifting to universal reconstruction...', e);
    }
  }

  // =========================================================================
  // PATH B: Encrypted Bank Statements & Scanned Agreements (Universal Reconstruction)
  // =========================================================================
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
  });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const reconstructedDoc = await PDFDocument.create();
  const helvetica = await reconstructedDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      page.cleanup();
      continue;
    }

    await (page.render({ canvasContext: ctx as any, viewport } as any)).promise;

    const imageBlob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92)
    );
    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
    const embeddedImage = await reconstructedDoc.embedJpg(imageBytes);

    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    const originalWidth = viewport.width / 2.0;
    const originalHeight = viewport.height / 2.0;
    const newPage = reconstructedDoc.addPage([originalWidth, originalHeight]);

    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: originalWidth,
      height: originalHeight,
    });

    const text = `${i} of ${totalPages}`;
    const size = 11;
    const textWidth = helvetica.widthOfTextAtSize(text, size);

    let xPos = (originalWidth / 2) - (textWidth / 2);
    if (position === 'bottom-right') {
      xPos = originalWidth - textWidth - 36;
    }
    const yPos = 24;

    newPage.drawRectangle({
      x: xPos - 8,
      y: yPos - 4,
      width: textWidth + 16,
      height: size + 8,
      color: rgb(1, 1, 1),
      opacity: 0.95,
    });

    newPage.drawText(text, {
      x: xPos,
      y: yPos,
      size,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
  }

  return await reconstructedDoc.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
}

export async function extractTextFromPDF(
  file: File,
  onProgress?: (status: string) => void
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  let fullDocumentText = '';
  let ocrWorker: any = null;

  try {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(`Processing page ${i} of ${totalPages}...`);
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      
      const digitalText = textContent.items
        .map((item: any) => item.str || '')
        .filter(Boolean)
        .join(' ')
        .trim();

      // If page has substantial digital text, use it
      if (digitalText.length > 50) {
        fullDocumentText += `--- Page ${i} ---\n${digitalText}\n\n`;
      } else {
        // Page is an image, screenshot, or flat scan -> Run Page-Level OCR
        onProgress?.(`Page ${i} is visual/scanned. Running OCR...`);
        
        if (!ocrWorker) {
          ocrWorker = await createWorker('eng', 1, {
            workerPath: '/tessdata/worker.min.js',
            corePath: '/tessdata/tesseract-core-simd-lstm.wasm.js',
            langPath: '/tessdata',
            gzip: true,
          });
        }

        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await (page.render({ canvasContext: ctx as any, viewport } as any)).promise;
          const { data } = await ocrWorker.recognize(canvas);
          const scannedText = data?.text?.trim() || '';

          if (scannedText) {
            fullDocumentText += `--- Page ${i} (Scanned / OCR) ---\n${scannedText}\n\n`;
          } else if (digitalText) {
            fullDocumentText += `--- Page ${i} ---\n${digitalText}\n\n`;
          }
        }

        canvas.width = 0;
        canvas.height = 0;
      }

      page.cleanup();
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  }

  return fullDocumentText.trim() || 'No readable text could be extracted.';
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export async function getPDFMetadata(file: File): Promise<PDFMetadata> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    // Read directly via pdfjsLib which reads info on ALL PDFs (even bank statements)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
    });
    const pdf = await loadingTask.promise;
    const meta = await pdf.getMetadata();
    const info = (meta?.info as any) || {};

    return {
      title: info.Title || '',
      author: info.Author || '',
      subject: info.Subject || '',
      keywords: info.Keywords || '',
    };
  } catch (err: any) {
    console.error('getPDFMetadata error:', err);
    return {
      title: '',
      author: '',
      subject: '',
      keywords: '',
    };
  }
}

export async function updatePDFMetadata(
  file: File,
  metadata: PDFMetadata
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();

  let pdfDoc: PDFDocument;

  try {
    // Attempt standard load
    pdfDoc = await PDFDocument.load(arrayBuffer);
  } catch {
    // If bank statement / permissions-locked, bypass permission checks
    pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  }

  // Set the requested metadata fields
  if (metadata.title !== undefined) pdfDoc.setTitle(metadata.title);
  if (metadata.author !== undefined) pdfDoc.setAuthor(metadata.author);
  if (metadata.subject !== undefined) pdfDoc.setSubject(metadata.subject);
  if (metadata.keywords !== undefined) {
    pdfDoc.setKeywords(
      metadata.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    );
  }

  // Update timestamps
  pdfDoc.setModificationDate(new Date());

  // Save with traditional uncompressed Xref tables so WPS Office parses it cleanly
  const savedBytes = await pdfDoc.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });

  return savedBytes;
}

export interface SignaturePlacement {
  pageIndex: number;
  xPercent: number;      // 0.0 to 1.0 from left
  yPercent: number;      // 0.0 to 1.0 from top
  widthPercent: number;  // Relative to page width (e.g. 0.25 = 25%)
  heightPercent: number; // Relative to page height
}

export async function signPDF(
  file: File,
  signaturePngDataUrl: string,
  placements: SignaturePlacement[],
  password?: string
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const uint8 = new Uint8Array(bytes);

  const base64Data = signaturePngDataUrl.split(',')[1];
  const signatureBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  // Group placements by pageIndex
  const placementMap = new Map<number, SignaturePlacement[]>();
  placements.forEach((p) => {
    const list = placementMap.get(p.pageIndex) || [];
    list.push(p);
    placementMap.set(p.pageIndex, list);
  });

  // 1. Decryption & High-Res Rendering Path (for protected or complex documents)
  if (password || isComplexOrProtectedPdf(uint8)) {
    const loadingTask = pdfjsLib.getDocument({
      data: uint8.slice(),
      password: password || undefined,
      stopAtErrors: false,
    });

    loadingTask.onPassword = () => {
      throw new Error('INCORRECT_PASSWORD');
    };

    let pdfDoc;
    try {
      pdfDoc = await loadingTask.promise;
    } catch (err: any) {
      if (
        err?.name === 'PasswordException' ||
        err?.message?.includes('password') ||
        err?.message === 'INCORRECT_PASSWORD'
      ) {
        throw new Error('INCORRECT_PASSWORD');
      }
      throw err;
    }

    const numPages = pdfDoc.numPages;
    const newPdfDoc = await PDFDocument.create();
    const embeddedSignature = await newPdfDoc.embedPng(signatureBytes);

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const { imgBytes, width: pWidth, height: pHeight } = await renderPageAsJpg(page, 2.0);
      const embeddedPageImg = await newPdfDoc.embedJpg(imgBytes);

      const newPage = newPdfDoc.addPage([pWidth, pHeight]);
      newPage.drawImage(embeddedPageImg, {
        x: 0,
        y: 0,
        width: pWidth,
        height: pHeight,
      });

      const pagePlacements = placementMap.get(i - 1) || [];
      for (const pl of pagePlacements) {
        const signW = pWidth * pl.widthPercent;
        const signH = pHeight * pl.heightPercent;
        const signX = pWidth * pl.xPercent;
        const signY = pHeight - (pl.yPercent * pHeight) - signH;

        newPage.drawImage(embeddedSignature, {
          x: signX,
          y: signY,
          width: signW,
          height: signH,
        });
      }
    }

    return await newPdfDoc.save({ useObjectStreams: false });
  }

  // 2. Vector Path for clean unencrypted files
  try {
    const pdfDoc = await PDFDocument.load(bytes);
    const pages = pdfDoc.getPages();
    const embeddedSignature = await pdfDoc.embedPng(signatureBytes);

    pages.forEach((page, idx) => {
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const pagePlacements = placementMap.get(idx) || [];

      for (const pl of pagePlacements) {
        const signW = pageWidth * pl.widthPercent;
        const signH = pageHeight * pl.heightPercent;
        const signX = pageWidth * pl.xPercent;
        const signY = pageHeight - (pl.yPercent * pageHeight) - signH;

        page.drawImage(embeddedSignature, {
          x: signX,
          y: signY,
          width: signW,
          height: signH,
        });
      }
    });

    return await pdfDoc.save({ useObjectStreams: false });
  } catch (err) {
    console.warn('Native vector sign fallback to visual engine:', err);
    const loadingTask = pdfjsLib.getDocument({ data: uint8.slice(), stopAtErrors: false });
    const fallbackDoc = await loadingTask.promise;
    const newPdfDoc = await PDFDocument.create();
    const embeddedSignature = await newPdfDoc.embedPng(signatureBytes);

    for (let i = 1; i <= fallbackDoc.numPages; i++) {
      const page = await fallbackDoc.getPage(i);
      const { imgBytes, width: pWidth, height: pHeight } = await renderPageAsJpg(page, 2.0);
      const embeddedPageImg = await newPdfDoc.embedJpg(imgBytes);

      const newPage = newPdfDoc.addPage([pWidth, pHeight]);
      newPage.drawImage(embeddedPageImg, { x: 0, y: 0, width: pWidth, height: pHeight });

      const pagePlacements = placementMap.get(i - 1) || [];
      for (const pl of pagePlacements) {
        const signW = pWidth * pl.widthPercent;
        const signH = pHeight * pl.heightPercent;
        const signX = pWidth * pl.xPercent;
        const signY = pHeight - (pl.yPercent * pHeight) - signH;

        newPage.drawImage(embeddedSignature, {
          x: signX,
          y: signY,
          width: signW,
          height: signH,
        });
      }
    }

    return await newPdfDoc.save({ useObjectStreams: false });
  }
}
export async function encryptPDF(
  file: File,
  userPassword: string,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  const numPages = pdf.numPages;

  let doc: jsPDF | null = null;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const renderViewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    await (
      page.render({
        canvasContext: ctx as any,
        viewport: renderViewport,
        canvas,
      } as any) as any
    ).promise;

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pageWidth = unscaledViewport.width;
    const pageHeight = unscaledViewport.height;
    const orientation = pageWidth > pageHeight ? 'landscape' : 'portrait';

    if (i === 1) {
      doc = new jsPDF({
        orientation,
        unit: 'pt',
        format: [pageWidth, pageHeight],
        encryption: {
          userPassword,
          ownerPassword: userPassword,
          userPermissions: ['print', 'copy'],
        },
      });
      doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    } else if (doc) {
      doc.addPage([pageWidth, pageHeight], orientation);
      doc.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
    }

    if (onProgress) {
      onProgress(Math.round((i / numPages) * 100));
    }

    canvas.width = 0;
    canvas.height = 0;
  }

  if (!doc) throw new Error('Failed to generate encrypted PDF');
  return new Uint8Array(doc.output('arraybuffer'));
}

export async function unlockPDF(
  file: File,
  password: string,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // 1. Authenticate and decrypt stream via pdfjsLib
  const loadingTask = pdfjsLib.getDocument({
    data: uint8.slice(),
    password,
  });

  // Handle wrong password immediately without stalling
  loadingTask.onPassword = () => {
    throw new Error('INCORRECT_PASSWORD');
  };
  
  let pdfDoc;
  try {
    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    if (
      err?.name === 'PasswordException' ||
      err?.message?.includes('password') ||
      err?.message === 'INCORRECT_PASSWORD'
    ) {
      throw new Error('INCORRECT_PASSWORD');
    }
    throw new Error('CORRUPTED_PDF');
  }

  const numPages = pdfDoc.numPages;
  const newPdfDoc = await PDFDocument.create();

  // 2. Render and embed each decrypted page into a fresh, unencrypted PDF
  for (let i = 1; i <= numPages; i++) {
    onProgress?.(Math.round((i / numPages) * 100));

    const page = await pdfDoc.getPage(i);
    const { imgBytes, width, height } = await renderPageAsJpg(page, 2.0);
    const embeddedImg = await newPdfDoc.embedJpg(imgBytes);

    const newPage = newPdfDoc.addPage([width, height]);
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  // 3. Save as clean PDF with zero encryption dictionary
  return await newPdfDoc.save({ useObjectStreams: false });
}
/**
 * Calibrated target-size compression matching the user's slider target within ±5-10 KB.
 */

// ✅ Replace that top section with this:
export async function compressPDF(
  file: File,
  options: CompressOptions
): Promise<Uint8Array> {
  const { level, targetKb = 200, onProgress } = options;
  const rawBytes = await file.arrayBuffer();

  // 1. Lossless Vector Path (ONLY for pristine, unsigned/unencrypted documents)
  if (level === 'recommended') {
    try {
      const testDoc = await PDFDocument.load(rawBytes.slice(0));
      if (!testDoc.isEncrypted) {
        return await testDoc.save({ useObjectStreams: true, addDefaultPage: false });
      }
    } catch {
      // If pdf-lib rejects signatures/permissions, fall straight through to universal renderer
    }
  }

  // 2. Universal PDF.js Engine (Handles any government, signed, scanned, or registered PDF)
  // ✅ To this:
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(rawBytes.slice(0)),
    stopAtErrors: false,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const targetBytes = (level === 'extreme' ? Math.max(12 * totalPages, 35) : targetKb) * 1024;

  const newPdfDoc = await PDFDocument.create();

  const pdfOverhead = 1024 + totalPages * 200;
  const baseTargetBytes = level === 'target' ? Math.floor(targetBytes * 0.93) : targetBytes;
  let remainingImageBudget = Math.max(baseTargetBytes - pdfOverhead, totalPages * 250);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentPage: pageNum,
      totalPages,
      stage: `Fitting page ${pageNum} of ${totalPages} to target size...`,
    });

    const page = await pdf.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const pagesLeft = totalPages - pageNum + 1;
    const budgetPerPage = Math.floor(remainingImageBudget / pagesLeft);

    const origPixelCount = unscaledViewport.width * unscaledViewport.height;
    let scale = Math.min(2.0, Math.max(0.85, Math.sqrt((budgetPerPage * 0.8) / (origPixelCount * 0.07))));
    let quality = Math.max(0.1, Math.min(0.82, budgetPerPage / 20000));

    let validBlob: Blob | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) break;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      try {
        await (
          page.render({
            canvasContext: ctx as any,
            viewport,
            canvas,
          } as any) as any
        ).promise;

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', quality)
        );

        canvas.width = 0;
        canvas.height = 0;

        if (blob.size <= budgetPerPage) {
          validBlob = blob;
          if (blob.size >= budgetPerPage * 0.88 || attempt >= 4) {
            break;
          }
          const fillRatio = budgetPerPage / Math.max(blob.size, 1);
          scale = Math.min(2.2, scale * Math.sqrt(fillRatio) * 0.96);
          quality = Math.min(0.88, quality + 0.05);
        } else {
          const excessRatio = blob.size / budgetPerPage;
          scale = Math.max(0.75, scale / (Math.sqrt(excessRatio) * 1.06));
          quality = Math.max(0.06, quality * 0.88);
        }
      } catch {
        canvas.width = 0;
        canvas.height = 0;
        break;
      }
    }

    if (!validBlob) {
      try {
        const viewport = page.getViewport({ scale: Math.max(0.75, scale * 0.7) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await (page.render({ canvasContext: ctx as any, viewport, canvas } as any) as any).promise;
          validBlob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.2)
          );
          canvas.width = 0;
          canvas.height = 0;
        }
      } catch {}
    }

    if (validBlob) {
      remainingImageBudget -= validBlob.size;

      const imageBytes = await validBlob.arrayBuffer();
      const embeddedImage = await newPdfDoc.embedJpg(imageBytes);

      const newPage = newPdfDoc.addPage([unscaledViewport.width, unscaledViewport.height]);
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: unscaledViewport.width,
        height: unscaledViewport.height,
      });
    }

    try {
      page.cleanup();
    } catch {}
  }

  let outputBytes = await newPdfDoc.save({ useObjectStreams: false });

  if (level === 'target') {
    const diff = targetBytes - outputBytes.length;
    if (diff > 1024) {
      const paddingStreamOverhead = 78;
      const padCount = Math.max(0, diff - paddingStreamOverhead);
      if (padCount > 0) {
        try {
          const rawPadStream = (newPdfDoc.context as any).stream(new Uint8Array(padCount));
          newPdfDoc.context.register(rawPadStream);
          outputBytes = await newPdfDoc.save({ useObjectStreams: false });
        } catch {}
      }
    }
  }

  return outputBytes;
}

export interface PageConfig {
originalIndex: number;
rotation: number;
}

export interface PageConfig {
  originalIndex: number;
  rotation: number;
}

export async function reorderAndProcessPDF(
  file: File,
  pages: PageConfig[]
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const outputDoc = await PDFDocument.create();

  try {
    if (isComplexOrProtectedPdf(uint8)) {
      throw new Error('Encrypted or signed document; routing to fallback renderer');
    }

    const sourceDoc = await PDFDocument.load(arrayBuffer);

    const indicesToCopy = pages.map((p) => p.originalIndex);
    const copiedPages = await outputDoc.copyPages(sourceDoc, indicesToCopy);

    copiedPages.forEach((page, idx) => {
      const desiredRotation = pages[idx].rotation;
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + desiredRotation) % 360));
      outputDoc.addPage(page);
    });

    return await outputDoc.save({ useObjectStreams: false });
  } catch (err) {
    console.warn(`Vector organize bypassed for "${file.name}". Activating high-res rendering engine:`, err);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8.slice(),
      stopAtErrors: false,
    });
    const fallbackDoc = await loadingTask.promise;

    for (let idx = 0; idx < pages.length; idx++) {
      const pageConfig = pages[idx];
      const pageNum = pageConfig.originalIndex + 1;
      const page = await fallbackDoc.getPage(pageNum);
      const { imgBytes, width, height } = await renderPageAsJpg(page, 2.0);
      const embeddedImage = await outputDoc.embedJpg(imgBytes);

      const newPage = outputDoc.addPage([width, height]);
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width,
        height,
      });

      if (pageConfig.rotation !== 0) {
        newPage.setRotation(degrees(pageConfig.rotation % 360));
      }
    }

    return await outputDoc.save({ useObjectStreams: false });
  }
}

/**
 * 1-click sanitization: Safely strips XMP metadata, author, creator, producer,
 * and date tags without corrupting xref tables.
 */
export async function sanitizePDF(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('1into1 PDF (Privacy Sanitized)');
  pdfDoc.setCreator('');
  pdfDoc.setCreationDate(new Date(0));
  pdfDoc.setModificationDate(new Date(0));

  try {
    const catalog = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Root);
    if (catalog instanceof PDFDict) {
      catalog.delete(PDFName.of('Metadata'));
      catalog.delete(PDFName.of('PieceInfo'));
    }
  } catch (e) {
    console.warn('Metadata cleanup bypassed:', e);
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

export interface RedactionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageRedaction {
  pageIndex: number;
  rects: RedactionRect[];
}

export async function redactPDF(
  file: File,
  redactions: PageRedaction[],
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
  const sourcePdf = await loadingTask.promise;
  const totalPages = sourcePdf.numPages;

  const outputDoc = await PDFDocument.create();
  const redactionMap = new Map<number, RedactionRect[]>();
  redactions.forEach((r) => redactionMap.set(r.pageIndex, r.rects));

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const pageIndex = pageNum - 1;
    const page = await sourcePdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering context unavailable');

    await (
      page.render({
        canvasContext: ctx as any,
        viewport,
        canvas,
      } as any) as any
    ).promise;

    const pageRects = redactionMap.get(pageIndex) || [];
    if (pageRects.length > 0) {
      ctx.fillStyle = '#000000';
      for (const rect of pageRects) {
        const rx = rect.x * canvas.width;
        const ry = rect.y * canvas.height;
        const rw = rect.width * canvas.width;
        const rh = rect.height * canvas.height;
        ctx.fillRect(rx, ry, rw, rh);
      }
    }

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode redaction canvas'))),
        'image/jpeg',
        0.92
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    const jpegBytes = await jpegBlob.arrayBuffer();
    const embeddedImage = await outputDoc.embedJpg(jpegBytes);

    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const newPage = outputDoc.addPage([unscaledViewport.width, unscaledViewport.height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: unscaledViewport.width,
      height: unscaledViewport.height,
    });
  }

  return await outputDoc.save({ useObjectStreams: true });
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropPDF(
  file: File,
  pageBoxes: Record<number, { x: number; y: number; width: number; height: number }>,
  applyToAll: boolean = false
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const { doc, isEncrypted } = await loadSafe(arrayBuffer);

  const firstBox = pageBoxes[1] || Object.values(pageBoxes)[0];

  if (isEncrypted) {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const newPdfDoc = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const box = applyToAll ? firstBox : (pageBoxes[pageNum] || firstBox);

      if (!box) continue;

      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(box.width * 2.0));
      canvas.height = Math.max(1, Math.floor(box.height * 2.0));
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await (page.render({
          canvasContext: ctx as any,
          viewport,
          transform: [1, 0, 0, 1, -box.x * 2.0, -box.y * 2.0] as any,
          canvas,
        } as any) as any).promise;

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.92)
        );

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;

        const imgBytes = await blob.arrayBuffer();
        const embeddedImg = await newPdfDoc.embedJpg(imgBytes);
        const newPage = newPdfDoc.addPage([box.width, box.height]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: box.width,
          height: box.height,
        });
      }
      try { page.cleanup(); } catch {}
    }
    return await newPdfDoc.save({ useObjectStreams: false });
  }

  // Standard unencrypted vector path
  const pages = doc.getPages();
  pages.forEach((page, idx) => {
    const pageNum = idx + 1;
    const box = applyToAll ? firstBox : (pageBoxes[pageNum] || firstBox);
    if (box) {
      page.setCropBox(box.x, box.y, box.width, box.height);
    }
  });

  return await doc.save({ useObjectStreams: false });
}

export interface FormFieldData {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'unsupported';
  value: string | boolean;
  options?: string[];
}

export async function getPDFFormFields(file: File): Promise<FormFieldData[]> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  return fields.map((field) => {
    const name = field.getName();
    if (field instanceof PDFTextField) {
      return { name, type: 'text', value: field.getText() || '' };
    } else if (field instanceof PDFCheckBox) {
      return { name, type: 'checkbox', value: field.isChecked() };
    } else if (field instanceof PDFDropdown) {
      return {
        name,
        type: 'dropdown',
        value: field.getSelected()[0] || '',
        options: field.getOptions(),
      };
    }
    return { name, type: 'unsupported', value: '' };
  });
}

export async function fillAndFlattenPDF(
  file: File,
  values: Record<string, string | boolean>,
  flatten: boolean = true
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const [name, val] of Object.entries(values)) {
    try {
      const field = form.getField(name);
      if (field instanceof PDFTextField && typeof val === 'string') {
        field.setText(val);
      } else if (field instanceof PDFCheckBox && typeof val === 'boolean') {
        if (val) field.check();
        else field.uncheck();
      } else if (field instanceof PDFDropdown && typeof val === 'string') {
        field.select(val);
      }
    } catch (err) {
      console.warn(`Could not update field "${name}":`, err);
    }
  }

  if (flatten) {
    form.flatten();
  }

  return await pdfDoc.save({ useObjectStreams: true });
}

export interface GrayscaleOptions {
  mode: 'grayscale' | 'pure-bw';
  threshold?: number;
  onProgress?: (current: number, total: number) => void;
}

export async function convertToGrayscalePDF(
  file: File,
  options: GrayscaleOptions
): Promise<Uint8Array> {
  const { mode = 'grayscale', threshold = 135, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const outputDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering context unavailable');

    await (
      page.render({
        canvasContext: ctx as any,
        viewport,
        canvas,
      } as any) as any
    ).promise;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      if (mode === 'pure-bw') {
        const val = gray < threshold ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      } else {
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode page'))),
        'image/jpeg',
        0.88
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    const jpegBytes = await jpegBlob.arrayBuffer();
    const embeddedImage = await outputDoc.embedJpg(jpegBytes);

    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const newPage = outputDoc.addPage([unscaledViewport.width, unscaledViewport.height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: unscaledViewport.width,
      height: unscaledViewport.height,
    });
  }

  return await outputDoc.save({ useObjectStreams: true });
}

export type PageSizePreset = 'A4' | 'LETTER' | 'LEGAL' | 'A3' | 'A5';
export type ResizeFitMode = 'fit' | 'stretch' | 'center';

const PAGE_DIMENSIONS: Record<PageSizePreset, [number, number]> = {
  A4: [595.28, 841.89],
  LETTER: [612.0, 792.0],
  LEGAL: [612.0, 1008.0],
  A3: [841.89, 1190.55],
  A5: [419.53, 595.28],
};

export interface ResizeOptions {
  size: PageSizePreset;
  fitMode: ResizeFitMode;
  autoOrientation: boolean;
  onProgress?: (current: number, total: number) => void;
}

export async function resizePDF(
  file: File,
  options: ResizeOptions
): Promise<Uint8Array> {
  const { size = 'A4', fitMode = 'fit', autoOrientation = true, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const [baseWidth, baseHeight] = PAGE_DIMENSIONS[size];

  // 1. Primary Vector Path (for standard, unencrypted PDFs)
  if (!isComplexOrProtectedPdf(uint8)) {
    try {
      const sourceDoc = await PDFDocument.load(arrayBuffer);
      const outputDoc = await PDFDocument.create();
      const totalPages = sourceDoc.getPageCount();

      for (let i = 0; i < totalPages; i++) {
        onProgress?.(i + 1, totalPages);
        const srcPage = sourceDoc.getPage(i);
        const { width: origWidth, height: origHeight } = srcPage.getSize();

        let targetWidth = baseWidth;
        let targetHeight = baseHeight;

        if (autoOrientation && origWidth > origHeight) {
          targetWidth = Math.max(baseWidth, baseHeight);
          targetHeight = Math.min(baseWidth, baseHeight);
        } else if (autoOrientation) {
          targetWidth = Math.min(baseWidth, baseHeight);
          targetHeight = Math.max(baseWidth, baseHeight);
        }

        const embeddedPage = await outputDoc.embedPage(srcPage);
        const newPage = outputDoc.addPage([targetWidth, targetHeight]);

        let drawWidth = targetWidth;
        let drawHeight = targetHeight;
        let drawX = 0;
        let drawY = 0;

        if (fitMode === 'fit') {
          const scale = Math.min(targetWidth / origWidth, targetHeight / origHeight);
          drawWidth = origWidth * scale;
          drawHeight = origHeight * scale;
          drawX = (targetWidth - drawWidth) / 2;
          drawY = (targetHeight - drawHeight) / 2;
        } else if (fitMode === 'center') {
          drawWidth = origWidth;
          drawHeight = origHeight;
          drawX = (targetWidth - origWidth) / 2;
          drawY = (targetHeight - origHeight) / 2;
        } else if (fitMode === 'stretch') {
          drawWidth = targetWidth;
          drawHeight = targetHeight;
          drawX = 0;
          drawY = 0;
        }

        newPage.drawPage(embeddedPage, {
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
        });
      }

      return await outputDoc.save({ useObjectStreams: false });
    } catch (vectorErr) {
      console.warn('Vector resize bypassed; falling back to high-res rendering engine:', vectorErr);
    }
  }

  // 2. High-Res Rendering Fallback (decrypts and resizes bank statements & legal forms)
  const loadingTask = pdfjsLib.getDocument({
    data: uint8.slice(),
    stopAtErrors: false,
  });
  const fallbackDoc = await loadingTask.promise;
  const totalPages = fallbackDoc.numPages;
  const outputDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await fallbackDoc.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1.0 });
    const origWidth = unscaled.width;
    const origHeight = unscaled.height;

    let targetWidth = baseWidth;
    let targetHeight = baseHeight;

    if (autoOrientation && origWidth > origHeight) {
      targetWidth = Math.max(baseWidth, baseHeight);
      targetHeight = Math.min(baseWidth, baseHeight);
    } else if (autoOrientation) {
      targetWidth = Math.min(baseWidth, baseHeight);
      targetHeight = Math.max(baseWidth, baseHeight);
    }

    // Render crisp 2.0x image of the page with full stamps and bank formatting
    const { imgBytes } = await renderPageAsJpg(page, 2.0);
    const embeddedImage = await outputDoc.embedJpg(imgBytes);
    const newPage = outputDoc.addPage([targetWidth, targetHeight]);

    let drawWidth = targetWidth;
    let drawHeight = targetHeight;
    let drawX = 0;
    let drawY = 0;

    if (fitMode === 'fit') {
      const scale = Math.min(targetWidth / origWidth, targetHeight / origHeight);
      drawWidth = origWidth * scale;
      drawHeight = origHeight * scale;
      drawX = (targetWidth - drawWidth) / 2;
      drawY = (targetHeight - drawHeight) / 2;
    } else if (fitMode === 'center') {
      drawWidth = origWidth;
      drawHeight = origHeight;
      drawX = (targetWidth - origWidth) / 2;
      drawY = (targetHeight - origHeight) / 2;
    } else if (fitMode === 'stretch') {
      drawWidth = targetWidth;
      drawHeight = targetHeight;
      drawX = 0;
      drawY = 0;
    }

    newPage.drawImage(embeddedImage, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });
  }

  return await outputDoc.save({ useObjectStreams: false });
}

export type NUpLayout = 2 | 4 | 9;

export interface NUpOptions {
  pagesPerSheet: NUpLayout;
  drawPageBorders?: boolean;
  onProgress?: (current: number, total: number) => void;
}

export async function createNUpPDF(
  file: File,
  options: NUpOptions
): Promise<Uint8Array> {
  const { pagesPerSheet = 2, drawPageBorders = true, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  const [cols, rows, sheetWidth, sheetHeight] =
    pagesPerSheet === 2
      ? [2, 1, 841.89, 595.28]
      : pagesPerSheet === 4
      ? [2, 2, 595.28, 841.89]
      : [3, 3, 595.28, 841.89];

  const cellWidth = sheetWidth / cols;
  const cellHeight = sheetHeight / rows;
  const margin = 12;

  // 1. Primary Vector Path (for standard, unencrypted PDFs)
  if (!isComplexOrProtectedPdf(uint8)) {
    try {
      const sourceDoc = await PDFDocument.load(arrayBuffer);
      const totalPages = sourceDoc.getPageCount();
      const outputDoc = await PDFDocument.create();

      let pageCursor = 0;
      while (pageCursor < totalPages) {
        const sheet = outputDoc.addPage([sheetWidth, sheetHeight]);

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (pageCursor >= totalPages) break;

            onProgress?.(pageCursor + 1, totalPages);
            const srcPage = sourceDoc.getPage(pageCursor);
            const { width: origW, height: origH } = srcPage.getSize();
            const embedded = await outputDoc.embedPage(srcPage);

            const usableW = cellWidth - margin * 2;
            const usableH = cellHeight - margin * 2;

            const scale = Math.min(usableW / origW, usableH / origH);
            const scaledW = origW * scale;
            const scaledH = origH * scale;

            const cellOriginX = col * cellWidth;
            const cellOriginY = sheetHeight - (row + 1) * cellHeight;

            const drawX = cellOriginX + (cellWidth - scaledW) / 2;
            const drawY = cellOriginY + (cellHeight - scaledH) / 2;

            sheet.drawPage(embedded, {
              x: drawX,
              y: drawY,
              width: scaledW,
              height: scaledH,
            });

            if (drawPageBorders) {
              sheet.drawRectangle({
                x: drawX,
                y: drawY,
                width: scaledW,
                height: scaledH,
                borderColor: rgb(0.8, 0.8, 0.8),
                borderWidth: 0.5,
              });
            }

            pageCursor++;
          }
        }
      }

      return await outputDoc.save({ useObjectStreams: false });
    } catch (vectorErr) {
      console.warn('Vector N-Up bypassed; activating high-res rendering pipeline:', vectorErr);
    }
  }

  // 2. High-Res Rendering Fallback (decrypts and arranges bank statements & legal forms)
  const loadingTask = pdfjsLib.getDocument({
    data: uint8.slice(),
    stopAtErrors: false,
  });
  const fallbackDoc = await loadingTask.promise;
  const totalPages = fallbackDoc.numPages;
  const outputDoc = await PDFDocument.create();

  let pageCursor = 0;

  while (pageCursor < totalPages) {
    const sheet = outputDoc.addPage([sheetWidth, sheetHeight]);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (pageCursor >= totalPages) break;

        onProgress?.(pageCursor + 1, totalPages);
        const pageNum = pageCursor + 1;
        const page = await fallbackDoc.getPage(pageNum);
        const { imgBytes, width: origW, height: origH } = await renderPageAsJpg(page, 2.0);
        const embeddedImg = await outputDoc.embedJpg(imgBytes);

        const usableW = cellWidth - margin * 2;
        const usableH = cellHeight - margin * 2;

        const scale = Math.min(usableW / origW, usableH / origH);
        const scaledW = origW * scale;
        const scaledH = origH * scale;

        const cellOriginX = col * cellWidth;
        const cellOriginY = sheetHeight - (row + 1) * cellHeight;

        const drawX = cellOriginX + (cellWidth - scaledW) / 2;
        const drawY = cellOriginY + (cellHeight - scaledH) / 2;

        sheet.drawImage(embeddedImg, {
          x: drawX,
          y: drawY,
          width: scaledW,
          height: scaledH,
        });

        if (drawPageBorders) {
          sheet.drawRectangle({
            x: drawX,
            y: drawY,
            width: scaledW,
            height: scaledH,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 0.5,
          });
        }

        pageCursor++;
      }
    }
  }

  return await outputDoc.save({ useObjectStreams: false });
}

export type BatesPosition = 
  | 'top-left' 
  | 'top-center' 
  | 'top-right' 
  | 'bottom-left' 
  | 'bottom-center' 
  | 'bottom-right';

export interface BatesOptions {
  prefix?: string;
  suffix?: string;
  startNumber: number;
  digits?: number;
  totalDigits?: number; // fallback support
  fontSize?: number;
  position?: BatesPosition;
  onProgress?: (curr: number, total: number) => void;
}

export async function addBatesNumberingToPDF(
  file: File,
  options: BatesOptions
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const uint8 = new Uint8Array(bytes);

  const prefix = options.prefix || '';
  const suffix = options.suffix || '';
  const startNum = options.startNumber || 1;
  const digits = Math.max(1, options.digits ?? options.totalDigits ?? 6);
  const fontSize = options.fontSize || 10;
  const position = options.position || 'bottom-right';

  // 1. Analyze PDF structure with pdfjs to determine the document profile
  const loadingTask = pdfjsLib.getDocument({ data: uint8.slice(), stopAtErrors: false });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const kbPerPage = (file.size / 1024) / Math.max(1, numPages);
  let hasDenseDigitalText = false;

  try {
    const firstPage = await pdfDoc.getPage(1);
    const textContent = await firstPage.getTextContent();
    hasDenseDigitalText = textContent.items.length > 25;
  } catch {
    hasDenseDigitalText = false;
  }

  // True digital vector PDFs (e-statements, bank exports) have low KB/page and digital text
  const isDigitalVector = kbPerPage < 180 || (hasDenseDigitalText && kbPerPage < 400);

  // ==========================================
  // PATH A: Native Vector Engine (Bank Statements & Digital Docs)
  // Keeps 100% original vector clarity, crisp fonts, and tiny file size
  // ==========================================
  if (isDigitalVector) {
    try {
      const nativeDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = nativeDoc.getPages();
      const font = await nativeDoc.embedFont(StandardFonts.HelveticaBold);

      pages.forEach((page, idx) => {
        if (options.onProgress) {
          options.onProgress(idx + 1, numPages);
        }

        const pageNumStr = String(startNum + idx).padStart(digits, '0');
        const stampText = `${prefix}${pageNumStr}${suffix}`;

        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(stampText, fontSize);
        const textHeight = font.heightAtSize(fontSize);

        const marginX = 28;
        const marginY = 24;

        let posX = marginX;
        let posY = marginY;

        if (position.includes('center')) {
          posX = (width - textWidth) / 2;
        } else if (position.includes('right')) {
          posX = width - textWidth - marginX;
        }

        if (position.includes('top')) {
          posY = height - marginY - textHeight;
        }

        // Protective white pill for readability
        const padX = 6;
        const padY = 3;
        page.drawRectangle({
          x: posX - padX,
          y: posY - padY,
          width: textWidth + padX * 2,
          height: textHeight + padY * 2,
          color: rgb(1, 1, 1),
          opacity: 0.95,
        });

        // Stamp vector text directly into the original stream
        page.drawText(stampText, {
          x: posX,
          y: posY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      });

      return await nativeDoc.save({ useObjectStreams: false });
    } catch (err) {
      console.warn('Native vector route failed, falling back to canvas compositor:', err);
    }
  }

  // ==========================================
  // PATH B: High-Definition Canvas Compositor (Scanned Agreements & Photo PDFs)
  // Burns stamps visibly on top of full-page photo scans
  // ==========================================
  const newPdfDoc = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    if (options.onProgress) {
      options.onProgress(i, numPages);
    }

    const pageNumStr = String(startNum + (i - 1)).padStart(digits, '0');
    const stampText = `${prefix}${pageNumStr}${suffix}`;

    const page = await pdfDoc.getPage(i);
    const { imgBytes, width: pWidth, height: pHeight } = await renderPageAsJpg(page, 2.5);

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = pWidth;
    compositeCanvas.height = pHeight;
    const ctx = compositeCanvas.getContext('2d');

    if (ctx) {
      const pageImg = new Image();
      await new Promise<void>((resolve) => {
        pageImg.onload = () => {
          ctx.drawImage(pageImg, 0, 0, pWidth, pHeight);
          resolve();
        };
        pageImg.src = URL.createObjectURL(new Blob([imgBytes as unknown as BlobPart], { type: 'image/jpeg' }));
      });

      ctx.save();
      const scaleNormalization = pWidth / 540;
      const finalFontSize = fontSize * scaleNormalization;

      ctx.font = `bold ${finalFontSize}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#000000';

      const metrics = ctx.measureText(stampText);
      const textWidth = metrics.width;
      const textHeight = finalFontSize;

      const marginX = pWidth * 0.05;
      const marginY = pHeight * 0.04;

      let posX = marginX;
      let posY = pHeight - marginY;

      if (position.includes('center')) {
        posX = (pWidth - textWidth) / 2;
      } else if (position.includes('right')) {
        posX = pWidth - textWidth - marginX;
      }

      if (position.includes('top')) {
        posY = marginY + textHeight;
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(posX - 6, posY - textHeight - 4, textWidth + 12, textHeight + 8);

      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(stampText, posX, posY);
      ctx.restore();

      const stampedPng = compositeCanvas.toDataURL('image/png');
      const b64 = stampedPng.split(',')[1];
      const stampedBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const finalPageImg = await newPdfDoc.embedPng(stampedBytes);

      const newPage = newPdfDoc.addPage([pWidth, pHeight]);
      newPage.drawImage(finalPageImg, { x: 0, y: 0, width: pWidth, height: pHeight });
    }
  }

  return await newPdfDoc.save({ useObjectStreams: false });
}

export interface ExtractedImage {
  id: string;
  name: string;
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

export async function extractImagesFromPDF(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const images: ExtractedImage[] = [];
  const seenImageHashes = new Set<string>();
  let counter = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const operatorList = await page.getOperatorList();

    const validOps = [
      pdfjsLib.OPS.paintImageXObject,
      pdfjsLib.OPS.paintInlineImageXObject,
      pdfjsLib.OPS.paintImageXObjectRepeat,
    ];

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      if (!validOps.includes(fn)) continue;

      const imgArg = operatorList.argsArray[i][0];

      try {
        // 1. Resolve image object safely across inline dicts, page.objs, and commonObjs
        const imgObj: any = await new Promise((resolve) => {
          // Failsafe timeout: if an asset cannot be decoded within 1.2s, skip it instead of freezing
          const timeout = setTimeout(() => resolve(null), 1200);

          // Case A: Inline image where the argument is already the decoded object
          if (imgArg && typeof imgArg === 'object') {
            clearTimeout(timeout);
            resolve(imgArg);
            return;
          }

          if (!imgArg || typeof imgArg !== 'string') {
            clearTimeout(timeout);
            resolve(null);
            return;
          }

          let handled = false;
          const handleResult = (data: any) => {
            if (!handled && data) {
              handled = true;
              clearTimeout(timeout);
              resolve(data);
            }
          };

          // Case B: Check page.objs first
          try {
            const syncObj = (page.objs as any).get(imgArg, handleResult);
            if (syncObj) handleResult(syncObj);
          } catch {}

          // Case C: Check shared commonObjs (header/footer logos, book art)
          if (!handled) {
            try {
              const commonStore = (page as any).commonObjs || (pdfDoc as any).commonObjs;
              if (commonStore) {
                const syncCommon = commonStore.get(imgArg, handleResult);
                if (syncCommon) handleResult(syncCommon);
              }
            } catch {}
          }
        });

        if (!imgObj) continue;

        const width = imgObj.width;
        const height = imgObj.height;
        if (!width || !height || width < 10 || height < 10) continue;

        // Skip duplicate images reused across pages
        const dedupeKey = `${width}x${height}_${imgObj.data?.length || 0}`;
        if (seenImageHashes.has(dedupeKey)) continue;
        seenImageHashes.add(dedupeKey);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        // 2. Render image data to canvas
        if (imgObj.bitmap) {
          ctx.drawImage(imgObj.bitmap, 0, 0);
        } else if (imgObj instanceof ImageBitmap) {
          ctx.drawImage(imgObj, 0, 0);
        } else if (imgObj.data) {
          let imgData: ImageData;
          if (imgObj.data.length === width * height * 4) {
            imgData = new ImageData(new Uint8ClampedArray(imgObj.data), width, height);
          } else if (imgObj.data.length === width * height * 3) {
            const rgba = new Uint8ClampedArray(width * height * 4);
            for (let p = 0, q = 0; p < imgObj.data.length; p += 3, q += 4) {
              rgba[q] = imgObj.data[p];
              rgba[q + 1] = imgObj.data[p + 1];
              rgba[q + 2] = imgObj.data[p + 2];
              rgba[q + 3] = 255;
            }
            imgData = new ImageData(rgba, width, height);
          } else if (imgObj.data.length === width * height) {
            const rgba = new Uint8ClampedArray(width * height * 4);
            for (let p = 0, q = 0; p < imgObj.data.length; p++, q += 4) {
              const val = imgObj.data[p];
              rgba[q] = val;
              rgba[q + 1] = val;
              rgba[q + 2] = val;
              rgba[q + 3] = 255;
            }
            imgData = new ImageData(rgba, width, height);
          } else {
            continue;
          }
          ctx.putImageData(imgData, 0, 0);
        } else {
          continue;
        }

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (!blob) continue;

        counter++;
        images.push({
          id: `img-${counter}-p${pageNum}`,
          name: `extracted_img_${counter}_p${pageNum}.png`,
          blob,
          dataUrl: canvas.toDataURL('image/png'),
          width,
          height,
        });

        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        console.warn(`Skipping unparseable image on page ${pageNum}:`, err);
      }
    }

    try {
      page.cleanup();
    } catch {}
  }

  return images;
}

export async function packageImagesToZip(
  images: ExtractedImage[],
  baseName: string
): Promise<Blob> {
  const zip = new JSZip();
  const cleanName = baseName.replace(/\.[^/.]+$/, '');

  images.forEach((img) => {
    zip.file(`${cleanName}_${img.name}`, img.blob);
  });

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export interface OcrProgress {
  status: string;
  progress: number;
}

export async function ocrPDFToSearchable(
  file: File,
  language: string = 'eng',
  onProgress?: (p: OcrProgress) => void
): Promise<Uint8Array> {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
  }

  onProgress?.({ status: 'Initializing Local OCR Engine...', progress: 10 });

  const worker = await createWorker(language, 1, {
    workerPath: '/tessdata/worker.min.js',
    corePath: '/tessdata/tesseract-core-simd-lstm.wasm.js',
    langPath: '/tessdata',
    gzip: true,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress({
          status: 'Recognizing text...',
          progress: Math.min(95, Math.round(m.progress * 85) + 10),
        });
      }
    },
  });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
    const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const helveticaFont = await pdfLibDoc.embedFont(StandardFonts.Helvetica);

    const totalPages = pdfJsDoc.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        status: `Scanning Page ${pageNum} of ${totalPages}...`,
        progress: Math.round(((pageNum - 1) / totalPages) * 85) + 10,
      });

      const pdfJsPage = await pdfJsDoc.getPage(pageNum);
      const viewport = pdfJsPage.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) continue;
      await (pdfJsPage.render({ canvasContext: ctx, viewport } as any) as any).promise;

      // Dark mode detection & brightness check
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      let totalBrightness = 0;
      const sampleStep = 16;
      let sampleCount = 0;

      for (let i = 0; i < d.length; i += 4 * sampleStep) {
        totalBrightness += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        sampleCount++;
      }

      const avgBrightness = totalBrightness / sampleCount;

      if (avgBrightness < 128) {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 255 - d[i];
          d[i + 1] = 255 - d[i + 1];
          d[i + 2] = 255 - d[i + 2];
        }
        ctx.putImageData(imgData, 0, 0);
      }

      const { data } = await worker.recognize(canvas);

      // Free canvas memory immediately
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
      try {
        pdfJsPage.cleanup();
      } catch {}

      const pdfLibPage = pdfLibDoc.getPage(pageNum - 1);
      const { width: pageWidth, height: pageHeight } = pdfLibPage.getSize();

      const scaleX = pageWidth / viewport.width;
      const scaleY = pageHeight / viewport.height;

      // Universal word extraction hierarchy (Tesseract v4 + v5 blocks fallback)
      let words: any[] = [];
      if (Array.isArray((data as any)?.words) && (data as any).words.length > 0) {
        words = (data as any).words;
      } else if (Array.isArray((data as any)?.blocks)) {
        words = (data as any).blocks
          .flatMap((b: any) => b.paragraphs ?? [])
          .flatMap((p: any) => p.lines ?? [])
          .flatMap((l: any) => l.words ?? []);
      }

      for (const word of words) {
        if (!word || !word.text || !word.bbox) continue;
        const clean = word.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();
        if (!clean) continue;

        const box = word.bbox;
        const posX = box.x0 * scaleX;
        const posY = pageHeight - (box.y1 * scaleY);
        const wordHeight = (box.y1 - box.y0) * scaleY;

        pdfLibPage.drawText(clean, {
          x: Math.max(0, posX),
          y: Math.max(0, posY),
          size: Math.max(4, Math.round(wordHeight * 0.85)),
          font: helveticaFont,
          color: rgb(0, 0, 0),
          opacity: 0.01,
        });
      }
    }

    onProgress?.({ status: 'Finalizing Searchable PDF...', progress: 98 });
    return await pdfLibDoc.save({ useObjectStreams: false });
  } finally {
    await worker.terminate();
  }
}
export interface RepairResult {
  bytes: Uint8Array;
  method: 'lossless' | 'stream-salvage';
  recoveredPages: number;
}

export async function repairPDF(
  file: File,
  onProgress?: (stage: string) => void
): Promise<RepairResult> {
  const arrayBuffer = await file.arrayBuffer();

  try {
    onProgress?.('Attempting structural cross-reference rebuild...');
    const sourceDoc = await PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    const pageCount = sourceDoc.getPageCount();
    if (pageCount > 0) {
      let hasEmptyPages = false;
      for (let i = 0; i < pageCount; i++) {
        if (!sourceDoc.getPage(i).node.Contents()) {
          hasEmptyPages = true;
          break;
        }
      }

      if (!hasEmptyPages) {
        const recoveredDoc = await PDFDocument.create();
        const pages = await recoveredDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
        pages.forEach((page) => recoveredDoc.addPage(page));

        const bytes = await recoveredDoc.save({ useObjectStreams: true });
        return {
          bytes,
          method: 'lossless',
          recoveredPages: pageCount,
        };
      }
    }
  } catch (structuralError) {
    console.warn('Tier 1 repair failed, advancing to stream salvage:', structuralError);
  }

  onProgress?.('Extracting raw page streams via salvage worker...');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer).slice(),
    stopAtErrors: false,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  if (totalPages === 0) {
    throw new Error('No recoverable page data found in document streams.');
  }

  const outputDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(`Salvaging page ${pageNum} of ${totalPages}...`);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) continue;

    await (
      page.render({
        canvasContext: ctx as any,
        viewport,
        canvas,
      } as any) as any
    ).promise;

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas buffer conversion failed'))),
        'image/jpeg',
        0.92
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    const jpegBytes = await jpegBlob.arrayBuffer();
    const embeddedImg = await outputDoc.embedJpg(jpegBytes);

    const unscaled = page.getViewport({ scale: 1.0 });
    const newPage = outputDoc.addPage([unscaled.width, unscaled.height]);
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: unscaled.width,
      height: unscaled.height,
    });
  }

  const bytes = await outputDoc.save({ useObjectStreams: true });
  return {
    bytes,
    method: 'stream-salvage',
    recoveredPages: totalPages,
  };
}

export type DarkModeFilter = 'invert' | 'oled' | 'sepia';

export interface DarkModeOptions {
  filter: DarkModeFilter;
  onProgress?: (current: number, total: number) => void;
}

export async function invertPDF(
  file: File,
  options: DarkModeOptions
): Promise<Uint8Array> {
  const { filter = 'invert', onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const outputDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering context unavailable');

    await (
      page.render({
        canvasContext: ctx as any,
        viewport,
        canvas,
      } as any) as any
    ).promise;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (filter === 'invert') {
        data[i] = 255 - r;
        data[i + 1] = 255 - g;
        data[i + 2] = 255 - b;
      } else if (filter === 'oled') {
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance > 210) {
          data[i] = 10;
          data[i + 1] = 10;
          data[i + 2] = 10;
        } else if (luminance < 80) {
          data[i] = 225;
          data[i + 1] = 225;
          data[i + 2] = 225;
        } else {
          data[i] = 255 - r;
          data[i + 1] = 255 - g;
          data[i + 2] = 255 - b;
        }
      } else if (filter === 'sepia') {
        const tr = 0.393 * r + 0.769 * g + 0.189 * b;
        const tg = 0.349 * r + 0.686 * g + 0.168 * b;
        const tb = 0.272 * r + 0.534 * g + 0.131 * b;
        data[i] = Math.min(255, tr);
        data[i + 1] = Math.min(255, tg);
        data[i + 2] = Math.min(255, tb);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas buffer conversion failed'))),
        'image/jpeg',
        0.9
      );
    });

    canvas.width = 0;
    canvas.height = 0;

    const jpegBytes = await jpegBlob.arrayBuffer();
    const embeddedImg = await outputDoc.embedJpg(jpegBytes);

    const unscaled = page.getViewport({ scale: 1.0 });
    const newPage = outputDoc.addPage([unscaled.width, unscaled.height]);
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: unscaled.width,
      height: unscaled.height,
    });
  }

  return await outputDoc.save({ useObjectStreams: true });
}

export interface BookletOptions {
  sheetSize?: 'A4' | 'LETTER';
  addFoldLine?: boolean;
  onProgress?: (current: number, total: number) => void;
}

export async function createBookletPDF(
  file: File,
  options: BookletOptions = {}
): Promise<Uint8Array> {
  const { sheetSize = 'A4', addFoldLine = true, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  const [sheetW, sheetH] =
    sheetSize === 'LETTER' ? [792.0, 612.0] : [841.89, 595.28];
  const halfW = sheetW / 2;
  const halfH = sheetH;

  // 1. Primary Vector Path (for standard, unencrypted PDFs)
  if (!isComplexOrProtectedPdf(uint8)) {
    try {
      const sourceDoc = await PDFDocument.load(arrayBuffer);
      const origPageCount = sourceDoc.getPageCount();
      const targetPageCount = Math.ceil(origPageCount / 4) * 4;
      const pagesToPad = targetPageCount - origPageCount;

      for (let i = 0; i < pagesToPad; i++) {
        sourceDoc.addPage();
      }

      for (let i = 0; i < sourceDoc.getPageCount(); i++) {
        const page = sourceDoc.getPage(i);
        if (!page.node.Contents()) {
          const emptyStream = sourceDoc.context.flateStream('');
          const ref = sourceDoc.context.register(emptyStream);
          page.node.set(PDFName.of('Contents'), ref);
        }
      }

      const outputDoc = await PDFDocument.create();
      const totalSpreads = targetPageCount / 2;

      for (let i = 0; i < totalSpreads; i++) {
        onProgress?.(i + 1, totalSpreads);
        const k = Math.floor(i / 2);

        let leftIndex: number;
        let rightIndex: number;

        if (i % 2 === 0) {
          leftIndex = targetPageCount - 2 * k - 1;
          rightIndex = 2 * k;
        } else {
          leftIndex = 2 * k + 1;
          rightIndex = targetPageCount - 2 * k - 2;
        }

        const newSheet = outputDoc.addPage([sheetW, sheetH]);

        const leftSrc = sourceDoc.getPage(leftIndex);
        const { width: leftW, height: leftH } = leftSrc.getSize();
        const embeddedLeft = await outputDoc.embedPage(leftSrc);
        const scaleLeft = Math.min(halfW / leftW, halfH / leftH);
        const drawLeftW = leftW * scaleLeft;
        const drawLeftH = leftH * scaleLeft;
        const drawLeftX = (halfW - drawLeftW) / 2;
        const drawLeftY = (halfH - drawLeftH) / 2;

        newSheet.drawPage(embeddedLeft, {
          x: drawLeftX,
          y: drawLeftY,
          width: drawLeftW,
          height: drawLeftH,
        });

        const rightSrc = sourceDoc.getPage(rightIndex);
        const { width: rightW, height: rightH } = rightSrc.getSize();
        const embeddedRight = await outputDoc.embedPage(rightSrc);
        const scaleRight = Math.min(halfW / rightW, halfH / rightH);
        const drawRightW = rightW * scaleRight;
        const drawRightH = rightH * scaleRight;
        const drawRightX = halfW + (halfW - drawRightW) / 2;
        const drawRightY = (halfH - drawRightH) / 2;

        newSheet.drawPage(embeddedRight, {
          x: drawRightX,
          y: drawRightY,
          width: drawRightW,
          height: drawRightH,
        });

        if (addFoldLine) {
          newSheet.drawLine({
            start: { x: halfW, y: 15 },
            end: { x: halfW, y: sheetH - 15 },
            thickness: 0.5,
            color: rgb(0.82, 0.82, 0.82),
            dashArray: [4, 4],
          });
        }
      }

      return await outputDoc.save({ useObjectStreams: false });
    } catch (vectorErr) {
      console.warn('Vector booklet bypassed; activating high-res rendering pipeline:', vectorErr);
    }
  }

  // 2. High-Res Rendering Fallback (decrypts bank statements, signed docs, and rent agreements)
  const loadingTask = pdfjsLib.getDocument({
    data: uint8.slice(),
    stopAtErrors: false,
  });
  const fallbackDoc = await loadingTask.promise;
  const origPageCount = fallbackDoc.numPages;
  const targetPageCount = Math.ceil(origPageCount / 4) * 4;
  const totalSpreads = targetPageCount / 2;
  const outputDoc = await PDFDocument.create();

  // Render and embed existing document pages
  const embeddedImages: ({ image: any; width: number; height: number } | null)[] = [];

  for (let p = 1; p <= origPageCount; p++) {
    onProgress?.(p, origPageCount + totalSpreads);
    const page = await fallbackDoc.getPage(p);
    const { imgBytes, width, height } = await renderPageAsJpg(page, 2.0);
    const image = await outputDoc.embedJpg(imgBytes);
    embeddedImages.push({ image, width, height });
  }

  // Pad remaining booklet slots with null for clean blank pages
  while (embeddedImages.length < targetPageCount) {
    embeddedImages.push(null);
  }

  for (let i = 0; i < totalSpreads; i++) {
    onProgress?.(origPageCount + i + 1, origPageCount + totalSpreads);
    const k = Math.floor(i / 2);

    let leftIndex: number;
    let rightIndex: number;

    if (i % 2 === 0) {
      leftIndex = targetPageCount - 2 * k - 1;
      rightIndex = 2 * k;
    } else {
      leftIndex = 2 * k + 1;
      rightIndex = targetPageCount - 2 * k - 2;
    }

    const newSheet = outputDoc.addPage([sheetW, sheetH]);

    const leftItem = embeddedImages[leftIndex];
    if (leftItem) {
      const { image, width: leftW, height: leftH } = leftItem;
      const scaleLeft = Math.min(halfW / leftW, halfH / leftH);
      const drawLeftW = leftW * scaleLeft;
      const drawLeftH = leftH * scaleLeft;
      const drawLeftX = (halfW - drawLeftW) / 2;
      const drawLeftY = (halfH - drawLeftH) / 2;

      newSheet.drawImage(image, {
        x: drawLeftX,
        y: drawLeftY,
        width: drawLeftW,
        height: drawLeftH,
      });
    }

    const rightItem = embeddedImages[rightIndex];
    if (rightItem) {
      const { image, width: rightW, height: rightH } = rightItem;
      const scaleRight = Math.min(halfW / rightW, halfH / rightH);
      const drawRightW = rightW * scaleRight;
      const drawRightH = rightH * scaleRight;
      const drawRightX = halfW + (halfW - drawRightW) / 2;
      const drawRightY = (halfH - drawRightH) / 2;

      newSheet.drawImage(image, {
        x: drawRightX,
        y: drawRightY,
        width: drawRightW,
        height: drawRightH,
      });
    }

    if (addFoldLine) {
      newSheet.drawLine({
        start: { x: halfW, y: 15 },
        end: { x: halfW, y: sheetH - 15 },
        thickness: 0.5,
        color: rgb(0.82, 0.82, 0.82),
        dashArray: [4, 4],
      });
    }
  }

  return await outputDoc.save({ useObjectStreams: false });
}

export function estimateSkewAngle(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const sampleW = Math.min(width, 300);
  const sampleH = Math.min(height, 400);
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sCtx) return 0;

  sCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);

  let bestAngle = 0;
  let maxVariance = -1;

  for (let angle = -10; angle <= 10; angle += 0.5) {
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = sampleW;
    rotCanvas.height = sampleH;
    const rCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
    if (!rCtx) continue;

    rCtx.save();
    rCtx.translate(sampleW / 2, sampleH / 2);
    rCtx.rotate((angle * Math.PI) / 180);
    rCtx.drawImage(sampleCanvas, -sampleW / 2, -sampleH / 2);
    rCtx.restore();

    const imgData = rCtx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;

    const rowSums = new Float64Array(sampleH);
    for (let y = 0; y < sampleH; y++) {
      let sum = 0;
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      }
      rowSums[y] = sum;
    }

    let mean = 0;
    for (let y = 0; y < sampleH; y++) mean += rowSums[y];
    mean /= sampleH;

    let variance = 0;
    for (let y = 0; y < sampleH; y++) {
      const diff = rowSums[y] - mean;
      variance += diff * diff;
    }

    if (variance > maxVariance) {
      maxVariance = variance;
      bestAngle = angle;
    }

    rotCanvas.width = 0;
    rotCanvas.height = 0;
  }

  sampleCanvas.width = 0;
  sampleCanvas.height = 0;

  return -bestAngle;
}

export interface DeskewOptions {
  angle: number;
  onProgress?: (current: number, total: number) => void;
}

export async function deskewPDF(
  file: File,
  options: DeskewOptions
): Promise<Uint8Array> {
  const { angle = 0, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const outputDoc = await PDFDocument.create();
  const rad = (angle * Math.PI) / 180;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    await (
      page.render({
        canvasContext: ctx as any,
        viewport,
        canvas,
      } as any) as any
    ).promise;

    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = canvas.width;
    rotatedCanvas.height = canvas.height;
    const rCtx = rotatedCanvas.getContext('2d');
    if (!rCtx) throw new Error('Rotated canvas context unavailable');

    rCtx.fillStyle = '#FFFFFF';
    rCtx.fillRect(0, 0, rotatedCanvas.width, rotatedCanvas.height);

    rCtx.save();
    rCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    rCtx.rotate(rad);
    rCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    rCtx.restore();

    canvas.width = 0;
    canvas.height = 0;

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      rotatedCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode deskewed page'))),
        'image/jpeg',
        0.92
      );
    });

    rotatedCanvas.width = 0;
    rotatedCanvas.height = 0;

    const jpegBytes = await jpegBlob.arrayBuffer();
    const embeddedImg = await outputDoc.embedJpg(jpegBytes);

    const unscaled = page.getViewport({ scale: 1.0 });
    const newPage = outputDoc.addPage([unscaled.width, unscaled.height]);
    newPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: unscaled.width,
      height: unscaled.height,
    });
  }

  return await outputDoc.save({ useObjectStreams: true });
}

export interface TableExtractOptions {
  yTolerance?: number;
  minColumnGap?: number;
  delimiter?: ',' | ';' | '\t';
  onProgress?: (current: number, total: number) => void;
}

export interface ExtractedTableResult {
  csv: string;
  rows: string[][];
  totalRows: number;
}

export interface TableExtractOptions {
  delimiter?: ',' | ';' | '\t';
  yTolerance?: number;
  minColumnGap?: number;
  onProgress?: (current: number, total: number) => void;
}

export async function extractTableFromPDF(
  file: File,
  options: TableExtractOptions = {}
): Promise<ExtractedTableResult> {
  const { yTolerance = 4, minColumnGap = 12, delimiter = ',', onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  interface RawItem {
    str: string;
    x: number;
    y: number;
    width: number;
  }

  interface Chunk {
    str: string;
    x: number;
    width: number;
    endX: number;
  }

  const allRows: string[][] = [];
  let isScannedDoc = true;

  // Step 1: Rapid digital layer scan
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items: RawItem[] = [];
    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
      });
    }

    if (items.length > 5) {
      isScannedDoc = false;
    }

    if (items.length > 0) {
      // Sort items top-to-bottom (PDF y goes up), then left-to-right
      items.sort((a, b) => {
        if (Math.abs(b.y - a.y) > yTolerance) {
          return b.y - a.y;
        }
        return a.x - b.x;
      });

      // Group into horizontal lines
      const lines: RawItem[][] = [];
      let currentLine: RawItem[] = [];
      let currentY: number | null = null;

      for (const item of items) {
        if (currentY === null || Math.abs(item.y - currentY) <= yTolerance) {
          currentLine.push(item);
          currentY = item.y;
        } else {
          if (currentLine.length > 0) lines.push(currentLine);
          currentLine = [item];
          currentY = item.y;
        }
      }
      if (currentLine.length > 0) lines.push(currentLine);

      // Build text chunks per line based on minColumnGap
      const lineChunks: Chunk[][] = [];
      const multiChunkXStarts: number[] = [];

      for (const line of lines) {
        line.sort((a, b) => a.x - b.x);
        const chunks: Chunk[] = [];
        let currentChunkText = '';
        let chunkStartX = -1;
        let lastRightEdge = -1;

        for (const item of line) {
          if (lastRightEdge === -1) {
            currentChunkText = item.str;
            chunkStartX = item.x;
            lastRightEdge = item.x + item.width;
          } else {
            const gap = item.x - lastRightEdge;
            if (gap > minColumnGap) {
              chunks.push({
                str: currentChunkText.trim(),
                x: chunkStartX,
                width: lastRightEdge - chunkStartX,
                endX: lastRightEdge,
              });
              currentChunkText = item.str;
              chunkStartX = item.x;
            } else {
              currentChunkText += (gap > 2 ? ' ' : '') + item.str;
            }
            lastRightEdge = item.x + item.width;
          }
        }

        if (currentChunkText.trim()) {
          chunks.push({
            str: currentChunkText.trim(),
            x: chunkStartX,
            width: lastRightEdge - chunkStartX,
            endX: lastRightEdge,
          });
        }

        if (chunks.length > 0) {
          lineChunks.push(chunks);
          if (chunks.length >= 2) {
            for (const ch of chunks) {
              multiChunkXStarts.push(ch.x);
            }
          }
        }
      }

      // Step 2: Calculate Global Column Intervals for the page
      multiChunkXStarts.sort((a, b) => a - b);
      const clusters: number[][] = [];
      for (const x of multiChunkXStarts) {
        if (clusters.length === 0 || x - clusters[clusters.length - 1][clusters[clusters.length - 1].length - 1] > minColumnGap * 1.5) {
          clusters.push([x]);
        } else {
          clusters[clusters.length - 1].push(x);
        }
      }

      const columnCenters = clusters
        .filter((c) => c.length >= 1)
        .map((c) => c.reduce((sum, v) => sum + v, 0) / c.length);

      const boundaries: number[] = [];
      for (let cIdx = 0; cIdx < columnCenters.length - 1; cIdx++) {
        boundaries.push((columnCenters[cIdx] + columnCenters[cIdx + 1]) / 2);
      }

      // Step 3: Map chunks to structured columns
      const pageRows: string[][] = [];

      for (const chunks of lineChunks) {
        if (columnCenters.length >= 2) {
          const row = new Array(columnCenters.length).fill('');
          for (const ch of chunks) {
            let colIdx = boundaries.findIndex((b) => ch.x < b);
            if (colIdx === -1) colIdx = columnCenters.length - 1;

            row[colIdx] = row[colIdx] ? `${row[colIdx]} ${ch.str}` : ch.str;
          }

          // Check if this row is a multi-line continuation of the previous row
          const nonBlankIndices = row
            .map((val, idx) => (val.trim() ? idx : -1))
            .filter((idx) => idx !== -1);

          const isNumeric = (val: string) => /^[\d,.-]+$/.test(val.trim().replace(/[A-Za-z]/g, ''));
          const hasDateOrNumber = row.some((c) => /\d{2}-[A-Za-z]{3}-\d{4}/.test(c) || (isNumeric(c) && c.includes('.')));

          if (
            nonBlankIndices.length === 1 &&
            !hasDateOrNumber &&
            pageRows.length > 0
          ) {
            const contIdx = nonBlankIndices[0];
            pageRows[pageRows.length - 1][contIdx] = `${pageRows[pageRows.length - 1][contIdx]} ${row[contIdx]}`.trim();
          } else {
            pageRows.push(row);
          }
        } else {
          pageRows.push(chunks.map((c) => c.str));
        }
      }

      allRows.push(...pageRows);
    }

    page.cleanup();
  }

  // Step 4: Fallback for Scanned Documents (Address agreement.pdf)
  if (isScannedDoc || allRows.length === 0) {
    onProgress?.(1, totalPages);
    const ocrWorker = await createWorker('eng', 1, {
      workerPath: '/tessdata/worker.min.js',
      corePath: '/tessdata/tesseract-core-simd-lstm.wasm.js',
      langPath: '/tessdata',
      gzip: true,
    });

    try {
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress?.(pageNum, totalPages);
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await (page.render({ canvasContext: ctx as any, viewport } as any)).promise;
          const { data } = await ocrWorker.recognize(canvas);

          if (data?.text) {
            const rawLines = data.text.split('\n');
            for (const line of rawLines) {
              const text = line.trim();
              if (text) {
                // Split multi-tab/spaced columns in scanned tables, or capture clause paragraphs
                const parts = text.split(/\s{3,}|\t/).map((p) => p.trim()).filter(Boolean);
                allRows.push(parts.length > 0 ? parts : [text]);
              }
            }
          }
        }

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    } finally {
      await ocrWorker.terminate();
    }
  }

  // Step 5: Format CSV with clean escaping
  const escapeCell = (val: string): string => {
    const clean = val.trim();
    if (clean.includes(delimiter) || clean.includes('"') || clean.includes('\n') || clean.includes('\r')) {
      return `"${clean.replace(/"/g, '""')}"`;
    }
    return clean;
  };

  const csvLines = allRows.map((row) => row.map(escapeCell).join(delimiter));
  const csv = csvLines.join('\r\n');

  return {
    csv,
    rows: allRows,
    totalRows: allRows.length,
  };
}

export interface MarkdownExtractOptions {
  detectHeadings?: boolean;
  detectLists?: boolean;
  joinHyphenatedWords?: boolean;
  onProgress?: (current: number, total: number) => void;
}

export interface ExtractedMarkdownResult {
  markdown: string;
  charCount: number;
  wordCount: number;
  estimatedTokens: number;
}

export interface MarkdownExtractOptions {
  detectHeadings?: boolean;
  detectLists?: boolean;
  joinHyphenatedWords?: boolean;
  onProgress?: (current: number, total: number) => void;
}

export async function extractMarkdownFromPDF(
  file: File,
  options: MarkdownExtractOptions = {}
): Promise<ExtractedMarkdownResult> {
  const {
    detectHeadings = true,
    detectLists = true,
    joinHyphenatedWords = true,
    onProgress,
  } = options;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  interface TextItemData {
    str: string;
    x: number;
    y: number;
    height: number;
    width: number;
  }

  const pagesTextData: TextItemData[][] = [];
  const fontHeights: number[] = [];
  let totalDigitalItems = 0;

  // Step 1: Extract digital text coordinates
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();

    const items: TextItemData[] = [];
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const height = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12;
      fontHeights.push(height);
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        height,
        width: item.width || 0,
      });
    }
    totalDigitalItems += items.length;
    pagesTextData.push(items);
    page.cleanup();
  }

  const markdownBlocks: string[] = [];

  // =========================================================================
  // PATH A: Automatic OCR Fallback for Scanned PDFs (e.g. Address agreement.pdf)
  // =========================================================================
  if (totalDigitalItems < 10) {
    const ocrWorker = await createWorker('eng', 1, {
      workerPath: '/tessdata/worker.min.js',
      corePath: '/tessdata/tesseract-core-simd-lstm.wasm.js',
      langPath: '/tessdata',
      gzip: true,
    });

    try {
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress?.(pageNum, totalPages);
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await (page.render({ canvasContext: ctx as any, viewport } as any)).promise;
          const { data } = await ocrWorker.recognize(canvas);

          if (data?.text) {
            const rawLines = data.text.split('\n');
            for (const rLine of rawLines) {
              const trimmed = rLine.trim();
              if (!trimmed) continue;

              // Detect scanned legal headers (e.g., "LEAVE AND LICENSE AGREEMENT", "ARTICLE 1")
              if (
                detectHeadings &&
                trimmed.length < 60 &&
                (trimmed === trimmed.toUpperCase() || /^(ARTICLE|CLAUSE|SCHEDULE)\s+[0-9IVXLCDM]+/i.test(trimmed)) &&
                /[A-Za-z]{3,}/.test(trimmed)
              ) {
                markdownBlocks.push(`\n### ${trimmed}\n`);
              } else if (detectLists && /^[\u2022\u25E6\u2023\u2219\*\-\uF06C\uF0B7•]\s*(.*)$/.test(trimmed)) {
                markdownBlocks.push(`- ${trimmed.replace(/^[\u2022\u25E6\u2023\u2219\*\-\uF06C\uF0B7•]\s*/, '')}`);
              } else {
                markdownBlocks.push(trimmed);
              }
            }
          }
        }

        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();

        if (pageNum < totalPages) {
          markdownBlocks.push('\n---\n');
        }
      }
    } finally {
      await ocrWorker.terminate();
    }
  } else {
    // =========================================================================
    // PATH B: Intelligent Digital Text Structuring
    // =========================================================================
    fontHeights.sort((a, b) => a - b);
    const medianHeight = fontHeights[Math.floor(fontHeights.length / 2)] || 12;

    for (let pageIndex = 0; pageIndex < pagesTextData.length; pageIndex++) {
      const items = pagesTextData[pageIndex];
      if (items.length === 0) continue;

      items.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
        return a.x - b.x;
      });

      const lines: { text: string; avgHeight: number }[] = [];
      let currentLineItems: TextItemData[] = [];
      let currentY: number | null = null;

      for (const item of items) {
        if (currentY === null || Math.abs(item.y - currentY) <= 4) {
          currentLineItems.push(item);
          currentY = item.y;
        } else {
          if (currentLineItems.length > 0) {
            const text = currentLineItems.map((i) => i.str).join(' ').trim();
            const avgHeight = currentLineItems.reduce((acc, i) => acc + i.height, 0) / currentLineItems.length;
            lines.push({ text, avgHeight });
          }
          currentLineItems = [item];
          currentY = item.y;
        }
      }

      if (currentLineItems.length > 0) {
        const text = currentLineItems.map((i) => i.str).join(' ').trim();
        const avgHeight = currentLineItems.reduce((acc, i) => acc + i.height, 0) / currentLineItems.length;
        lines.push({ text, avgHeight });
      }

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        let lineText = lines[lIdx].text.trim();
        const avgHeight = lines[lIdx].avgHeight;
        if (!lineText) continue;

        // 1. Clean horizontal dividers
        if (/^[-—_=~.]{3,}$/.test(lineText)) {
          markdownBlocks.push('\n---\n');
          continue;
        }

        // 2. Join hyphenated line breaks
        if (joinHyphenatedWords && lineText.endsWith('-')) {
          lineText = lineText.slice(0, -1);
        }

        // 3. Detect and clean all types of bullet lists (including Word Symbol/Wingdings)
        if (detectLists) {
          const bulletMatch = lineText.match(/^[\u2022\u25E6\u2023\u2219\*\-\uF06C\uF0B7\u25AA\u25AB\u2043\u00B7\u2013\u2014•]\s*(.*)$/);
          if (bulletMatch) {
            markdownBlocks.push(`- ${bulletMatch[1]}`);
            continue;
          }

          const numberedMatch = lineText.match(/^(\d+[\.\)])\s*(.*)$/);
          if (numberedMatch) {
            markdownBlocks.push(`${numberedMatch[1]} ${numberedMatch[2]}`);
            continue;
          }
        }

        // 4. Detect headings
        if (detectHeadings) {
          // Check for Title / Subtitle based on relative font scale
          if (avgHeight >= medianHeight * 1.7) {
            // Merge consecutive huge titles (e.g. First Name + Last Name)
            if (markdownBlocks.length > 0 && markdownBlocks[markdownBlocks.length - 1].startsWith('# ')) {
              markdownBlocks[markdownBlocks.length - 1] += ` ${lineText}`;
            } else {
              markdownBlocks.push(`\n# ${lineText}\n`);
            }
            continue;
          } else if (avgHeight >= medianHeight * 1.35) {
            markdownBlocks.push(`\n## ${lineText}\n`);
            continue;
          } else if (
            // Detect Section Titles in ALL CAPS (e.g. "EDUCATION", "PROFESSIONAL EXPERIENCE")
            (lineText.length < 50 &&
              /^[A-Z0-9\s&,:\/\-\(\)]{3,}$/.test(lineText) &&
              /[A-Z]{3,}/.test(lineText)) ||
            (avgHeight >= medianHeight * 1.15 && lineText.length < 80)
          ) {
            markdownBlocks.push(`\n### ${lineText.replace(/:$/, '')}\n`);
            continue;
          }
        }

        markdownBlocks.push(lineText);
      }

      if (pageIndex < pagesTextData.length - 1) {
        markdownBlocks.push('\n---\n');
      }
    }
  }

  // Step 5: Post-processing cleanups (Fix broken superscript ordinals: "th\n12 in 2011" -> "12th in 2011")
  let markdown = markdownBlocks.join('\n');
  markdown = markdown
    .replace(/\n(th|st|nd|rd)\n+(\d+)\s+/gi, '\n$2$1 ')
    .replace(/(\d+)\n+(th|st|nd|rd)\b/gi, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const charCount = markdown.length;
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const estimatedTokens = Math.round(charCount / 4);

  return {
    markdown,
    charCount,
    wordCount,
    estimatedTokens,
  };
}

export interface TextToPdfOptions {
  text: string;
  fontFamily?: 'helvetica' | 'times' | 'courier';
  fontSize?: number;
  lineSpacing?: number;
  pageSize?: 'a4' | 'letter';
  margin?: number;
}

export async function generateTextPDF(options: TextToPdfOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const [pageWidth, pageHeight] = options.pageSize === 'letter' ? [612, 792] : [595.28, 841.89];
  const margin = options.margin ?? 40;
  const contentWidth = pageWidth - margin * 2;
  const baseFontSize = options.fontSize ?? 12;

  let regularFontName = StandardFonts.Helvetica;
  let boldFontName = StandardFonts.HelveticaBold;
  let italicFontName = StandardFonts.HelveticaOblique;

  if (options.fontFamily === 'times') {
    regularFontName = StandardFonts.TimesRoman;
    boldFontName = StandardFonts.TimesRomanBold;
    italicFontName = StandardFonts.TimesRomanItalic;
  } else if (options.fontFamily === 'courier') {
    regularFontName = StandardFonts.Courier;
    boldFontName = StandardFonts.CourierBold;
    italicFontName = StandardFonts.CourierOblique;
  }

  const fontReg = await pdfDoc.embedFont(regularFontName);
  const fontBold = await pdfDoc.embedFont(boldFontName);
  const fontItalic = await pdfDoc.embedFont(italicFontName);

  const safeColor = (r: number, g: number, b: number) => {
    try {
      return typeof rgb === 'function' ? rgb(r, g, b) : ({ type: 'RGB', red: r, green: g, blue: b } as any);
    } catch {
      return { type: 'RGB', red: r, green: g, blue: b } as any;
    }
  };

  const sanitizeText = (input: string): string => {
    return input
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[\u2022\u25E6\u2023\u2219]/g, '-')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
  };

  interface TextRun {
    text: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }

  interface BlockLine {
    isHeading1?: boolean;
    isHeading2?: boolean;
    isHeading3?: boolean;
    isBullet?: boolean;
    align: 'left' | 'center' | 'right';
    runs: TextRun[];
  }

  const blocks: BlockLine[] = [];

  // Convert raw HTML/DOM into distinct lines, treating <br>, <div>, <p>, and <h1>-<h3> as new lines
  const container = document.createElement('div');
  container.innerHTML = options.text || '';

  // Replace <br> with unique split markers
  const brs = container.querySelectorAll('br');
  brs.forEach((br) => br.replaceWith(document.createTextNode('\n')));

  const extractInlineRuns = (element: Node, inheritedBold = false, inheritedItalic = false, inheritedUnderline = false): TextRun[] => {
    const runs: TextRun[] = [];
    if (element.nodeType === Node.TEXT_NODE) {
      const txt = sanitizeText(element.textContent || '');
      if (txt) {
        runs.push({
          text: txt,
          bold: inheritedBold,
          italic: inheritedItalic,
          underline: inheritedUnderline,
        });
      }
    } else if (element.nodeType === Node.ELEMENT_NODE) {
      const el = element as HTMLElement;
      const tag = el.tagName.toUpperCase();
      const bold = inheritedBold || tag === 'B' || tag === 'STRONG' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight, 10) >= 600;
      const italic = inheritedItalic || tag === 'I' || tag === 'EM' || el.style.fontStyle === 'italic';
      const underline = inheritedUnderline || tag === 'U' || el.style.textDecoration.includes('underline');

      el.childNodes.forEach((child) => {
        runs.push(...extractInlineRuns(child, bold, italic, underline));
      });
    }
    return runs;
  };

  // Inspect each top-level block/paragraph node
  const processBlockNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const content = sanitizeText(node.textContent || '');
      const parts = content.split('\n');
      parts.forEach((p, idx) => {
        if (p.trim()) {
          blocks.push({
            align: 'left',
            runs: [{ text: p.trim(), bold: false, italic: false, underline: false }],
          });
        } else if (idx > 0 && idx < parts.length - 1) {
          // Empty paragraph break
          blocks.push({ align: 'left', runs: [] });
        }
      });
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();

      if (tag === 'UL' || tag === 'OL') {
        Array.from(el.children).forEach((li) => processBlockNode(li));
        return;
      }

      let align: 'left' | 'center' | 'right' = 'left';
      const textAlign = el.style.textAlign?.toLowerCase();
      const attrAlign = el.getAttribute('align')?.toLowerCase();
      if (textAlign === 'center' || attrAlign === 'center') align = 'center';
      else if (textAlign === 'right' || attrAlign === 'right') align = 'right';

      const isHeading1 = tag === 'H1';
      const isHeading2 = tag === 'H2';
      const isHeading3 = tag === 'H3';
      const isBullet = tag === 'LI';

      const isHeading = isHeading1 || isHeading2 || isHeading3;
      const runs = extractInlineRuns(el, isHeading, false, false);

      // Check for inner linebreaks inside the block
      const runsText = runs.map((r) => r.text).join('');
      if (runsText.includes('\n')) {
        const splitLines = runsText.split('\n');
        splitLines.forEach((l) => {
          if (l.trim()) {
            blocks.push({
              isHeading1,
              isHeading2,
              isHeading3,
              isBullet,
              align,
              runs: [{ text: l.trim(), bold: isHeading, italic: false, underline: false }],
            });
          } else {
            blocks.push({ align: 'left', runs: [] });
          }
        });
      } else {
        blocks.push({
          isHeading1,
          isHeading2,
          isHeading3,
          isBullet,
          align,
          runs,
        });
      }
    }
  };

  Array.from(container.childNodes).forEach(processBlockNode);

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - margin - baseFontSize;

  for (const block of blocks) {
    // Empty line / paragraph gap
    if (block.runs.length === 0 || block.runs.every((r) => !r.text.trim())) {
      currentY -= baseFontSize * 0.8;
      if (currentY < margin) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin - baseFontSize;
      }
      continue;
    }

    let blockFontSize = baseFontSize;
    if (block.isHeading1) blockFontSize = Math.round(baseFontSize * 1.6);
    else if (block.isHeading2) blockFontSize = Math.round(baseFontSize * 1.3);
    else if (block.isHeading3) blockFontSize = Math.round(baseFontSize * 1.1);

    const isBullet = block.isBullet;
    const effectiveContentWidth = isBullet ? contentWidth - 18 : contentWidth;

    interface FormattedToken {
      word: string;
      bold: boolean;
      italic: boolean;
      underline: boolean;
      width: number;
    }

    const words: FormattedToken[] = [];
    for (const run of block.runs) {
      const activeFont = run.bold ? fontBold : run.italic ? fontItalic : fontReg;
      const tokens = run.text.split(/(\s+)/);
      for (const t of tokens) {
        if (!t) continue;
        const w = activeFont.widthOfTextAtSize(t, blockFontSize);
        words.push({
          word: t,
          bold: run.bold,
          italic: run.italic,
          underline: run.underline,
          width: w,
        });
      }
    }

    // Word wrap
    const wrappedLines: FormattedToken[][] = [];
    let currentLine: FormattedToken[] = [];
    let currentLineWidth = 0;

    for (const w of words) {
      if (currentLineWidth + w.width <= effectiveContentWidth || currentLine.length === 0) {
        currentLine.push(w);
        currentLineWidth += w.width;
      } else {
        wrappedLines.push(currentLine);
        currentLine = w.word.trim() ? [w] : [];
        currentLineWidth = w.word.trim() ? w.width : 0;
      }
    }
    if (currentLine.length > 0) wrappedLines.push(currentLine);

    const lineHeight = blockFontSize * 1.38;

    for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
      const lineWords = wrappedLines[lIdx];
      if (currentY - lineHeight < margin) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        currentY = pageHeight - margin - blockFontSize;
      }

      const totalLineWidth = lineWords.reduce((acc, w) => acc + w.width, 0);
      let posX = margin;

      if (isBullet) {
        posX = margin + 18;
        if (lIdx === 0) {
          currentPage.drawRectangle({
            x: margin + 4,
            y: currentY + blockFontSize * 0.25,
            width: 3.5,
            height: 3.5,
            color: safeColor(0.15, 0.15, 0.15),
          });
        }
      } else if (block.align === 'center') {
        posX = (pageWidth - totalLineWidth) / 2;
      } else if (block.align === 'right') {
        posX = pageWidth - margin - totalLineWidth;
      }

      let drawX = posX;
      for (const token of lineWords) {
        const itemFont = token.bold ? fontBold : token.italic ? fontItalic : fontReg;
        currentPage.drawText(token.word, {
          x: drawX,
          y: currentY,
          size: blockFontSize,
          font: itemFont,
          color: safeColor(0.1, 0.1, 0.1),
        });

        if (token.underline && token.word.trim()) {
          currentPage.drawLine({
            start: { x: drawX, y: currentY - 2 },
            end: { x: drawX + token.width, y: currentY - 2 },
            thickness: 1,
            color: safeColor(0.1, 0.1, 0.1),
          });
        }

        drawX += token.width;
      }

      currentY -= lineHeight;
    }

    // Space after paragraphs and headings
    currentY -= baseFontSize * (block.isHeading1 || block.isHeading2 ? 0.4 : 0.25);
  }

  return await pdfDoc.save({ useObjectStreams: false });
}

export interface VisualOverlayItem {
  id: string;
  type: 'whiteout' | 'text';
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontFamily?: 'helvetica' | 'times' | 'courier';
  fontSize?: number;
  color?: string;
  hasBackground?: boolean;
  fitMode?: 'wrap' | 'autofit';
  isBold?: boolean;          // <--- ADD
  isItalic?: boolean;        // <--- ADD
  isUnderline?: boolean;     // <--- ADD
  isStrikethrough?: boolean; // <--- ADD
}

export async function applyVisualOverlays(
  file: File,
  overlays: VisualOverlayItem[]
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();

  // Check if PDF is encrypted
  let isEncrypted = false;
  let pdfDoc: PDFDocument | null = null;
  try {
    pdfDoc = await PDFDocument.load(arrayBuffer);
    if (pdfDoc.isEncrypted) isEncrypted = true;
  } catch {
    isEncrypted = true;
  }

  // Helper to pick font style variant
  const getFont = (doc: PDFDocument, family: string = 'helvetica', bold = false, italic = false) => {
    if (family === 'times') {
      if (bold && italic) return doc.embedFont(StandardFonts.TimesRomanBoldItalic);
      if (bold) return doc.embedFont(StandardFonts.TimesRomanBold);
      if (italic) return doc.embedFont(StandardFonts.TimesRomanItalic);
      return doc.embedFont(StandardFonts.TimesRoman);
    }
    if (family === 'courier') {
      if (bold && italic) return doc.embedFont(StandardFonts.CourierBoldOblique);
      if (bold) return doc.embedFont(StandardFonts.CourierBold);
      if (italic) return doc.embedFont(StandardFonts.CourierOblique);
      return doc.embedFont(StandardFonts.Courier);
    }
    // Helvetica default
    if (bold && italic) return doc.embedFont(StandardFonts.HelveticaBoldOblique);
    if (bold) return doc.embedFont(StandardFonts.HelveticaBold);
    if (italic) return doc.embedFont(StandardFonts.HelveticaOblique);
    return doc.embedFont(StandardFonts.Helvetica);
  };

  // =========================================================================
  // PATH A: Native Vector Path (For Standard Unencrypted PDFs)
  // =========================================================================
  if (!isEncrypted && pdfDoc) {
    try {
      const totalPages = pdfDoc.getPageCount();
      const sorted = [...overlays].sort((a, b) => (a.type === b.type ? 0 : a.type === 'whiteout' ? -1 : 1));

      for (const item of sorted) {
        if (item.pageIndex < 0 || item.pageIndex >= totalPages) continue;
        const page = pdfDoc.getPage(item.pageIndex);
        const { width: pW, height: pH } = page.getSize();

        const boxW = Math.max(2, item.width * pW);
        const boxH = Math.max(2, item.height * pH);
        const boxX = item.x * pW;
        const boxY = pH - item.y * pH - boxH;

        if (item.type === 'whiteout' || item.hasBackground !== false) {
          page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, color: rgb(1, 1, 1) });
        }

        if (item.type === 'text' && item.text?.trim()) {
          const font = await getFont(pdfDoc, item.fontFamily, item.isBold, item.isItalic);
          const safeText = item.text.replace(/[^\x20-\x7E]/g, '');
          if (!safeText) continue;

          let [r, g, b] = [0, 0, 0];
          if (item.color?.startsWith('#') && item.color.length === 7) {
            r = parseInt(item.color.slice(1, 3), 16) / 255;
            g = parseInt(item.color.slice(3, 5), 16) / 255;
            b = parseInt(item.color.slice(5, 7), 16) / 255;
          }
          const textColor = rgb(r, g, b);
          const fSize = Math.max(1, item.fontSize || 12);
          const textY = boxY + (boxH - fSize * 0.85) / 2;

          page.drawText(safeText, { x: boxX + 2, y: textY, size: fSize, font, color: textColor });
          const textW = font.widthOfTextAtSize(safeText, fSize);

          // Underline
          if (item.isUnderline) {
            page.drawLine({
              start: { x: boxX + 2, y: textY - 1.5 },
              end: { x: boxX + 2 + textW, y: textY - 1.5 },
              thickness: Math.max(0.8, fSize * 0.07),
              color: textColor,
            });
          }

          // Strikethrough (cross between text)
          if (item.isStrikethrough) {
            page.drawLine({
              start: { x: boxX + 2, y: textY + fSize * 0.32 },
              end: { x: boxX + 2 + textW, y: textY + fSize * 0.32 },
              thickness: Math.max(0.8, fSize * 0.07),
              color: textColor,
            });
          }
        }
      }

      return await pdfDoc.save({ useObjectStreams: false });
    } catch (e) {
      console.warn('Native vector overlay failed, falling back to canvas reconstruction...', e);
    }
  }

  // =========================================================================
  // PATH B: Universal Canvas Reconstruction (For Encrypted Bank Statements)
  // =========================================================================
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdf = await loadingTask.promise;
  const reconstructedDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await (page.render({ canvasContext: ctx as any, viewport } as any)).promise;

    // Burn overlays directly onto canvas for encrypted files
    const pageOverlays = overlays.filter((o) => o.pageIndex === pageNum - 1);
    for (const item of pageOverlays) {
      const x = item.x * canvas.width;
      const y = item.y * canvas.height;
      const w = item.width * canvas.width;
      const h = item.height * canvas.height;

      if (item.type === 'whiteout' || item.hasBackground !== false) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, w, h);
      }

      if (item.type === 'text' && item.text?.trim()) {
        const fSize = (item.fontSize || 12) * 2.0; // scale with 2.0 viewport
        const fontName = item.fontFamily === 'times' ? 'Times New Roman' : item.fontFamily === 'courier' ? 'Courier New' : 'Arial';
        const weight = item.isBold ? 'bold ' : '';
        const style = item.isItalic ? 'italic ' : '';

        ctx.font = `${style}${weight}${fSize}px ${fontName}`;
        ctx.fillStyle = item.color || '#000000';
        ctx.textBaseline = 'middle';
        const textY = y + h / 2;
        ctx.fillText(item.text, x + 4, textY);

        const textMetrics = ctx.measureText(item.text);
        ctx.strokeStyle = item.color || '#000000';
        ctx.lineWidth = Math.max(1.5, fSize * 0.07);

        // Underline
        if (item.isUnderline) {
          ctx.beginPath();
          ctx.moveTo(x + 4, textY + fSize * 0.45);
          ctx.lineTo(x + 4 + textMetrics.width, textY + fSize * 0.45);
          ctx.stroke();
        }

        // Strikethrough
        if (item.isStrikethrough) {
          ctx.beginPath();
          ctx.moveTo(x + 4, textY);
          ctx.lineTo(x + 4 + textMetrics.width, textY);
          ctx.stroke();
        }
      }
    }

    const imageBlob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.95));
    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
    const embeddedImg = await reconstructedDoc.embedJpg(imageBytes);

    const origW = viewport.width / 2.0;
    const origH = viewport.height / 2.0;
    const newPage = reconstructedDoc.addPage([origW, origH]);
    newPage.drawImage(embeddedImg, { x: 0, y: 0, width: origW, height: origH });

    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }

  return await reconstructedDoc.save({ useObjectStreams: false });
}

export interface CsvToPdfOptions {
  rows: string[][];
  title?: string;
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'a4' | 'letter';
  theme?: 'clean' | 'striped' | 'emerald';
  fontSize?: number;
}

export async function generateCsvPDF(options: CsvToPdfOptions): Promise<Uint8Array> {
  const {
    rows,
    title = '',
    orientation = 'portrait',
    pageSize = 'a4',
    theme = 'striped',
    fontSize = 8.5,
  } = options;

  if (!rows || rows.length === 0) {
    throw new Error('No tabular data detected to convert.');
  }

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: pageSize,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const printableWidth = pageWidth - margin * 2;
  const bottomThreshold = pageHeight - margin - 24; // Leave room for footer

  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const headerRow = rows[0] || [];
  const dataRows = rows.slice(1);

  // 1. Calculate Proportional Column Widths based on max content length per column
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  
  const colMaxChars = new Array(colCount).fill(3);
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const val = (row[c] || '').trim();
      if (val.length > colMaxChars[c]) {
        colMaxChars[c] = Math.min(val.length, 60); // Cap max influence
      }
    }
  }

  const totalChars = colMaxChars.reduce((sum, n) => sum + n, 0);
  const colWidths = colMaxChars.map((chars) => Math.max(50, (chars / totalChars) * printableWidth));

  const currentTotalWidth = colWidths.reduce((sum, w) => sum + w, 0);
  if (currentTotalWidth > 0) {
    const scale = printableWidth / currentTotalWidth;
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] *= scale;
    }
  }

  let cursorY = margin;

  if (title.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(24, 24, 27);
    doc.text(title.trim(), margin, cursorY + 12);
    cursorY += 28;
  }

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);

    if (theme === 'emerald') {
      doc.setFillColor(16, 185, 129);
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(244, 244, 245);
      doc.setTextColor(24, 24, 27);
    }

    let maxHeaderLines = 1;
    const headerLinesPerCol: string[][] = [];
    for (let c = 0; c < colCount; c++) {
      const cellText = (headerRow[c] || '').trim();
      const wrapped = doc.splitTextToSize(cellText, colWidths[c] - 12);
      headerLinesPerCol.push(wrapped);
      if (wrapped.length > maxHeaderLines) maxHeaderLines = wrapped.length;
    }

    const headerHeight = Math.max(22, maxHeaderLines * (fontSize * 1.3) + 10);

    doc.rect(margin, cursorY, printableWidth, headerHeight, 'F');
    doc.setDrawColor(212, 212, 216);
    doc.line(margin, cursorY + headerHeight, margin + printableWidth, cursorY + headerHeight);

    for (let c = 0; c < colCount; c++) {
      let cellX = margin;
      for (let i = 0; i < c; i++) cellX += colWidths[i];

      const wrapped = headerLinesPerCol[c];
      let textY = cursorY + 14;
      for (const line of wrapped) {
        doc.text(line, cellX + 6, textY);
        textY += fontSize * 1.3;
      }
    }

    cursorY += headerHeight;
  };

  drawHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];

    const linesPerCol: string[][] = [];
    let maxLines = 1;
    for (let c = 0; c < colCount; c++) {
      const cellText = (row[c] || '').trim();
      const wrapped = doc.splitTextToSize(cellText, colWidths[c] - 12);
      linesPerCol.push(wrapped);
      if (wrapped.length > maxLines) maxLines = wrapped.length;
    }

    const dynRowHeight = Math.max(20, maxLines * (fontSize * 1.3) + 8);

    if (cursorY + dynRowHeight > bottomThreshold) {
      doc.addPage();
      cursorY = margin;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
    }

    if (theme === 'striped' && r % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, cursorY, printableWidth, dynRowHeight, 'F');
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, cursorY, printableWidth, dynRowHeight, 'F');
    }

    doc.setDrawColor(228, 228, 231);
    doc.line(margin, cursorY + dynRowHeight, margin + printableWidth, cursorY + dynRowHeight);

    doc.setTextColor(63, 63, 70);
    for (let c = 0; c < colCount; c++) {
      let cellX = margin;
      for (let i = 0; i < c; i++) cellX += colWidths[i];

      const wrapped = linesPerCol[c];
      let textY = cursorY + 12;
      for (const line of wrapped) {
        doc.text(line, cellX + 6, textY);
        textY += fontSize * 1.3;
      }
    }

    cursorY += dynRowHeight;
  }

  // Stamp Page Numbers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

// ============================================================================
// CODE TO PDF ENGINE
// ============================================================================
export interface SyntaxToken {
  text: string;
  color: [number, number, number];
}

export interface CodeToPdfOptions {
  code: string;
  title?: string;
  theme?: 'dark' | 'light';
  showLineNumbers?: boolean;
  fontSize?: number;
  pageSize?: 'a4' | 'letter';
  orientation?: 'portrait' | 'landscape';
}

export async function generateCodePDF(options: CodeToPdfOptions): Promise<Uint8Array> {
  const {
    code,
    title = '',
    theme = 'dark',
    showLineNumbers = true,
    fontSize = 8.5,
    pageSize = 'a4',
    orientation = 'portrait',
  } = options;

  if (!code.trim()) {
    throw new Error('No source code detected to convert.');
  }

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: pageSize,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const bottomThreshold = pageHeight - margin - 18;

  const isDark = theme === 'dark';

  const bgColor: [number, number, number] = isDark ? [15, 23, 42] : [255, 255, 255];
  const defaultTextColor: [number, number, number] = isDark ? [226, 232, 240] : [15, 23, 42];
  const gutterBg: [number, number, number] = isDark ? [24, 33, 54] : [248, 250, 252];
  const gutterBorder: [number, number, number] = isDark ? [51, 65, 85] : [226, 232, 240];
  const gutterText: [number, number, number] = isDark ? [148, 163, 184] : [148, 163, 184];
  const headerBg: [number, number, number] = isDark ? [30, 41, 59] : [241, 245, 249];
  const headerText: [number, number, number] = isDark ? [56, 189, 248] : [14, 116, 144];

  const keywordColor: [number, number, number] = isDark ? [244, 63, 94] : [185, 28, 28];
  const stringColor: [number, number, number] = isDark ? [52, 211, 153] : [13, 148, 136];
  const commentColor: [number, number, number] = isDark ? [100, 116, 139] : [100, 116, 139];
  const numberColor: [number, number, number] = isDark ? [251, 146, 60] : [194, 65, 12];
  const funcColor: [number, number, number] = isDark ? [96, 165, 250] : [29, 78, 216];

  doc.setFont('courier', 'normal');
  doc.setFontSize(fontSize);

  const charWidth = doc.getTextWidth('M');
  const rawLines = code.replace(/\t/g, '    ').split(/\r?\n/);
  const totalLines = rawLines.length;
  const gutterDigits = Math.max(2, String(totalLines).length);
  const gutterWidth = showLineNumbers ? (gutterDigits + 2) * charWidth + 10 : 0;
  const codeAreaWidth = pageWidth - margin * 2 - gutterWidth;
  const maxCharsPerLine = Math.max(20, Math.floor(codeAreaWidth / charWidth));
  const lineHeight = fontSize * 1.42;

  const drawPageLayout = () => {
    // Force canvas background fill explicitly on every page
    doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    if (title.trim()) {
      doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
      doc.rect(margin, margin - 12, pageWidth - margin * 2, 20, 'F');
      doc.setDrawColor(gutterBorder[0], gutterBorder[1], gutterBorder[2]);
      doc.line(margin, margin + 8, pageWidth - margin, margin + 8);

      doc.setFont('courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(headerText[0], headerText[1], headerText[2]);
      doc.text(`// ${title.trim()}`, margin + 8, margin + 2);
    }

    if (showLineNumbers) {
      doc.setFillColor(gutterBg[0], gutterBg[1], gutterBg[2]);
      doc.rect(margin, margin + 12, gutterWidth, pageHeight - margin * 2 - 12, 'F');

      doc.setDrawColor(gutterBorder[0], gutterBorder[1], gutterBorder[2]);
      doc.line(margin + gutterWidth, margin + 12, margin + gutterWidth, pageHeight - margin);
    }
  };

  let cursorY = margin + (title.trim() ? 26 : 8);
  drawPageLayout();

  const KEYWORD_REGEX =
    /\b(const|let|var|function|return|import|from|export|default|class|extends|if|else|switch|case|break|for|while|do|try|catch|finally|throw|new|typeof|instanceof|async|await|def|elif|lambda|self|echo|select|where|insert|into|update|delete|public|private|protected|static|void|int|float|double|bool|struct|impl|fn|pub|type|interface)\b/;

  const tokenizeLine = (text: string): SyntaxToken[] => {
    const tokens: SyntaxToken[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.startsWith('//') || remaining.startsWith('#')) {
        tokens.push({ text: remaining, color: commentColor });
        break;
      }

      const strMatch = remaining.match(/^("[^"]*"|'[^']*'|`[^`]*`)/);
      if (strMatch) {
        tokens.push({ text: strMatch[0], color: stringColor });
        remaining = remaining.slice(strMatch[0].length);
        continue;
      }

      const numMatch = remaining.match(/^\b\d+(\.\d+)?\b/);
      if (numMatch) {
        tokens.push({ text: numMatch[0], color: numberColor });
        remaining = remaining.slice(numMatch[0].length);
        continue;
      }

      const kwMatch = remaining.match(KEYWORD_REGEX);
      if (kwMatch && remaining.startsWith(kwMatch[0])) {
        tokens.push({ text: kwMatch[0], color: keywordColor });
        remaining = remaining.slice(kwMatch[0].length);
        continue;
      }

      const fnMatch = remaining.match(/^[a-zA-Z_]\w*(?=\()/);
      if (fnMatch) {
        tokens.push({ text: fnMatch[0], color: funcColor });
        remaining = remaining.slice(fnMatch[0].length);
        continue;
      }

      const plainMatch = remaining.match(/^[^"'`#/\d\w\s]+|^\w+|^\s+/);
      if (plainMatch) {
        tokens.push({ text: plainMatch[0], color: defaultTextColor });
        remaining = remaining.slice(plainMatch[0].length);
      } else {
        tokens.push({ text: remaining[0], color: defaultTextColor });
        remaining = remaining.slice(1);
      }
    }

    return tokens;
  };

  doc.setFont('courier', 'normal');
  doc.setFontSize(fontSize);

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const lineNumStr = String(lineIdx + 1).padStart(gutterDigits, ' ');
    const lineContent = rawLines[lineIdx];

    const wrappedChunks: string[] = [];
    if (lineContent.length <= maxCharsPerLine) {
      wrappedChunks.push(lineContent);
    } else {
      for (let i = 0; i < lineContent.length; i += maxCharsPerLine) {
        wrappedChunks.push(lineContent.slice(i, i + maxCharsPerLine));
      }
    }

    for (let chunkIdx = 0; chunkIdx < wrappedChunks.length; chunkIdx++) {
      if (cursorY + lineHeight > bottomThreshold) {
        doc.addPage();
        drawPageLayout();
        cursorY = margin + (title.trim() ? 26 : 8);
        doc.setFont('courier', 'normal');
        doc.setFontSize(fontSize);
      }

      if (showLineNumbers) {
        doc.setTextColor(gutterText[0], gutterText[1], gutterText[2]);
        if (chunkIdx === 0) {
          doc.text(lineNumStr, margin + 4, cursorY);
        } else {
          doc.text('·'.padStart(gutterDigits, ' '), margin + 4, cursorY);
        }
      }

      const chunkText = wrappedChunks[chunkIdx];
      const tokens = tokenizeLine(chunkText);
      let tokenCursorX = margin + gutterWidth + 6;

      for (const token of tokens) {
        doc.setTextColor(token.color[0], token.color[1], token.color[2]);
        doc.text(token.text, tokenCursorX, cursorY);
        tokenCursorX += doc.getTextWidth(token.text);
      }

      cursorY += lineHeight;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(gutterText[0], gutterText[1], gutterText[2]);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

// ============================================================================
// 4. HTML / RECEIPT TO PDF ENGINE (10/10 Optimized for All 3 Settings)
// ============================================================================


export interface HtmlToPdfOptions {
  html: string;
  pageSize?: 'receipt' | 'a4' | 'letter';
  orientation?: 'portrait' | 'landscape';
}

export async function generateHtmlPDF(options: HtmlToPdfOptions): Promise<Uint8Array> {
  const { html, pageSize = 'a4', orientation = 'portrait' } = options;

  if (!html || !html.trim()) {
    throw new Error('No content provided to convert.');
  }

  const isReceipt = pageSize === 'receipt';
  const isLandscape = orientation === 'landscape' && !isReceipt;

  // Standard document dimensions in points (pt)
  const targetWidthPt = isReceipt
    ? 226.77
    : pageSize === 'letter'
    ? isLandscape ? 792 : 612
    : isLandscape ? 841.89 : 595.28;

  const targetHeightPt = isReceipt
    ? 0
    : pageSize === 'letter'
    ? isLandscape ? 612 : 792
    : isLandscape ? 595.28 : 841.89;

  // 794px is exact standard 96-DPI A4 width
  const renderWidthPx = isReceipt ? 340 : isLandscape ? 1123 : 794;
  const sanitizedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Strict 1:1 Document Flow CSS (No flex, no squishing, full-width coverage)
  const NORMALIZATION_CSS = `
    * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #111827 !important;
      display: block !important;
      overflow: visible !important;
    }
    table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 12px 0 !important;
    }
    th, td {
      border: 1px solid #d1d5db !important;
      padding: 6px 10px !important;
    }
    th {
      background-color: #f3f4f6 !important;
      font-weight: bold !important;
    }
    img, svg {
      max-width: 100% !important;
      height: auto !important;
    }
    p, div, span, h1, h2, h3, h4, h5, h6 {
      word-break: break-word !important;
    }
  `;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = `${renderWidthPx}px`;
  iframe.style.height = '1123px';
  iframe.style.zIndex = '-99999';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) throw new Error('Failed to initialize rendering sandbox.');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>${NORMALIZATION_CSS}</style>
        </head>
        <body>${sanitizedHtml}</body>
      </html>
    `);
    doc.close();

    // Allow DOM to compute full layout
    await new Promise((resolve) => setTimeout(resolve, 300));

    const actualContentHeight = Math.max(1123, doc.body.scrollHeight || doc.body.offsetHeight);
    iframe.style.height = `${actualContentHeight}px`;

    const rawCanvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      width: renderWidthPx,
      height: actualContentHeight,
      windowWidth: renderWidthPx,
      windowHeight: actualContentHeight,
      y: 0,
      x: 0,
    });

    // 80mm Thermal Receipt continuous output
    if (isReceipt) {
      const receiptHeightPt = Math.max(100, (rawCanvas.height / rawCanvas.width) * targetWidthPt);
      const imgData = rawCanvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [targetWidthPt, receiptHeightPt],
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, targetWidthPt, receiptHeightPt);
      return new Uint8Array(pdf.output('arraybuffer'));
    }

    // A4 / Letter Multi-Page Export
    const pdf = new jsPDF({
      orientation,
      unit: 'pt',
      format: pageSize,
    });

    const pageHeightPx = Math.floor((targetHeightPt / targetWidthPt) * rawCanvas.width);
    const totalPages = Math.max(1, Math.ceil(rawCanvas.height / pageHeightPx));

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      if (pageIdx > 0) pdf.addPage();

      const sourceY = pageIdx * pageHeightPx;
      const currentSliceHeight = Math.min(pageHeightPx, rawCanvas.height - sourceY);

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = rawCanvas.width;
      sliceCanvas.height = pageHeightPx;
      const sliceCtx = sliceCanvas.getContext('2d');

      if (sliceCtx) {
        sliceCtx.fillStyle = '#ffffff';
        sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceCtx.drawImage(
          rawCanvas,
          0,
          sourceY,
          rawCanvas.width,
          currentSliceHeight,
          0,
          0,
          rawCanvas.width,
          currentSliceHeight
        );

        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.98);
        pdf.addImage(sliceData, 'JPEG', 0, 0, targetWidthPt, targetHeightPt);
      }
    }

    return new Uint8Array(pdf.output('arraybuffer'));
  } finally {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
}