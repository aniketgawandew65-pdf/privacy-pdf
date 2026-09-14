import { PDFDocument } from 'pdf-lib';
import { loadPdfJsFromBlob } from './pdfjs';

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

export async function getPDFPageCount(
  file: File
): Promise<number> {
  const loaded =
    await loadPdfJsFromBlob(
      file
    );

  try {
    return loaded.pdf.numPages;
  } finally {
    await loaded.dispose();
  }
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

  if (level === 'target' && (!Number.isFinite(targetKb) || !targetKb || targetKb <= 0)) {
    throw new Error('Choose a valid target size in KB.');
  }

  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdf =
    loadedPdf.pdf;

  try {
  const totalPages = pdf.numPages;

  const targetBytes = Math.floor((level === 'extreme'
    ? Math.max(15 * totalPages, 40)
    : (targetKb || Math.max(50, Math.round(file.size / (1024 * 2))))) * 1024);

  let fitScale = 1;
  for (let attempt = 0; attempt < 12; attempt++) {
  const newPdfDoc = await PDFDocument.create();
  const pdfOverhead = 1024 + totalPages * 200;
  let remainingImageBudget = Math.max(Math.floor(targetBytes * 0.88) - pdfOverhead, totalPages * 1000);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({
      currentPage: pageNum,
      totalPages,
      stage: attempt === 0 ? `Compressing page ${pageNum} of ${totalPages}...` : `Fitting to ${targetKb} KB: pass ${attempt + 1}, page ${pageNum} of ${totalPages}...`,
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
    targetScale *= fitScale;
    targetQuality = Math.max(0.03, targetQuality * Math.sqrt(fitScale));
    const safeRenderScale = Math.min(1.0, 1024 / maxDim, Math.max(targetScale, 0.05));
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

      const finalWidth = Math.max(1, Math.floor(unscaledViewport.width * targetScale));
      const finalHeight = Math.max(1, Math.floor(unscaledViewport.height * targetScale));

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
      throw new Error('This device could not render a PDF page. Try a smaller document.');
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

  let outputBytes: Uint8Array = await newPdfDoc.save({ useObjectStreams: true });
  if (level === 'target' && outputBytes.byteLength > targetBytes) {
    // Measure the complete PDF, including container overhead, before accepting it.
    // Rebuild one page at a time at lower resolution; never truncate PDF bytes.
    fitScale *= Math.min(0.7, Math.sqrt(targetBytes / outputBytes.byteLength) * 0.8);
    continue;
  }

  if (
    level === 'target' &&
    targetBytes &&
    outputBytes.byteLength < targetBytes
  ) {
    const originalLength =
      outputBytes.byteLength;

    const diff =
      targetBytes -
      originalLength;

    if (diff > 0) {
      const backingBuffer =
        outputBytes.buffer;

      const ownsWholeBuffer =
        outputBytes.byteOffset === 0 &&
        outputBytes.byteLength ===
          backingBuffer.byteLength;

      const transfer =
        (backingBuffer as any)
          .transfer;


      /*
       * Modern browsers can expand an ArrayBuffer by
       * transferring it to a new size.
       *
       * The original backing buffer is detached, which
       * avoids deliberately retaining both the compressed
       * PDF and another target-sized copy.
       */
      if (
        ownsWholeBuffer &&
        typeof transfer ===
          'function'
      ) {
        const expandedBuffer =
          transfer.call(
            backingBuffer,
            targetBytes
          ) as ArrayBuffer;

        outputBytes =
          new Uint8Array(
            expandedBuffer
          );
      } else if (
        targetBytes <=
        32 * 1024 * 1024
      ) {
        /*
         * Compatibility fallback for older browsers.
         *
         * Keep the traditional copy only for modest output
         * sizes where the temporary duplicate is bounded.
         */
        const expanded =
          new Uint8Array(
            targetBytes
          );

        expanded.set(
          outputBytes,
          0
        );

        outputBytes =
          expanded;
      } else {
        /*
         * Never inflate a large PDF by allocating another
         * 32+ MB target-sized buffer merely for whitespace.
         *
         * The compressed PDF is already valid and below
         * the requested maximum size.
         */
        console.warn(
          'Exact padding skipped on this browser to protect memory. Output remains below the requested target size.'
        );

        return outputBytes;
      }


      /*
       * Preserve the existing trailing PDF-comment padding
       * format without touching the compressed PDF bytes.
       */
      if (
        diff >= 1
      ) {
        outputBytes[
          originalLength
        ] = 0x0A;
      }

      if (
        diff >= 2
      ) {
        outputBytes[
          originalLength + 1
        ] = 0x25;
      }

      for (
        let i =
          originalLength + 2;
        i <
        targetBytes - 1;
        i++
      ) {
        outputBytes[i] =
          0x20;
      }

      if (
        diff > 2
      ) {
        outputBytes[
          targetBytes - 1
        ] = 0x0A;
      }
    }
  }

  return outputBytes;
  }
  throw new Error(`Could not fit all ${totalPages} pages into ${targetKb} KB after maximum image reduction. PDF structure also needs space. Split the PDF or choose a larger size.`);
  } finally {
    await loadedPdf.dispose();
  }
}
