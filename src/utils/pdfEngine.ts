import { jsPDF } from 'jspdf';
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

// Configure offline worker for 100% local processing (works in Airplane Mode)
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
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
/**
 * Merges multiple PDF files into one single PDF document.
 * Includes automatic dual-engine fallback (pdf-lib -> pdfjs raster salvage)
 * so non-standard, damaged, or scanned PDFs never fail to merge.
 */
export async function mergePDFs(files: File[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const fileBytes = await file.arrayBuffer();

    try {
      // 1. Primary Path: Lossless native vector copy
      const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();

      // Ensure every page has a valid Contents stream to prevent copyPages crash
      for (let i = 0; i < pageCount; i++) {
        const page = pdfDoc.getPage(i);
        if (!page.node.Contents()) {
          const emptyStream = pdfDoc.context.flateStream('');
          const ref = pdfDoc.context.register(emptyStream);
          page.node.set(PDFName.of('Contents'), ref);
        }
      }

      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } catch (err) {
      console.warn(`Native merge failed for "${file.name}". Activating fallback engine:`, err);

      // 2. Resilient Fallback: PDF.js renderer salvages and embeds pages
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBytes).slice(),
        stopAtErrors: false,
      });
      const fallbackDoc = await loadingTask.promise;
      const numPages = fallbackDoc.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await fallbackDoc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const renderViewport = page.getViewport({ scale: 2.0 }); // High-DPI for print clarity

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await (
            page.render({
              canvasContext: ctx as any,
              viewport: renderViewport,
            } as any) as any
          ).promise;

          const jpegBlob = await new Promise<Blob>((resolve) =>
            canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.92)
          );

          canvas.width = 0;
          canvas.height = 0;

          const imgBytes = await jpegBlob.arrayBuffer();
          const embeddedImage = await mergedPdf.embedJpg(imgBytes);

          const newPage = mergedPdf.addPage([unscaledViewport.width, unscaledViewport.height]);
          newPage.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width: unscaledViewport.width,
            height: unscaledViewport.height,
          });
        }
      }
    }
  }

  // Save with useObjectStreams: false for universal viewer compatibility
  return await mergedPdf.save({ useObjectStreams: false });
}
/**
 * Compresses a PDF to fit under a specific target size (in KB)
 * using client-side canvas rasterization and quality tuning.
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
        viewport: viewport,
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

export async function rotatePDF(file: File, rotationAngle: number): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const currentAngle = page.getRotation().angle;
    page.setRotation(degrees((currentAngle + rotationAngle) % 360));
  }

  return await pdfDoc.save();
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
        viewport: viewport,
        canvas: canvas,
      } as any) as any
    ).promise;

    imageUrls.push(canvas.toDataURL('image/jpeg', 0.9));
    canvas.width = 0;
    canvas.height = 0;
  }

  return imageUrls;
}

export async function splitPDF(file: File, ranges: string): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();
  const total = srcDoc.getPageCount();

  const pagesToInclude = new Set<number>();
  ranges.split(',').forEach((part) => {
    const p = part.trim();
    if (p.includes('-')) {
      const [start, end] = p.split('-').map((n) => parseInt(n.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= total) pagesToInclude.add(i - 1);
        }
      }
    } else {
      const num = parseInt(p, 10);
      if (!isNaN(num) && num >= 1 && num <= total) pagesToInclude.add(num - 1);
    }
  });

  const indices = Array.from(pagesToInclude).sort((a, b) => a - b);
  const copied = await newDoc.copyPages(srcDoc, indices);
  copied.forEach((p) => newDoc.addPage(p));

  return await newDoc.save();
}

export async function removePagesFromPDF(file: File, pageNumbersToRemove: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const sortedIndices = [...pageNumbersToRemove]
    .map((num) => num - 1)
    .sort((a, b) => b - a);

  for (const pageIndex of sortedIndices) {
    if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
      pdfDoc.removePage(pageIndex);
    }
  }

  return await pdfDoc.save();
}

/**
 * Dual-engine page counter: uses pdf-lib with ignoreEncryption,
 * with seamless PDF.js fallback for scanned or strict files.
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

export async function addWatermarkToPDF(file: File, watermarkText: string): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    page.drawText(watermarkText, {
      x: width * 0.2,
      y: height * 0.4,
      size: 42,
      opacity: 0.25,
      rotate: degrees(45),
    });
  }

  return await pdfDoc.save();
}

export async function addPageNumbersToPDF(
  file: File,
  position: 'bottom-center' | 'bottom-right' = 'bottom-center'
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const total = pages.length;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const text = `Page ${index + 1} of ${total}`;
    const textSize = 10;
    const textWidth = font.widthOfTextAtSize(text, textSize);

    const x = position === 'bottom-right' ? width - textWidth - 36 : (width - textWidth) / 2;

    page.drawText(text, {
      x,
      y: 24,
      size: textSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  });

  return await pdfDoc.save();
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');

    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
  }

  return fullText.trim();
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export async function getPDFMetadata(file: File): Promise<PDFMetadata> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return {
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    keywords: pdfDoc.getKeywords() || '',
  };
}

export async function updatePDFMetadata(file: File, metadata: PDFMetadata): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

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

  return await pdfDoc.save();
}

export async function signPDF(
  file: File,
  signaturePngDataUrl: string,
  pageIndex: number = 0,
  xPercent: number = 0.6,
  yPercent: number = 0.1,
  width: number = 150,
  height: number = 60
): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const targetPage = pages[pageIndex] || pages[0];
  const { width: pageWidth, height: pageHeight } = targetPage.getSize();

  const base64Data = signaturePngDataUrl.split(',')[1];
  const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const embeddedImage = await pdfDoc.embedPng(imageBytes);

  targetPage.drawImage(embeddedImage, {
    x: pageWidth * xPercent,
    y: pageHeight * yPercent,
    width,
    height,
  });

  return await pdfDoc.save();
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
        canvas: canvas,
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

  try {
    const testDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    onProgress?.(100);
    return await testDoc.save({ useObjectStreams: false });
  } catch {}

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer).slice(),
    password: password,
  });

  const pdf = await loadingTask.promise;
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
        canvas: canvas,
      } as any) as any
    ).promise;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pageWidth = unscaledViewport.width;
    const pageHeight = unscaledViewport.height;
    const orientation = pageWidth > pageHeight ? 'landscape' : 'portrait';

    if (i === 1) {
      doc = new jsPDF({
        orientation,
        unit: 'pt',
        format: [pageWidth, pageHeight],
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

  if (!doc) throw new Error('Failed to generate unlocked PDF');
  return new Uint8Array(doc.output('arraybuffer'));
}

export async function compressPDF(
  file: File,
  options: CompressOptions
): Promise<Uint8Array> {
  const { level, targetKb = 200, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();

  if (level === 'recommended') {
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    return await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const newPdfDoc = await PDFDocument.create();

  const pdfOverhead = 1536 + totalPages * 250;
  const desiredTotalBytes = (level === 'extreme' ? Math.max(40 * totalPages, 60) : targetKb) * 1024;
  const netImageBudget = Math.max(desiredTotalBytes - pdfOverhead, totalPages * 1024);
  const budgetPerPage = Math.floor(netImageBudget / totalPages);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentPage: pageNum,
      totalPages,
      stage: `Fitting page ${pageNum} of ${totalPages} to target size...`,
    });

    const page = await pdf.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    let scale = Math.max(0.15, Math.min(1.4, Math.sqrt(budgetPerPage / 45000)));
    let quality = budgetPerPage < 20 * 1024 ? 0.35 : 0.65;
    let finalBlob: Blob | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) break;

      await (
        page.render({
          canvasContext: ctx as any,
          viewport,
        } as any) as any
      ).promise;

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', quality)
      );

      canvas.width = 0;
      canvas.height = 0;

      finalBlob = blob;

      if (blob.size <= budgetPerPage) {
        if (blob.size >= budgetPerPage * 0.75 || attempt >= 2) {
          break;
        }
        scale = Math.min(1.4, scale * 1.12);
        quality = Math.min(0.85, quality + 0.1);
      } else {
        const excessRatio = blob.size / budgetPerPage;
        const downscaleFactor = Math.sqrt(1 / excessRatio) * 0.92;
        scale = Math.max(0.1, scale * downscaleFactor);
        quality = Math.max(0.12, quality * 0.85);
      }
    }

    if (finalBlob) {
      const imageBytes = await finalBlob.arrayBuffer();
      const embeddedImage = await newPdfDoc.embedJpg(imageBytes);

      const newPage = newPdfDoc.addPage([unscaledViewport.width, unscaledViewport.height]);
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: unscaledViewport.width,
        height: unscaledViewport.height,
      });
    }
  }

  return await newPdfDoc.save({ useObjectStreams: true });
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
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const outputDoc = await PDFDocument.create();

  const indicesToCopy = pages.map((p) => p.originalIndex);
  const copiedPages = await outputDoc.copyPages(sourceDoc, indicesToCopy);

  copiedPages.forEach((page, idx) => {
    const desiredRotation = pages[idx].rotation;
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees((currentRotation + desiredRotation) % 360));
    outputDoc.addPage(page);
  });

  return await outputDoc.save({ useObjectStreams: true });
}

export async function splitPdfToZip(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = sourceDoc.getPageCount();
  const zip = new JSZip();

  const baseName = file.name.replace(/\.[^/.]+$/, '');

  for (let i = 0; i < totalPages; i++) {
    onProgress?.(i + 1, totalPages);
    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(sourceDoc, [i]);
    singleDoc.addPage(copiedPage);

    const pdfBytes = await singleDoc.save({ useObjectStreams: true });
    const paddedIndex = String(i + 1).padStart(2, '0');
    zip.file(`${baseName}_page_${paddedIndex}.pdf`, pdfBytes);
  }

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
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

/**
 * 100% Native Vector Crop: Zero quality loss, zero rasterization. 
 * Instantly trims PDF page dimensions mathematically.
 */
