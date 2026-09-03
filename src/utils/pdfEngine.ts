import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

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
    // Convert any image format (JPG, PNG, WEBP) to JPEG bytes via canvas
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

  await page.render({
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    imageUrls.push(canvas.toDataURL('image/jpeg', 0.9));
  }

  return imageUrls;
}
export async function removePagesFromPDF(file: File, pageNumbersToRemove: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  
  // Sort page indices in descending order so removal doesn't shift upcoming indices
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