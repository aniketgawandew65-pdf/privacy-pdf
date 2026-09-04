import { jsPDF } from 'jspdf';
import { PDFDocument, degrees, StandardFonts, rgb, PDFName, PDFDict } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

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