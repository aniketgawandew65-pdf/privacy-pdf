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
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

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
    const pdfDoc = await PDFDocument.load(fileBytes);
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
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

  // If already smaller than target, return as-is
  if (originalSizeKB <= targetSizeKB) {
    return new Uint8Array(fileBytes);
  }

  // Load PDF with PDF.js
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBytes) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  // Calculate compression quality ratio (clamped between 0.35 and 0.85)
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
        canvasContext: context,
        viewport: viewport,
      } as any) as any
    ).promise;

    // Convert canvas page to compressed JPEG blob
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

    // Add page matching original aspect ratio
    const newPage = outputPdf.addPage([viewport.width, viewport.height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
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
  }

  return await pdfDoc.save();
}

export async function rotatePDF(file: File, rotationAngle: number): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const currentAngle = page.getRotation().angle;
    page.setRotation(degrees((currentAngle + rotationAngle) % 360));
  }

  return await pdfDoc.save();
}

export async function pdfToImages(file: File): Promise<string[]> {
  const fileBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
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
  }

  return imageUrls;
}

export async function removePagesFromPDF(file: File, pageNumbersToRemove: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);

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

export async function getPDFPageCount(file: File): Promise<number> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  return pdfDoc.getPageCount();
}

export async function addWatermarkToPDF(file: File, watermarkText: string): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
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
  const pdfDoc = await PDFDocument.load(bytes);
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
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
  const pdfDoc = await PDFDocument.load(bytes);
  return {
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    keywords: pdfDoc.getKeywords() || '',
  };
}

export async function updatePDFMetadata(file: File, metadata: PDFMetadata): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);

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
  const pdfDoc = await PDFDocument.load(bytes);
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
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
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

  // Mode 1: Standard (Lossless structural cleanup)
  if (level === 'recommended') {
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    return await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  }

  // Mode 2 & 3: Canvas Rasterization to Exact KB Target
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const newPdfDoc = await PDFDocument.create();

  // Reserve PDF structural overhead (~1.5KB base + ~250B per page)
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

    // Derive initial scale directly from byte budget
    let scale = Math.max(0.15, Math.min(1.4, Math.sqrt(budgetPerPage / 45000)));
    let quality = budgetPerPage < 20 * 1024 ? 0.35 : 0.65;
    let finalBlob: Blob | null = null;

    // Up to 4 convergence passes to force output under budgetPerPage
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

      // Free canvas memory immediately
      canvas.width = 0;
      canvas.height = 0;

      finalBlob = blob;

      if (blob.size <= budgetPerPage) {
        // Fits under target budget
        if (blob.size >= budgetPerPage * 0.75 || attempt >= 2) {
          break;
        }
        // Slightly increase quality if well below budget
        scale = Math.min(1.4, scale * 1.12);
        quality = Math.min(0.85, quality + 0.1);
      } else {
        // Exceeded budget: scale down canvas dimensions proportionally
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
  originalIndex: number; // 0-indexed
  rotation: number;      // 0, 90, 180, 270
}

/**
 * Reorders, rotates, and cherry-picks pages into a new PDF
 */
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

/**
 * Bursts a multi-page PDF into separate 1-page PDFs packaged into a ZIP
 */
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
 * 1-click sanitization: Strips XMP metadata, author, creator, producer, and date tags
 */
export async function sanitizePDF(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // Strip standard metadata
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('1into1 PDF (Privacy Sanitized)');
  pdfDoc.setCreator('');
  pdfDoc.setCreationDate(new Date(0));
  pdfDoc.setModificationDate(new Date(0));

  // Remove low-level XMP Metadata catalog if present
  const catalog = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Root);
  if (catalog instanceof PDFDict) {
    catalog.delete(PDFName.of('Metadata'));
    catalog.delete(PDFName.of('PieceInfo'));
  }

  return await pdfDoc.save({ useObjectStreams: true });
}