export async function cropPDF(
  file: File,
  cropData: CropBox | Record<number, CropBox>,
  applyToAllPages: boolean = true,
  targetPageIndex: number = 0
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  pages.forEach((page, index) => {
    let box: CropBox | null = null;

    if ('x' in cropData) {
      if (applyToAllPages || index === targetPageIndex) {
        box = cropData;
      }
    } else {
      const pageNum = index + 1;
      box = cropData[pageNum] || (applyToAllPages ? cropData[1] || Object.values(cropData)[0] : null);
    }

    if (!box) return;

    const mediaBox = page.getMediaBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;

    const mbX = mediaBox.x;
    const mbY = mediaBox.y;
    const mbW = mediaBox.width;
    const mbH = mediaBox.height;

    const safeW = Math.max(0.01, Math.min(1, box.width));
    const safeH = Math.max(0.01, Math.min(1, box.height));
    const safeX = Math.max(0, Math.min(1 - safeW, box.x));
    const safeY = Math.max(0, Math.min(1 - safeH, box.y));

    let finalX = mbX;
    let finalY = mbY;
    let finalW = mbW;
    let finalH = mbH;

    if (rotation === 0) {
      finalX = mbX + safeX * mbW;
      finalY = mbY + (1 - (safeY + safeH)) * mbH;
      finalW = safeW * mbW;
      finalH = safeH * mbH;
    } else if (rotation === 90) {
      finalX = mbX + (1 - (safeY + safeH)) * mbW;
      finalY = mbY + (1 - (safeX + safeW)) * mbH;
      finalW = safeH * mbW;
      finalH = safeW * mbH;
    } else if (rotation === 180) {
      finalX = mbX + (1 - (safeX + safeW)) * mbW;
      finalY = mbY + safeY * mbH;
      finalW = safeW * mbW;
      finalH = safeH * mbH;
    } else if (rotation === 270) {
      finalX = mbX + safeY * mbW;
      finalY = mbY + safeX * mbH;
      finalW = safeH * mbW;
      finalH = safeW * mbH;
    }

    page.setCropBox(finalX, finalY, finalW, finalH);
    page.setMediaBox(finalX, finalY, finalW, finalH);
  });

  return await pdfDoc.save({ useObjectStreams: false });
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
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const outputDoc = await PDFDocument.create();

  const [baseWidth, baseHeight] = PAGE_DIMENSIONS[size];
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

  return await outputDoc.save({ useObjectStreams: true });
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
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const outputDoc = await PDFDocument.create();

  const totalPages = sourceDoc.getPageCount();
  const [cols, rows, sheetWidth, sheetHeight] =
    pagesPerSheet === 2
      ? [2, 1, 841.89, 595.28]
      : pagesPerSheet === 4
      ? [2, 2, 595.28, 841.89]
      : [3, 3, 595.28, 841.89];

  const cellWidth = sheetWidth / cols;
  const cellHeight = sheetHeight / rows;
  const margin = 12;

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

  return await outputDoc.save({ useObjectStreams: true });
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
  startNumber?: number;
  digits?: number;
  suffix?: string;
  position?: BatesPosition;
  fontSize?: number;
  onProgress?: (current: number, total: number) => void;
}

