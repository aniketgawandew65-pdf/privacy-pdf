import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

try {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
  }
} catch (_) {}

export interface CompressionProgress {
  currentPage: number;
  totalPages: number;
  stage: string;
}

export type CompressionLevel = 'low' | 'medium' | 'high' | 'extreme' | 'target' | string;

export interface CompressOptions {
  level?: CompressionLevel;
  targetKb?: number;
  onProgress?: (progress: CompressionProgress) => void;
}

export async function getPDFPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const count = pdf.numPages;
  if (typeof (pdf as any).destroy === 'function') {
    (pdf as any).destroy();
  }
  return count;
}

export async function compressPDF(
  file: File,
  optionsOrLevel?: CompressOptions | CompressionLevel,
  targetKbArg?: number,
  onProgressArg?: (progress: CompressionProgress) => void
): Promise<Uint8Array> {
  let level: string = 'target';
  let targetKb: number | undefined;
  let onProgress: ((progress: CompressionProgress) => void) | undefined;

  if (typeof optionsOrLevel === 'object' && optionsOrLevel !== null) {
    level = (optionsOrLevel.level as string) || 'target';
    targetKb = optionsOrLevel.targetKb;
    onProgress = optionsOrLevel.onProgress;
  } else {
    level = (optionsOrLevel as string) || 'target';
    targetKb = targetKbArg;
    onProgress = onProgressArg;
  }

  const rawBytes = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(rawBytes),
    stopAtErrors: false,
  });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const targetBytes = (level === 'extreme'
    ? Math.max(15 * totalPages, 40)
    : (targetKb || Math.max(50, Math.round(file.size / (1024 * 2))))) * 1024;

  const newPdfDoc = await PDFDocument.create();
  const pdfOverhead = 1024 + totalPages * 200;
  let remainingImageBudget = Math.max(Math.floor(targetBytes * 0.88) - pdfOverhead, totalPages * 1000);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentPage: pageNum,
      totalPages,
      stage: `Compressing page ${pageNum} of ${totalPages}...`,
    });

    const page = await pdf.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    const pagesRemaining = Math.max(1, totalPages - pageNum + 1);
    const budgetPerPage = Math.max(1200, Math.floor(remainingImageBudget / pagesRemaining));

    let targetQuality = 0.50;
    let bytesPerPixel = 0.055;

    if (budgetPerPage < 12 * 1024) {
      targetQuality = 0.10;
      bytesPerPixel = 0.022;
    } else if (budgetPerPage < 35 * 1024) {
      targetQuality = 0.18;
      bytesPerPixel = 0.034;
    } else if (budgetPerPage < 85 * 1024) {
      targetQuality = 0.32;
      bytesPerPixel = 0.048;
    } else if (budgetPerPage < 200 * 1024) {
      targetQuality = 0.55;
      bytesPerPixel = 0.075;
    } else {
      targetQuality = 0.80;
      bytesPerPixel = 0.130;
    }

    const maxAllowedPixels = Math.max(12000, Math.floor((budgetPerPage * 0.75) / bytesPerPixel));
    const origPixels = unscaledViewport.width * unscaledViewport.height;
    let targetScale = Math.min(1.0, Math.sqrt(maxAllowedPixels / origPixels));

    if (budgetPerPage > 350 * 1024) {
      targetScale = Math.min(1.5, Math.max(1.0, targetScale));
    }

    const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
    const safeRenderScale = Math.max(0.65, Math.min(1.0, 1024 / maxDim));
    const renderViewport = page.getViewport({ scale: safeRenderScale });

    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.width = Math.max(1, Math.floor(renderViewport.width));
    pdfCanvas.height = Math.max(1, Math.floor(renderViewport.height));
    const pdfCtx = pdfCanvas.getContext('2d', { alpha: false });

    let validBlob: Blob | null = null;

    if (pdfCtx) {
      pdfCtx.fillStyle = '#ffffff';
      pdfCtx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);

      await (
        page.render({
          canvasContext: pdfCtx as any,
          viewport: renderViewport,
        } as any) as any
      ).promise;

      const finalWidth = Math.max(32, Math.floor(unscaledViewport.width * targetScale));
      const finalHeight = Math.max(32, Math.floor(unscaledViewport.height * targetScale));

      const outCanvas = document.createElement('canvas');
      outCanvas.width = finalWidth;
      outCanvas.height = finalHeight;
      const outCtx = outCanvas.getContext('2d', { alpha: false });

      if (outCtx) {
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'medium';
        outCtx.drawImage(pdfCanvas, 0, 0, finalWidth, finalHeight);

        pdfCanvas.width = 0;
        pdfCanvas.height = 0;

        let blob = await new Promise<Blob | null>((resolve) =>
          outCanvas.toBlob((b) => resolve(b), 'image/jpeg', targetQuality)
        );

        if (blob && blob.size > budgetPerPage && targetQuality > 0.08) {
          const tighterQuality = Math.max(0.05, targetQuality * 0.65);
          const smallerBlob = await new Promise<Blob | null>((resolve) =>
            outCanvas.toBlob((b) => resolve(b), 'image/jpeg', tighterQuality)
          );
          if (smallerBlob && smallerBlob.size < blob.size) {
            blob = smallerBlob;
          }
        }

        if (blob && blob.size > 0) {
          validBlob = blob;
          remainingImageBudget = Math.max(0, remainingImageBudget - blob.size);
        }
      }

      outCanvas.width = 0;
      outCanvas.height = 0;
    }

    pdfCanvas.width = 0;
    pdfCanvas.height = 0;
    if (typeof (page as any).cleanup === 'function') {
      (page as any).cleanup();
    }

    if (!validBlob || validBlob.size === 0) {
      validBlob = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
    }

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

  let outputBytes: Uint8Array = await newPdfDoc.save({ useObjectStreams: false });

  if (level === 'target' && targetBytes && outputBytes.byteLength < targetBytes) {
    const diff = targetBytes - outputBytes.byteLength;
    if (diff > 0) {
      const padded = new Uint8Array(targetBytes);
      padded.set(outputBytes, 0);
      padded[outputBytes.byteLength] = 0x0A;
      padded[outputBytes.byteLength + 1] = 0x25;
      for (let i = outputBytes.byteLength + 2; i < targetBytes - 1; i++) {
        padded[i] = 0x20;
      }
      if (diff > 2) {
        padded[targetBytes - 1] = 0x0A;
      }
      outputBytes = padded;
    }
  }

  return outputBytes;
}