export interface RedactionRect {
  x: number;      // Normalized (0 to 1) relative to page width
  y: number;      // Normalized (0 to 1) relative to page height
  width: number;  // Normalized (0 to 1)
  height: number; // Normalized (0 to 1)
}

export interface PageRedaction {
  pageIndex: number; // 0-indexed
  rects: RedactionRect[];
}

/**
 * Permanently burns blackout rectangles into document pages via canvas rasterization,
 * ensuring no underlying text stream or vector layer remains extractable.
 */
export async function redactPDF(
  file: File,
  redactions: PageRedaction[],
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const sourcePdf = await loadingTask.promise;
  const totalPages = sourcePdf.numPages;

  const outputDoc = await PDFDocument.create();

  // Map redactions by page index
  const redactionMap = new Map<number, RedactionRect[]>();
  redactions.forEach((r) => redactionMap.set(r.pageIndex, r.rects));

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const pageIndex = pageNum - 1;
    const page = await sourcePdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // High-DPI render

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering context unavailable');

    // 1. Render page content
    await (
      page.render({
        canvasContext: ctx as any,
        viewport,
      } as any) as any
    ).promise;

    // 2. Permanently burn solid blackout boxes if redactions exist on this page
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

    // 3. Bake into compressed JPEG
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
  x: number;      // Normalized (0 to 1) from top-left
  y: number;      // Normalized (0 to 1) from top-left
  width: number;  // Normalized (0 to 1)
  height: number; // Normalized (0 to 1)
}

/**
 * Trims PDF page boundaries natively by recalculating CropBox and MediaBox.
 * Supports per-page crop geometries, handles rotated pages, and preserves 100% vector fidelity.
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
      // Single CropBox provided
      if (applyToAllPages || index === targetPageIndex) {
        box = cropData;
      }
    } else {
      // Dictionary of 1-based page numbers provided: { [pageNumber]: CropBox }
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

    let finalX = mbX;
    let finalY = mbY;
    let finalW = mbW;
    let finalH = mbH;

    // Convert top-left normalized screen coordinates to bottom-left PDF coordinates
    if (rotation === 0) {
      finalX = mbX + box.x * mbW;
      finalY = mbY + (1 - (box.y + box.height)) * mbH;
      finalW = box.width * mbW;
      finalH = box.height * mbH;
    } else if (rotation === 90) {
      finalX = mbX + (1 - (box.y + box.height)) * mbW;
      finalY = mbY + (1 - (box.x + box.width)) * mbH;
      finalW = box.height * mbW;
      finalH = box.width * mbH;
    } else if (rotation === 180) {
      finalX = mbX + (1 - (box.x + box.width)) * mbW;
      finalY = mbY + box.y * mbH;
      finalW = box.width * mbW;
      finalH = box.height * mbH;
    } else if (rotation === 270) {
      finalX = mbX + box.y * mbW;
      finalY = mbY + box.x * mbH;
      finalW = box.height * mbW;
      finalH = box.width * mbH;
    }

    // Apply both CropBox and MediaBox for universal viewer compatibility
    page.setCropBox(finalX, finalY, finalW, finalH);
    page.setMediaBox(finalX, finalY, finalW, finalH);
  });

  return await pdfDoc.save({ useObjectStreams: true });
}

export interface FormFieldData {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'unsupported';
  value: string | boolean;
  options?: string[];
}

/**
 * Inspects the PDF and returns all detected interactive AcroForm fields.
 */
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

/**
 * Fills PDF form fields in memory and optionally flattens the form into static vector text.
 */
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
  threshold?: number; // 0-255 for pure black & white threshold (default: 128)
  onProgress?: (current: number, total: number) => void;
}

/**
 * Converts all pages in a PDF to grayscale or high-contrast pure black and white (photocopy mode).
 * Processes canvas pixel buffers locally in-browser.
 */