export async function addBatesNumbersToPDF(
  file: File,
  options: BatesOptions = {}
): Promise<Uint8Array> {
  const {
    prefix = '',
    startNumber = 1,
    digits = 6,
    suffix = '',
    position = 'bottom-right',
    fontSize = 10,
    onProgress,
  } = options;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  for (let i = 0; i < totalPages; i++) {
    onProgress?.(i + 1, totalPages);
    const page = pages[i];
    const { width, height } = page.getSize();

    const currentNum = startNumber + i;
    const paddedNumber = String(currentNum).padStart(digits, '0');
    const batesText = `${prefix}${paddedNumber}${suffix}`;

    const textWidth = font.widthOfTextAtSize(batesText, fontSize);
    const textHeight = fontSize;
    const margin = 28;

    let x = margin;
    let y = margin;

    switch (position) {
      case 'top-left':
        x = margin;
        y = height - margin - textHeight;
        break;
      case 'top-center':
        x = (width - textWidth) / 2;
        y = height - margin - textHeight;
        break;
      case 'top-right':
        x = width - margin - textWidth;
        y = height - margin - textHeight;
        break;
      case 'bottom-left':
        x = margin;
        y = margin;
        break;
      case 'bottom-center':
        x = (width - textWidth) / 2;
        y = margin;
        break;
      case 'bottom-right':
      default:
        x = width - margin - textWidth;
        y = margin;
        break;
    }

    page.drawText(batesText, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
  }

  return await pdfDoc.save({ useObjectStreams: true });
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
      if (validOps.includes(fn)) {
        const imgKey = operatorList.argsArray[i][0];

        try {
          const imgObj: any = await new Promise((resolve) => {
            const obj = (page.objs as any).get(imgKey, (resolved: any) => {
              if (resolved) resolve(resolved);
            });
            if (obj) resolve(obj);
          });

          if (!imgObj) continue;

          const width = imgObj.width;
          const height = imgObj.height;
          if (!width || !height) continue;

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          if (imgObj.bitmap) {
            ctx.drawImage(imgObj.bitmap, 0, 0);
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
          console.warn(`Could not extract image ${imgKey} on page ${pageNum}:`, err);
        }
      }
    }
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
  page: number;
  totalPages: number;
  status: string;
  progress: number;
}

/**
 * High-Speed OCR: clamps canvas to max 1600px (~150 DPI) so Tesseract runs in seconds instead of 5 minutes.
 */
/**
 * High-Speed OCR: clamps canvas to max 1600px (~150 DPI) so Tesseract runs in seconds instead of 5 minutes.
 */
export async function ocrPDFToSearchable(
  file: File,
  language: string = 'eng',
  onProgress?: (progress: OcrProgress) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const bytesForPdfJs = new Uint8Array(arrayBuffer).slice();
  const loadingTask = pdfjsLib.getDocument({ data: bytesForPdfJs });
  const sourcePdf = await loadingTask.promise;
  const totalPages = sourcePdf.numPages;

  let currentPageProcessing = 1;
  const worker = await createWorker(language, 1, {
    langPath: '/tessdata',
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress({
          page: currentPageProcessing,
          totalPages,
          status: `Recognizing text on page ${currentPageProcessing}...`,
          progress: Math.round(((currentPageProcessing - 1 + (m.progress || 0)) / totalPages) * 100),
        });
      }
    },
  });

  const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      currentPageProcessing = pageNum;
      onProgress?.({
        page: pageNum,
        totalPages,
        status: `Rendering page ${pageNum} for OCR...`,
        progress: Math.round(((pageNum - 1) / totalPages) * 100),
      });

      const pdfPage = pdfDoc.getPage(pageNum - 1);
      const { width: pageWidth, height: pageHeight } = pdfPage.getSize();

      const jsPage = await sourcePdf.getPage(pageNum);
      const unscaled = jsPage.getViewport({ scale: 1.0 });

      // Clamp canvas dimension to max 1600px for high speed while keeping accuracy
      const maxDim = Math.max(unscaled.width, unscaled.height);
      const scale = Math.min(1600 / maxDim, 2.0);
      const viewport = jsPage.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (!ctx) continue;

      await (
        jsPage.render({
          canvasContext: ctx as any,
          viewport,
        } as any) as any
      ).promise;

      const { data } = await worker.recognize(canvas);
      const pageData = data as any;

      const scaleX = pageWidth / canvas.width;
      const scaleY = pageHeight / canvas.height;

      if (pageData && pageData.words) {
        for (const word of pageData.words) {
          const cleanText = word.text?.trim();
          if (!cleanText) continue;

          // Normalize smart quotes, em-dashes, and non-ASCII symbols so pdf-lib doesn't drop words
          const safeText = cleanText
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/[^\x20-\x7E]/g, '');

          if (!safeText) continue;

          const { x0, y0, y1 } = word.bbox;
          const pdfX = x0 * scaleX;
          const wordBoxHeight = (y1 - y0) * scaleY;
          const pdfY = pageHeight - y1 * scaleY;
          const fontSize = Math.max(4, Math.min(72, wordBoxHeight * 0.85));

          try {
            pdfPage.drawText(safeText, {
              x: pdfX,
              y: pdfY,
              size: fontSize,
              font,
              opacity: 0,
            });
          } catch {}
        }
      }

      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
  }

  onProgress?.({
    page: totalPages,
    totalPages,
    status: 'Finalizing searchable PDF...',
    progress: 100,
  });

  return await pdfDoc.save({ useObjectStreams: true });
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

/**
 * Hardened Booklet maker: pads with blank pages and adds empty Contents stream
 * to any page lacking one, resolving "Can't embed page with missing Contents".
 */
export async function createBookletPDF(
  file: File,
  options: BookletOptions = {}
): Promise<Uint8Array> {
  const { sheetSize = 'A4', addFoldLine = true, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const origPageCount = sourceDoc.getPageCount();

  const targetPageCount = Math.ceil(origPageCount / 4) * 4;
  const pagesToPad = targetPageCount - origPageCount;
  for (let i = 0; i < pagesToPad; i++) {
    sourceDoc.addPage();
  }

  // Ensure every page has a valid Contents stream before embedding
  for (let i = 0; i < sourceDoc.getPageCount(); i++) {
    const page = sourceDoc.getPage(i);
    if (!page.node.Contents()) {
      const emptyStream = sourceDoc.context.flateStream('');
      const ref = sourceDoc.context.register(emptyStream);
      page.node.set(PDFName.of('Contents'), ref);
    }
  }

  const outputDoc = await PDFDocument.create();
  const [sheetW, sheetH] =
    sheetSize === 'LETTER' ? [792.0, 612.0] : [841.89, 595.28];

  const halfW = sheetW / 2;
  const halfH = sheetH;
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

  return await outputDoc.save({ useObjectStreams: true });
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

export async function extractTableFromPDF(
  file: File,
  options: TableExtractOptions = {}
): Promise<ExtractedTableResult> {
  const { yTolerance = 4, minColumnGap = 12, delimiter = ',', onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const allRows: string[][] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    interface RawItem {
      str: string;
      x: number;
      y: number;
      width: number;
    }

    const items: RawItem[] = [];
    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const tx = item.transform[4];
      const ty = item.transform[5];
      items.push({
        str: item.str,
        x: tx,
        y: ty,
        width: item.width || 0,
      });
    }

    items.sort((a, b) => {
      if (Math.abs(b.y - a.y) > yTolerance) {
        return b.y - a.y;
      }
      return a.x - b.x;
    });

    const lines: RawItem[][] = [];
    let currentLine: RawItem[] = [];
    let currentY: number | null = null;

    for (const item of items) {
      if (currentY === null || Math.abs(item.y - currentY) <= yTolerance) {
        currentLine.push(item);
        currentY = item.y;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
        currentY = item.y;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);

      const rowCells: string[] = [];
      let currentCellText = '';
      let lastRightEdge = -1;

      for (const item of line) {
        if (lastRightEdge === -1) {
          currentCellText = item.str;
          lastRightEdge = item.x + item.width;
        } else {
          const gap = item.x - lastRightEdge;
          if (gap > minColumnGap) {
            rowCells.push(currentCellText.trim());
            currentCellText = item.str;
          } else {
            currentCellText += (gap > 2 ? ' ' : '') + item.str;
          }
          lastRightEdge = item.x + item.width;
        }
      }

      if (currentCellText.trim()) {
        rowCells.push(currentCellText.trim());
      }

      if (rowCells.length > 0) {
        allRows.push(rowCells);
      }
    }
  }

  const escapeCell = (val: string): string => {
    if (val.includes(delimiter) || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
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
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer).slice() });
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
    pagesTextData.push(items);
  }

  fontHeights.sort((a, b) => a - b);
  const medianHeight = fontHeights[Math.floor(fontHeights.length / 2)] || 12;

  const markdownBlocks: string[] = [];

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

    for (const line of lines) {
      let lineText = line.text;
      if (!lineText) continue;

      if (joinHyphenatedWords && lineText.endsWith('-')) {
        lineText = lineText.slice(0, -1);
      }

      if (detectHeadings) {
        if (line.avgHeight >= medianHeight * 1.8) {
          markdownBlocks.push(`\n# ${lineText}\n`);
          continue;
        } else if (line.avgHeight >= medianHeight * 1.35) {
          markdownBlocks.push(`\n## ${lineText}\n`);
          continue;
        } else if (line.avgHeight >= medianHeight * 1.15 && lineText.length < 80) {
          markdownBlocks.push(`\n### ${lineText}\n`);
          continue;
        }
      }

      if (detectLists) {
        const bulletMatch = lineText.match(/^[\u2022\u25E6\u2023\u2219\*\-]\s*(.*)$/);
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

      markdownBlocks.push(lineText);
    }

    if (pageIndex < pagesTextData.length - 1) {
      markdownBlocks.push('\n---\n');
    }
  }

  const markdown = markdownBlocks
    .join('\n')
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