export async function convertToGrayscalePDF(
  file: File,
  options: GrayscaleOptions
): Promise<Uint8Array> {
  const { mode = 'grayscale', threshold = 135, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const outputDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // High-DPI for print clarity

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

    // Apply color transformation directly to the pixel buffer
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Standard ITU-R BT.601 perceptual luminance formula
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

/**
 * Standardizes all PDF pages to a selected paper format.
 * Embeds source pages into target dimensions with vector fidelity.
 */
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

    // Determine target orientation
    let targetWidth = baseWidth;
    let targetHeight = baseHeight;

    if (autoOrientation && origWidth > origHeight) {
      // Rotate target to landscape to match original orientation
      targetWidth = Math.max(baseWidth, baseHeight);
      targetHeight = Math.min(baseWidth, baseHeight);
    } else if (autoOrientation) {
      // Portrait
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

/**
 * Arranges multiple input pages onto a single sheet (2-Up, 4-Up, 9-Up).
 * Vector-native layout calculation preserving crystal-clear text quality.
 */
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
      ? [2, 1, 841.89, 595.28] // A4 Landscape
      : pagesPerSheet === 4
      ? [2, 2, 595.28, 841.89] // A4 Portrait
      : [3, 3, 595.28, 841.89]; // 9-Up: A4 Portrait

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

        // Usable cell area with padding
        const usableW = cellWidth - margin * 2;
        const usableH = cellHeight - margin * 2;

        const scale = Math.min(usableW / origW, usableH / origH);
        const scaledW = origW * scale;
        const scaledH = origH * scale;

        // PDF coordinate origin is bottom-left
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
  digits?: number; // Zero-padding (e.g. 6 -> 000001)
  suffix?: string;
  position?: BatesPosition;
  fontSize?: number;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Applies sequential Bates numbering stamps across all PDF pages.
 * Fully native vector stamping preserving source quality.
 */
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

/**
 * Inspects PDF operator lists and extracts all embedded image objects into standalone PNG blobs.
 */
export async function extractImagesFromPDF(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ExtractedImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
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
          // Resolve image object from PDF.js cache
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

/**
 * Bundles extracted image blobs into a ZIP file in memory.
 */
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
  progress: number; // 0 to 100
}

/**
 * Runs optical character recognition locally on scanned pages and embeds
 * an invisible, coordinate-accurate vector text layer to make the PDF searchable.
 */
export async function ocrPDFToSearchable(
  file: File,
  language: string = 'eng',
  onProgress?: (progress: OcrProgress) => void
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const sourcePdf = await loadingTask.promise;
  const totalPages = sourcePdf.numPages;

  // Initialize Tesseract client-side worker
  const worker = await createWorker(language);

  // Load existing PDF to append invisible text layer
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        page: pageNum,
        totalPages,
        status: `Rendering page ${pageNum} for OCR...`,
        progress: Math.round(((pageNum - 1) / totalPages) * 100),
      });

      const pdfPage = pdfDoc.getPage(pageNum - 1);
      const { width: pageWidth, height: pageHeight } = pdfPage.getSize();

      // Render page to canvas at 2x resolution for high OCR accuracy
      const jsPage = await sourcePdf.getPage(pageNum);
      const viewport = jsPage.getViewport({ scale: 2.0 });

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

      onProgress?.({
        page: pageNum,
        totalPages,
        status: `Recognizing text on page ${pageNum}...`,
        progress: Math.round(((pageNum - 0.5) / totalPages) * 100),
      });

      // Execute OCR
      const { data } = await worker.recognize(canvas);
      const pageData = data as any;

      // Coordinate scaling factors (Canvas pixels to PDF points)
      const scaleX = pageWidth / canvas.width;
      const scaleY = pageHeight / canvas.height;

      // Draw invisible text words over the exact coordinates
      if (pageData && pageData.words) {
        for (const word of pageData.words) {
          const cleanText = word.text?.trim();
          if (!cleanText) continue;

          const { x0, y0, y1 } = word.bbox;

          // Convert canvas coordinate space (top-left) to PDF coordinate space (bottom-left)
          const pdfX = x0 * scaleX;
          const wordBoxHeight = (y1 - y0) * scaleY;
          const pdfY = pageHeight - y1 * scaleY;
          const fontSize = Math.max(4, Math.min(72, wordBoxHeight * 0.85));

          try {
            pdfPage.drawText(cleanText, {
              x: pdfX,
              y: pdfY,
              size: fontSize,
              font,
              opacity: 0,
            });
          } catch {
            // Ignore non-standard glyph encoding issues gracefully
          }
        }
      }
      // Cleanup canvas memory
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

/**
 * Recovers corrupted or unreadable PDFs by rebuilding cross-reference tables
 * and re-serializing compliant PDF structures in memory.
 */
export async function repairPDF(
  file: File,
  onProgress?: (stage: string) => void
): Promise<RepairResult> {
  const arrayBuffer = await file.arrayBuffer();

  // Tier 1: Tolerant structural reconstruction (Vector lossless)
  try {
    onProgress?.('Attempting structural cross-reference rebuild...');
    const sourceDoc = await PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    const pageCount = sourceDoc.getPageCount();
    if (pageCount > 0) {
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
  } catch (structuralError) {
    console.warn('Tier 1 repair failed, advancing to stream salvage:', structuralError);
  }

  // Tier 2: Resilient stream salvage via PDF.js worker
  onProgress?.('Extracting raw page streams via salvage worker...');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
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

/**
 * Transforms PDF color spaces to Dark Mode, OLED Black, or Warm Sepia in-memory.
 */
export async function invertPDF(
  file: File,
  options: DarkModeOptions
): Promise<Uint8Array> {
  const { filter = 'invert', onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  const outputDoc = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // High-DPI for sharp typography

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
          // Bright backgrounds become pitch black
          data[i] = 10;
          data[i + 1] = 10;
          data[i + 2] = 10;
        } else if (luminance < 80) {
          // Dark text becomes soft readable white
          data[i] = 225;
          data[i + 1] = 225;
          data[i + 2] = 225;
        } else {
          // Invert mid-tones
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
 * Rearranges sequential PDF pages into a print-ready saddle-stitch booklet imposition.
 * Automatically pads with blank pages to a multiple of 4 and embeds vector content.
 */
export async function createBookletPDF(
  file: File,
  options: BookletOptions = {}
): Promise<Uint8Array> {
  const { sheetSize = 'A4', addFoldLine = true, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const origPageCount = sourceDoc.getPageCount();

  // Saddle-stitch booklets require total pages to be a multiple of 4
  const targetPageCount = Math.ceil(origPageCount / 4) * 4;
  const pagesToPad = targetPageCount - origPageCount;
  for (let i = 0; i < pagesToPad; i++) {
    sourceDoc.addPage();
  }

  const outputDoc = await PDFDocument.create();
  const [sheetW, sheetH] =
    sheetSize === 'LETTER' ? [792.0, 612.0] : [841.89, 595.28]; // Landscape dimensions

  const halfW = sheetW / 2;
  const halfH = sheetH;
  const totalSpreads = targetPageCount / 2;

  for (let i = 0; i < totalSpreads; i++) {
    onProgress?.(i + 1, totalSpreads);
    const k = Math.floor(i / 2);

    let leftIndex: number;
    let rightIndex: number;

    if (i % 2 === 0) {
      // Front side of sheet: Left = N - 2k - 1, Right = 2k
      leftIndex = targetPageCount - 2 * k - 1;
      rightIndex = 2 * k;
    } else {
      // Back side of sheet: Left = 2k + 1, Right = N - 2k - 2
      leftIndex = 2 * k + 1;
      rightIndex = targetPageCount - 2 * k - 2;
    }

    const newSheet = outputDoc.addPage([sheetW, sheetH]);

    // Embed left sub-page
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

    // Embed right sub-page
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

    // Optional center fold guideline
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

/**
 * Estimates text skew angle using horizontal projection profile variance.
 * Tests candidate angles from -10 to +10 degrees in 0.5-degree steps.
 */
export function estimateSkewAngle(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  // Downscale to a small thumbnail canvas for rapid heuristic testing
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

    // Calculate row luminance sums
    const rowSums = new Float64Array(sampleH);
    for (let y = 0; y < sampleH; y++) {
      let sum = 0;
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      }
      rowSums[y] = sum;
    }

    // Compute variance of row sums (aligned horizontal text creates high peak-to-valley variance)
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

  // The correction angle is the negative of the detected tilt
  return -bestAngle;
}

export interface DeskewOptions {
  angle: number; // Degrees to rotate (-15 to +15)
  onProgress?: (current: number, total: number) => void;
}

/**
 * Rotates pages by a precise deskew angle on an offscreen canvas and rebuilds the PDF.
 */
export async function deskewPDF(
  file: File,
  options: DeskewOptions
): Promise<Uint8Array> {
  const { angle = 0, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
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

    // Apply deskew rotation around canvas center
    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = canvas.width;
    rotatedCanvas.height = canvas.height;
    const rCtx = rotatedCanvas.getContext('2d');
    if (!rCtx) throw new Error('Rotated canvas context unavailable');

    // Fill background with clean white
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
  yTolerance?: number; // Vertical pixel proximity threshold to group text into the same row
  minColumnGap?: number; // Horizontal gap threshold to start a new column
  delimiter?: ',' | ';' | '\t';
  onProgress?: (current: number, total: number) => void;
}

export interface ExtractedTableResult {
  csv: string;
  rows: string[][];
  totalRows: number;
}

/**
 * Parses coordinate text streams from a PDF to reconstruct tabular rows and columns.
 * Formats values into an RFC-4180 compliant CSV string and matrix array.
 */
export async function extractTableFromPDF(
  file: File,
  options: TableExtractOptions = {}
): Promise<ExtractedTableResult> {
  const { yTolerance = 4, minColumnGap = 12, delimiter = ',', onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
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
      // transform: [scaleX, skewY, skewX, scaleY, tx, ty]
      const tx = item.transform[4];
      const ty = item.transform[5];
      items.push({
        str: item.str,
        x: tx,
        y: ty,
        width: item.width || 0,
      });
    }

    // Sort items descending by Y (top to bottom), then ascending by X (left to right)
    items.sort((a, b) => {
      if (Math.abs(b.y - a.y) > yTolerance) {
        return b.y - a.y;
      }
      return a.x - b.x;
    });

    // Cluster items into lines
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

    // Convert lines into columns by grouping adjacent characters or separating spaced columns
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
            // Consecutive or lightly spaced text within the same column cell
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

  // Format matrix into standard CSV
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

/**
 * Extracts structured Markdown from PDF text streams.
 * Uses font scale heuristics for headings and regex for list normalizations.
 */
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
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
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

  // Pass 1: Gather raw items and sample body font sizes
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

  // Determine median body font size
  fontHeights.sort((a, b) => a - b);
  const medianHeight = fontHeights[Math.floor(fontHeights.length / 2)] || 12;

  const markdownBlocks: string[] = [];

  // Pass 2: Reconstruct lines and format headings/lists
  for (let pageIndex = 0; pageIndex < pagesTextData.length; pageIndex++) {
    const items = pagesTextData[pageIndex];
    if (items.length === 0) continue;

    // Group items into lines
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

    // Format lines to Markdown
    for (const line of lines) {
      let lineText = line.text;
      if (!lineText) continue;

      if (joinHyphenatedWords && lineText.endsWith('-')) {
        lineText = lineText.slice(0, -1);
      }

      // Check headings
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

      // Check lists
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