/**
 * 100% Client-side vector Text & Markdown to PDF generator with auto-pagination.
 */
export async function generateTextPDF(options: TextToPdfOptions): Promise<Uint8Array> {
  const {
    text,
    fontFamily = 'helvetica',
    fontSize = 12,
    lineSpacing = 1.4,
    pageSize = 'a4',
    margin = 40,
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: pageSize,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const printableWidth = pageWidth - margin * 2;
  const bottomThreshold = pageHeight - margin;

  let cursorY = margin + fontSize;

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Markdown Heading 1: # Title
    if (rawLine.startsWith('# ')) {
      const h1Size = Math.round(fontSize * 1.6);
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(h1Size);
      const splitLines = doc.splitTextToSize(rawLine.replace('# ', ''), printableWidth);

      for (const line of splitLines) {
        if (cursorY + h1Size > bottomThreshold) {
          doc.addPage();
          cursorY = margin + h1Size;
        }
        doc.text(line, margin, cursorY);
        cursorY += h1Size * lineSpacing;
      }
      cursorY += 6;
      continue;
    }

    // Markdown Heading 2: ## Subtitle
    if (rawLine.startsWith('## ')) {
      const h2Size = Math.round(fontSize * 1.3);
      doc.setFont(fontFamily, 'bold');
      doc.setFontSize(h2Size);
      const splitLines = doc.splitTextToSize(rawLine.replace('## ', ''), printableWidth);

      for (const line of splitLines) {
        if (cursorY + h2Size > bottomThreshold) {
          doc.addPage();
          cursorY = margin + h2Size;
        }
        doc.text(line, margin, cursorY);
        cursorY += h2Size * lineSpacing;
      }
      cursorY += 4;
      continue;
    }

    // Markdown Bullet point: - list item
    if (rawLine.startsWith('- ') || rawLine.startsWith('* ')) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(fontSize);
      const bulletText = rawLine.replace(/^[-*]\s+/, '');
      const splitLines = doc.splitTextToSize(bulletText, printableWidth - 14);

      for (let j = 0; j < splitLines.length; j++) {
        if (cursorY + fontSize > bottomThreshold) {
          doc.addPage();
          cursorY = margin + fontSize;
        }
        if (j === 0) {
          doc.text('•', margin, cursorY);
        }
        doc.text(splitLines[j], margin + 14, cursorY);
        cursorY += fontSize * lineSpacing;
      }
      continue;
    }

    // Blank line
    if (!rawLine.trim()) {
      cursorY += fontSize * 0.8;
      continue;
    }

    // Normal paragraph text
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(fontSize);
    const splitLines = doc.splitTextToSize(rawLine, printableWidth);

    for (const line of splitLines) {
      if (cursorY + fontSize > bottomThreshold) {
        doc.addPage();
        cursorY = margin + fontSize;
      }
      doc.text(line, margin, cursorY);
      cursorY += fontSize * lineSpacing;
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
export interface CsvToPdfOptions {
  rows: string[][];
  title?: string;
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'a4' | 'letter';
  theme?: 'clean' | 'striped' | 'emerald';
  fontSize?: number;
}

/**
 * High-speed vector CSV/Excel to PDF generator with auto-pagination and repeating headers.
 */
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
}

/**
 * 8-Point Visual Overlay & Whiteout Engine with selectable standard fonts,
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
}

/**
 * 8-Point Visual Overlay & Whiteout Engine with selectable standard fonts,
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
}

/**
 * 8-Point Visual Overlay & Whiteout Engine with selectable standard fonts,
 * precision size scaling (1pt-72pt), auto-fit, and word wrap.
 */
export async function applyVisualOverlays(
  file: File,
  overlays: VisualOverlayItem[]
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const totalPages = pdfDoc.getPageCount();

  const sortedOverlays = [...overlays].sort((a, b) => {
    if (a.type === 'whiteout' && b.type === 'text') return -1;
    if (a.type === 'text' && b.type === 'whiteout') return 1;
    return 0;
  });

  for (const item of sortedOverlays) {
    if (item.pageIndex < 0 || item.pageIndex >= totalPages) continue;
    const page = pdfDoc.getPage(item.pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();

    const boxWidth = Math.max(2, item.width * pageWidth);
    const boxHeight = Math.max(2, item.height * pageHeight);
    const boxX = item.x * pageWidth;
    const boxY = pageHeight - item.y * pageHeight - boxHeight;

    // Draw opaque white mask
    if (item.type === 'whiteout' || item.hasBackground !== false) {
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
      });
    }

    // Draw text layer
    if (item.type === 'text' && item.text?.trim()) {
      let font = helveticaFont;
      if (item.fontFamily === 'times') font = timesFont;
      if (item.fontFamily === 'courier') font = courierFont;

      const safeText = item.text
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[^\x20-\x7E]/g, '');

      if (!safeText) continue;

      let r = 0;
      let g = 0;
      let b = 0;
      if (item.color && item.color.startsWith('#') && item.color.length === 7) {
        r = parseInt(item.color.slice(1, 3), 16) / 255;
        g = parseInt(item.color.slice(3, 5), 16) / 255;
        b = parseInt(item.color.slice(5, 7), 16) / 255;
      }
      const textColor = rgb(r, g, b);

      if (item.fitMode === 'autofit') {
        const unitWidth = font.widthOfTextAtSize(safeText, 1);
        const maxFittingWidth = unitWidth > 0 ? (boxWidth - 4) / unitWidth : 12;
        const maxFittingHeight = boxHeight * 0.8;
        const autoSize = Math.max(1, Math.min(maxFittingWidth, maxFittingHeight, 120));

        const textY = boxY + (boxHeight - autoSize * 0.85) / 2;
        page.drawText(safeText, {
          x: boxX + 2,
          y: textY,
          size: autoSize,
          font,
          color: textColor,
        });
      } else {
        const fSize = Math.max(1, item.fontSize || 12);
        const lineHeight = fSize * 1.25;
        const words = safeText.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const lineWidth = font.widthOfTextAtSize(testLine, fSize);
          if (lineWidth > boxWidth - 4 && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);

        let lineY = boxY + boxHeight - fSize;
        for (const line of lines) {
          if (lineY < boxY) break;
          page.drawText(line, {
            x: boxX + 2,
            y: lineY,
            size: fSize,
            font,
            color: textColor,
          });
          lineY -= lineHeight;
        }
      }
    }
  }

  return await pdfDoc.save({ useObjectStreams: false });
}
export interface CsvToPdfOptions {
  rows: string[][];
  title?: string;
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'a4' | 'letter';
  theme?: 'clean' | 'striped' | 'emerald';
  fontSize?: number;
}

/**
 * Client-side vector CSV/Excel to PDF generator
 */
export async function generateCsvPDF(options: CsvToPdfOptions): Promise<Uint8Array> {
  const {
    rows,
    title = '',
    orientation = 'portrait',
    pageSize = 'a4',
    theme = 'striped',
    fontSize = 9,
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
  const bottomThreshold = pageHeight - margin;

  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const colWidth = printableWidth / colCount;
  const rowHeight = Math.max(18, fontSize * 2.2);

  let cursorY = margin;

  if (title.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(24, 24, 27);
    doc.text(title.trim(), margin, cursorY + 12);
    cursorY += 26;
  }

  const headerRow = rows[0] || [];
  const dataRows = rows.slice(1);

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

    doc.rect(margin, cursorY, printableWidth, rowHeight, 'F');
    doc.setDrawColor(212, 212, 216);
    doc.line(margin, cursorY + rowHeight, margin + printableWidth, cursorY + rowHeight);

    for (let c = 0; c < colCount; c++) {
      const cellText = (headerRow[c] || '').trim();
      const cellX = margin + c * colWidth + 6;
      const cellY = cursorY + rowHeight / 2 + fontSize / 3;
      const truncated = doc.splitTextToSize(cellText, colWidth - 10)[0] || '';
      doc.text(truncated, cellX, cellY);
    }

    cursorY += rowHeight;
  };

  drawHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];

    if (cursorY + rowHeight > bottomThreshold) {
      doc.addPage();
      cursorY = margin;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
    }

    if (theme === 'striped' && r % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, cursorY, printableWidth, rowHeight, 'F');
    } else {
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, cursorY, printableWidth, rowHeight, 'F');
    }

    doc.setDrawColor(228, 228, 231);
    doc.line(margin, cursorY + rowHeight, margin + printableWidth, cursorY + rowHeight);

    doc.setTextColor(63, 63, 70);
    for (let c = 0; c < colCount; c++) {
      const cellText = (row[c] || '').trim();
      const cellX = margin + c * colWidth + 6;
      const cellY = cursorY + rowHeight / 2 + fontSize / 3;
      const truncated = doc.splitTextToSize(cellText, colWidth - 10)[0] || '';
      doc.text(truncated, cellX, cellY);
    }

    cursorY += rowHeight;
  }

  return new Uint8Array(doc.output('arraybuffer'));
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

interface SyntaxToken {
  text: string;
  color: [number, number, number]; // RGB
}

/**
 * 100% Client-side vector Code to PDF generator with syntax highlighting,
 * line numbers, and clean multi-page pagination.
 */
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
  const margin = 32;
  const bottomThreshold = pageHeight - margin;

  // Theme palettes
  const isDark = theme === 'dark';
  const bgColor: [number, number, number] = isDark ? [15, 23, 42] : [255, 255, 255]; // Slate 900 vs Pure White
  const defaultTextColor: [number, number, number] = isDark ? [226, 232, 240] : [30, 41, 59];
  const gutterBg: [number, number, number] = isDark ? [30, 41, 59] : [241, 245, 249];
  const gutterText: [number, number, number] = isDark ? [100, 116, 139] : [148, 163, 184];
  const keywordColor: [number, number, number] = isDark ? [244, 63, 94] : [192, 38, 211]; // Rose 500 vs Fuchsia 600
  const stringColor: [number, number, number] = isDark ? [52, 211, 153] : [13, 148, 136]; // Emerald 400 vs Teal 600
  const commentColor: [number, number, number] = isDark ? [100, 116, 139] : [100, 116, 139]; // Slate 500
  const numberColor: [number, number, number] = isDark ? [251, 146, 60] : [217, 119, 6]; // Orange 400 vs Amber 600

  const drawPageBackground = () => {
    if (isDark) {
      doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
    }
  };

  drawPageBackground();

  let cursorY = margin;

  // Optional Header / File Title Banner
  if (title.trim()) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(isDark ? 56 : 15, isDark ? 189 : 23, isDark ? 248 : 42);
    doc.text(`// ${title.trim()}`, margin, cursorY + 6);
    cursorY += 24;
  }

  const rawLines = code.replace(/\t/g, '  ').split(/\r?\n/);
  const totalLines = rawLines.length;
  const gutterDigits = Math.max(2, String(totalLines).length);
  const charWidth = fontSize * 0.6; // Constant width for Courier monospace font
  const gutterWidth = showLineNumbers ? (gutterDigits + 2) * charWidth + 12 : 0;
  const codeAreaWidth = pageWidth - margin * 2 - gutterWidth;
  const maxCharsPerLine = Math.floor(codeAreaWidth / charWidth);
  const lineHeight = fontSize * 1.45;

  // Keywords list covering JS, TS, Python, SQL, Java, C++, Rust, Go
  const KEYWORD_REGEX =
    /\b(const|let|var|function|return|import|from|export|default|class|extends|if|else|switch|case|break|for|while|do|try|catch|finally|throw|new|typeof|instanceof|async|await|def|elif|lambda|self|echo|select|from|where|insert|into|update|delete|public|private|protected|static|void|int|float|double|bool|struct|impl|fn|pub|type|interface)\b/;

  // Lightweight regex tokenizer
  const tokenizeLine = (text: string): SyntaxToken[] => {
    const tokens: SyntaxToken[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      // Single-line comment
      if (remaining.startsWith('//') || remaining.startsWith('#')) {
        tokens.push({ text: remaining, color: commentColor });
        break;
      }

      // Strings (double quotes, single quotes, backticks)
      const strMatch = remaining.match(/^("[^"]*"|'[^']*'|`[^`]*`)/);
      if (strMatch) {
        tokens.push({ text: strMatch[0], color: stringColor });
        remaining = remaining.slice(strMatch[0].length);
        continue;
      }

      // Numbers
      const numMatch = remaining.match(/^\b\d+(\.\d+)?\b/);
      if (numMatch) {
        tokens.push({ text: numMatch[0], color: numberColor });
        remaining = remaining.slice(numMatch[0].length);
        continue;
      }

      // Keywords
      const kwMatch = remaining.match(KEYWORD_REGEX);
      if (kwMatch && remaining.startsWith(kwMatch[0])) {
        tokens.push({ text: kwMatch[0], color: keywordColor });
        remaining = remaining.slice(kwMatch[0].length);
        continue;
      }

      // Standard identifiers / symbols
      const plainMatch = remaining.match(/^[^"'`#/\d\w]+|^\w+/);
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

    // Wrap long lines
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
        drawPageBackground();
        cursorY = margin;
      }

      // Draw line number gutter
      if (showLineNumbers) {
        doc.setFillColor(gutterBg[0], gutterBg[1], gutterBg[2]);
        doc.rect(margin, cursorY - fontSize * 0.85, gutterWidth - 6, lineHeight, 'F');

        doc.setTextColor(gutterText[0], gutterText[1], gutterText[2]);
        if (chunkIdx === 0) {
          doc.text(lineNumStr, margin + 4, cursorY);
        } else {
          // Wrapped continuation marker
          doc.text('·'.padStart(gutterDigits, ' '), margin + 4, cursorY);
        }
      }

      // Draw highlighted code tokens
      const chunkText = wrappedChunks[chunkIdx];
      const tokens = tokenizeLine(chunkText);
      let tokenCursorX = margin + gutterWidth;

      for (const token of tokens) {
        doc.setTextColor(token.color[0], token.color[1], token.color[2]);
        // ASCII sanitize to prevent WinAnsi exceptions
        const safeToken = token.text.replace(/[^\x20-\x7E]/g, ' ');
        doc.text(safeToken, tokenCursorX, cursorY);
        tokenCursorX += safeToken.length * charWidth;
      }

      cursorY += lineHeight;
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
}