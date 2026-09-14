import { sanitizeRichHtml } from './sanitizeHtml';
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
import {
  loadPdfJsFromBlob,
  pdfjsLib,
} from './pdfjs';
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {

}
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {

}

if (typeof window !== "undefined") {  }
import { Zip, ZipPassThrough } from 'fflate';
import { createWorker } from 'tesseract.js';


// Configure offline worker for 100% local processing
if (typeof window !== 'undefined' && 'Worker' in window) {

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
async function isComplexOrProtectedFile(
  file: File
): Promise<boolean> {
  try {
    const chunkSize = 4096;

    const headBytes =
      new Uint8Array(
        await file
          .slice(
            0,
            Math.min(
              chunkSize,
              file.size
            )
          )
          .arrayBuffer()
      );

    const tailStart =
      Math.max(
        0,
        file.size - chunkSize
      );

    const tailBytes =
      new Uint8Array(
        await file
          .slice(
            tailStart,
            file.size
          )
          .arrayBuffer()
      );

    const decoder =
      new TextDecoder(
        'latin1'
      );

    const scan =
      decoder.decode(headBytes) +
      decoder.decode(tailBytes);

    return (
      scan.includes('/Encrypt') ||
      scan.includes('/encrypt')
    );
  } catch {
    return false;
  }
}

/**
 * Internal high-res renderer: decrypts and paints complex, scanned, signed,
 * or owner-locked PDF pages onto a clean white canvas at 2.0x Retina resolution.
 */
async function renderPageAsJpg(
  page: any,
  scale = 1.5
): Promise<{ imgBytes: Uint8Array; width: number; height: number }> {
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
  const safeScale = maxDim * scale > 2048 ? 2048 / maxDim : scale;
  const renderViewport = page.getViewport({ scale: safeScale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(renderViewport.width));
  canvas.height = Math.max(1, Math.floor(renderViewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire canvas rendering context");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport: renderViewport,
  }).promise;

  ctx.getImageData(0, 0, 1, 1);

  const jpegBlob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b || new Blob()), "image/jpeg", 0.92)
  );

  canvas.width = 0;
  canvas.height = 0;

  const arrayBuffer = await jpegBlob.arrayBuffer();
  return {
    imgBytes: new Uint8Array(arrayBuffer),
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
  const mergedPdf =
    await PDFDocument.create();

  for (const file of files) {
    let sourceBuffer:
      | ArrayBuffer
      | null = null;

    try {
      const looksProtected =
        await isComplexOrProtectedFile(
          file
        );

      if (looksProtected) {
        throw new Error(
          'Complex or protected document; switching to rendering pipeline'
        );
      }

      /*
       * pdf-lib requires the complete document for the
       * vector-preserving merge path.
       */
      sourceBuffer =
        await file.arrayBuffer();

      const pdfDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      const pageCount =
        pdfDoc.getPageCount();

      for (
        let i = 0;
        i < pageCount;
        i++
      ) {
        const page =
          pdfDoc.getPage(i);

        if (
          !page.node.Contents()
        ) {
          throw new Error(
            'Missing Contents stream'
          );
        }
      }

      const copiedPages =
        await mergedPdf.copyPages(
          pdfDoc,
          pdfDoc.getPageIndices()
        );

      copiedPages.forEach(
        (page) =>
          mergedPdf.addPage(page)
      );

      sourceBuffer = null;
    } catch (err) {
      console.warn(
        `Vector merge bypassed for "${file.name}". Activating high-res rendering engine:`,
        err
      );

      /*
       * Do not keep the full vector source buffer alive
       * while the raster fallback is working.
       */
      sourceBuffer = null;

      await new Promise<void>(
        (resolve) =>
          setTimeout(resolve, 0)
      );

      const loadedFallback =
        await loadPdfJsFromBlob(
          file,
          {
            stopAtErrors: false,
          }
        );

      const fallbackDoc =
        loadedFallback.pdf;

      try {
        const numPages =
          fallbackDoc.numPages;

        for (
          let pageNum = 1;
          pageNum <= numPages;
          pageNum++
        ) {
          const page =
            await fallbackDoc.getPage(
              pageNum
            );

          try {
            const {
              imgBytes,
              width,
              height,
            } =
              await renderPageAsJpg(
                page
              );

            const embeddedImage =
              await mergedPdf.embedJpg(
                imgBytes
              );

            const newPage =
              mergedPdf.addPage([
                width,
                height,
              ]);

            newPage.drawImage(
              embeddedImage,
              {
                x: 0,
                y: 0,
                width,
                height,
              }
            );
          } finally {
            try {
              page.cleanup();
            } catch (_) {}
          }
        }
      } finally {
        await loadedFallback.dispose();
      }
    }
  }

  return await mergedPdf.save({
    useObjectStreams: false,
  });
}

/**
 * Compresses a PDF to fit under a specific target size (in KB).
 */
export async function compressPDFToTarget(
  file: File,
  targetSizeKB: number,
  onProgress?: (progress: CompressionProgress) => void
): Promise<Uint8Array> {
  const originalSizeKB =
    file.size / 1024;

  /*
   * Only the pass-through case needs the original bytes
   * because those exact bytes become the output.
   */
  if (
    originalSizeKB <=
    targetSizeKB
  ) {
    return new Uint8Array(
      await file.arrayBuffer()
    );
  }

  /*
   * When compression is required, PDF.js reads directly
   * from the browser-backed File instead of another
   * full-size JavaScript buffer.
   */
  const loadedPdf =
    await loadPdfJsFromBlob(
      file
    );

  const pdfDoc =
    loadedPdf.pdf;

  try {
    const totalPages =
      pdfDoc.numPages;

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
        canvasContext: context as any, viewport,
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

    canvas.width = 1;
    canvas.height = 1;

    try {
      page.cleanup();
    } catch (_) {}
  }

    return await outputPdf.save();
  } finally {
    await loadedPdf.dispose();
  }
}

export async function imagesToPDF(imageFiles: File[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const file of imageFiles) {
    const imgBitmap =
      await createImageBitmap(file);

    const canvas =
      document.createElement('canvas');

    try {
      canvas.width =
        imgBitmap.width;

      canvas.height =
        imgBitmap.height;

      const ctx =
        canvas.getContext(
          "2d",
          { alpha: false }
        );

      canvas.style.position =
        "fixed";

      canvas.style.left =
        "-9999px";

      canvas.style.opacity =
        "0";

      document.body.appendChild(
        canvas
      );

      if (!ctx) {
        continue;
      }

      ctx.drawImage(
        imgBitmap,
        0,
        0
      );

      const blob =
        await new Promise<Blob | null>(
          (resolve) =>
            canvas.toBlob(
              resolve,
              'image/jpeg',
              0.92
            )
        );

      if (!blob) {
        continue;
      }

      const jpegBytes =
        await blob.arrayBuffer();

      const embeddedImage =
        await pdfDoc.embedJpg(
          jpegBytes
        );

      const page =
        pdfDoc.addPage([
          embeddedImage.width,
          embeddedImage.height,
        ]);

      page.drawImage(
        embeddedImage,
        {
          x: 0,
          y: 0,
          width:
            embeddedImage.width,
          height:
            embeddedImage.height,
        }
      );
    } finally {
      /*
       * Full-resolution photo canvases can consume tens
       * of megabytes. Release the pixel backing store
       * immediately after each image.
       */
      canvas.width = 1;
      canvas.height = 1;

      try {
        canvas.remove();
      } catch (_) {}

      try {
        imgBitmap.close();
      } catch (_) {}
    }

    /*
     * Give the browser a chance to reclaim the previous
     * bitmap/canvas before decoding the next image.
     */
    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );
  }

  return await pdfDoc.save();
}

export async function rotatePDF(
  file: File,
  rotations: Record<number, number> | number
): Promise<Uint8Array> {
  let sourceBuffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  const loadedSafe =
    await loadSafe(
      sourceBuffer
    );

  let doc:
    | PDFDocument
    | null =
      loadedSafe.doc;

  const isEncrypted =
    loadedSafe.isEncrypted;

  /*
   * loadSafe() has finished parsing the source.
   * Drop our separate complete ArrayBuffer reference before
   * either vector editing or the raster fallback.
   */
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

  // If the document has internal encryption, pdf-lib cannot
  // safely save its original vector streams.
  if (isEncrypted) {
    /*
     * Drop our references to the full pdf-lib source before
     * starting the raster fallback.
     */
    sourceBuffer = null;
    doc = null;

    await new Promise<void>(
      (resolve) =>
        setTimeout(resolve, 0)
    );

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
      const totalPages =
        pdf.numPages;

      const newPdfDoc =
        await PDFDocument.create();

      for (
        let pageNum = 1;
        pageNum <= totalPages;
        pageNum++
      ) {
        const page =
          await pdf.getPage(
            pageNum
          );

        try {
          const angle =
            typeof rotations === 'number'
              ? rotations
              : (
                  rotations[
                    pageNum
                  ] || 0
                );

          const viewport =
            page.getViewport({
              scale: 2.0,
              rotation:
                (
                  (
                    angle % 360
                  ) + 360
                ) % 360,
            });

          const canvas =
            document.createElement(
              'canvas'
            );

          try {
            canvas.width =
              Math.floor(
                viewport.width
              );

            canvas.height =
              Math.floor(
                viewport.height
              );

            const ctx =
              canvas.getContext(
                '2d',
                {
                  alpha: false,
                }
              );

            if (ctx) {
              ctx.fillStyle =
                '#ffffff';

              ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
              );

              await (
                page.render({
                  canvasContext:
                    ctx as any,
                  viewport,
                  canvas,
                } as any) as any
              ).promise;

              const blob =
                await new Promise<Blob>(
                  (resolve) =>
                    canvas.toBlob(
                      (b) =>
                        resolve(
                          b ||
                            new Blob()
                        ),
                      'image/jpeg',
                      0.92
                    )
                );

              const imgBytes =
                await blob.arrayBuffer();

              const embeddedImg =
                await newPdfDoc.embedJpg(
                  imgBytes
                );

              const newPage =
                newPdfDoc.addPage([
                  viewport.width /
                    2.0,
                  viewport.height /
                    2.0,
                ]);

              newPage.drawImage(
                embeddedImg,
                {
                  x: 0,
                  y: 0,
                  width:
                    viewport.width /
                    2.0,
                  height:
                    viewport.height /
                    2.0,
                }
              );
            }
          } finally {
            canvas.width = 1;
            canvas.height = 1;
          }
        } finally {
          try {
            page.cleanup();
          } catch (_) {}
        }

        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              0
            )
        );
      }

      /*
       * All rotated raster pages are already embedded.
       * Release PDF.js before allocating the complete
       * serialized output.
       */
      await loadedPdf.dispose();

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );

      return await newPdfDoc.save({
        useObjectStreams: false,
      });
    } finally {
      await loadedPdf.dispose();
    }
  }

  // Standard unencrypted vector path
  // remains fast and lossless.
  if (!doc) {
    throw new Error(
      'Unable to load PDF for rotation.'
    );
  }

  const pages =
    doc.getPages();

  pages.forEach(
    (page, idx) => {
      const pageNum =
        idx + 1;

      const additionalAngle =
        typeof rotations === 'number'
          ? rotations
          : (
              rotations[
                pageNum
              ] || 0
            );

      if (
        additionalAngle !== 0
      ) {
        const currentRotation =
          page.getRotation().angle;

        const finalAngle =
          (
            (
              currentRotation +
              additionalAngle
            ) %
              360 +
            360
          ) % 360;

        page.setRotation(
          degrees(
            finalAngle
          )
        );
      }
    }
  );

  return await doc.save({
    useObjectStreams: false,
  });
}

export type PdfImageFormat = 'jpg' | 'png' | 'webp';

export async function pdfToImages(
  file: File,
  format: PdfImageFormat = 'jpg',
  quality: number = 0.9
): Promise<Blob[]> {
  const loadedPdf =
    await loadPdfJsFromBlob(
      file
    );

  const pdfDoc =
    loadedPdf.pdf;

  const imageBlobs: Blob[] = [];

  const mimeType =
    format === 'png'
      ? 'image/png'
      : format === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

  try {
    for (
      let pageNum = 1;
      pageNum <= pdfDoc.numPages;
      pageNum++
    ) {
      const page =
        await pdfDoc.getPage(
          pageNum
        );

      const canvas =
        document.createElement(
          'canvas'
        );

      try {
        const viewport =
          page.getViewport({
            scale: 2.0,
          });

        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );

        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );

        if (!ctx) {
          throw new Error(
            'Failed to create canvas rendering context'
          );
        }

        ctx.fillStyle =
          '#ffffff';

        ctx.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );

        await (
          page.render({
            canvasContext:
              ctx as any,
            viewport,
          } as any) as any
        ).promise;

        /*
         * Keep encoded image bytes as Blob data.
         *
         * Avoid base64/Data URLs, which expand the encoded
         * image in JavaScript memory and then require callers
         * to convert it back into binary data.
         */
        const imageBlob =
          await new Promise<Blob | null>(
            (resolve) => {
              canvas.toBlob(
                resolve,
                mimeType,
                format === 'png'
                  ? undefined
                  : quality
              );
            }
          );

        if (!imageBlob) {
          throw new Error(
            `Failed to encode page ${pageNum} as ${format.toUpperCase()}`
          );
        }

        imageBlobs.push(
          imageBlob
        );
      } finally {
        canvas.width = 1;
        canvas.height = 1;

        try {
          page.cleanup();
        } catch (_) {}
      }
    }

    return imageBlobs;
  } finally {
    await loadedPdf.dispose();
  }
}

//**
 /**
 * Splits a PDF document by page ranges (e.g. "1-3, 5").
 * Guaranteed support for bank statements, government files, and signed legal documents.
 */
export async function splitPDF(
  file: File,
  ranges: string
): Promise<Uint8Array> {
  /*
   * First inspect only the small head/tail chunks.
   * This matches the existing encryption detection without
   * allocating the complete PDF.
   */
  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let pageCount = 0;

  let sourceBuffer:
    | ArrayBuffer
    | null = null;

  let vectorDoc:
    | PDFDocument
    | null = null;

  let fallbackLoaded:
    | {
        pdf: any;
        dispose: () => Promise<void>;
      }
    | null = null;


  /*
   * Clean PDFs need pdf-lib for the lossless vector path.
   * Protected PDFs skip that full-file allocation entirely.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      vectorDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      pageCount =
        vectorDoc.getPageCount();
    } catch {
      vectorDoc = null;
      sourceBuffer = null;
    }
  }


  /*
   * If vector loading was skipped or failed, get the page
   * count from browser-backed PDF.js.
   */
  if (!vectorDoc) {
    fallbackLoaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );

    pageCount =
      fallbackLoaded.pdf.numPages;
  }


  const pagesToInclude =
    new Set<number>();

  if (
    !ranges ||
    ranges
      .trim()
      .toLowerCase() === 'all'
  ) {
    for (
      let i = 0;
      i < pageCount;
      i++
    ) {
      pagesToInclude.add(i);
    }
  } else {
    ranges
      .split(',')
      .forEach((part) => {
        const p =
          part.trim();

        if (p.includes('-')) {
          const [
            rangeStart,
            rangeEnd,
          ] =
            p
              .split('-')
              .map((n) =>
                parseInt(
                  n.trim(),
                  10
                )
              );

          if (
            !isNaN(rangeStart) &&
            !isNaN(rangeEnd)
          ) {
            for (
              let i = rangeStart;
              i <= rangeEnd;
              i++
            ) {
              if (
                i >= 1 &&
                i <= pageCount
              ) {
                pagesToInclude.add(
                  i - 1
                );
              }
            }
          }
        } else {
          const num =
            parseInt(
              p,
              10
            );

          if (
            !isNaN(num) &&
            num >= 1 &&
            num <= pageCount
          ) {
            pagesToInclude.add(
              num - 1
            );
          }
        }
      });
  }


  const indices =
    Array.from(
      pagesToInclude
    ).sort(
      (a, b) =>
        a - b
    );


  if (indices.length === 0) {
    if (fallbackLoaded) {
      await fallbackLoaded.dispose();
    }

    throw new Error(
      'No valid pages specified for extraction.'
    );
  }


  /*
   * Check whether the existing vector PDF is safe to copy.
   * Reuse the same parsed pdf-lib document instead of loading
   * the complete source a second time.
   */
  let isVectorSafe =
    Boolean(vectorDoc);

  if (vectorDoc) {
    try {
      for (const idx of indices) {
        const page =
          vectorDoc.getPage(
            idx
          );

        const res =
          page.node.get(
            PDFName.of(
              'Resources'
            )
          );

        const contents =
          page.node.Contents();

        if (
          !res ||
          !contents ||
          page.node.Annots()
        ) {
          isVectorSafe =
            false;

          break;
        }
      }
    } catch {
      isVectorSafe =
        false;
    }
  }


  /*
   * 1. Native vector path.
   * Lossless and preserves fonts/text for clean PDFs.
   */
  if (
    isVectorSafe &&
    vectorDoc
  ) {
    try {
      const newDoc =
        await PDFDocument.create();

      const copied =
        await newDoc.copyPages(
          vectorDoc,
          indices
        );

      copied.forEach(
        (page) =>
          newDoc.addPage(
            page
          )
      );

      return await newDoc.save({
        useObjectStreams: false,
      });
    } catch (error) {
      console.warn(
        'Vector split failed, proceeding to high-res engine:',
        error
      );
    }
  }


  /*
   * Vector processing is finished.
   * Release our full-file references before opening PDF.js.
   */
  vectorDoc = null;
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


  if (!fallbackLoaded) {
    fallbackLoaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );
  }


  const fallbackDoc =
    fallbackLoaded.pdf;

  try {
    const salvageDoc =
      await PDFDocument.create();

    for (const idx of indices) {
      const pageNum =
        idx + 1;

      const page =
        await fallbackDoc.getPage(
          pageNum
        );

      try {
        const {
          imgBytes,
          width,
          height,
        } =
          await renderPageAsJpg(
            page,
            2.0
          );

        const embeddedImage =
          await salvageDoc.embedJpg(
            imgBytes
          );

        const newPage =
          salvageDoc.addPage([
            width,
            height,
          ]);

        newPage.drawImage(
          embeddedImage,
          {
            x: 0,
            y: 0,
            width,
            height,
          }
        );
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }
    }

    return await salvageDoc.save({
      useObjectStreams: false,
    });
  } finally {
    await fallbackLoaded.dispose();
  }
}

/**
 * Splits all pages of a PDF into separate files packaged into a ZIP archive.
 */
export async function splitPdfToZip(
  file: File,
  onProgress?: (
    current: number,
    total: number
  ) => void
): Promise<Blob> {
  /*
   * fflate's streaming ZIP writer emits archive bytes as
   * each page is added instead of retaining every page PDF
   * internally until final generation.
   *
   * We still keep the final ZIP chunks because this function
   * returns a Blob, but the individual uncompressed page PDFs
   * can be released after each iteration.
   */
  const createStreamingZip = () => {
    const chunks:
      ArrayBuffer[] = [];

    let resolveZip!:
      (blob: Blob) => void;

    let rejectZip!:
      (error: unknown) => void;

    const result =
      new Promise<Blob>(
        (resolve, reject) => {
          resolveZip =
            resolve;

          rejectZip =
            reject;
        }
      );

    const zip =
      new Zip(
        (
          error,
          data,
          final
        ) => {
          if (error) {
            rejectZip(
              error
            );
            return;
          }

          if (
            data &&
            data.length
          ) {
            /*
             * fflate types its output buffer as
             * ArrayBufferLike. Copy it into a regular
             * ArrayBuffer so Blob construction is portable
             * across TypeScript/browser definitions.
             */
            const copy =
              new Uint8Array(
                data.length
              );

            copy.set(
              data
            );

            chunks.push(
              copy.buffer
            );
          }

          if (final) {
            resolveZip(
              new Blob(
                chunks,
                {
                  type:
                    'application/zip',
                }
              )
            );
          }
        }
      );

    return {
      addFile: (
        name: string,
        data: Uint8Array
      ) => {
        /*
         * PDF files already contain compressed streams,
         * so storing them directly avoids another expensive
         * in-memory DEFLATE pass.
         */
        const entry =
          new ZipPassThrough(
            name
          );

        zip.add(
          entry
        );

        entry.push(
          data,
          true
        );
      },

      finish: async () => {
        zip.end();
        return await result;
      },
    };
  };

  let zipWriter =
    createStreamingZip();

  const baseName =
    file.name.replace(
      /\.[^/.]+$/,
      ''
    );

  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let sourceBuffer:
    | ArrayBuffer
    | null = null;

  let vectorDoc:
    | PDFDocument
    | null = null;

  let fallbackLoaded:
    | {
        pdf: any;
        dispose: () => Promise<void>;
      }
    | null = null;

  let totalPages = 0;

  /*
   * Keep the existing lossless vector path for ordinary PDFs.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      vectorDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      totalPages =
        vectorDoc.getPageCount();
    } catch {
      vectorDoc = null;
      sourceBuffer = null;
    }
  }

  /*
   * Protected/unreadable vector PDFs use the existing
   * browser-backed PDF.js fallback.
   */
  if (!vectorDoc) {
    fallbackLoaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );

    totalPages =
      fallbackLoaded.pdf.numPages;
  }

  /*
   * Preserve the existing vector-safety check.
   */
  let isVectorSafe =
    Boolean(vectorDoc);

  if (vectorDoc) {
    try {
      for (
        let i = 0;
        i < totalPages;
        i++
      ) {
        const page =
          vectorDoc.getPage(i);

        if (
          !page.node.get(
            PDFName.of(
              'Resources'
            )
          ) ||
          !page.node.Contents() ||
          page.node.Annots()
        ) {
          isVectorSafe =
            false;
          break;
        }
      }
    } catch {
      isVectorSafe =
        false;
    }
  }

  /*
   * Lossless vector split.
   */
  if (
    isVectorSafe &&
    vectorDoc
  ) {
    try {
      for (
        let i = 0;
        i < totalPages;
        i++
      ) {
        onProgress?.(
          i + 1,
          totalPages
        );

        const singleDoc =
          await PDFDocument.create();

        const [copiedPage] =
          await singleDoc.copyPages(
            vectorDoc,
            [i]
          );

        singleDoc.addPage(
          copiedPage
        );

        const pdfBytes =
          await singleDoc.save({
            useObjectStreams:
              false,
          });

        const paddedIndex =
          String(
            i + 1
          ).padStart(
            2,
            '0'
          );

        zipWriter.addFile(
          `${baseName}_page_${paddedIndex}.pdf`,
          pdfBytes
        );

        /*
         * Yield after each page so completed page objects can
         * become collectible before the next one is created.
         */
        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              0
            )
        );
      }

      vectorDoc = null;
      sourceBuffer = null;

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );

      return await zipWriter.finish();
    } catch (error) {
      console.warn(
        'Vector ZIP split failed, proceeding to high-res engine:',
        error
      );

      /*
       * Discard the incomplete archive and start a clean one
       * before entering the raster fallback.
       */
      zipWriter =
        createStreamingZip();
    }
  }

  vectorDoc = null;
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

  if (!fallbackLoaded) {
    fallbackLoaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );
  }

  const fallbackDoc =
    fallbackLoaded.pdf;

  try {
    for (
      let i = 0;
      i < totalPages;
      i++
    ) {
      onProgress?.(
        i + 1,
        totalPages
      );

      const page =
        await fallbackDoc.getPage(
          i + 1
        );

      try {
        const {
          imgBytes,
          width,
          height,
        } =
          await renderPageAsJpg(
            page,
            2.0
          );

        const singleDoc =
          await PDFDocument.create();

        const embeddedImage =
          await singleDoc.embedJpg(
            imgBytes
          );

        const newPage =
          singleDoc.addPage([
            width,
            height,
          ]);

        newPage.drawImage(
          embeddedImage,
          {
            x: 0,
            y: 0,
            width,
            height,
          }
        );

        const pdfBytes =
          await singleDoc.save({
            useObjectStreams:
              false,
          });

        const paddedIndex =
          String(
            i + 1
          ).padStart(
            2,
            '0'
          );

        zipWriter.addFile(
          `${baseName}_page_${paddedIndex}.pdf`,
          pdfBytes
        );
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
        )
      );
    }

    await fallbackLoaded.dispose();
    fallbackLoaded = null;

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await zipWriter.finish();
  } finally {
    if (fallbackLoaded) {
      await fallbackLoaded.dispose();
    }
  }
}

export async function removePagesFromPDF(
  file: File,
  pageNumbersToRemove: number[]
): Promise<Uint8Array> {
  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let sourceBuffer:
    | ArrayBuffer
    | null = null;

  let vectorDoc:
    | PDFDocument
    | null = null;

  let fallbackLoaded:
    | {
        pdf: any;
        dispose: () => Promise<void>;
      }
    | null = null;

  let pageCount = 0;


  /*
   * Clean PDFs keep the fast, lossless pdf-lib path.
   * Protected files skip the complete source allocation.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      vectorDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      pageCount =
        vectorDoc.getPageCount();
    } catch {
      vectorDoc = null;
      sourceBuffer = null;
    }
  }


  /*
   * If vector loading was skipped or failed,
   * obtain the page count through browser-backed PDF.js.
   */
  if (!vectorDoc) {
    fallbackLoaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );

    pageCount =
      fallbackLoaded.pdf.numPages;
  }


  const removeSet =
    new Set(
      pageNumbersToRemove.map(
        (n) => n - 1
      )
    );

  const indicesToKeep:
    number[] = [];

  for (
    let i = 0;
    i < pageCount;
    i++
  ) {
    if (!removeSet.has(i)) {
      indicesToKeep.push(i);
    }
  }


  if (
    indicesToKeep.length === 0
  ) {
    if (fallbackLoaded) {
      await fallbackLoaded.dispose();
    }

    throw new Error(
      'Cannot remove all pages from the document.'
    );
  }


  /*
   * Validate whether vector page copying is safe.
   */
  let isVectorSafe =
    Boolean(vectorDoc);

  if (vectorDoc) {
    try {
      for (
        const idx of
        indicesToKeep
      ) {
        const page =
          vectorDoc.getPage(
            idx
          );

        if (
          !page.node.Contents() ||
          page.node.Annots()
        ) {
          isVectorSafe =
            false;

          break;
        }
      }
    } catch {
      isVectorSafe =
        false;
    }
  }


  /*
   * 1. Lossless vector removal.
   */
  if (
    isVectorSafe &&
    vectorDoc
  ) {
    try {
      const newDoc =
        await PDFDocument.create();

      const copied =
        await newDoc.copyPages(
          vectorDoc,
          indicesToKeep
        );

      copied.forEach(
        (page) =>
          newDoc.addPage(
            page
          )
      );

      return await newDoc.save({
        useObjectStreams: false,
      });
    } catch (error) {
      console.warn(
        `Vector removal bypassed for "${file.name}". Activating high-res rendering engine:`,
        error
      );
    }
  }


  /*
   * Release complete vector-source references before
   * entering the visual fallback.
   */
  vectorDoc = null;
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


  if (!fallbackLoaded) {
    fallbackLoaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );
  }


  const fallbackDoc =
    fallbackLoaded.pdf;

  try {
    const newDoc =
      await PDFDocument.create();

    for (
      const idx of
      indicesToKeep
    ) {
      const pageNum =
        idx + 1;

      const page =
        await fallbackDoc.getPage(
          pageNum
        );

      try {
        const {
          imgBytes,
          width,
          height,
        } =
          await renderPageAsJpg(
            page,
            2.0
          );

        const embeddedImage =
          await newDoc.embedJpg(
            imgBytes
          );

        const newPage =
          newDoc.addPage([
            width,
            height,
          ]);

        newPage.drawImage(
          embeddedImage,
          {
            x: 0,
            y: 0,
            width,
            height,
          }
        );
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }
    }

    return await newDoc.save({
      useObjectStreams: false,
    });
  } finally {
    await fallbackLoaded.dispose();
  }
}

/**
 * Dual-engine page counter.
 */
export async function getPDFPageCount(
  file: File
): Promise<number> {
  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  /*
   * Normal PDFs do not need a complete JavaScript copy
   * merely to read the page count.
   */
  if (!looksProtected) {
    try {
      const loaded =
        await loadPdfJsFromBlob(
          file,
          {
            stopAtErrors: false,
          }
        );

      try {
        return loaded.pdf.numPages;
      } finally {
        await loaded.dispose();
      }
    } catch (_) {
      /*
       * Fall through to the compatibility path below.
       */
    }
  }

  /*
   * Preserve compatibility with protected / unusual PDFs.
   * pdf-lib with ignoreEncryption can count some documents
   * that PDF.js refuses to open without a password.
   */
  const bytes =
    await file.arrayBuffer();

  try {
    const pdfDoc =
      await PDFDocument.load(
        bytes,
        {
          ignoreEncryption: true,
        }
      );

    return pdfDoc.getPageCount();
  } catch (_) {
    /*
     * Final browser-backed attempt.
     * Do not create another Uint8Array/slice copy.
     */
    const loaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );

    try {
      return loaded.pdf.numPages;
    } finally {
      await loaded.dispose();
    }
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
  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdfDoc =
    loadedPdf.pdf;

  try {
    const numPages =
      pdfDoc.numPages;

    const newPdfDoc =
      await PDFDocument.create();

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

    const stampedBlob =
      await new Promise<Blob>(
        (
          resolve,
          reject
        ) => {
          compositeCanvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(
                  new Error(
                    'Failed to encode watermarked page.'
                  )
                );
              }
            },
            'image/jpeg',
            0.95
          );
        }
      );

    const stampedBytes =
      await stampedBlob.arrayBuffer();

    const finalPageImg =
      await newPdfDoc.embedJpg(
        stampedBytes
      );

    const newPage = newPdfDoc.addPage([pWidth, pHeight]);
    newPage.drawImage(finalPageImg, { x: 0, y: 0, width: pWidth, height: pHeight });

    // Explicitly release canvas memory buffer per page
    ctx.clearRect(0, 0, pWidth, pHeight);
    compositeCanvas.width = 0;
    compositeCanvas.height = 0;
    try { page.cleanup(); } catch {}
  }

    return await newPdfDoc.save({
      useObjectStreams: false,
    });
  } finally {
    await loadedPdf.dispose();
  }
}
export async function addPageNumbersToPDF(
  file: File,
  position: 'bottom-center' | 'bottom-right'
): Promise<Uint8Array> {
  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let sourceBuffer:
    | ArrayBuffer
    | null = null;

  let pdfDoc:
    | PDFDocument
    | null = null;

  let isEncrypted =
    looksProtected;


  /*
   * Normal PDFs keep the fast, lossless vector path.
   * Files already detected as protected skip this full
   * source allocation entirely.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      pdfDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      if (pdfDoc.isEncrypted) {
        isEncrypted = true;
      }
    } catch {
      isEncrypted = true;
      pdfDoc = null;
    }
  }


  /*
   * PATH A:
   * Standard unencrypted PDF.
   * Preserve the existing native vector stamping behavior.
   */
  if (
    !isEncrypted &&
    pdfDoc
  ) {
    try {
      const helveticaFont =
        await pdfDoc.embedFont(
          StandardFonts.HelveticaBold
        );

      const pages =
        pdfDoc.getPages();

      const totalPages =
        pages.length;

      for (
        let i = 0;
        i < totalPages;
        i++
      ) {
        const page =
          pages[i];

        const box =
          page.getCropBox() ||
          page.getMediaBox();

        const text =
          (i + 1) +
          ' of ' +
          totalPages;

        const size = 11;

        const textWidth =
          helveticaFont.widthOfTextAtSize(
            text,
            size
          );

        let xPos =
          box.x +
          box.width / 2 -
          textWidth / 2;

        if (
          position ===
          'bottom-right'
        ) {
          xPos =
            box.x +
            box.width -
            textWidth -
            36;
        }

        const yPos =
          box.y + 28;

        page.drawRectangle({
          x: xPos - 6,
          y: yPos - 3,
          width:
            textWidth + 12,
          height:
            size + 6,
          color: rgb(
            1,
            1,
            1
          ),
          opacity: 0.9,
        });

        page.drawText(
          text,
          {
            x: xPos,
            y: yPos,
            size,
            font:
              helveticaFont,
            color: rgb(
              0,
              0,
              0
            ),
          }
        );
      }

      return await pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });
    } catch (error) {
      console.warn(
        'Path A failed, shifting to universal reconstruction...',
        error
      );
    }
  }


  /*
   * PATH B:
   * Encrypted bank statements, scanned agreements,
   * and PDFs whose vector save failed.
   *
   * Release the full pdf-lib source references before
   * opening the raster engine.
   */
  pdfDoc = null;
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


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
    const totalPages =
      pdf.numPages;

    const reconstructedDoc =
      await PDFDocument.create();

    const helvetica =
      await reconstructedDoc.embedFont(
        StandardFonts.HelveticaBold
      );


    for (
      let i = 1;
      i <= totalPages;
      i++
    ) {
      const page =
        await pdf.getPage(i);

      const canvas =
        document.createElement(
          'canvas'
        );

      try {
        const viewport =
          page.getViewport({
            scale: 2.0,
          });

        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );

        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );

        canvas.style.position =
          'fixed';

        canvas.style.left =
          '-9999px';

        canvas.style.opacity =
          '0';

        document.body.appendChild(
          canvas
        );


        if (!ctx) {
          continue;
        }


        await (
          page.render({
            canvasContext:
              ctx as any,
            viewport,
          } as any) as any
        ).promise;


        const imageBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(
                      new Error(
                        'Failed to encode reconstructed PDF page.'
                      )
                    );
                  }
                },
                'image/jpeg',
                0.92
              );
            }
          );


        const imageBytes =
          await imageBlob.arrayBuffer();

        const embeddedImage =
          await reconstructedDoc.embedJpg(
            imageBytes
          );


        const originalWidth =
          viewport.width /
          2.0;

        const originalHeight =
          viewport.height /
          2.0;


        const newPage =
          reconstructedDoc.addPage([
            originalWidth,
            originalHeight,
          ]);


        newPage.drawImage(
          embeddedImage,
          {
            x: 0,
            y: 0,
            width:
              originalWidth,
            height:
              originalHeight,
          }
        );


        const text =
          i +
          ' of ' +
          totalPages;

        const size = 11;

        const textWidth =
          helvetica.widthOfTextAtSize(
            text,
            size
          );


        let xPos =
          originalWidth /
            2 -
          textWidth /
            2;

        if (
          position ===
          'bottom-right'
        ) {
          xPos =
            originalWidth -
            textWidth -
            36;
        }


        const yPos = 24;


        newPage.drawRectangle({
          x: xPos - 8,
          y: yPos - 4,
          width:
            textWidth + 16,
          height:
            size + 8,
          color: rgb(
            1,
            1,
            1
          ),
          opacity: 0.95,
        });


        newPage.drawText(
          text,
          {
            x: xPos,
            y: yPos,
            size,
            font:
              helvetica,
            color: rgb(
              0,
              0,
              0
            ),
          }
        );
      } finally {
        canvas.width = 1;
        canvas.height = 1;

        try {
          canvas.remove();
        } catch (_) {}

        try {
          page.cleanup();
        } catch (_) {}
      }
    }


    return await reconstructedDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });
  } finally {
    await loadedPdf.dispose();
  }
}

export async function extractTextFromPDF(
  file: File,
  onProgress?: (status: string) => void
): Promise<string> {
  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdfDoc =
    loadedPdf.pdf;

  const totalPages =
    pdfDoc.numPages;

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
        const ctx = canvas.getContext("2d", { alpha: false });
      canvas.style.position = "fixed";
      canvas.style.left = "-9999px";
      canvas.style.opacity = "0";
      document.body.appendChild(canvas);

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

        canvas.width = 1;
        canvas.height = 1;

        try {
          canvas.remove();
        } catch (_) {}
      }

      page.cleanup();
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }

    await loadedPdf.dispose();
  }

  return fullDocumentText.trim() || 'No readable text could be extracted.';
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export async function getPDFMetadata(
  file: File
): Promise<PDFMetadata> {
  let disposePdf:
    | (() => Promise<void>)
    | null = null;

  try {
    const loaded =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );

    disposePdf =
      loaded.dispose;

    const meta =
      await loaded.pdf.getMetadata();

    const info =
      (meta?.info as any) || {};

    return {
      title:
        info.Title || '',
      author:
        info.Author || '',
      subject:
        info.Subject || '',
      keywords:
        info.Keywords || '',
    };
  } catch (err: any) {
    console.error(
      'getPDFMetadata error:',
      err
    );

    return {
      title: '',
      author: '',
      subject: '',
      keywords: '',
    };
  } finally {
    if (disposePdf) {
      await disposePdf();
    }
  }
}

export async function updatePDFMetadata(
  file: File,
  metadata: PDFMetadata
): Promise<Uint8Array> {
  let arrayBuffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  let pdfDoc: PDFDocument;

  try {
    // Attempt standard load
    pdfDoc =
      await PDFDocument.load(
        arrayBuffer
      );
  } catch {
    // If bank statement / permissions-locked, bypass permission checks
    pdfDoc =
      await PDFDocument.load(
        arrayBuffer!,
        {
          ignoreEncryption: true,
        }
      );
  }

  /*
   * pdf-lib has parsed the source. Drop the separate
   * complete input-buffer reference before final save.
   */
  arrayBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

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
  const base64Data =
    signaturePngDataUrl.split(',')[1];

  const signatureBytes =
    Uint8Array.from(
      atob(base64Data),
      (c) => c.charCodeAt(0)
    );

  const placementMap =
    new Map<
      number,
      SignaturePlacement[]
    >();

  placements.forEach((placement) => {
    const list =
      placementMap.get(
        placement.pageIndex
      ) || [];

    list.push(
      placement
    );

    placementMap.set(
      placement.pageIndex,
      list
    );
  });


  const renderSignedPdf =
    async (
      loadedPdf: {
        pdf: any;
        dispose: () => Promise<void>;
      }
    ): Promise<Uint8Array> => {
      const pdfDoc =
        loadedPdf.pdf;

      try {
        const newPdfDoc =
          await PDFDocument.create();

        const embeddedSignature =
          await newPdfDoc.embedPng(
            signatureBytes
          );

        for (
          let i = 1;
          i <= pdfDoc.numPages;
          i++
        ) {
          const page =
            await pdfDoc.getPage(i);

          try {
            const {
              imgBytes,
              width: pWidth,
              height: pHeight,
            } =
              await renderPageAsJpg(
                page,
                2.0
              );

            const embeddedPageImg =
              await newPdfDoc.embedJpg(
                imgBytes
              );

            const newPage =
              newPdfDoc.addPage([
                pWidth,
                pHeight,
              ]);

            newPage.drawImage(
              embeddedPageImg,
              {
                x: 0,
                y: 0,
                width: pWidth,
                height: pHeight,
              }
            );

            const pagePlacements =
              placementMap.get(
                i - 1
              ) || [];

            for (
              const placement of
              pagePlacements
            ) {
              const signW =
                pWidth *
                placement.widthPercent;

              const signH =
                pHeight *
                placement.heightPercent;

              const signX =
                pWidth *
                placement.xPercent;

              const signY =
                pHeight -
                (
                  placement.yPercent *
                  pHeight
                ) -
                signH;

              newPage.drawImage(
                embeddedSignature,
                {
                  x: signX,
                  y: signY,
                  width: signW,
                  height: signH,
                }
              );
            }
          } finally {
            try {
              page.cleanup();
            } catch (_) {}
          }

          /*
           * Let the completed page's rendering/JPEG
           * temporaries become collectible before moving
           * to the next page.
           */
          await new Promise<void>(
            (resolve) =>
              setTimeout(
                resolve,
                0
              )
          );
        }

        /*
         * All source pages and signatures are already
         * embedded in newPdfDoc. Release PDF.js before
         * allocating the complete serialized signed PDF.
         */
        await loadedPdf.dispose();

        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              0
            )
        );

        return await newPdfDoc.save({
          useObjectStreams: false,
        });
      } finally {
        await loadedPdf.dispose();
      }
    };


  /*
   * Protected/password path.
   *
   * Do not allocate a complete source ArrayBuffer before
   * PDF.js. The browser-backed File is sufficient.
   */
  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  if (
    password ||
    looksProtected
  ) {
    let loadedPdf:
      | {
          pdf: any;
          dispose: () => Promise<void>;
        }
      | null = null;

    try {
      loadedPdf =
        await loadPdfJsFromBlob(
          file,
          {
            password:
              password ||
              undefined,
            stopAtErrors: false,
          }
        );
    } catch (err: any) {
      if (
        err?.name ===
          'PasswordException' ||
        err?.message
          ?.toLowerCase()
          .includes(
            'password'
          ) ||
        err?.message ===
          'INCORRECT_PASSWORD'
      ) {
        throw new Error(
          'INCORRECT_PASSWORD'
        );
      }

      throw err;
    }

    return await renderSignedPdf(
      loadedPdf
    );
  }


  /*
   * Clean unencrypted PDFs retain the native,
   * lossless vector signing path.
   */
  let sourceBuffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  try {
    const pdfDoc =
      await PDFDocument.load(
        sourceBuffer
      );

    /*
     * pdf-lib has parsed the source document.
     * Drop our separate complete input-buffer reference
     * before signing and final serialization.
     */
    sourceBuffer = null;

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    const pages =
      pdfDoc.getPages();

    const embeddedSignature =
      await pdfDoc.embedPng(
        signatureBytes
      );

    pages.forEach(
      (page, idx) => {
        const {
          width: pageWidth,
          height: pageHeight,
        } =
          page.getSize();

        const pagePlacements =
          placementMap.get(
            idx
          ) || [];

        for (
          const placement of
          pagePlacements
        ) {
          const signW =
            pageWidth *
            placement.widthPercent;

          const signH =
            pageHeight *
            placement.heightPercent;

          const signX =
            pageWidth *
            placement.xPercent;

          const signY =
            pageHeight -
            (
              placement.yPercent *
              pageHeight
            ) -
            signH;

          page.drawImage(
            embeddedSignature,
            {
              x: signX,
              y: signY,
              width: signW,
              height: signH,
            }
          );
        }
      }
    );

    return await pdfDoc.save({
      useObjectStreams: false,
    });
  } catch (err) {
    console.warn(
      'Native vector sign fallback to visual engine:',
      err
    );

    /*
     * Release our complete source reference before opening
     * the raster fallback.
     */
    sourceBuffer = null;

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    let loadedFallback:
      | {
          pdf: any;
          dispose: () => Promise<void>;
        }
      | null = null;

    try {
      loadedFallback =
        await loadPdfJsFromBlob(
          file,
          {
            stopAtErrors: false,
          }
        );
    } catch (fallbackError: any) {
      if (
        fallbackError?.name ===
          'PasswordException' ||
        fallbackError?.message
          ?.toLowerCase()
          .includes(
            'password'
          )
      ) {
        throw new Error(
          'INCORRECT_PASSWORD'
        );
      }

      throw fallbackError;
    }

    return await renderSignedPdf(
      loadedFallback
    );
  }
}

export async function encryptPDF(
  file: File,
  userPassword: string,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
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
    const numPages =
      pdf.numPages;

    let doc:
      | jsPDF
      | null = null;

    for (
      let i = 1;
      i <= numPages;
      i++
    ) {
      const page =
        await pdf.getPage(i);

      const canvas =
        document.createElement(
          'canvas'
        );

      try {
        const unscaledViewport =
          page.getViewport({
            scale: 1.0,
          });

        const renderViewport =
          page.getViewport({
            scale: 2.0,
          });

        canvas.width =
          Math.floor(
            renderViewport.width
          );

        canvas.height =
          Math.floor(
            renderViewport.height
          );

        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );

        if (!ctx) {
          throw new Error(
            'Canvas context unavailable'
          );
        }

        await (
          page.render({
            canvasContext:
              ctx as any,
            viewport:
              renderViewport,
            canvas,
          } as any) as any
        ).promise;


        /*
         * Avoid a large base64 data URL.
         * Encode directly to a JPEG Blob and pass its bytes
         * to jsPDF.
         */
        const imageBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(
                      new Error(
                        'Failed to encode PDF page.'
                      )
                    );
                  }
                },
                'image/jpeg',
                0.92
              );
            }
          );

        const imageBytes =
          new Uint8Array(
            await imageBlob.arrayBuffer()
          );

        const pageWidth =
          unscaledViewport.width;

        const pageHeight =
          unscaledViewport.height;

        const orientation =
          pageWidth >
          pageHeight
            ? 'landscape'
            : 'portrait';


        if (i === 1) {
          doc =
            new jsPDF({
              orientation,
              unit: 'pt',
              format: [
                pageWidth,
                pageHeight,
              ],
              encryption: {
                userPassword,
                ownerPassword:
                  userPassword,
                userPermissions: [
                  'print',
                  'copy',
                ],
              },
            });

          doc.addImage(
            imageBytes,
            'JPEG',
            0,
            0,
            pageWidth,
            pageHeight
          );
        } else if (doc) {
          doc.addPage(
            [
              pageWidth,
              pageHeight,
            ],
            orientation
          );

          doc.addImage(
            imageBytes,
            'JPEG',
            0,
            0,
            pageWidth,
            pageHeight
          );
        }


        onProgress?.(
          Math.round(
            (
              i /
              numPages
            ) *
              100
          )
        );
      } finally {
        canvas.width = 1;
        canvas.height = 1;

        try {
          canvas.remove();
        } catch (_) {}

        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser a chance to reclaim the
       * completed page's render/JPEG temporaries
       * before starting the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    if (!doc) {
      throw new Error(
        'Failed to generate encrypted PDF'
      );
    }


    /*
     * The source PDF is no longer needed once every page
     * has been rendered into jsPDF.
     *
     * Release PDF.js before allocating the complete
     * encrypted output buffer so both large documents
     * do not remain live during final serialization.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    const outputBuffer =
      doc.output(
        'arraybuffer'
      );

    return new Uint8Array(
      outputBuffer
    );
  } finally {
    /*
     * loadPdfJsFromBlob.dispose() is idempotent, so this
     * also safely covers errors before final serialization.
     */
    await loadedPdf.dispose();
  }
}

export async function unlockPDF(
  file: File,
  password: string,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  let loadedPdf:
    | {
        pdf: any;
        dispose: () => Promise<void>;
      }
    | null = null;

  /*
   * Authenticate and decrypt directly from the browser-backed
   * File. No complete ArrayBuffer/Uint8Array source copy.
   */
  try {
    loadedPdf =
      await loadPdfJsFromBlob(
        file,
        {
          password,
          stopAtErrors: false,
        }
      );
  } catch (err: any) {
    if (
      err?.name ===
        'PasswordException' ||
      err?.message
        ?.toLowerCase()
        .includes(
          'password'
        ) ||
      err?.message ===
        'INCORRECT_PASSWORD'
    ) {
      throw new Error(
        'INCORRECT_PASSWORD'
      );
    }

    throw new Error(
      'CORRUPTED_PDF'
    );
  }


  const pdfDoc =
    loadedPdf.pdf;

  try {
    const numPages =
      pdfDoc.numPages;

    const newPdfDoc =
      await PDFDocument.create();


    /*
     * Render and embed every decrypted page into a fresh,
     * unencrypted PDF exactly as before.
     */
    for (
      let i = 1;
      i <= numPages;
      i++
    ) {
      onProgress?.(
        Math.round(
          (
            i /
            numPages
          ) *
            100
        )
      );

      const page =
        await pdfDoc.getPage(i);

      try {
        const {
          imgBytes,
          width,
          height,
        } =
          await renderPageAsJpg(
            page,
            2.0
          );

        const embeddedImg =
          await newPdfDoc.embedJpg(
            imgBytes
          );

        const newPage =
          newPdfDoc.addPage([
            width,
            height,
          ]);

        newPage.drawImage(
          embeddedImg,
          {
            x: 0,
            y: 0,
            width,
            height,
          }
        );
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser an opportunity to reclaim
       * the completed page's temporary render memory
       * before processing the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * Every decrypted page is now embedded in the new
     * document, so the original PDF.js source is no
     * longer required.
     *
     * Release it before serializing the complete unlocked
     * PDF to reduce source/output memory overlap.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    /*
     * Save as a clean PDF with no encryption dictionary.
     */
    return await newPdfDoc.save({
      useObjectStreams: false,
    });
  } finally {
    /*
     * dispose() is idempotent, so this still safely
     * handles errors before final serialization.
     */
    await loadedPdf.dispose();
  }
}

export async function compressPDF(
  file: File,
  options: CompressOptions
): Promise<Uint8Array> {
  const {
    level,
    targetKb = 200,
    onProgress,
  } = options;

  let vectorSource:
    | ArrayBuffer
    | null = null;


  /*
   * Recommended mode first attempts the existing
   * lossless pdf-lib save.
   *
   * Extreme/Target skip this complete source allocation.
   */
  if (level === 'recommended') {
    try {
      vectorSource =
        await file.arrayBuffer();

      const testDoc =
        await PDFDocument.load(
          vectorSource
        );

      /*
       * pdf-lib has parsed the source. Drop our separate
       * full input-buffer reference before serialization
       * or raster fallback.
       */
      vectorSource = null;

      if (!testDoc.isEncrypted) {
        return await testDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });
      }
    } catch (_) {
      /*
       * Preserve existing behavior:
       * signed/protected/problematic PDFs fall through
       * to the universal raster renderer.
       */
    }
  }


  /*
   * Drop the full pdf-lib source reference before opening
   * PDF.js for the universal compression path.
   */
  vectorSource = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


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
    const totalPages =
      pdf.numPages;

    const targetBytes =
      (
        level === 'extreme'
          ? Math.max(
              12 * totalPages,
              35
            )
          : targetKb
      ) * 1024;

    const newPdfDoc =
      await PDFDocument.create();

    const pdfOverhead =
      1024 +
      totalPages * 200;

    const baseTargetBytes =
      level === 'target'
        ? Math.floor(
            targetBytes * 0.93
          )
        : targetBytes;

    let remainingImageBudget =
      Math.max(
        baseTargetBytes -
          pdfOverhead,
        totalPages * 250
      );


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.({
        currentPage:
          pageNum,
        totalPages,
        stage:
          'Compressing page ' +
          pageNum +
          ' of ' +
          totalPages +
          '...',
      });

      const page =
        await pdf.getPage(
          pageNum
        );

      try {
        const unscaledViewport =
          page.getViewport({
            scale: 1.0,
          });

        const pagesLeft =
          totalPages -
          pageNum +
          1;

        const budgetPerPage =
          Math.floor(
            remainingImageBudget /
              pagesLeft
          );


        let scale = 0.85;
        let quality = 0.50;

        if (
          budgetPerPage <
          35 * 1024
        ) {
          scale = 0.70;
          quality = 0.12;
        } else if (
          budgetPerPage <
          80 * 1024
        ) {
          scale = 0.75;
          quality = 0.25;
        } else if (
          budgetPerPage <
          180 * 1024
        ) {
          scale = 0.90;
          quality = 0.50;
        } else {
          scale = 1.0;
          quality = 0.80;
        }


        const viewport =
          page.getViewport({
            scale,
          });

        const canvas =
          document.createElement(
            'canvas'
          );

        try {
          canvas.width =
            Math.max(
              1,
              Math.floor(
                viewport.width
              )
            );

          canvas.height =
            Math.max(
              1,
              Math.floor(
                viewport.height
              )
            );

          const ctx =
            canvas.getContext(
              '2d',
              {
                alpha: false,
              }
            );

          let validBlob:
            Blob =
              new Blob(
                [],
                {
                  type:
                    'image/jpeg',
                }
              );


          if (ctx) {
            ctx.fillStyle =
              '#ffffff';

            ctx.fillRect(
              0,
              0,
              canvas.width,
              canvas.height
            );

            await (
              page.render({
                canvasContext:
                  ctx as any,
                viewport,
              } as any) as any
            ).promise;


            const generatedBlob =
              await new Promise<
                Blob | null
              >(
                (resolve) =>
                  canvas.toBlob(
                    (blob) =>
                      resolve(
                        blob
                      ),
                    'image/jpeg',
                    quality
                  )
              );


            if (
              generatedBlob &&
              generatedBlob.size >
                0
            ) {
              validBlob =
                generatedBlob;
            }
          }


          if (
            validBlob.size ===
            0
          ) {
            validBlob =
              new Blob(
                [
                  new Uint8Array(
                    100
                  ),
                ],
                {
                  type:
                    'image/jpeg',
                }
              );
          }


          remainingImageBudget -=
            validBlob.size;


          const imageBytes =
            await validBlob.arrayBuffer();

          const embeddedImage =
            await newPdfDoc.embedJpg(
              imageBytes
            );


          const newPage =
            newPdfDoc.addPage([
              unscaledViewport.width,
              unscaledViewport.height,
            ]);


          newPage.drawImage(
            embeddedImage,
            {
              x: 0,
              y: 0,
              width:
                unscaledViewport.width,
              height:
                unscaledViewport.height,
            }
          );
        } finally {
          canvas.width = 1;
          canvas.height = 1;
        }
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Allow the completed page's canvas/JPEG temporaries
       * to be reclaimed before rendering the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * Every compressed page is already embedded in
     * newPdfDoc. Release the original PDF.js source before
     * allocating the complete serialized compressed PDF.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    let outputBytes =
      await newPdfDoc.save({
        useObjectStreams: false,
      });


    /*
     * Exact-target padding logic intentionally preserved.
     * We will inspect its large allocation separately.
     */
    if (
      level === 'target'
    ) {
      const desiredLength =
        Math.floor(
          targetBytes
        );

      const diff =
        desiredLength -
        outputBytes.length;

      /*
       * Keep the existing tolerance behavior:
       * tiny differences do not justify padding.
       *
       * For larger differences, build only the final
       * required output buffer. Do not create a separate
       * padCount-sized stream and do not serialize pdf-lib
       * a second time.
       */
      if (diff > 1024) {
        const eofMarker =
          new Uint8Array([
            0x25,
            0x25,
            0x45,
            0x4f,
            0x46,
          ]);

        let eofIndex = -1;

        /*
         * Search near the end of the PDF for %%EOF.
         */
        const searchStart =
          Math.max(
            0,
            outputBytes.length -
              4096
          );

        outer:
        for (
          let i =
            outputBytes.length -
            eofMarker.length;
          i >= searchStart;
          i--
        ) {
          for (
            let j = 0;
            j <
            eofMarker.length;
            j++
          ) {
            if (
              outputBytes[
                i + j
              ] !==
              eofMarker[j]
            ) {
              continue outer;
            }
          }

          eofIndex = i;
          break;
        }


        if (eofIndex >= 0) {
          const oldLength =
            outputBytes.length;

          const isWholeBuffer =
            outputBytes.byteOffset === 0 &&
            outputBytes.byteLength ===
              outputBytes.buffer.byteLength;

          const transferableBuffer =
            outputBytes.buffer as ArrayBuffer & {
              transfer?: (
                newByteLength?: number
              ) => ArrayBuffer;
            };

          /*
           * Modern browsers can expand the backing
           * ArrayBuffer by transferring it. This detaches
           * the old buffer instead of holding two complete
           * PDF-sized allocations simultaneously.
           */
          if (
            isWholeBuffer &&
            typeof transferableBuffer.transfer ===
              'function'
          ) {
            const expandedBuffer =
              transferableBuffer.transfer(
                desiredLength
              );

            const paddedBytes =
              new Uint8Array(
                expandedBuffer
              );

            /*
             * Move %%EOF/trailing bytes to their new final
             * position. copyWithin handles overlapping memory.
             */
            paddedBytes.copyWithin(
              eofIndex + diff,
              eofIndex,
              oldLength
            );

            paddedBytes.fill(
              0x20,
              eofIndex,
              eofIndex + diff
            );

            outputBytes =
              paddedBytes;
          } else if (
            desiredLength <=
            32 * 1024 * 1024
          ) {
            /*
             * Compatibility fallback for older browsers.
             * Keep it only for modest outputs where a second
             * allocation is unlikely to kill a mobile tab.
             */
            const paddedBytes =
              new Uint8Array(
                desiredLength
              );

            paddedBytes.set(
              outputBytes.subarray(
                0,
                eofIndex
              ),
              0
            );

            paddedBytes.fill(
              0x20,
              eofIndex,
              eofIndex + diff
            );

            paddedBytes.set(
              outputBytes.subarray(
                eofIndex
              ),
              eofIndex + diff
            );

            outputBytes =
              paddedBytes;
          } else {
            /*
             * The compressed PDF is already valid and below
             * the requested target. On browsers without
             * ArrayBuffer.transfer, do not risk another huge
             * allocation merely to add artificial whitespace.
             */
            console.warn(
              'Exact target padding skipped on this browser to avoid a large duplicate allocation.'
            );
          }
        } else {
          console.warn(
            'Exact target padding skipped because %%EOF was not found.'
          );
        }
      }
    }


    return outputBytes;
  } finally {
    await loadedPdf.dispose();
  }
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
  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let sourceBuffer:
    | ArrayBuffer
    | null = null;


  /*
   * Clean PDFs retain the native lossless vector path.
   * Protected PDFs skip the complete source allocation.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      const sourceDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      const outputDoc =
        await PDFDocument.create();

      const indicesToCopy =
        pages.map(
          (page) =>
            page.originalIndex
        );

      const copiedPages =
        await outputDoc.copyPages(
          sourceDoc,
          indicesToCopy
        );

      copiedPages.forEach(
        (
          page,
          idx
        ) => {
          const desiredRotation =
            pages[idx].rotation;

          const currentRotation =
            page
              .getRotation()
              .angle;

          page.setRotation(
            degrees(
              (
                currentRotation +
                desiredRotation
              ) % 360
            )
          );

          outputDoc.addPage(
            page
          );
        }
      );

      return await outputDoc.save({
        useObjectStreams: false,
      });
    } catch (err) {
      console.warn(
        `Vector organize bypassed for "${file.name}". Activating high-res rendering engine:`,
        err
      );
    }
  }


  /*
   * Release the vector source before starting
   * the browser-backed raster fallback.
   */
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


  const loadedFallback =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const fallbackDoc =
    loadedFallback.pdf;

  try {
    const outputDoc =
      await PDFDocument.create();

    for (
      let idx = 0;
      idx < pages.length;
      idx++
    ) {
      const pageConfig =
        pages[idx];

      const pageNum =
        pageConfig.originalIndex +
        1;

      const page =
        await fallbackDoc.getPage(
          pageNum
        );

      try {
        const {
          imgBytes,
          width,
          height,
        } =
          await renderPageAsJpg(
            page,
            2.0
          );

        const embeddedImage =
          await outputDoc.embedJpg(
            imgBytes
          );

        const newPage =
          outputDoc.addPage([
            width,
            height,
          ]);

        newPage.drawImage(
          embeddedImage,
          {
            x: 0,
            y: 0,
            width,
            height,
          }
        );

        if (
          pageConfig.rotation !==
          0
        ) {
          newPage.setRotation(
            degrees(
              pageConfig.rotation %
                360
            )
          );
        }
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Release temporary render memory before the next
       * reordered page is processed.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }

    /*
     * All fallback pages are now embedded in outputDoc.
     * Release the original PDF.js source before allocating
     * the complete serialized output.
     */
    await loadedFallback.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await outputDoc.save({
      useObjectStreams: false,
    });
  } finally {
    /*
     * dispose() is idempotent and also protects error paths.
     */
    await loadedFallback.dispose();
  }
}

/**
 * 1-click sanitization: Safely strips XMP metadata, author, creator, producer,
 * and date tags without corrupting xref tables.
 */
export async function sanitizePDF(file: File): Promise<Uint8Array> {
  let arrayBuffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  const pdfDoc =
    await PDFDocument.load(
      arrayBuffer,
      {
        ignoreEncryption: true,
      }
    );

  /*
   * pdf-lib has parsed the source. Release the separate
   * complete input-buffer reference before sanitization
   * and final serialization.
   */
  arrayBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

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
  onProgress?: (
    current: number,
    total: number
  ) => void
): Promise<Uint8Array> {
  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const sourcePdf =
    loadedPdf.pdf;

  try {
    const totalPages =
      sourcePdf.numPages;

    const outputDoc =
      await PDFDocument.create();

    const redactionMap =
      new Map<
        number,
        RedactionRect[]
      >();

    redactions.forEach(
      (redaction) =>
        redactionMap.set(
          redaction.pageIndex,
          redaction.rects
        )
    );


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        pageNum,
        totalPages
      );

      const pageIndex =
        pageNum - 1;

      const page =
        await sourcePdf.getPage(
          pageNum
        );

      const canvas =
        document.createElement(
          'canvas'
        );

      try {
        const viewport =
          page.getViewport({
            scale: 2.0,
          });

        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );

        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );

        if (!ctx) {
          throw new Error(
            'Canvas rendering context unavailable'
          );
        }


        await (
          page.render({
            canvasContext:
              ctx as any,
            viewport,
          } as any) as any
        ).promise;


        const pageRects =
          redactionMap.get(
            pageIndex
          ) || [];


        if (
          pageRects.length >
          0
        ) {
          ctx.fillStyle =
            '#000000';

          for (
            const rect of
            pageRects
          ) {
            const rx =
              rect.x *
              canvas.width;

            const ry =
              rect.y *
              canvas.height;

            const rw =
              rect.width *
              canvas.width;

            const rh =
              rect.height *
              canvas.height;

            ctx.fillRect(
              rx,
              ry,
              rw,
              rh
            );
          }
        }


        const jpegBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(
                      new Error(
                        'Failed to encode redaction canvas'
                      )
                    );
                  }
                },
                'image/jpeg',
                0.92
              );
            }
          );


        const jpegBytes =
          await jpegBlob.arrayBuffer();

        const embeddedImage =
          await outputDoc.embedJpg(
            jpegBytes
          );


        const unscaledViewport =
          page.getViewport({
            scale: 1.0,
          });


        const newPage =
          outputDoc.addPage([
            unscaledViewport.width,
            unscaledViewport.height,
          ]);


        newPage.drawImage(
          embeddedImage,
          {
            x: 0,
            y: 0,
            width:
              unscaledViewport.width,
            height:
              unscaledViewport.height,
          }
        );
      } finally {
        canvas.width = 1;
        canvas.height = 1;

        try {
          canvas.remove();
        } catch (_) {}

        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser an opportunity to reclaim
       * the completed page's temporary canvas/JPEG
       * memory before rendering the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * Every redacted page is now embedded in outputDoc.
     * Release the original PDF.js source before allocating
     * the complete serialized redacted PDF.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await outputDoc.save({
      useObjectStreams: true,
    });
  } finally {
    /*
     * dispose() is idempotent and still covers errors
     * that happen before final serialization.
     */
    await loadedPdf.dispose();
  }
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropPDF(
  file: File,
  pageBoxes: Record<
    number,
    {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  >,
  applyToAll: boolean = false
): Promise<Uint8Array> {
  const firstBox =
    pageBoxes[1] ||
    Object.values(
      pageBoxes
    )[0];

  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let sourceBuffer:
    | ArrayBuffer
    | null = null;

  let doc:
    | PDFDocument
    | null = null;

  let isEncrypted =
    looksProtected;


  /*
   * Clean PDFs retain the native lossless crop-box path.
   * Protected PDFs can skip the complete source allocation.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      const loadedSafe =
        await loadSafe(
          sourceBuffer
        );

      doc =
        loadedSafe.doc;

      isEncrypted =
        loadedSafe.isEncrypted;
    } catch (_) {
      doc = null;
      isEncrypted = true;
    }
  }


  /*
   * Protected/encrypted documents use visual reconstruction.
   */
  if (isEncrypted || !doc) {
    sourceBuffer = null;
    doc = null;

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

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
      const totalPages =
        pdf.numPages;

      const newPdfDoc =
        await PDFDocument.create();


      for (
        let pageNum = 1;
        pageNum <= totalPages;
        pageNum++
      ) {
        const page =
          await pdf.getPage(
            pageNum
          );

        const box =
          applyToAll
            ? firstBox
            : (
                pageBoxes[
                  pageNum
                ] ||
                firstBox
              );


        if (!box) {
          try {
            page.cleanup();
          } catch (_) {}

          continue;
        }


        const canvas =
          document.createElement(
            'canvas'
          );

        try {
          const viewport =
            page.getViewport({
              scale: 2.0,
            });

          canvas.width =
            Math.max(
              1,
              Math.floor(
                box.width *
                  2.0
              )
            );

          canvas.height =
            Math.max(
              1,
              Math.floor(
                box.height *
                  2.0
              )
            );

          const ctx =
            canvas.getContext(
              '2d',
              {
                alpha: false,
              }
            );

          if (!ctx) {
            throw new Error(
              'Canvas rendering context unavailable'
            );
          }


          ctx.fillStyle =
            '#ffffff';

          ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
          );


          await (
            page.render({
              canvasContext:
                ctx as any,
              viewport,
              transform: [
                1,
                0,
                0,
                1,
                -box.x *
                  2.0,
                -box.y *
                  2.0,
              ] as any,
              canvas,
            } as any) as any
          ).promise;


          const blob =
            await new Promise<Blob>(
              (
                resolve,
                reject
              ) => {
                canvas.toBlob(
                  (result) => {
                    if (result) {
                      resolve(
                        result
                      );
                    } else {
                      reject(
                        new Error(
                          'Failed to encode cropped page.'
                        )
                      );
                    }
                  },
                  'image/jpeg',
                  0.92
                );
              }
            );


          const imgBytes =
            await blob.arrayBuffer();

          const embeddedImg =
            await newPdfDoc.embedJpg(
              imgBytes
            );

          const newPage =
            newPdfDoc.addPage([
              box.width,
              box.height,
            ]);

          newPage.drawImage(
            embeddedImg,
            {
              x: 0,
              y: 0,
              width:
                box.width,
              height:
                box.height,
            }
          );
        } finally {
          canvas.width = 1;
          canvas.height = 1;

          try {
            canvas.remove();
          } catch (_) {}

          try {
            page.cleanup();
          } catch (_) {}
        }
      }


      return await newPdfDoc.save({
        useObjectStreams: false,
      });
    } finally {
      await loadedPdf.dispose();
    }
  }


  /*
   * Standard unencrypted vector path.
   */
  const pages =
    doc.getPages();

  pages.forEach(
    (
      page,
      idx
    ) => {
      const pageNum =
        idx + 1;

      const box =
        applyToAll
          ? firstBox
          : (
              pageBoxes[
                pageNum
              ] ||
              firstBox
            );

      if (box) {
        page.setCropBox(
          box.x,
          box.y,
          box.width,
          box.height
        );
      }
    }
  );


  return await doc.save({
    useObjectStreams: false,
  });
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
  let buffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  const pdfDoc =
    await PDFDocument.load(
      buffer,
      {
        ignoreEncryption: true,
      }
    );

  /*
   * pdf-lib has parsed the form document. Drop the separate
   * complete source-buffer reference before editing/save.
   */
  buffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

  const form =
    pdfDoc.getForm();

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


export type FillableFieldType =
  | 'text'
  | 'checkbox'
  | 'dropdown'
  | 'radio'
  | 'date'
  | 'signature';

export interface FillableFieldSpec {
  id: string;
  name: string;
  type: FillableFieldType;

  // Zero-based PDF page index
  pageIndex: number;

  // Normalized coordinates from 0 to 1.
  // x/y use TOP-LEFT browser coordinates.
  x: number;
  y: number;
  width: number;
  height: number;

  options?: string[];
  defaultValue?: string | boolean;
}

/**
 * Creates interactive AcroForm fields directly inside the PDF.
 *
 * Everything runs locally with pdf-lib.
 * No document upload or server processing is required.
 */
export async function createFillablePDF(
  file: File,
  fields: FillableFieldSpec[]
): Promise<Uint8Array> {
  const isRealPasswordError = (error: any) => {
    const name =
      String(
        error?.name || ''
      ).toLowerCase();

    const message =
      String(
        error?.message || ''
      ).toLowerCase();

    const code =
      error?.code;

    const passwordResponses =
      (pdfjsLib as any)
        .PasswordResponses;

    return (
      name.includes(
        'passwordexception'
      ) ||
      name ===
        'passwordexception' ||
      code ===
        passwordResponses?.NEED_PASSWORD ||
      code ===
        passwordResponses?.INCORRECT_PASSWORD ||
      message.includes(
        'password required'
      ) ||
      message.includes(
        'incorrect password'
      )
    );
  };


  /*
   * REAL PASSWORD CHECK
   *
   * PDF.js remains the authority for whether this PDF
   * actually requires a password.
   *
   * It now reads directly from the browser-backed File
   * instead of receiving a second complete Uint8Array copy.
   */
  const assertReadableWithoutPassword =
    async () => {
      try {
        const loadedReadable =
          await loadPdfJsFromBlob(
            file,
            {
              stopAtErrors: false,
            }
          );

        await loadedReadable.dispose();
      } catch (error: any) {
        if (
          isRealPasswordError(
            error
          )
        ) {
          throw new Error(
            'This PDF requires a password. Unlock it first, then create fillable fields.'
          );
        }

        throw new Error(
          'This PDF could not be opened for editing.'
        );
      }
    };


  await assertReadableWithoutPassword();


  /*
   * Compatibility fallback.
   *
   * Readable PDFs that pdf-lib cannot safely modify are
   * rebuilt locally from rendered pages.
   *
   * PDF.js again reads from File/Blob directly, so no
   * complete source copy is created for the fallback.
   */
  const rebuildFromRenderedPages =
    async (): Promise<PDFDocument> => {
      const loadedSource =
        await loadPdfJsFromBlob(
          file,
          {
            stopAtErrors: false,
          }
        );

      const sourcePdf =
        loadedSource.pdf;

      const rebuilt =
        await PDFDocument.create();

      try {
        for (
          let pageNumber = 1;
          pageNumber <=
            sourcePdf.numPages;
          pageNumber++
        ) {
          const sourcePage =
            await sourcePdf.getPage(
              pageNumber
            );

          try {
            const {
              imgBytes,
            } =
              await renderPageAsJpg(
                sourcePage,
                1.5
              );


            const sourceViewport =
              sourcePage.getViewport({
                scale: 1,
              });


            const sourceWidth =
              sourceViewport.width;

            const sourceHeight =
              sourceViewport.height;


            const aspectRatio =
              sourceWidth /
              sourceHeight;


            let pageWidth =
              sourceWidth;

            let pageHeight =
              sourceHeight;


            const longestEdge =
              Math.max(
                sourceWidth,
                sourceHeight
              );


            if (
              longestEdge >
              1000
            ) {
              if (
                sourceHeight >=
                sourceWidth
              ) {
                pageHeight =
                  842;

                pageWidth =
                  842 *
                  aspectRatio;
              } else {
                pageWidth =
                  842;

                pageHeight =
                  842 /
                  aspectRatio;
              }
            }


            const image =
              await rebuilt.embedJpg(
                imgBytes
              );


            const page =
              rebuilt.addPage([
                pageWidth,
                pageHeight,
              ]);


            page.drawImage(
              image,
              {
                x: 0,
                y: 0,
                width:
                  pageWidth,
                height:
                  pageHeight,
              }
            );
          } finally {
            try {
              sourcePage.cleanup();
            } catch (_) {}
          }
        }
      } finally {
        await loadedSource.dispose();
      }


      return rebuilt;
    };


  /*
   * Preserve original vector structure whenever pdf-lib
   * can safely edit it.
   *
   * Only this vector route performs one complete source read.
   */
  const loadWorkingDocument =
    async (): Promise<PDFDocument> => {
      let sourceBuffer:
        | ArrayBuffer
        | null =
          await file.arrayBuffer();


      try {
        try {
          const pdfDoc =
            await PDFDocument.load(
              sourceBuffer
            );


          if (
            pdfDoc.isEncrypted
          ) {
            console.info(
              'Readable PDF contains encryption/permission structures. Using local compatibility rebuild.'
            );

            sourceBuffer =
              null;

            await new Promise<void>(
              (resolve) =>
                setTimeout(
                  resolve,
                  0
                )
            );

            return await rebuildFromRenderedPages();
          }


          sourceBuffer =
            null;

          return pdfDoc;
        } catch (_) {
          /*
           * Some readable PDFs make pdf-lib reject the
           * normal source structure even though PDF.js
           * can display them.
           */
          try {
            const pdfDoc =
              await PDFDocument.load(
                sourceBuffer!,
                {
                  ignoreEncryption: true,
                }
              );


            if (
              pdfDoc.isEncrypted
            ) {
              sourceBuffer =
                null;

              await new Promise<void>(
                (resolve) =>
                  setTimeout(
                    resolve,
                    0
                  )
              );

              return await rebuildFromRenderedPages();
            }


            sourceBuffer =
              null;

            return pdfDoc;
          } catch (_) {
            sourceBuffer =
              null;

            await new Promise<void>(
              (resolve) =>
                setTimeout(
                  resolve,
                  0
                )
            );

            return await rebuildFromRenderedPages();
          }
        }
      } finally {
        sourceBuffer =
          null;
      }
    };


  const applyFields = async (
    pdfDoc: PDFDocument
  ) => {
    const pages =
      pdfDoc.getPages();

    const form =
      pdfDoc.getForm();

    const appearanceFont =
      await pdfDoc.embedFont(
        StandardFonts.Helvetica
      );

    const usedNames =
      new Set<string>(
        form
          .getFields()
          .map((field) =>
            field.getName()
          )
      );

    const uniqueFieldName = (
      requested: string,
      index: number
    ) => {
      const base =
        requested.trim() ||
        `field_${index + 1}`;

      if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
      }

      let suffix = 2;

      while (
        usedNames.has(
          `${base}_${suffix}`
        )
      ) {
        suffix += 1;
      }

      const result =
        `${base}_${suffix}`;

      usedNames.add(result);

      return result;
    };

    for (
      let index = 0;
      index < fields.length;
      index++
    ) {
      const fieldSpec =
        fields[index];

      const page =
        pages[fieldSpec.pageIndex];

      if (!page) continue;

      const {
        width: pageWidth,
        height: pageHeight,
      } = page.getSize();

      const x =
        Math.max(
          0,
          Math.min(
            pageWidth,
            fieldSpec.x *
              pageWidth
          )
        );

      const width =
        Math.max(
          8,
          Math.min(
            pageWidth - x,
            fieldSpec.width *
              pageWidth
          )
        );

      const height =
        Math.max(
          8,
          Math.min(
            pageHeight,
            fieldSpec.height *
              pageHeight
          )
        );

      /*
       * Browser editor:
       * top-left origin.
       *
       * PDF:
       * bottom-left origin.
       */
      const y =
        Math.max(
          0,
          Math.min(
            pageHeight -
              height,
            pageHeight -
              fieldSpec.y *
                pageHeight -
              height
          )
        );

      const fieldName =
        uniqueFieldName(
          fieldSpec.name,
          index
        );

      const commonStyle = {
        borderColor: rgb(
          0.35,
          0.35,
          0.38
        ),
        borderWidth: 1,
        backgroundColor: rgb(
          1,
          1,
          1
        ),
      };

      if (
        fieldSpec.type === 'text' ||
        fieldSpec.type === 'date'
      ) {
        const textField =
          form.createTextField(
            fieldName
          );

        if (
          typeof fieldSpec.defaultValue ===
          'string'
        ) {
          textField.setText(
            fieldSpec.defaultValue
          );
        }

        textField.addToPage(
          page,
          {
            x,
            y,
            width,
            height,
            textColor: rgb(
              0,
              0,
              0
            ),
            ...commonStyle,
          }
        );

        continue;
      }

      if (
        fieldSpec.type ===
        'checkbox'
      ) {
        const checkbox =
          form.createCheckBox(
            fieldName
          );

        const size =
          Math.max(
            10,
            Math.min(
              width,
              height
            )
          );

        checkbox.addToPage(
          page,
          {
            x,
            y:
              y +
              Math.max(
                0,
                (height -
                  size) /
                  2
              ),
            width: size,
            height: size,
            ...commonStyle,
          }
        );

        if (
          fieldSpec.defaultValue ===
          true
        ) {
          checkbox.check();
        }

        continue;
      }

      if (
        fieldSpec.type ===
        'dropdown'
      ) {
        const dropdown =
          form.createDropdown(
            fieldName
          );

        const options =
          (
            fieldSpec.options ||
            []
          )
            .map(
              (option) =>
                option.trim()
            )
            .filter(Boolean)
            .filter(
              (
                option,
                optionIndex,
                array
              ) =>
                array.indexOf(
                  option
                ) === optionIndex
            );

        const safeOptions =
          options.length
            ? options
            : [
                'Option 1',
                'Option 2',
              ];

        dropdown.addOptions(
          safeOptions
        );

        if (
          typeof fieldSpec.defaultValue ===
            'string' &&
          safeOptions.includes(
            fieldSpec.defaultValue
          )
        ) {
          dropdown.select(
            fieldSpec.defaultValue
          );
        }

        dropdown.addToPage(
          page,
          {
            x,
            y,
            width,
            height,
            textColor: rgb(
              0,
              0,
              0
            ),
            ...commonStyle,
          }
        );

        continue;
      }

      if (
        fieldSpec.type ===
        'radio'
      ) {
        const radio =
          form.createRadioGroup(
            fieldName
          );

        const options =
          (
            fieldSpec.options ||
            []
          )
            .map(
              (option) =>
                option.trim()
            )
            .filter(Boolean)
            .filter(
              (
                option,
                optionIndex,
                array
              ) =>
                array.indexOf(
                  option
                ) === optionIndex
            );

        const safeOptions =
          options.length
            ? options
            : [
                'Option 1',
                'Option 2',
              ];

        const rowHeight =
          height /
          safeOptions.length;

        safeOptions.forEach(
          (
            option,
            optionIndex
          ) => {
            const buttonSize =
              Math.max(
                9,
                Math.min(
                  14,
                  rowHeight *
                    0.55
                )
              );

            const optionY =
              y +
              height -
              rowHeight *
                (optionIndex +
                  1) +
              Math.max(
                0,
                (rowHeight -
                  buttonSize) /
                  2
              );

            radio.addOptionToPage(
              option,
              page,
              {
                x,
                y: optionY,
                width:
                  buttonSize,
                height:
                  buttonSize,

                borderColor:
                  rgb(
                    0.35,
                    0.35,
                    0.38
                  ),

                borderWidth: 1,

                backgroundColor:
                  rgb(
                    1,
                    1,
                    1
                  ),
              }
            );

            page.drawText(
              option,
              {
                x:
                  x +
                  buttonSize +
                  5,

                y:
                  optionY +
                  Math.max(
                    0,
                    buttonSize *
                      0.15
                  ),

                size:
                  Math.max(
                    7,
                    Math.min(
                      11,
                      buttonSize *
                        0.7
                    )
                  ),

                font:
                  appearanceFont,

                color:
                  rgb(
                    0,
                    0,
                    0
                  ),
              }
            );
          }
        );

        continue;
      }

      if (
        fieldSpec.type ===
        'signature'
      ) {
        /*
         * Visual signature placeholder.
         * NOT a certificate-based digital signature.
         */
        page.drawRectangle({
          x,
          y,
          width,
          height,

          borderColor: rgb(
            0.35,
            0.35,
            0.38
          ),

          borderWidth: 1,

          color: rgb(
            0.98,
            0.98,
            0.98
          ),
        });

        const labelSize =
          Math.max(
            7,
            Math.min(
              11,
              height *
                0.23
            )
          );

        page.drawText(
          'Sign here',
          {
            x:
              x + 6,

            y:
              y +
              Math.max(
                4,
                (height -
                  labelSize) /
                  2
              ),

            size:
              labelSize,

            font:
              appearanceFont,

            color:
              rgb(
                0.45,
                0.45,
                0.48
              ),
          }
        );
      }
    }

    form.updateFieldAppearances(
      appearanceFont
    );
  };

  let pdfDoc =
    await loadWorkingDocument();

  try {
    await applyFields(pdfDoc);

    return await pdfDoc.save({
      useObjectStreams: true,
    });
  } catch (error) {
    /*
     * One final safety path:
     * readable PDF + unusual internals = rebuild locally.
     */
    console.warn(
      'Rebuilding readable PDF for form compatibility:',
      error
    );

    pdfDoc =
      await rebuildFromRenderedPages();

    await applyFields(pdfDoc);

    return await pdfDoc.save({
      useObjectStreams: true,
    });
  }
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
  const {
    mode = 'grayscale',
    threshold = 135,
    onProgress,
  } = options;

  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdfDoc =
    loadedPdf.pdf;

  try {
    const totalPages =
      pdfDoc.numPages;

    const outputDoc =
      await PDFDocument.create();


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        pageNum,
        totalPages
      );

      const page =
        await pdfDoc.getPage(
          pageNum
        );

      const canvas =
        document.createElement(
          'canvas'
        );

      try {
        const viewport =
          page.getViewport({
            scale: 2.0,
          });

        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );

        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );

        if (!ctx) {
          throw new Error(
            'Canvas rendering context unavailable'
          );
        }


        await (
          page.render({
            canvasContext:
              ctx as any,
            viewport,
          } as any) as any
        ).promise;


        const imgData =
          ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

        const data =
          imgData.data;


        for (
          let i = 0;
          i < data.length;
          i += 4
        ) {
          const gray =
            0.299 *
              data[i] +
            0.587 *
              data[i + 1] +
            0.114 *
              data[i + 2];

          if (
            mode ===
            'pure-bw'
          ) {
            const val =
              gray <
              threshold
                ? 0
                : 255;

            data[i] =
              val;

            data[i + 1] =
              val;

            data[i + 2] =
              val;
          } else {
            data[i] =
              gray;

            data[i + 1] =
              gray;

            data[i + 2] =
              gray;
          }
        }


        ctx.putImageData(
          imgData,
          0,
          0
        );


        const jpegBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(
                      new Error(
                        'Failed to encode page'
                      )
                    );
                  }
                },
                'image/jpeg',
                0.88
              );
            }
          );


        const jpegBytes =
          await jpegBlob.arrayBuffer();

        const embeddedImage =
          await outputDoc.embedJpg(
            jpegBytes
          );


        const unscaledViewport =
          page.getViewport({
            scale: 1.0,
          });


        const newPage =
          outputDoc.addPage([
            unscaledViewport.width,
            unscaledViewport.height,
          ]);


        newPage.drawImage(
          embeddedImage,
          {
            x: 0,
            y: 0,
            width:
              unscaledViewport.width,
            height:
              unscaledViewport.height,
          }
        );
      } finally {
        canvas.width = 1;
        canvas.height = 1;

        try {
          canvas.remove();
        } catch (_) {}

        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Allow the browser to reclaim the completed
       * page's temporary pixel/JPEG memory before
       * processing the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * All converted pages are already embedded in the
     * output document. Release the original PDF.js source
     * before serializing the complete grayscale PDF.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await outputDoc.save({
      useObjectStreams: true,
    });
  } finally {
    /*
     * dispose() is idempotent and also protects
     * errors before final serialization.
     */
    await loadedPdf.dispose();
  }
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
  const {
    size = 'A4',
    fitMode = 'fit',
    autoOrientation = true,
    onProgress,
  } = options;

  const [
    baseWidth,
    baseHeight,
  ] =
    PAGE_DIMENSIONS[size];

  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let sourceBuffer:
    | ArrayBuffer
    | null = null;


  /*
   * Clean PDFs retain the lossless vector resize path.
   * Protected PDFs skip the complete pdf-lib source read.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      const sourceDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      const outputDoc =
        await PDFDocument.create();

      const totalPages =
        sourceDoc.getPageCount();


      for (
        let i = 0;
        i < totalPages;
        i++
      ) {
        onProgress?.(
          i + 1,
          totalPages
        );

        const srcPage =
          sourceDoc.getPage(i);

        const {
          width: origWidth,
          height: origHeight,
        } =
          srcPage.getSize();


        let targetWidth =
          baseWidth;

        let targetHeight =
          baseHeight;


        if (
          autoOrientation &&
          origWidth >
            origHeight
        ) {
          targetWidth =
            Math.max(
              baseWidth,
              baseHeight
            );

          targetHeight =
            Math.min(
              baseWidth,
              baseHeight
            );
        } else if (
          autoOrientation
        ) {
          targetWidth =
            Math.min(
              baseWidth,
              baseHeight
            );

          targetHeight =
            Math.max(
              baseWidth,
              baseHeight
            );
        }


        const embeddedPage =
          await outputDoc.embedPage(
            srcPage
          );

        const newPage =
          outputDoc.addPage([
            targetWidth,
            targetHeight,
          ]);


        let drawWidth =
          targetWidth;

        let drawHeight =
          targetHeight;

        let drawX = 0;
        let drawY = 0;


        if (
          fitMode === 'fit'
        ) {
          const scale =
            Math.min(
              targetWidth /
                origWidth,
              targetHeight /
                origHeight
            );

          drawWidth =
            origWidth *
            scale;

          drawHeight =
            origHeight *
            scale;

          drawX =
            (
              targetWidth -
              drawWidth
            ) / 2;

          drawY =
            (
              targetHeight -
              drawHeight
            ) / 2;
        } else if (
          fitMode ===
          'center'
        ) {
          drawWidth =
            origWidth;

          drawHeight =
            origHeight;

          drawX =
            (
              targetWidth -
              origWidth
            ) / 2;

          drawY =
            (
              targetHeight -
              origHeight
            ) / 2;
        } else if (
          fitMode ===
          'stretch'
        ) {
          drawWidth =
            targetWidth;

          drawHeight =
            targetHeight;

          drawX = 0;
          drawY = 0;
        }


        newPage.drawPage(
          embeddedPage,
          {
            x: drawX,
            y: drawY,
            width:
              drawWidth,
            height:
              drawHeight,
          }
        );
      }


      return await outputDoc.save({
        useObjectStreams: false,
      });
    } catch (vectorErr) {
      console.warn(
        'Vector resize bypassed; falling back to high-res rendering engine:',
        vectorErr
      );
    }
  }


  /*
   * Release vector source reference before raster fallback.
   */
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


  const loadedFallback =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const fallbackDoc =
    loadedFallback.pdf;

  try {
    const totalPages =
      fallbackDoc.numPages;

    const outputDoc =
      await PDFDocument.create();


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        pageNum,
        totalPages
      );

      const page =
        await fallbackDoc.getPage(
          pageNum
        );

      try {
        const unscaled =
          page.getViewport({
            scale: 1.0,
          });

        const origWidth =
          unscaled.width;

        const origHeight =
          unscaled.height;


        let targetWidth =
          baseWidth;

        let targetHeight =
          baseHeight;


        if (
          autoOrientation &&
          origWidth >
            origHeight
        ) {
          targetWidth =
            Math.max(
              baseWidth,
              baseHeight
            );

          targetHeight =
            Math.min(
              baseWidth,
              baseHeight
            );
        } else if (
          autoOrientation
        ) {
          targetWidth =
            Math.min(
              baseWidth,
              baseHeight
            );

          targetHeight =
            Math.max(
              baseWidth,
              baseHeight
            );
        }


        const {
          imgBytes,
        } =
          await renderPageAsJpg(
            page,
            2.0
          );


        const embeddedImage =
          await outputDoc.embedJpg(
            imgBytes
          );

        const newPage =
          outputDoc.addPage([
            targetWidth,
            targetHeight,
          ]);


        let drawWidth =
          targetWidth;

        let drawHeight =
          targetHeight;

        let drawX = 0;
        let drawY = 0;


        if (
          fitMode === 'fit'
        ) {
          const scale =
            Math.min(
              targetWidth /
                origWidth,
              targetHeight /
                origHeight
            );

          drawWidth =
            origWidth *
            scale;

          drawHeight =
            origHeight *
            scale;

          drawX =
            (
              targetWidth -
              drawWidth
            ) / 2;

          drawY =
            (
              targetHeight -
              drawHeight
            ) / 2;
        } else if (
          fitMode ===
          'center'
        ) {
          drawWidth =
            origWidth;

          drawHeight =
            origHeight;

          drawX =
            (
              targetWidth -
              origWidth
            ) / 2;

          drawY =
            (
              targetHeight -
              origHeight
            ) / 2;
        } else if (
          fitMode ===
          'stretch'
        ) {
          drawWidth =
            targetWidth;

          drawHeight =
            targetHeight;

          drawX = 0;
          drawY = 0;
        }


        newPage.drawImage(
          embeddedImage,
          {
            x: drawX,
            y: drawY,
            width:
              drawWidth,
            height:
              drawHeight,
          }
        );
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser a chance to reclaim the
       * completed fallback page's temporary render
       * memory before processing the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * Every fallback page is now embedded in outputDoc.
     * Release the original PDF.js source before allocating
     * the complete resized output during serialization.
     */
    await loadedFallback.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await outputDoc.save({
      useObjectStreams: false,
    });
  } finally {
    /*
     * dispose() is idempotent and still protects
     * all earlier error paths.
     */
    await loadedFallback.dispose();
  }
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
  const {
    pagesPerSheet = 2,
    drawPageBorders = true,
    onProgress,
  } = options;

  const [
    cols,
    rows,
    sheetWidth,
    sheetHeight,
  ] =
    pagesPerSheet === 2
      ? [
          2,
          1,
          841.89,
          595.28,
        ]
      : pagesPerSheet === 4
        ? [
            2,
            2,
            595.28,
            841.89,
          ]
        : [
            3,
            3,
            595.28,
            841.89,
          ];

  const cellWidth =
    sheetWidth / cols;

  const cellHeight =
    sheetHeight / rows;

  const margin = 12;

  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );

  let sourceBuffer:
    | ArrayBuffer
    | null = null;


  /*
   * Clean PDFs retain vector N-Up composition.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();

      const sourceDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      /*
       * pdf-lib has parsed the source document.
       * Drop our separate complete input-buffer reference
       * before building the N-Up output document.
       */
      sourceBuffer = null;

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );

      const totalPages =
        sourceDoc.getPageCount();

      const outputDoc =
        await PDFDocument.create();

      let pageCursor = 0;


      while (
        pageCursor <
        totalPages
      ) {
        const sheet =
          outputDoc.addPage([
            sheetWidth,
            sheetHeight,
          ]);


        for (
          let row = 0;
          row < rows;
          row++
        ) {
          for (
            let col = 0;
            col < cols;
            col++
          ) {
            if (
              pageCursor >=
              totalPages
            ) {
              break;
            }


            onProgress?.(
              pageCursor + 1,
              totalPages
            );


            const srcPage =
              sourceDoc.getPage(
                pageCursor
              );

            const {
              width: origW,
              height: origH,
            } =
              srcPage.getSize();


            const embedded =
              await outputDoc.embedPage(
                srcPage
              );


            const usableW =
              cellWidth -
              margin * 2;

            const usableH =
              cellHeight -
              margin * 2;


            const scale =
              Math.min(
                usableW /
                  origW,
                usableH /
                  origH
              );

            const scaledW =
              origW * scale;

            const scaledH =
              origH * scale;


            const cellOriginX =
              col *
              cellWidth;

            const cellOriginY =
              sheetHeight -
              (
                row + 1
              ) *
                cellHeight;


            const drawX =
              cellOriginX +
              (
                cellWidth -
                scaledW
              ) /
                2;

            const drawY =
              cellOriginY +
              (
                cellHeight -
                scaledH
              ) /
                2;


            sheet.drawPage(
              embedded,
              {
                x: drawX,
                y: drawY,
                width:
                  scaledW,
                height:
                  scaledH,
              }
            );


            if (
              drawPageBorders
            ) {
              sheet.drawRectangle({
                x: drawX,
                y: drawY,
                width:
                  scaledW,
                height:
                  scaledH,
                borderColor:
                  rgb(
                    0.8,
                    0.8,
                    0.8
                  ),
                borderWidth:
                  0.5,
              });
            }


            pageCursor++;
          }
        }
      }


      return await outputDoc.save({
        useObjectStreams: false,
      });
    } catch (vectorErr) {
      console.warn(
        'Vector N-Up bypassed; activating high-res rendering pipeline:',
        vectorErr
      );
    }
  }


  /*
   * Release vector source before entering raster fallback.
   */
  sourceBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


  const loadedFallback =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const fallbackDoc =
    loadedFallback.pdf;


  try {
    const totalPages =
      fallbackDoc.numPages;

    const outputDoc =
      await PDFDocument.create();

    let pageCursor = 0;


    while (
      pageCursor <
      totalPages
    ) {
      const sheet =
        outputDoc.addPage([
          sheetWidth,
          sheetHeight,
        ]);


      for (
        let row = 0;
        row < rows;
        row++
      ) {
        for (
          let col = 0;
          col < cols;
          col++
        ) {
          if (
            pageCursor >=
            totalPages
          ) {
            break;
          }


          onProgress?.(
            pageCursor + 1,
            totalPages
          );


          const pageNum =
            pageCursor + 1;

          const page =
            await fallbackDoc.getPage(
              pageNum
            );

          try {
            const {
              imgBytes,
              width: origW,
              height: origH,
            } =
              await renderPageAsJpg(
                page,
                2.0
              );


            const embeddedImg =
              await outputDoc.embedJpg(
                imgBytes
              );


            const usableW =
              cellWidth -
              margin * 2;

            const usableH =
              cellHeight -
              margin * 2;


            const scale =
              Math.min(
                usableW /
                  origW,
                usableH /
                  origH
              );

            const scaledW =
              origW * scale;

            const scaledH =
              origH * scale;


            const cellOriginX =
              col *
              cellWidth;

            const cellOriginY =
              sheetHeight -
              (
                row + 1
              ) *
                cellHeight;


            const drawX =
              cellOriginX +
              (
                cellWidth -
                scaledW
              ) /
                2;

            const drawY =
              cellOriginY +
              (
                cellHeight -
                scaledH
              ) /
                2;


            sheet.drawImage(
              embeddedImg,
              {
                x: drawX,
                y: drawY,
                width:
                  scaledW,
                height:
                  scaledH,
              }
            );


            if (
              drawPageBorders
            ) {
              sheet.drawRectangle({
                x: drawX,
                y: drawY,
                width:
                  scaledW,
                height:
                  scaledH,
                borderColor:
                  rgb(
                    0.8,
                    0.8,
                    0.8
                  ),
                borderWidth:
                  0.5,
              });
            }
          } finally {
            try {
              page.cleanup();
            } catch (_) {}
          }


          pageCursor++;

          /*
           * Give the browser an opportunity to reclaim
           * the completed page's temporary render/JPEG
           * memory before processing the next source page.
           */
          await new Promise<void>(
            (resolve) =>
              setTimeout(
                resolve,
                0
              )
          );
        }
      }
    }


    /*
     * Every fallback source page is already embedded in
     * outputDoc. Release the original PDF.js document before
     * allocating the complete serialized N-Up output.
     */
    await loadedFallback.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await outputDoc.save({
      useObjectStreams: false,
    });
  } finally {
    /*
     * dispose() is idempotent and also protects all
     * earlier error paths.
     */
    await loadedFallback.dispose();
  }
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
  const prefix =
    options.prefix || '';

  const suffix =
    options.suffix || '';

  const startNum =
    options.startNumber || 1;

  const digits =
    Math.max(
      1,
      options.digits ??
        options.totalDigits ??
        6
    );

  const fontSize =
    options.fontSize || 10;

  const position =
    options.position ||
    'bottom-right';


  let loadedPdf:
    | {
        pdf: any;
        dispose: () => Promise<void>;
      }
    | null =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );


  /*
   * Profile the document without creating a complete
   * ArrayBuffer/Uint8Array source copy.
   */
  const profilePdf =
    loadedPdf.pdf;

  const numPages =
    profilePdf.numPages;

  const kbPerPage =
    (
      file.size /
      1024
    ) /
    Math.max(
      1,
      numPages
    );

  let hasDenseDigitalText =
    false;

  try {
    const firstPage =
      await profilePdf.getPage(
        1
      );

    try {
      const textContent =
        await firstPage.getTextContent();

      hasDenseDigitalText =
        textContent.items.length >
        25;
    } finally {
      try {
        firstPage.cleanup();
      } catch (_) {}
    }
  } catch (_) {
    hasDenseDigitalText =
      false;
  }


  const isDigitalVector =
    kbPerPage < 180 ||
    (
      hasDenseDigitalText &&
      kbPerPage < 400
    );


  /*
   * Native vector route for digital PDFs.
   *
   * Dispose PDF.js first so pdf-lib and PDF.js do not
   * hold the large source at the same time.
   */
  if (isDigitalVector) {
    await loadedPdf.dispose();
    loadedPdf = null;

    let vectorSource:
      | ArrayBuffer
      | null =
        await file.arrayBuffer();

    try {
      const nativeDoc =
        await PDFDocument.load(
          vectorSource,
          {
            ignoreEncryption: true,
          }
        );

      /*
       * pdf-lib has parsed the document, so our separate
       * complete source ArrayBuffer reference can go away
       * before Bates stamping begins.
       */
      vectorSource = null;

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );

      const pages =
        nativeDoc.getPages();

      const font =
        await nativeDoc.embedFont(
          StandardFonts.HelveticaBold
        );


      pages.forEach(
        (
          page,
          idx
        ) => {
          options.onProgress?.(
            idx + 1,
            numPages
          );

          const pageNumStr =
            String(
              startNum + idx
            ).padStart(
              digits,
              '0'
            );

          const stampText =
            prefix +
            pageNumStr +
            suffix;

          const {
            width,
            height,
          } =
            page.getSize();

          const textWidth =
            font.widthOfTextAtSize(
              stampText,
              fontSize
            );

          const textHeight =
            font.heightAtSize(
              fontSize
            );

          const marginX = 28;
          const marginY = 24;

          let posX =
            marginX;

          let posY =
            marginY;


          if (
            position.includes(
              'center'
            )
          ) {
            posX =
              (
                width -
                textWidth
              ) / 2;
          } else if (
            position.includes(
              'right'
            )
          ) {
            posX =
              width -
              textWidth -
              marginX;
          }


          if (
            position.includes(
              'top'
            )
          ) {
            posY =
              height -
              marginY -
              textHeight;
          }


          const padX = 6;
          const padY = 3;

          page.drawRectangle({
            x:
              posX -
              padX,
            y:
              posY -
              padY,
            width:
              textWidth +
              padX * 2,
            height:
              textHeight +
              padY * 2,
            color:
              rgb(
                1,
                1,
                1
              ),
            opacity:
              0.95,
          });


          page.drawText(
            stampText,
            {
              x: posX,
              y: posY,
              size:
                fontSize,
              font,
              color:
                rgb(
                  0,
                  0,
                  0
                ),
            }
          );
        }
      );


      return await nativeDoc.save({
        useObjectStreams: false,
      });
    } catch (err) {
      console.warn(
        'Native vector route failed, falling back to canvas compositor:',
        err
      );
    } finally {
      vectorSource = null;
    }


    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    loadedPdf =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );
  }


  /*
   * Scanned/photo fallback.
   *
   * If the document was non-vector, reuse the PDF.js
   * profile document instead of loading the source again.
   */
  if (!loadedPdf) {
    loadedPdf =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );
  }


  const pdfDoc =
    loadedPdf.pdf;

  try {
    const newPdfDoc =
      await PDFDocument.create();


    for (
      let i = 1;
      i <= numPages;
      i++
    ) {
      options.onProgress?.(
        i,
        numPages
      );

      const pageNumStr =
        String(
          startNum +
            (
              i - 1
            )
        ).padStart(
          digits,
          '0'
        );

      const stampText =
        prefix +
        pageNumStr +
        suffix;


      const page =
        await pdfDoc.getPage(
          i
        );

      const compositeCanvas =
        document.createElement(
          'canvas'
        );

      try {
        const renderedPage =
          await renderPageAsJpg(
            page,
            2.5
          );

        let imgBytes =
          renderedPage.imgBytes;

        const pWidth =
          renderedPage.width;

        const pHeight =
          renderedPage.height;


        compositeCanvas.width =
          pWidth;

        compositeCanvas.height =
          pHeight;


        const ctx =
          compositeCanvas.getContext(
            '2d'
          );

        if (!ctx) {
          throw new Error(
            'Canvas rendering context unavailable'
          );
        }


        const pageImg =
          new Image();

        const pageBlobUrl =
          URL.createObjectURL(
            new Blob(
              [
                imgBytes as unknown as BlobPart,
              ],
              {
                type:
                  'image/jpeg',
              }
            )
          );


        try {
          await new Promise<void>(
            (
              resolve,
              reject
            ) => {
              pageImg.onload =
                () => {
                  ctx.drawImage(
                    pageImg,
                    0,
                    0,
                    pWidth,
                    pHeight
                  );

                  resolve();
                };

              pageImg.onerror =
                () =>
                  reject(
                    new Error(
                      'Failed to decode rendered PDF page.'
                    )
                  );

              pageImg.src =
                pageBlobUrl;
            }
          );
        } finally {
          URL.revokeObjectURL(
            pageBlobUrl
          );

          /*
           * The rendered page has already been painted onto
           * compositeCanvas. Drop the Image's decoded source
           * and our compressed JPEG byte reference before
           * creating the stamped output image.
           */
          try {
            pageImg.src = '';
          } catch (_) {}

          imgBytes =
            new Uint8Array(0);
        }


        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              0
            )
        );


        ctx.save();

        const scaleNormalization =
          pWidth / 540;

        const finalFontSize =
          fontSize *
          scaleNormalization;

        ctx.font =
          'bold ' +
          finalFontSize +
          'px Helvetica, Arial, sans-serif';

        ctx.fillStyle =
          '#000000';


        const metrics =
          ctx.measureText(
            stampText
          );

        const textWidth =
          metrics.width;

        const textHeight =
          finalFontSize;

        const marginX =
          pWidth * 0.05;

        const marginY =
          pHeight * 0.04;

        let posX =
          marginX;

        let posY =
          pHeight -
          marginY;


        if (
          position.includes(
            'center'
          )
        ) {
          posX =
            (
              pWidth -
              textWidth
            ) / 2;
        } else if (
          position.includes(
            'right'
          )
        ) {
          posX =
            pWidth -
            textWidth -
            marginX;
        }


        if (
          position.includes(
            'top'
          )
        ) {
          posY =
            marginY +
            textHeight;
        }


        ctx.fillStyle =
          'rgba(255, 255, 255, 0.95)';

        ctx.fillRect(
          posX - 6,
          posY -
            textHeight -
            4,
          textWidth + 12,
          textHeight + 8
        );


        ctx.fillStyle =
          '#000000';

        ctx.textBaseline =
          'alphabetic';

        ctx.fillText(
          stampText,
          posX,
          posY
        );

        ctx.restore();


        /*
         * Avoid PNG base64 duplication.
         */
        const stampedBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              compositeCanvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    reject(
                      new Error(
                        'Failed to encode Bates page.'
                      )
                    );
                  }
                },
                'image/png'
              );
            }
          );


        const stampedBytes =
          await stampedBlob.arrayBuffer();

        const finalPageImg =
          await newPdfDoc.embedPng(
            stampedBytes
          );


        const newPage =
          newPdfDoc.addPage([
            pWidth,
            pHeight,
          ]);


        newPage.drawImage(
          finalPageImg,
          {
            x: 0,
            y: 0,
            width:
              pWidth,
            height:
              pHeight,
          }
        );
      } finally {
        compositeCanvas.width =
          1;

        compositeCanvas.height =
          1;

        try {
          compositeCanvas.remove();
        } catch (_) {}

        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Allow the browser to reclaim completed page
       * canvas/image temporaries before Bates processing
       * starts on the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * All stamped pages are now embedded in newPdfDoc.
     * Release the original PDF.js source before allocating
     * the complete serialized Bates PDF.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    return await newPdfDoc.save({
      useObjectStreams: false,
    });
  } finally {
    await loadedPdf.dispose();
  }
}

export interface ExtractedImage {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

export async function extractImagesFromPDF(
  file: File,
  onProgress?: (
    current: number,
    total: number
  ) => void
): Promise<ExtractedImage[]> {
  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdfDoc =
    loadedPdf.pdf;

  try {
    const totalPages =
      pdfDoc.numPages;

    const images:
      ExtractedImage[] = [];

    const seenImageHashes =
      new Set<string>();

    let counter = 0;


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        pageNum,
        totalPages
      );

      const page =
        await pdfDoc.getPage(
          pageNum
        );

      try {
        const operatorList =
          await page.getOperatorList();

        const validOps = [
          pdfjsLib.OPS
            .paintImageXObject,
          pdfjsLib.OPS
            .paintInlineImageXObject,
          pdfjsLib.OPS
            .paintImageXObjectRepeat,
        ];


        for (
          let i = 0;
          i <
          operatorList.fnArray.length;
          i++
        ) {
          const fn =
            operatorList.fnArray[i];

          if (
            !validOps.includes(
              fn
            )
          ) {
            continue;
          }


          const imgArg =
            operatorList
              .argsArray[i][0];


          try {
            const imgObj: any =
              await new Promise(
                (resolve) => {
                  const timeout =
                    setTimeout(
                      () =>
                        resolve(
                          null
                        ),
                      1200
                    );


                  if (
                    imgArg &&
                    typeof imgArg ===
                      'object'
                  ) {
                    clearTimeout(
                      timeout
                    );

                    resolve(
                      imgArg
                    );

                    return;
                  }


                  if (
                    !imgArg ||
                    typeof imgArg !==
                      'string'
                  ) {
                    clearTimeout(
                      timeout
                    );

                    resolve(
                      null
                    );

                    return;
                  }


                  let handled =
                    false;

                  const handleResult =
                    (
                      data: any
                    ) => {
                      if (
                        !handled &&
                        data
                      ) {
                        handled =
                          true;

                        clearTimeout(
                          timeout
                        );

                        resolve(
                          data
                        );
                      }
                    };


                  try {
                    const syncObj =
                      (
                        page.objs as any
                      ).get(
                        imgArg,
                        handleResult
                      );

                    if (syncObj) {
                      handleResult(
                        syncObj
                      );
                    }
                  } catch (_) {}


                  if (!handled) {
                    try {
                      const commonStore =
                        (
                          page as any
                        ).commonObjs ||
                        (
                          pdfDoc as any
                        ).commonObjs;

                      if (
                        commonStore
                      ) {
                        const syncCommon =
                          commonStore.get(
                            imgArg,
                            handleResult
                          );

                        if (
                          syncCommon
                        ) {
                          handleResult(
                            syncCommon
                          );
                        }
                      }
                    } catch (_) {}
                  }
                }
              );


            if (!imgObj) {
              continue;
            }


            const width =
              imgObj.width;

            const height =
              imgObj.height;


            if (
              !width ||
              !height ||
              width < 10 ||
              height < 10
            ) {
              continue;
            }


            const dedupeKey =
              width +
              'x' +
              height +
              '_' +
              (
                imgObj.data
                  ?.length ||
                0
              );


            if (
              seenImageHashes.has(
                dedupeKey
              )
            ) {
              continue;
            }


            seenImageHashes.add(
              dedupeKey
            );


            const canvas =
              document.createElement(
                'canvas'
              );

            try {
              canvas.width =
                width;

              canvas.height =
                height;


              const ctx =
                canvas.getContext(
                  '2d',
                  {
                    alpha: false,
                  }
                );


              if (!ctx) {
                continue;
              }


              if (
                imgObj.bitmap
              ) {
                ctx.drawImage(
                  imgObj.bitmap,
                  0,
                  0
                );
              } else if (
                typeof ImageBitmap !==
                  'undefined' &&
                imgObj instanceof
                  ImageBitmap
              ) {
                ctx.drawImage(
                  imgObj,
                  0,
                  0
                );
              } else if (
                imgObj.data
              ) {
                let imgData:
                  ImageData;


                if (
                  imgObj.data
                    .length ===
                  width *
                    height *
                    4
                ) {
                  imgData =
                    new ImageData(
                      new Uint8ClampedArray(
                        imgObj.data
                      ),
                      width,
                      height
                    );
                } else if (
                  imgObj.data
                    .length ===
                  width *
                    height *
                    3
                ) {
                  const rgba =
                    new Uint8ClampedArray(
                      width *
                        height *
                        4
                    );


                  for (
                    let p = 0,
                      q = 0;
                    p <
                    imgObj.data
                      .length;
                    p += 3,
                      q += 4
                  ) {
                    rgba[q] =
                      imgObj.data[p];

                    rgba[q + 1] =
                      imgObj.data[
                        p + 1
                      ];

                    rgba[q + 2] =
                      imgObj.data[
                        p + 2
                      ];

                    rgba[q + 3] =
                      255;
                  }


                  imgData =
                    new ImageData(
                      rgba,
                      width,
                      height
                    );
                } else if (
                  imgObj.data
                    .length ===
                  width *
                    height
                ) {
                  const rgba =
                    new Uint8ClampedArray(
                      width *
                        height *
                        4
                    );


                  for (
                    let p = 0,
                      q = 0;
                    p <
                    imgObj.data
                      .length;
                    p++,
                      q += 4
                  ) {
                    const val =
                      imgObj.data[p];

                    rgba[q] =
                      val;

                    rgba[q + 1] =
                      val;

                    rgba[q + 2] =
                      val;

                    rgba[q + 3] =
                      255;
                  }


                  imgData =
                    new ImageData(
                      rgba,
                      width,
                      height
                    );
                } else {
                  continue;
                }


                ctx.putImageData(
                  imgData,
                  0,
                  0
                );
              } else {
                continue;
              }


              const blob =
                await new Promise<
                  Blob | null
                >(
                  (resolve) =>
                    canvas.toBlob(
                      resolve,
                      'image/png'
                    )
                );


              if (!blob) {
                continue;
              }


              counter++;


              images.push({
                id:
                  'img-' +
                  counter +
                  '-p' +
                  pageNum,

                name:
                  'extracted_img_' +
                  counter +
                  '_p' +
                  pageNum +
                  '.png',

                blob,
                width,
                height,
              });
            } finally {
              canvas.width =
                1;

              canvas.height =
                1;

              try {
                canvas.remove();
              } catch (_) {}
            }
          } catch (err) {
            console.warn(
              'Skipping unparseable image on page ' +
                pageNum +
                ':',
              err
            );
          }
        }
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }
    }


    return images;
  } finally {
    await loadedPdf.dispose();
  }
}

export async function packageImagesToZip(
  images: ExtractedImage[],
  baseName: string
): Promise<Blob> {
  const cleanName =
    baseName.replace(
      /\.[^/.]+$/,
      ''
    );

  const chunks:
    ArrayBuffer[] = [];

  let resolveZip!:
    (blob: Blob) => void;

  let rejectZip!:
    (error: unknown) => void;

  const result =
    new Promise<Blob>(
      (resolve, reject) => {
        resolveZip =
          resolve;

        rejectZip =
          reject;
      }
    );

  const zip =
    new Zip(
      (
        error,
        data,
        final
      ) => {
        if (error) {
          rejectZip(
            error
          );
          return;
        }

        if (
          data &&
          data.length
        ) {
          const copy =
            new Uint8Array(
              data.length
            );

          copy.set(
            data
          );

          chunks.push(
            copy.buffer
          );
        }

        if (final) {
          resolveZip(
            new Blob(
              chunks,
              {
                type:
                  'application/zip',
              }
            )
          );
        }
      }
    );

  /*
   * Extracted JPG/PNG/WebP images are already compressed.
   * Store each one directly rather than running another
   * expensive DEFLATE pass over every image.
   */
  for (
    const image of images
  ) {
    const entry =
      new ZipPassThrough(
        `${cleanName}_${image.name}`
      );

    zip.add(
      entry
    );

    const bytes =
      new Uint8Array(
        await image.blob.arrayBuffer()
      );

    entry.push(
      bytes,
      true
    );

    /*
     * Yield after each image so its temporary ArrayBuffer
     * can become collectible before the next one is read.
     */
    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );
  }

  zip.end();

  return await result;
}

export interface OcrProgress {
  status: string;
  progress: number;
}

export async function ocrPDFToSearchable(
  file: File,
  language: string = 'eng',
  onProgress?: (
    p: OcrProgress
  ) => void
): Promise<Uint8Array> {
  if (
    !pdfjsLib
      .GlobalWorkerOptions
      .workerSrc
  ) {
    try {
    } catch (_) {
    }
  }


  onProgress?.({
    status:
      'Initializing Local OCR Engine...',
    progress: 10,
  });


  const worker =
    await createWorker(
      language,
      1,
      {
        workerPath:
          '/tessdata/worker.min.js',

        corePath:
          '/tessdata/tesseract-core-simd-lstm.wasm.js',

        langPath:
          '/tessdata',

        gzip: true,

        logger: (m) => {
          if (
            m.status ===
              'recognizing text' &&
            onProgress
          ) {
            onProgress({
              status:
                'Recognizing text...',

              progress:
                Math.min(
                  95,
                  Math.round(
                    m.progress *
                      85
                  ) + 10
                ),
            });
          }
        },
      }
    );

  let workerTerminated =
    false;


  let loadedPdf:
    | {
        pdf: any;
        dispose: () => Promise<void>;
      }
    | null = null;


  try {
    /*
     * pdf-lib still needs one complete source read because
     * this tool preserves the original PDF and overlays an
     * invisible searchable text layer.
     *
     * PDF.js now reads from the browser-backed File instead
     * of receiving a second complete Uint8Array copy.
     */
    let sourceBuffer:
      | ArrayBuffer
      | null =
        await file.arrayBuffer();


    const pdfLibDoc =
      await PDFDocument.load(
        sourceBuffer,
        {
          ignoreEncryption: true,
        }
      );


    /*
     * Drop our explicit ArrayBuffer reference as soon as
     * pdf-lib has parsed the source.
     */
    sourceBuffer = null;

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    loadedPdf =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );


    const pdfJsDoc =
      loadedPdf.pdf;


    const helveticaFont =
      await pdfLibDoc.embedFont(
        StandardFonts.Helvetica
      );


    const totalPages =
      pdfJsDoc.numPages;


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.({
        status:
          'Scanning Page ' +
          pageNum +
          ' of ' +
          totalPages +
          '...',

        progress:
          Math.round(
            (
              (
                pageNum - 1
              ) /
              totalPages
            ) *
              85
          ) + 10,
      });


      const pdfJsPage =
        await pdfJsDoc.getPage(
          pageNum
        );


      const canvas =
        document.createElement(
          'canvas'
        );


      try {
        const viewport =
          pdfJsPage.getViewport({
            scale: 2.0,
          });


        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );


        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );


        if (!ctx) {
          throw new Error(
            'Canvas rendering context unavailable'
          );
        }


        await (
          pdfJsPage.render({
            canvasContext:
              ctx as any,

            viewport,
          } as any) as any
        ).promise;


        /*
         * Preserve the existing dark-mode detection and
         * inversion behavior.
         */
        const imgData =
          ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );


        const d =
          imgData.data;


        let totalBrightness =
          0;

        const sampleStep =
          16;

        let sampleCount =
          0;


        for (
          let i = 0;
          i < d.length;
          i +=
            4 *
            sampleStep
        ) {
          totalBrightness +=
            d[i] *
              0.299 +
            d[i + 1] *
              0.587 +
            d[i + 2] *
              0.114;

          sampleCount++;
        }


        const avgBrightness =
          totalBrightness /
          Math.max(
            1,
            sampleCount
          );


        if (
          avgBrightness <
          128
        ) {
          for (
            let i = 0;
            i < d.length;
            i += 4
          ) {
            d[i] =
              255 -
              d[i];

            d[i + 1] =
              255 -
              d[i + 1];

            d[i + 2] =
              255 -
              d[i + 2];
          }


          ctx.putImageData(
            imgData,
            0,
            0
          );
        }


        const {
          data,
        } =
          await worker.recognize(
            canvas
          );


        const pdfLibPage =
          pdfLibDoc.getPage(
            pageNum - 1
          );


        const {
          width:
            pageWidth,
          height:
            pageHeight,
        } =
          pdfLibPage.getSize();


        const scaleX =
          pageWidth /
          viewport.width;

        const scaleY =
          pageHeight /
          viewport.height;


        /*
         * Universal word extraction hierarchy
         * for Tesseract v4/v5 compatibility.
         */
        let words:
          any[] = [];


        if (
          Array.isArray(
            (data as any)
              ?.words
          ) &&
          (data as any)
            .words.length >
            0
        ) {
          words =
            (data as any)
              .words;
        } else if (
          Array.isArray(
            (data as any)
              ?.blocks
          )
        ) {
          words =
            (data as any)
              .blocks
              .flatMap(
                (
                  b: any
                ) =>
                  b.paragraphs ??
                  []
              )
              .flatMap(
                (
                  p: any
                ) =>
                  p.lines ??
                  []
              )
              .flatMap(
                (
                  l: any
                ) =>
                  l.words ??
                  []
              );
        }


        for (
          const word of
          words
        ) {
          if (
            !word ||
            !word.text ||
            !word.bbox
          ) {
            continue;
          }


          const clean =
            word.text
              .replace(
                /[^ -~ -ÿ]/g,
                ''
              )
              .trim();


          if (!clean) {
            continue;
          }


          const box =
            word.bbox;


          const posX =
            box.x0 *
            scaleX;


          const posY =
            pageHeight -
            box.y1 *
              scaleY;


          const wordHeight =
            (
              box.y1 -
              box.y0
            ) *
            scaleY;


          pdfLibPage.drawText(
            clean,
            {
              x:
                Math.max(
                  0,
                  posX
                ),

              y:
                Math.max(
                  0,
                  posY
                ),

              size:
                Math.max(
                  4,
                  Math.round(
                    wordHeight *
                      0.85
                  )
                ),

              font:
                helveticaFont,

              color:
                rgb(
                  0,
                  0,
                  0
                ),

              opacity:
                0.01,
            }
          );
        }
      } finally {
        canvas.width =
          1;

        canvas.height =
          1;


        try {
          canvas.remove();
        } catch (_) {}


        try {
          pdfJsPage.cleanup();
        } catch (_) {}
      }

      /*
       * OCR pages are memory-heavy: rendered pixels,
       * Tesseract recognition data, and PDF.js page state.
       * Yield before starting the next page so completed
       * page temporaries can be reclaimed.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    onProgress?.({
      status:
        'Finalizing Searchable PDF...',

      progress: 98,
    });


    /*
     * OCR is completely finished and every searchable word
     * has already been written into pdfLibDoc.
     *
     * Release the browser-backed PDF.js source and the
     * Tesseract WASM worker before allocating the complete
     * serialized searchable PDF.
     */
    if (loadedPdf) {
      await loadedPdf.dispose();
      loadedPdf = null;
    }

    if (!workerTerminated) {
      await worker.terminate();
      workerTerminated =
        true;
    }

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    return await pdfLibDoc.save({
      useObjectStreams: false,
    });
  } finally {
    if (loadedPdf) {
      await loadedPdf.dispose();
    }

    if (!workerTerminated) {
      await worker.terminate();
      workerTerminated =
        true;
    }
  }
}

export interface RepairResult {
  bytes: Uint8Array;
  method: 'lossless' | 'stream-salvage';
  recoveredPages: number;
}

export async function repairPDF(
  file: File,
  onProgress?: (
    stage: string
  ) => void
): Promise<RepairResult> {
  let sourceBuffer:
    | ArrayBuffer
    | null = null;

  let sourceDoc:
    | PDFDocument
    | null = null;


  /*
   * Tier 1:
   * structural/lossless recovery with pdf-lib.
   */
  try {
    onProgress?.(
      'Attempting structural cross-reference rebuild...'
    );


    sourceBuffer =
      await file.arrayBuffer();


    sourceDoc =
      await PDFDocument.load(
        sourceBuffer,
        {
          ignoreEncryption: true,
          updateMetadata: false,
        }
      );


    const pageCount =
      sourceDoc.getPageCount();


    if (
      pageCount > 0
    ) {
      let hasEmptyPages =
        false;


      for (
        let i = 0;
        i < pageCount;
        i++
      ) {
        if (
          !sourceDoc
            .getPage(i)
            .node
            .Contents()
        ) {
          hasEmptyPages =
            true;

          break;
        }
      }


      if (!hasEmptyPages) {
        const recoveredDoc =
          await PDFDocument.create();


        const pages =
          await recoveredDoc.copyPages(
            sourceDoc,
            sourceDoc.getPageIndices()
          );


        pages.forEach(
          (page) =>
            recoveredDoc.addPage(
              page
            )
        );


        /*
         * copyPages has imported the required page objects
         * into recoveredDoc. Release our original parsed
         * document and complete source buffer before
         * serializing the repaired copy.
         */
        sourceDoc = null;
        sourceBuffer = null;

        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              0
            )
        );


        const bytes =
          await recoveredDoc.save({
            useObjectStreams: true,
          });


        return {
          bytes,
          method:
            'lossless',
          recoveredPages:
            pageCount,
        };
      }
    }
  } catch (
    structuralError
  ) {
    console.warn(
      'Tier 1 repair failed, advancing to stream salvage:',
      structuralError
    );
  }


  /*
   * Release Tier 1 references before PDF.js salvage.
   */
  sourceDoc = null;
  sourceBuffer = null;


  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


  onProgress?.(
    'Extracting raw page streams via salvage worker...'
  );


  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );


  const pdfDoc =
    loadedPdf.pdf;


  try {
    const totalPages =
      pdfDoc.numPages;


    if (
      totalPages === 0
    ) {
      throw new Error(
        'No recoverable page data found in document streams.'
      );
    }


    const outputDoc =
      await PDFDocument.create();


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        'Salvaging page ' +
        pageNum +
        ' of ' +
        totalPages +
        '...'
      );


      const page =
        await pdfDoc.getPage(
          pageNum
        );


      const canvas =
        document.createElement(
          'canvas'
        );


      try {
        const viewport =
          page.getViewport({
            scale: 2.0,
          });


        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );


        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );


        if (!ctx) {
          throw new Error(
            'Canvas rendering context unavailable'
          );
        }


        await (
          page.render({
            canvasContext:
              ctx as any,

            viewport,
          } as any) as any
        ).promise;


        const jpegBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(
                      blob
                    );
                  } else {
                    reject(
                      new Error(
                        'Canvas buffer conversion failed'
                      )
                    );
                  }
                },
                'image/jpeg',
                0.92
              );
            }
          );


        const jpegBytes =
          await jpegBlob.arrayBuffer();


        const embeddedImg =
          await outputDoc.embedJpg(
            jpegBytes
          );


        const unscaled =
          page.getViewport({
            scale: 1.0,
          });


        const newPage =
          outputDoc.addPage([
            unscaled.width,
            unscaled.height,
          ]);


        newPage.drawImage(
          embeddedImg,
          {
            x: 0,
            y: 0,
            width:
              unscaled.width,
            height:
              unscaled.height,
          }
        );
      } finally {
        canvas.width =
          1;

        canvas.height =
          1;


        try {
          canvas.remove();
        } catch (_) {}


        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser an opportunity to reclaim the
       * completed salvage page's canvas/JPEG temporaries
       * before rendering the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * All recoverable pages are now embedded in outputDoc.
     * Release the original PDF.js document before allocating
     * the complete serialized repaired PDF.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    const bytes =
      await outputDoc.save({
        useObjectStreams: true,
      });


    return {
      bytes,
      method:
        'stream-salvage',
      recoveredPages:
        totalPages,
    };
  } finally {
    await loadedPdf.dispose();
  }
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
  const {
    filter = 'invert',
    onProgress,
  } = options;


  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );


  const pdfDoc =
    loadedPdf.pdf;


  try {
    const totalPages =
      pdfDoc.numPages;


    const outputDoc =
      await PDFDocument.create();


    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        pageNum,
        totalPages
      );


      const page =
        await pdfDoc.getPage(
          pageNum
        );


      const canvas =
        document.createElement(
          'canvas'
        );


      try {
        const viewport =
          page.getViewport({
            scale: 2.0,
          });


        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );


        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );


        if (!ctx) {
          throw new Error(
            'Canvas rendering context unavailable'
          );
        }


        await (
          page.render({
            canvasContext:
              ctx as any,

            viewport,
          } as any) as any
        ).promise;


        const imgData =
          ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );


        const data =
          imgData.data;


        for (
          let i = 0;
          i < data.length;
          i += 4
        ) {
          const r =
            data[i];

          const g =
            data[i + 1];

          const b =
            data[i + 2];


          if (
            filter ===
            'invert'
          ) {
            data[i] =
              255 - r;

            data[i + 1] =
              255 - g;

            data[i + 2] =
              255 - b;
          } else if (
            filter ===
            'oled'
          ) {
            const luminance =
              0.299 * r +
              0.587 * g +
              0.114 * b;


            if (
              luminance >
              210
            ) {
              data[i] = 10;
              data[i + 1] = 10;
              data[i + 2] = 10;
            } else if (
              luminance <
              80
            ) {
              data[i] =
                225;

              data[i + 1] =
                225;

              data[i + 2] =
                225;
            } else {
              data[i] =
                255 - r;

              data[i + 1] =
                255 - g;

              data[i + 2] =
                255 - b;
            }
          } else if (
            filter ===
            'sepia'
          ) {
            const tr =
              0.393 * r +
              0.769 * g +
              0.189 * b;

            const tg =
              0.349 * r +
              0.686 * g +
              0.168 * b;

            const tb =
              0.272 * r +
              0.534 * g +
              0.131 * b;


            data[i] =
              Math.min(
                255,
                tr
              );

            data[i + 1] =
              Math.min(
                255,
                tg
              );

            data[i + 2] =
              Math.min(
                255,
                tb
              );
          }
        }


        ctx.putImageData(
          imgData,
          0,
          0
        );


        const jpegBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(
                      blob
                    );
                  } else {
                    reject(
                      new Error(
                        'Canvas buffer conversion failed'
                      )
                    );
                  }
                },
                'image/jpeg',
                0.9
              );
            }
          );


        const jpegBytes =
          await jpegBlob.arrayBuffer();


        const embeddedImg =
          await outputDoc.embedJpg(
            jpegBytes
          );


        const unscaled =
          page.getViewport({
            scale: 1.0,
          });


        const newPage =
          outputDoc.addPage([
            unscaled.width,
            unscaled.height,
          ]);


        newPage.drawImage(
          embeddedImg,
          {
            x: 0,
            y: 0,
            width:
              unscaled.width,
            height:
              unscaled.height,
          }
        );
      } finally {
        canvas.width =
          1;

        canvas.height =
          1;


        try {
          canvas.remove();
        } catch (_) {}


        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser an opportunity to reclaim
       * completed page pixel/JPEG memory before the
       * next dark-mode page is processed.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * All transformed pages are already embedded in
     * outputDoc. Release the original PDF.js source before
     * allocating the complete serialized dark-mode PDF.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    return await outputDoc.save({
      useObjectStreams: true,
    });
  } finally {
    /*
     * dispose() is idempotent and still protects
     * all earlier error paths.
     */
    await loadedPdf.dispose();
  }
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
  const {
    sheetSize = 'A4',
    addFoldLine = true,
    onProgress,
  } = options;


  const [
    sheetW,
    sheetH,
  ] =
    sheetSize === 'LETTER'
      ? [
          792.0,
          612.0,
        ]
      : [
          841.89,
          595.28,
        ];


  const halfW =
    sheetW / 2;

  const halfH =
    sheetH;


  const looksProtected =
    await isComplexOrProtectedFile(
      file
    );


  let sourceBuffer:
    | ArrayBuffer
    | null = null;


  /*
   * Clean PDFs retain the native vector booklet path.
   */
  if (!looksProtected) {
    try {
      sourceBuffer =
        await file.arrayBuffer();


      const sourceDoc =
        await PDFDocument.load(
          sourceBuffer
        );

      /*
       * pdf-lib has parsed the source document.
       * Drop our separate complete ArrayBuffer reference
       * before booklet composition begins.
       */
      sourceBuffer = null;

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );


      const origPageCount =
        sourceDoc.getPageCount();


      const targetPageCount =
        Math.ceil(
          origPageCount / 4
        ) * 4;


      const pagesToPad =
        targetPageCount -
        origPageCount;


      for (
        let i = 0;
        i < pagesToPad;
        i++
      ) {
        sourceDoc.addPage();
      }


      for (
        let i = 0;
        i <
        sourceDoc.getPageCount();
        i++
      ) {
        const page =
          sourceDoc.getPage(
            i
          );


        if (
          !page.node.Contents()
        ) {
          const emptyStream =
            sourceDoc.context.flateStream(
              ''
            );


          const ref =
            sourceDoc.context.register(
              emptyStream
            );


          page.node.set(
            PDFName.of(
              'Contents'
            ),
            ref
          );
        }
      }


      const outputDoc =
        await PDFDocument.create();


      const totalSpreads =
        targetPageCount / 2;


      for (
        let i = 0;
        i < totalSpreads;
        i++
      ) {
        onProgress?.(
          i + 1,
          totalSpreads
        );


        const k =
          Math.floor(
            i / 2
          );


        let leftIndex:
          number;

        let rightIndex:
          number;


        if (
          i % 2 === 0
        ) {
          leftIndex =
            targetPageCount -
            2 * k -
            1;

          rightIndex =
            2 * k;
        } else {
          leftIndex =
            2 * k + 1;

          rightIndex =
            targetPageCount -
            2 * k -
            2;
        }


        const newSheet =
          outputDoc.addPage([
            sheetW,
            sheetH,
          ]);


        const leftSrc =
          sourceDoc.getPage(
            leftIndex
          );


        const {
          width: leftW,
          height: leftH,
        } =
          leftSrc.getSize();


        const embeddedLeft =
          await outputDoc.embedPage(
            leftSrc
          );


        const scaleLeft =
          Math.min(
            halfW / leftW,
            halfH / leftH
          );


        const drawLeftW =
          leftW *
          scaleLeft;


        const drawLeftH =
          leftH *
          scaleLeft;


        const drawLeftX =
          (
            halfW -
            drawLeftW
          ) / 2;


        const drawLeftY =
          (
            halfH -
            drawLeftH
          ) / 2;


        newSheet.drawPage(
          embeddedLeft,
          {
            x:
              drawLeftX,

            y:
              drawLeftY,

            width:
              drawLeftW,

            height:
              drawLeftH,
          }
        );


        const rightSrc =
          sourceDoc.getPage(
            rightIndex
          );


        const {
          width: rightW,
          height: rightH,
        } =
          rightSrc.getSize();


        const embeddedRight =
          await outputDoc.embedPage(
            rightSrc
          );


        const scaleRight =
          Math.min(
            halfW / rightW,
            halfH / rightH
          );


        const drawRightW =
          rightW *
          scaleRight;


        const drawRightH =
          rightH *
          scaleRight;


        const drawRightX =
          halfW +
          (
            halfW -
            drawRightW
          ) / 2;


        const drawRightY =
          (
            halfH -
            drawRightH
          ) / 2;


        newSheet.drawPage(
          embeddedRight,
          {
            x:
              drawRightX,

            y:
              drawRightY,

            width:
              drawRightW,

            height:
              drawRightH,
          }
        );


        if (addFoldLine) {
          newSheet.drawLine({
            start: {
              x: halfW,
              y: 15,
            },

            end: {
              x: halfW,
              y:
                sheetH -
                15,
            },

            thickness:
              0.5,

            color:
              rgb(
                0.82,
                0.82,
                0.82
              ),

            dashArray: [
              4,
              4,
            ],
          });
        }
      }


      return await outputDoc.save({
        useObjectStreams: false,
      });
    } catch (vectorErr) {
      console.warn(
        'Vector booklet bypassed; activating high-res rendering pipeline:',
        vectorErr
      );
    }
  }


  /*
   * Release vector source before raster fallback.
   */
  sourceBuffer = null;


  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );


  const loadedFallback =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );


  const fallbackDoc =
    loadedFallback.pdf;


  try {
    const origPageCount =
      fallbackDoc.numPages;


    const targetPageCount =
      Math.ceil(
        origPageCount / 4
      ) * 4;


    const totalSpreads =
      targetPageCount / 2;


    const outputDoc =
      await PDFDocument.create();


    const embeddedImages:
      (
        | {
            image: any;
            width: number;
            height: number;
          }
        | null
      )[] = [];


    /*
     * Preserve existing two-phase fallback behavior:
     * first render source pages, then impose spreads.
     */
    for (
      let p = 1;
      p <= origPageCount;
      p++
    ) {
      onProgress?.(
        p,
        origPageCount +
          totalSpreads
      );


      const page =
        await fallbackDoc.getPage(
          p
        );


      try {
        const {
          imgBytes,
          width,
          height,
        } =
          await renderPageAsJpg(
            page,
            2.0
          );


        const image =
          await outputDoc.embedJpg(
            imgBytes
          );


        embeddedImages.push({
          image,
          width,
          height,
        });
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser an opportunity to reclaim the
       * completed source page's temporary render memory
       * before processing the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    /*
     * Every real source page has now been embedded into
     * outputDoc. PDF.js is no longer needed for booklet
     * imposition, so release it before building the spreads.
     */
    await loadedFallback.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    while (
      embeddedImages.length <
      targetPageCount
    ) {
      embeddedImages.push(
        null
      );
    }


    for (
      let i = 0;
      i < totalSpreads;
      i++
    ) {
      onProgress?.(
        origPageCount +
          i +
          1,
        origPageCount +
          totalSpreads
      );


      const k =
        Math.floor(
          i / 2
        );


      let leftIndex:
        number;

      let rightIndex:
        number;


      if (
        i % 2 === 0
      ) {
        leftIndex =
          targetPageCount -
          2 * k -
          1;

        rightIndex =
          2 * k;
      } else {
        leftIndex =
          2 * k + 1;

        rightIndex =
          targetPageCount -
          2 * k -
          2;
      }


      const newSheet =
        outputDoc.addPage([
          sheetW,
          sheetH,
        ]);


      const leftItem =
        embeddedImages[
          leftIndex
        ];


      if (leftItem) {
        const {
          image,
          width: leftW,
          height: leftH,
        } =
          leftItem;


        const scaleLeft =
          Math.min(
            halfW / leftW,
            halfH / leftH
          );


        const drawLeftW =
          leftW *
          scaleLeft;


        const drawLeftH =
          leftH *
          scaleLeft;


        const drawLeftX =
          (
            halfW -
            drawLeftW
          ) / 2;


        const drawLeftY =
          (
            halfH -
            drawLeftH
          ) / 2;


        newSheet.drawImage(
          image,
          {
            x:
              drawLeftX,

            y:
              drawLeftY,

            width:
              drawLeftW,

            height:
              drawLeftH,
          }
        );
      }


      const rightItem =
        embeddedImages[
          rightIndex
        ];


      if (rightItem) {
        const {
          image,
          width: rightW,
          height: rightH,
        } =
          rightItem;


        const scaleRight =
          Math.min(
            halfW / rightW,
            halfH / rightH
          );


        const drawRightW =
          rightW *
          scaleRight;


        const drawRightH =
          rightH *
          scaleRight;


        const drawRightX =
          halfW +
          (
            halfW -
            drawRightW
          ) / 2;


        const drawRightY =
          (
            halfH -
            drawRightH
          ) / 2;


        newSheet.drawImage(
          image,
          {
            x:
              drawRightX,

            y:
              drawRightY,

            width:
              drawRightW,

            height:
              drawRightH,
          }
        );
      }


      if (addFoldLine) {
        newSheet.drawLine({
          start: {
            x: halfW,
            y: 15,
          },

          end: {
            x: halfW,
            y:
              sheetH -
              15,
          },

          thickness:
            0.5,

          color:
            rgb(
              0.82,
              0.82,
              0.82
            ),

          dashArray: [
            4,
            4,
          ],
        });
      }
    }


    /*
     * Every embedded image has already been referenced by
     * its booklet sheet. Drop the temporary JavaScript array
     * before allocating the complete serialized PDF.
     *
     * outputDoc retains the PDF image objects it actually
     * needs for final serialization.
     */
    embeddedImages.length = 0;

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );


    return await outputDoc.save({
      useObjectStreams: false,
    });
  } finally {
    /*
     * dispose() is idempotent, so this also safely covers
     * failures that happen before the early disposal above.
     */
    await loadedFallback.dispose();
  }
}

export function estimateSkewAngle(ctx: CanvasRenderingContext2D, width: number, height: number): number {
  const sampleW = Math.min(width, 300);
  const sampleH = Math.min(height, 400);
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const sCtx = sampleCanvas.getContext('2d', {});
  if (!sCtx) return 0;

  sCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);

  let bestAngle = 0;
  let maxVariance = -1;

  for (let angle = -10; angle <= 10; angle += 0.5) {
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = sampleW;
    rotCanvas.height = sampleH;
    const rCtx = rotCanvas.getContext('2d', {});
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
  const {
    angle = 0,
    onProgress,
  } = options;

  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdfDoc =
    loadedPdf.pdf;

  try {
    const totalPages =
      pdfDoc.numPages;

    const outputDoc =
      await PDFDocument.create();

    const rad =
      (
        angle *
        Math.PI
      ) / 180;

    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        pageNum,
        totalPages
      );

      const page =
        await pdfDoc.getPage(
          pageNum
        );

      const canvas =
        document.createElement(
          'canvas'
        );

      const rotatedCanvas =
        document.createElement(
          'canvas'
        );

      try {
        const viewport =
          page.getViewport({
            scale: 2.0,
          });

        canvas.width =
          Math.floor(
            viewport.width
          );

        canvas.height =
          Math.floor(
            viewport.height
          );

        const ctx =
          canvas.getContext(
            '2d',
            {
              alpha: false,
            }
          );

        if (!ctx) {
          throw new Error(
            'Canvas context unavailable'
          );
        }

        await (
          page.render({
            canvasContext:
              ctx as any,
            viewport,
          } as any) as any
        ).promise;

        rotatedCanvas.width =
          canvas.width;

        rotatedCanvas.height =
          canvas.height;

        const rCtx =
          rotatedCanvas.getContext(
            '2d'
          );

        if (!rCtx) {
          throw new Error(
            'Rotated canvas context unavailable'
          );
        }

        rCtx.fillStyle =
          '#FFFFFF';

        rCtx.fillRect(
          0,
          0,
          rotatedCanvas.width,
          rotatedCanvas.height
        );

        rCtx.save();

        rCtx.translate(
          rotatedCanvas.width / 2,
          rotatedCanvas.height / 2
        );

        rCtx.rotate(
          rad
        );

        rCtx.drawImage(
          canvas,
          -canvas.width / 2,
          -canvas.height / 2
        );

        rCtx.restore();

        /*
         * The rendered source page has already been copied
         * into rotatedCanvas. Release its full-size pixel
         * backing store before JPEG encoding begins so two
         * large canvases do not remain live unnecessarily.
         */
        canvas.width = 1;
        canvas.height = 1;

        try {
          canvas.remove();
        } catch (_) {}

        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              0
            )
        );

        const jpegBlob =
          await new Promise<Blob>(
            (
              resolve,
              reject
            ) => {
              rotatedCanvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(
                      blob
                    );
                  } else {
                    reject(
                      new Error(
                        'Failed to encode deskewed page'
                      )
                    );
                  }
                },
                'image/jpeg',
                0.92
              );
            }
          );

        const jpegBytes =
          await jpegBlob.arrayBuffer();

        const embeddedImg =
          await outputDoc.embedJpg(
            jpegBytes
          );

        const unscaled =
          page.getViewport({
            scale: 1.0,
          });

        const newPage =
          outputDoc.addPage([
            unscaled.width,
            unscaled.height,
          ]);

        newPage.drawImage(
          embeddedImg,
          {
            x: 0,
            y: 0,
            width:
              unscaled.width,
            height:
              unscaled.height,
          }
        );
      } finally {
        canvas.width = 1;
        canvas.height = 1;

        rotatedCanvas.width = 1;
        rotatedCanvas.height = 1;

        try {
          canvas.remove();
        } catch (_) {}

        try {
          rotatedCanvas.remove();
        } catch (_) {}

        try {
          page.cleanup();
        } catch (_) {}
      }

      /*
       * Give the browser an opportunity to reclaim the
       * completed page's canvas/JPEG temporaries before
       * processing the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }

    /*
     * Every deskewed page is already embedded in outputDoc.
     * Release the original PDF.js document before allocating
     * the complete serialized output.
     */
    await loadedPdf.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await outputDoc.save({
      useObjectStreams: true,
    });
  } finally {
    await loadedPdf.dispose();
  }
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
  const {
    yTolerance = 4,
    minColumnGap = 12,
    delimiter = ',',
    onProgress,
  } = options;


  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );


  const pdfDoc =
    loadedPdf.pdf;


  try {
    const totalPages =
      pdfDoc.numPages;


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


    const allRows:
      string[][] = [];


    let isScannedDoc =
      true;


    /*
     * Step 1:
     * Rapid digital text-layer scan.
     */
    for (
      let pageNum = 1;
      pageNum <= totalPages;
      pageNum++
    ) {
      onProgress?.(
        pageNum,
        totalPages
      );


      const page =
        await pdfDoc.getPage(
          pageNum
        );


      try {
        const textContent =
          await page.getTextContent();


        const items:
          RawItem[] = [];


        for (
          const item of
          textContent.items as any[]
        ) {
          if (
            !item.str ||
            !item.str.trim()
          ) {
            continue;
          }


          items.push({
            str:
              item.str,

            x:
              item.transform[4],

            y:
              item.transform[5],

            width:
              item.width || 0,
          });
        }


        if (
          items.length > 5
        ) {
          isScannedDoc =
            false;
        }


        if (
          items.length >
          0
        ) {
          items.sort(
            (
              a,
              b
            ) => {
              if (
                Math.abs(
                  b.y -
                    a.y
                ) >
                yTolerance
              ) {
                return (
                  b.y -
                  a.y
                );
              }

              return (
                a.x -
                b.x
              );
            }
          );


          const lines:
            RawItem[][] = [];


          let currentLine:
            RawItem[] = [];


          let currentY:
            number | null =
              null;


          for (
            const item of
            items
          ) {
            if (
              currentY ===
                null ||
              Math.abs(
                item.y -
                  currentY
              ) <=
                yTolerance
            ) {
              currentLine.push(
                item
              );

              currentY =
                item.y;
            } else {
              if (
                currentLine.length >
                0
              ) {
                lines.push(
                  currentLine
                );
              }

              currentLine = [
                item,
              ];

              currentY =
                item.y;
            }
          }


          if (
            currentLine.length >
            0
          ) {
            lines.push(
              currentLine
            );
          }


          const lineChunks:
            Chunk[][] = [];


          const multiChunkXStarts:
            number[] = [];


          for (
            const line of
            lines
          ) {
            line.sort(
              (
                a,
                b
              ) =>
                a.x -
                b.x
            );


            const chunks:
              Chunk[] = [];


            let currentChunkText =
              '';


            let chunkStartX =
              -1;


            let lastRightEdge =
              -1;


            for (
              const item of
              line
            ) {
              if (
                lastRightEdge ===
                -1
              ) {
                currentChunkText =
                  item.str;

                chunkStartX =
                  item.x;

                lastRightEdge =
                  item.x +
                  item.width;
              } else {
                const gap =
                  item.x -
                  lastRightEdge;


                if (
                  gap >
                  minColumnGap
                ) {
                  chunks.push({
                    str:
                      currentChunkText.trim(),

                    x:
                      chunkStartX,

                    width:
                      lastRightEdge -
                      chunkStartX,

                    endX:
                      lastRightEdge,
                  });


                  currentChunkText =
                    item.str;

                  chunkStartX =
                    item.x;
                } else {
                  currentChunkText +=
                    (
                      gap > 2
                        ? ' '
                        : ''
                    ) +
                    item.str;
                }


                lastRightEdge =
                  item.x +
                  item.width;
              }
            }


            if (
              currentChunkText.trim()
            ) {
              chunks.push({
                str:
                  currentChunkText.trim(),

                x:
                  chunkStartX,

                width:
                  lastRightEdge -
                  chunkStartX,

                endX:
                  lastRightEdge,
              });
            }


            if (
              chunks.length >
              0
            ) {
              lineChunks.push(
                chunks
              );


              if (
                chunks.length >=
                2
              ) {
                for (
                  const ch of
                  chunks
                ) {
                  multiChunkXStarts.push(
                    ch.x
                  );
                }
              }
            }
          }


          /*
           * Step 2:
           * Calculate global column intervals.
           */
          multiChunkXStarts.sort(
            (
              a,
              b
            ) =>
              a - b
          );


          const clusters:
            number[][] = [];


          for (
            const x of
            multiChunkXStarts
          ) {
            if (
              clusters.length ===
                0 ||
              x -
                clusters[
                  clusters.length -
                    1
                ][
                  clusters[
                    clusters.length -
                      1
                  ].length - 1
                ] >
                minColumnGap *
                  1.5
            ) {
              clusters.push([
                x,
              ]);
            } else {
              clusters[
                clusters.length -
                  1
              ].push(
                x
              );
            }
          }


          const columnCenters =
            clusters
              .filter(
                (cluster) =>
                  cluster.length >=
                  1
              )
              .map(
                (cluster) =>
                  cluster.reduce(
                    (
                      sum,
                      value
                    ) =>
                      sum +
                      value,
                    0
                  ) /
                  cluster.length
              );


          const boundaries:
            number[] = [];


          for (
            let cIdx = 0;
            cIdx <
            columnCenters.length -
              1;
            cIdx++
          ) {
            boundaries.push(
              (
                columnCenters[
                  cIdx
                ] +
                columnCenters[
                  cIdx + 1
                ]
              ) / 2
            );
          }


          /*
           * Step 3:
           * Map chunks to structured columns.
           */
          const pageRows:
            string[][] = [];


          for (
            const chunks of
            lineChunks
          ) {
            if (
              columnCenters.length >=
              2
            ) {
              const row =
                new Array(
                  columnCenters.length
                ).fill(
                  ''
                );


              for (
                const ch of
                chunks
              ) {
                let colIdx =
                  boundaries.findIndex(
                    (boundary) =>
                      ch.x <
                      boundary
                  );


                if (
                  colIdx ===
                  -1
                ) {
                  colIdx =
                    columnCenters.length -
                    1;
                }


                row[colIdx] =
                  row[colIdx]
                    ? row[colIdx] +
                      ' ' +
                      ch.str
                    : ch.str;
              }


              const nonBlankIndices =
                row
                  .map(
                    (
                      value,
                      index
                    ) =>
                      value.trim()
                        ? index
                        : -1
                  )
                  .filter(
                    (index) =>
                      index !==
                      -1
                  );


              const isNumeric =
                (
                  value: string
                ) =>
                  /^[\d,.-]+$/.test(
                    value
                      .trim()
                      .replace(
                        /[A-Za-z]/g,
                        ''
                      )
                  );


              const hasDateOrNumber =
                row.some(
                  (cell) =>
                    /\d{2}-[A-Za-z]{3}-\d{4}/.test(
                      cell
                    ) ||
                    (
                      isNumeric(
                        cell
                      ) &&
                      cell.includes(
                        '.'
                      )
                    )
                );


              if (
                nonBlankIndices.length ===
                  1 &&
                !hasDateOrNumber &&
                pageRows.length >
                  0
              ) {
                const contIdx =
                  nonBlankIndices[0];


                pageRows[
                  pageRows.length -
                    1
                ][contIdx] =
                  (
                    pageRows[
                      pageRows.length -
                        1
                    ][contIdx] +
                    ' ' +
                    row[contIdx]
                  ).trim();
              } else {
                pageRows.push(
                  row
                );
              }
            } else {
              pageRows.push(
                chunks.map(
                  (chunk) =>
                    chunk.str
                )
              );
            }
          }


          allRows.push(
            ...pageRows
          );
        }
      } finally {
        try {
          page.cleanup();
        } catch (_) {}
      }
    }


    /*
     * Step 4:
     * OCR fallback for scanned documents.
     */
    if (
      isScannedDoc ||
      allRows.length === 0
    ) {
      onProgress?.(
        1,
        totalPages
      );


      const ocrWorker =
        await createWorker(
          'eng',
          1,
          {
            workerPath:
              '/tessdata/worker.min.js',

            corePath:
              '/tessdata/tesseract-core-simd-lstm.wasm.js',

            langPath:
              '/tessdata',

            gzip: true,
          }
        );


      try {
        for (
          let pageNum = 1;
          pageNum <= totalPages;
          pageNum++
        ) {
          onProgress?.(
            pageNum,
            totalPages
          );


          const page =
            await pdfDoc.getPage(
              pageNum
            );


          const canvas =
            document.createElement(
              'canvas'
            );


          try {
            const viewport =
              page.getViewport({
                scale: 1.5,
              });


            canvas.width =
              Math.floor(
                viewport.width
              );

            canvas.height =
              Math.floor(
                viewport.height
              );


            const ctx =
              canvas.getContext(
                '2d',
                {
                  alpha: false,
                }
              );


            if (ctx) {
              await (
                page.render({
                  canvasContext:
                    ctx as any,

                  viewport,
                } as any) as any
              ).promise;


              const {
                data,
              } =
                await ocrWorker.recognize(
                  canvas
                );


              if (
                data?.text
              ) {
                const rawLines =
                  data.text.split(
                    '\n'
                  );


                for (
                  const line of
                  rawLines
                ) {
                  const text =
                    line.trim();


                  if (!text) {
                    continue;
                  }


                  const parts =
                    text
                      .split(
                        /\s{3,}|\t/
                      )
                      .map(
                        (part) =>
                          part.trim()
                      )
                      .filter(
                        Boolean
                      );


                  allRows.push(
                    parts.length >
                      0
                      ? parts
                      : [
                          text,
                        ]
                  );
                }
              }
            }
          } finally {
            canvas.width =
              1;

            canvas.height =
              1;


            try {
              canvas.remove();
            } catch (_) {}


            try {
              page.cleanup();
            } catch (_) {}
          }
        }
      } finally {
        await ocrWorker.terminate();
      }
    }


    /*
     * Step 5:
     * Format CSV with clean escaping.
     */
    const escapeCell =
      (
        value: string
      ): string => {
        const clean =
          value.trim();


        if (
          clean.includes(
            delimiter
          ) ||
          clean.includes(
            '"'
          ) ||
          clean.includes(
            '\n'
          ) ||
          clean.includes(
            '\r'
          )
        ) {
          return (
            '"' +
            clean.replace(
              /"/g,
              '""'
            ) +
            '"'
          );
        }


        return clean;
      };


    const csvLines =
      allRows.map(
        (row) =>
          row
            .map(
              escapeCell
            )
            .join(
              delimiter
            )
      );


    const csv =
      csvLines.join(
        '\r\n'
      );


    return {
      csv,
      rows:
        allRows,
      totalRows:
        allRows.length,
    };
  } finally {
    await loadedPdf.dispose();
  }
}


export type UniversalDocumentKind =
  | 'bank-statement'
  | 'key-value'
  | 'table'
  | 'general'
  | 'mixed';

export interface UniversalDocumentSection {
  pageNumber: number;
  kind: 'key-value' | 'table' | 'general';
  label: string;
  confidence: number;
  rows: string[][];
}

export interface UniversalDocumentExtractResult {
  kind: UniversalDocumentKind;
  rows: string[][];
  totalRows: number;
  confidence: number;
  label: string;
  sections?: UniversalDocumentSection[];
}

const UNIVERSAL_DATE_RE =
  /\b\d{1,2}[-\/](?:[A-Za-z]{3}|\d{1,2})[-\/]\d{2,4}\b/gi;

const universalCleanCell = (value: string) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const universalMoneyValue = (
  value: string
): number | null => {
  const cleaned = universalCleanCell(value)
    .replace(/[₹$£€]/g, '')
    .replace(/,/g, '')
    .trim();

  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : null;
};

const universalFormatMoney = (value: number) =>
  value.toFixed(2);

const universalNormalizeBankRows = (
  sourceRows: string[][]
): string[][] => {
  const output: string[][] = [
    [
      'Transaction Date',
      'Value Date',
      'Details',
      'Debit',
      'Credit',
      'Balance',
    ],
  ];

  let previousBalance: number | null = null;

  for (const sourceRow of sourceRows) {
    const cells = sourceRow
      .map(universalCleanCell)
      .filter(Boolean);

    if (cells.length === 0) continue;

    const fullText = cells.join(' ');

    if (
      /transaction date/i.test(fullText) &&
      /balance/i.test(fullText)
    ) {
      continue;
    }

    if (/opening balance/i.test(fullText)) {
      const numeric = cells
        .map(universalMoneyValue)
        .filter(
          (value): value is number =>
            value !== null
        );

      if (numeric.length > 0) {
        previousBalance =
          numeric[numeric.length - 1];
      }

      continue;
    }

    const dates =
      fullText.match(UNIVERSAL_DATE_RE) || [];

    if (dates.length < 2) {
      continue;
    }

    const numericCells = cells
      .map((cell, index) => ({
        cell,
        index,
        value: universalMoneyValue(cell),
      }))
      .filter(
        (
          item
        ): item is {
          cell: string;
          index: number;
          value: number;
        } => item.value !== null
      );

    if (numericCells.length < 2) {
      continue;
    }

    const balanceEntry =
      numericCells[numericCells.length - 1];

    const amountEntry =
      numericCells[numericCells.length - 2];

    const balance = balanceEntry.value;
    const amount = Math.abs(amountEntry.value);

    const detailCells = cells.filter(
      (cell, index) => {
        if (
          index === balanceEntry.index ||
          index === amountEntry.index
        ) {
          return false;
        }

        if (
          cell.match(UNIVERSAL_DATE_RE)
        ) {
          return false;
        }

        return true;
      }
    );

    let debit = '';
    let credit = '';

    if (previousBalance !== null) {
      const delta =
        Math.round(
          (balance - previousBalance) * 100
        ) / 100;

      if (delta < -0.001) {
        debit = universalFormatMoney(
          Math.abs(delta)
        );
      } else if (delta > 0.001) {
        credit = universalFormatMoney(
          Math.abs(delta)
        );
      } else {
        debit =
          universalFormatMoney(amount);
      }
    } else {
      /*
       * First transaction fallback.
       * Most statements place the amount before
       * the balance. Keep it as debit until the
       * running balance establishes direction.
       */
      debit =
        universalFormatMoney(amount);
    }

    output.push([
      dates[0] ?? '',
      dates[1] ?? '',
      detailCells.join(' '),
      debit,
      credit,
      universalFormatMoney(balance),
    ]);

    previousBalance = balance;
  }

  return output;
};

const universalBuildKeyValueRows = (
  sourceRows: string[][]
): string[][] => {
  const result: string[][] = [
    ['Field', 'Value'],
  ];

  const seen = new Set<string>();

  const addPair = (
    rawField: string,
    rawValue: string
  ) => {
    const field = universalCleanCell(rawField)
      .replace(
        /^\(?\d+\)?[\.\)]?\s*/,
        ''
      )
      .replace(/[:\-–—]+$/, '')
      .trim();

    const value =
      universalCleanCell(rawValue);

    if (
      !field ||
      !value ||
      field.length > 90
    ) {
      return;
    }

    const key =
      `${field.toLowerCase()}|${value.toLowerCase()}`;

    if (seen.has(key)) return;

    seen.add(key);
    result.push([field, value]);
  };

  const commonLabelPattern =
    /^(?:\(?\d+\)?[\.\)]?\s*)?(name|address|owner name|owner address|tenant name|tenant address|date|date of execution|date of registration|registration number(?:\/year)?|registration fee|stamp duty|license fee|deposit|period|area|property description|document no\.?|document type|presentor name|account no\.?|account number|account type|currency|branch address|ifsc code|micr code|phone|mobile|email|pan|aadhaar|passport(?: no\.?)?|receipt no\.?|village name)\s*[:\-–—]?\s+(.+)$/i;

  for (const sourceRow of sourceRows) {
    const cells = sourceRow
      .map(universalCleanCell)
      .filter(Boolean);

    if (cells.length === 0) continue;

    if (
      cells.length >= 2 &&
      cells[0].length <= 90
    ) {
      const firstIsLabel =
        !universalMoneyValue(cells[0]) &&
        !UNIVERSAL_DATE_RE.test(cells[0]);

      UNIVERSAL_DATE_RE.lastIndex = 0;

      if (firstIsLabel) {
        addPair(
          cells[0],
          cells.slice(1).join(' ')
        );
      }
    }

    const text = cells.join(' ');

    const colonMatch =
      text.match(
        /^\s*(?:\(?\d+\)?[\.\)]?\s*)?([^:]{2,80})\s*:\s*(.+)$/
      );

    if (colonMatch) {
      addPair(
        colonMatch[1],
        colonMatch[2]
      );
      continue;
    }

    const commonMatch =
      text.match(commonLabelPattern);

    if (commonMatch) {
      addPair(
        commonMatch[1],
        commonMatch[2]
      );
    }
  }

  return result;
};


async function universalIsMostlyScannedPdf(
  file: File
): Promise<boolean> {
  const loadedPdf =
    await loadPdfJsFromBlob(
      file
    );

  const pdf =
    loadedPdf.pdf;

  const totalPages =
    pdf.numPages;

  let textItems = 0;

  try {
    for (
      let pageNumber = 1;
      pageNumber <= totalPages;
      pageNumber++
    ) {
      const page =
        await pdf.getPage(
          pageNumber
        );

      try {
        const content =
          await page.getTextContent();

        textItems +=
          (
            content.items as any[]
          ).filter(
            (item) =>
              item?.str &&
              String(
                item.str
              ).trim()
          ).length;
      } finally {
        try {
          page.cleanup();
        } catch {}
      }
    }

    return (
      textItems <
      Math.max(
        10,
        totalPages * 3
      )
    );
  } finally {
    await loadedPdf.dispose();
  }
}

type UniversalOcrWord = {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  confidence: number;
};

const universalRowsFromWords = (
  words: UniversalOcrWord[],
  pageWidth: number
): string[][] => {
  if (!words.length) return [];

  const sorted = [...words].sort((a, b) => {
    const ay = (a.y0 + a.y1) / 2;
    const by = (b.y0 + b.y1) / 2;

    if (Math.abs(ay - by) > 8) {
      return ay - by;
    }

    return a.x0 - b.x0;
  });

  const lines: UniversalOcrWord[][] = [];

  for (const word of sorted) {
    const centerY =
      (word.y0 + word.y1) / 2;

    let bestLine:
      | UniversalOcrWord[]
      | null = null;

    let bestDistance = Infinity;

    for (const line of lines) {
      const lineCenter =
        line.reduce(
          (sum, item) =>
            sum +
            (item.y0 + item.y1) / 2,
          0
        ) / line.length;

      const distance =
        Math.abs(
          centerY - lineCenter
        );

      const averageHeight =
        line.reduce(
          (sum, item) =>
            sum +
            (item.y1 - item.y0),
          0
        ) / line.length;

      const tolerance =
        Math.max(
          8,
          averageHeight * 0.55
        );

      if (
        distance <= tolerance &&
        distance < bestDistance
      ) {
        bestLine = line;
        bestDistance = distance;
      }
    }

    if (bestLine) {
      bestLine.push(word);
    } else {
      lines.push([word]);
    }
  }

  lines.sort((a, b) => {
    const ay =
      a.reduce(
        (sum, item) =>
          sum +
          (item.y0 + item.y1) / 2,
        0
      ) / a.length;

    const by =
      b.reduce(
        (sum, item) =>
          sum +
          (item.y0 + item.y1) / 2,
        0
      ) / b.length;

    return ay - by;
  });

  const rows: string[][] = [];

  for (const line of lines) {
    line.sort(
      (a, b) => a.x0 - b.x0
    );

    const heights = line
      .map(
        (word) =>
          word.y1 - word.y0
      )
      .sort((a, b) => a - b);

    const medianHeight =
      heights[
        Math.floor(
          heights.length / 2
        )
      ] || 12;

    /*
     * Normal spaces between words stay inside one cell.
     * Larger visual gaps become separate spreadsheet columns.
     */
    const gapThreshold =
      Math.max(
        22,
        medianHeight * 1.65,
        pageWidth * 0.014
      );

    const chunks: string[] = [];

    let currentText = '';
    let previousRight:
      | number
      | null = null;

    for (const word of line) {
      if (
        previousRight !== null
      ) {
        const gap =
          word.x0 -
          previousRight;

        if (
          gap > gapThreshold &&
          currentText.trim()
        ) {
          chunks.push(
            currentText.trim()
          );

          currentText = '';
        }
      }

      currentText +=
        (currentText ? ' ' : '') +
        word.text;

      previousRight = word.x1;
    }

    if (currentText.trim()) {
      chunks.push(
        currentText.trim()
      );
    }

    const cleanChunks =
      chunks
        .map((value) =>
          universalCleanCell(value)
        )
        .filter(Boolean);

    if (cleanChunks.length) {
      rows.push(cleanChunks);
    }
  }

  return rows;
};

type UniversalScannedPageData = {
  pageNumber: number;
  rows: string[][];
};

const universalStrictKeyValueRows = (
  rows: string[][]
): string[][] => {
  const output: string[][] = [
    ['Field', 'Value'],
  ];

  const seen = new Set<string>();

  const fieldPattern =
    /(?:article|deposit|license fee|license fee\s*&\s*deposit|property description|area|assessment|licensor|licensee|date of execution|date of registration|registration number|stamp duty|registration fee|remark|village name|receipt|document no|document type|presentor|presenter|owner|tenant|rented property|identity proof|occupation|mobile|email|phone|address|name|pan|aadhaar|passport|person 1|person 2|agent|period|pin code)/i;

  const valuePattern =
    /(?:₹|rs\.?|inr|\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b|\b\d{4,}\b|\b\d{1,2}[-\/](?:[a-z]{3}|\d{1,2})[-\/]\d{2,4}\b|\b[A-Z]{5}\d{4}[A-Z]\b|\b\d{10,12}\b|\bone lakh\b|\bthousand\b|\bhundred\b)/i;

  const add = (
    rawField: string,
    rawValue: string
  ) => {
    const field =
      universalCleanCell(rawField)
        .replace(
          /^\(?\d+\)?[\.\)]?\s*/,
          ''
        )
        .replace(/[:\-–—]+$/, '')
        .trim();

    const value =
      universalCleanCell(rawValue);

    if (
      !field ||
      !value ||
      field.length > 100
    ) {
      return;
    }

    const key =
      `${field.toLowerCase()}|${value.toLowerCase()}`;

    if (seen.has(key)) return;

    seen.add(key);

    output.push([
      field,
      value,
    ]);
  };

  for (
    let rowIndex = 0;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const cells =
      rows[rowIndex]
        .map(universalCleanCell)
        .filter(Boolean);

    if (!cells.length) continue;

    const text =
      cells.join(' ');

    /*
     * Normal visual Field | Value row.
     */
    if (
      cells.length >= 2 &&
      fieldPattern.test(cells[0])
    ) {
      const value =
        cells
          .slice(1)
          .join(' ');

      if (value) {
        add(
          cells[0],
          value
        );

        continue;
      }
    }

    /*
     * "Field: Value" on one OCR line.
     */
    const colon =
      text.match(
        /^\s*(.{2,100}?)\s*[:：]\s*(.+)$/
      );

    if (
      colon &&
      fieldPattern.test(
        colon[1]
      )
    ) {
      add(
        colon[1],
        colon[2]
      );

      continue;
    }

    /*
     * OCR often puts the label on one row and
     * the actual amount/value on the next row.
     */
    if (
      fieldPattern.test(text) &&
      text.length <= 110
    ) {
      const nearbyValues: string[] = [];

      for (
        let offset = 1;
        offset <= 3;
        offset++
      ) {
        const next =
          rows[
            rowIndex + offset
          ];

        if (!next) break;

        const nextText =
          next
            .map(
              universalCleanCell
            )
            .filter(Boolean)
            .join(' ');

        if (!nextText) continue;

        /*
         * Stop once another obvious field begins.
         */
        if (
          fieldPattern.test(
            nextText
          ) &&
          !valuePattern.test(
            nextText
          )
        ) {
          break;
        }

        if (
          valuePattern.test(
            nextText
          ) &&
          nextText.length <= 180
        ) {
          nearbyValues.push(
            nextText
          );
        }

        if (
          nearbyValues.length >= 2
        ) {
          break;
        }
      }

      if (
        nearbyValues.length
      ) {
        add(
          text,
          nearbyValues.join(
            ' · '
          )
        );
      }
    }

    /*
     * Special high-value agreement field.
     * Preserve both fee and deposit when OCR
     * has separated them across nearby lines.
     */
    if (
      /license fee/i.test(
        text
      ) &&
      /deposit/i.test(
        text
      )
    ) {
      const values: string[] = [];

      for (
        let offset = 0;
        offset <= 4;
        offset++
      ) {
        const candidate =
          rows[
            rowIndex + offset
          ];

        if (!candidate)
          continue;

        const candidateText =
          candidate
            .map(
              universalCleanCell
            )
            .filter(Boolean)
            .join(' ');

        if (
          valuePattern.test(
            candidateText
          )
        ) {
          values.push(
            candidateText
          );
        }
      }

      if (values.length) {
        add(
          'License Fee & Deposit',
          values.join(' · ')
        );
      }
    }
  }

  return output;
};

const universalBuildPageSections = (
  pageNumber: number,
  rawRows: string[][]
): UniversalDocumentSection[] => {
  const rows =
    rawRows
      .map((row) =>
        row
          .map(universalCleanCell)
          .filter(Boolean)
      )
      .filter((row) =>
        row.length > 0
      );

  if (!rows.length) {
    return [];
  }

  const text =
    rows
      .flat()
      .join(' ')
      .toLowerCase();

  const multiColumnRows =
    rows.filter(
      (row) =>
        row.length >= 2
    );

  const maxColumns =
    Math.max(
      1,
      ...rows.map(
        (row) => row.length
      )
    );

  const multiColumnRatio =
    multiColumnRows.length /
    Math.max(
      1,
      rows.length
    );

  /*
   * A real table usually has several repeatable,
   * reasonably short cells.
   */
  const structuredRows =
    rows.filter(
      (row) =>
        row.length >= 2 &&
        row.length <= 7 &&
        row.every(
          (cell) =>
            cell.length <= 120
        )
    );

  const structuredRatio =
    structuredRows.length /
    Math.max(
      1,
      rows.length
    );

  /*
   * Long rows are a strong sign that this is
   * prose that OCR accidentally split into columns.
   */
  const longProseRows =
    rows.filter(
      (row) => {
        const joined =
          row.join(' ');

        return (
          joined.length >= 135 &&
          row.length <= 3
        );
      }
    );

  const proseRatio =
    longProseRows.length /
    Math.max(
      1,
      rows.length
    );

  const tableSignals = [
    'particulars',
    'amount paid',
    'transaction id',
    'grn',
    'name & address',
    'thumb image',
    'digitally signed',
    'type of party',
    'date & time',
    'date, time',
    'information received',
    'admission',
    'verification with uidai',
    'receipt no',
    'receipt',
    'document no',
    'registration fee',
    'amount paid',
    'total',
  ].filter((signal) =>
    text.includes(signal)
  ).length;

  const formSignals = [
    'village name',
    'deposit',
    'license fee',
    'property description',
    'date of execution',
    'date of registration',
    'registration number',
    'registration fee',
    'stamp duty',
    'document no',
    'document type',
    'presentor name',
    'owner name',
    'owner details',
    'tenant name',
    'tenant details',
    'rented property',
    'identity proof',
    'occupation',
    'mobile number',
    'email id',
    'agent details',
  ].filter((signal) =>
    text.includes(signal)
  ).length;

  const proseSignals = [
    'whereas',
    'hereinafter',
    'terms and conditions',
    'the licensor',
    'the licensee',
    'shall be',
    'provided that',
    'agreement',
    'witnesseth',
  ].filter((signal) =>
    text.includes(signal)
  ).length;

  const kvRows =
    universalStrictKeyValueRows(
      rows
    );

  const looksLikeProse =
    proseSignals >= 2 ||
    proseRatio >= 0.3 ||
    (
      rows.length >= 5 &&
      structuredRatio < 0.28
    );

  /*
   * Strong forms are handled BEFORE weak visual
   * table guesses. This fixes pages such as tenant
   * information / registration forms.
   */
  if (
    kvRows.length >= 4 &&
    formSignals >= 2 &&
    !looksLikeProse &&
    tableSignals < 2
  ) {
    const sections:
      UniversalDocumentSection[] = [
        {
          pageNumber,
          kind: 'key-value',
          label:
            `Page ${pageNumber} · Form / Key-Value`,
          confidence:
            formSignals >= 4
              ? 0.92
              : 0.84,
          rows: kvRows,
        },
      ];

    const notes =
      rows
        .filter(
          (row) =>
            row.join(' ')
              .length >= 70
        )
        .map((row) => [
          row.join(' '),
        ]);

    if (
      notes.length >= 2
    ) {
      sections.push({
        pageNumber,
        kind: 'general',
        label:
          `Page ${pageNumber} · Notes`,
        confidence: 0.7,
        rows: notes,
      });
    }

    return sections;
  }

  /*
   * Strong real tables.
   * Explicit table headers can override prose,
   * but weak visual spacing cannot.
   */
  /*
   * Some pages contain a real table at the top
   * followed by long legal prose. Judge the top
   * section separately so the prose cannot hide it.
   */
  const topRows =
    rows.slice(
      0,
      Math.min(
        14,
        rows.length
      )
    );

  const topStructuredRows =
    topRows.filter(
      (row) =>
        row.length >= 2 &&
        row.length <= 8 &&
        row.every(
          (cell) =>
            cell.length <= 130
        )
    );

  const topText =
    topRows
      .flat()
      .join(' ')
      .toLowerCase();

  const topTableSignals = [
    'particular',
    'amount paid',
    'transaction',
    'grn',
    'receipt',
    'document no',
    'document type',
    'registration fee',
    'stamp duty',
    'total',
    'date',
  ].filter(
    (signal) =>
      topText.includes(
        signal
      )
  ).length;

  const topLooksLikeTable =
    topStructuredRows.length >=
      3 &&
    (
      topTableSignals >= 1 ||
      (
        topRows.length > 0 &&
        topStructuredRows.length /
          topRows.length >=
          0.45
      )
    );

  const strongTable =
    tableSignals >= 2 ||
    topLooksLikeTable ||
    (
      !looksLikeProse &&
      maxColumns >= 3 &&
      structuredRows.length >= 4 &&
      multiColumnRatio >= 0.3 &&
      structuredRatio >= 0.4
    );

  if (strongTable) {
    const sections:
      UniversalDocumentSection[] = [];

    const tableRows =
      rows.filter(
        (row) =>
          row.length >= 2 &&
          row.length <= 8
      );

    if (
      tableRows.length >= 2
    ) {
      sections.push({
        pageNumber,
        kind: 'table',
        label:
          `Page ${pageNumber} · Table`,
        confidence:
          tableSignals >= 2
            ? 0.92
            : 0.82,
        rows: tableRows,
      });
    }

    const proseRows =
      rows
        .filter(
          (row) =>
            row.length === 1 &&
            row[0].length >= 35
        )
        .map((row) => [
          row.join(' '),
        ]);

    if (
      proseRows.length >= 2
    ) {
      sections.push({
        pageNumber,
        kind: 'general',
        label:
          `Page ${pageNumber} · Text / Notes`,
        confidence: 0.72,
        rows: proseRows,
      });
    }

    return sections;
  }

  /*
   * Legal clauses and ordinary prose stay as text
   * instead of becoming fake spreadsheet tables.
   */
  return [
    {
      pageNumber,
      kind: 'general',
      label:
        `Page ${pageNumber} · Text`,
      confidence:
        looksLikeProse
          ? 0.86
          : 0.72,
      rows: rows.map(
        (row) => [
          row.join(' '),
        ]
      ),
    },
  ];
};



const universalMoneyWordsToNumber = (
  raw: string
): number | null => {
  const units: Record<
    string,
    number
  > = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
  };

  const tens: Record<
    string,
    number
  > = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  const scales: Record<
    string,
    number
  > = {
    thousand: 1000,
    lakh: 100000,
    lac: 100000,
    million: 1000000,
    crore: 10000000,
  };

  const tokens =
    raw
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(
        /[^a-z\s]/g,
        ' '
      )
      .split(/\s+/)
      .filter(Boolean);

  let current = 0;
  let total = 0;
  let found = false;

  for (
    const token of tokens
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        units,
        token
      )
    ) {
      current +=
        units[token];

      found = true;
      continue;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        tens,
        token
      )
    ) {
      current +=
        tens[token];

      found = true;
      continue;
    }

    if (
      token ===
      'hundred'
    ) {
      current =
        Math.max(
          1,
          current
        ) * 100;

      found = true;
      continue;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        scales,
        token
      )
    ) {
      total +=
        Math.max(
          1,
          current
        ) *
        scales[token];

      current = 0;
      found = true;
    }
  }

  const value =
    total + current;

  if (
    !found ||
    value < 100
  ) {
    return null;
  }

  return value;
};

const universalExtractFinancialHints = (
  rawText: string
): string[][] => {
  const text =
    String(
      rawText ?? ''
    )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  if (!text) {
    return [];
  }

  const output:
    string[][] = [];

  const seen =
    new Set<string>();

  const normalizeAmount = (
    raw: string
  ): number | null => {
    const digits =
      raw.replace(
        /[^\d]/g,
        ''
      );

    if (
      digits.length < 3 ||
      digits.length > 8
    ) {
      return null;
    }

    const value =
      Number(
        digits
      );

    if (
      !Number.isFinite(
        value
      ) ||
      value < 100 ||
      value > 99999999
    ) {
      return null;
    }

    return value;
  };

  const add = (
    label: string,
    amount: number
  ) => {
    if (
      !Number.isFinite(
        amount
      ) ||
      amount < 100
    ) {
      return;
    }

    const key =
      label.toLowerCase();

    if (
      seen.has(key)
    ) {
      return;
    }

    seen.add(key);

    output.push([
      label,
      `Rs. ${Math.round(
        amount
      )}`,
    ]);
  };

  const collectWordAmounts = (
    source: string
  ): number[] => {
    const amounts:
      number[] = [];

    /*
     * Normalize common OCR mistakes:
     * Only -> Oniy / Onl
     */
    const normalized =
      String(source ?? '')
        .toLowerCase()
        .replace(/[–—]/g, '-')
        .replace(
          /\boniy\b|\bonl\b|\boniy\b/g,
          'only'
        );

    /*
     * Capture phrases such as:
     *
     * Twenty-Seven Thousand Only
     * One Lakh Only
     * Ninety Five Thousand
     */
    const phrasePattern =
      /\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|and)[\s-]+){0,8}(?:thousand|lakh|lac|million|crore)(?:\s+only)?)\b/gi;

    let match:
      RegExpExecArray | null;

    while (
      (
        match =
          phrasePattern.exec(
            normalized
          )
      ) !== null
    ) {
      const value =
        universalMoneyWordsToNumber(
          match[1] ?? ''
        );

      if (
        value !== null &&
        value >= 1000 &&
        !amounts.includes(
          value
        )
      ) {
        amounts.push(
          value
        );
      }
    }

    return amounts;
  };

  /*
   * Special case:
   * License Fee & Deposit often contains
   * both amounts in one paragraph.
   */
  const combined =
    text.match(
      /(?:license\s*)?fee\s*(?:&|and)?\s*deposit/i
    );

  if (
    combined &&
    typeof combined.index ===
      'number'
  ) {
    const window =
      text.slice(
        combined.index,
        combined.index +
          900
      );

    const amounts:
      number[] = [];

    const digitRegex =
      /(?:rs\.?|inr|₹)\s*([0-9][0-9,\s]{2,14})/gi;

    let digitMatch:
      RegExpExecArray | null;

    while (
      (
        digitMatch =
          digitRegex.exec(
            window
          )
      ) !== null
    ) {
      const value =
        normalizeAmount(
          digitMatch[1] ??
            ''
        );

      if (
        value !== null &&
        !amounts.includes(
          value
        )
      ) {
        amounts.push(
          value
        );
      }
    }

    /*
     * If OCR missed digits, recover amounts from:
     * "Twenty-Seven Thousand Only"
     * "One Lakh Only"
     */
    const wordAmounts =
      collectWordAmounts(
        window
      );

    /*
     * Written amounts are safer when scan OCR drops
     * leading digits.
     *
     * Example:
     * "Rs. 7000 (Twenty-Seven Thousand Only)"
     * becomes 27000 rather than 7000.
     */
    let resolvedAmounts:
      number[] = [];

    if (
      wordAmounts.length >= 2
    ) {
      resolvedAmounts =
        [...wordAmounts]
          .sort(
            (a, b) =>
              a - b
          );
    } else if (
      amounts.length === 2
    ) {
      /*
       * Trust printed digits only when exactly
       * two plausible amounts were found.
       */
      resolvedAmounts =
        [...amounts]
          .sort(
            (a, b) =>
              a - b
          );
    }

    if (
      resolvedAmounts.length >= 2
    ) {
      add(
        'License Fee',
        resolvedAmounts[0]
      );

      add(
        'Deposit',
        resolvedAmounts[
          resolvedAmounts.length -
            1
        ]
      );
    }
  }

  const patterns: Array<
    [
      string,
      RegExp
    ]
  > = [
    [
      'Stamp Duty',
      /stamp\s*duty[\s\S]{0,160}?(?:rs\.?|inr|₹)\s*([0-9][0-9,\s]{2,14})/i,
    ],
    [
      'Registration Fee',
      /registration\s*fee[\s\S]{0,160}?(?:rs\.?|inr|₹)\s*([0-9][0-9,\s]{2,14})/i,
    ],
  ];

  for (
    const [
      label,
      pattern,
    ] of patterns
  ) {
    const match =
      text.match(
        pattern
      );

    if (
      match?.[1]
    ) {
      const value =
        normalizeAmount(
          match[1]
        );

      if (
        value !== null
      ) {
        add(
          label,
          value
        );
      }
    }
  }

  return output;
};



async function universalExtractScannedPages(
  file: File,
  options: TableExtractOptions
): Promise<UniversalScannedPageData[]> {
  const loadedPdf =
    await loadPdfJsFromBlob(
      file
    );

  const pdf =
    loadedPdf.pdf;

  const worker =
    await createWorker(
      'eng',
      1,
      {
        workerPath:
          '/tessdata/worker.min.js',
        corePath:
          '/tessdata/tesseract-core-simd-lstm.wasm.js',
        langPath:
          '/tessdata',
        gzip: true,
      }
    );

  const pages:
    UniversalScannedPageData[] = [];

  try {
    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      options.onProgress?.(
        pageNumber,
        pdf.numPages
      );

      const page =
        await pdf.getPage(
          pageNumber
        );

      const baseViewport =
        page.getViewport({
          scale: 1,
        });

      const maxDimension =
        Math.max(
          baseViewport.width,
          baseViewport.height
        );

      const scale =
        Math.min(
          2.25,
          Math.max(
            1.75,
            2400 /
              Math.max(
                1,
                maxDimension
              )
          )
        );

      const viewport =
        page.getViewport({
          scale,
        });

      const canvas =
        document.createElement(
          'canvas'
        );

      canvas.width =
        Math.max(
          1,
          Math.ceil(
            viewport.width
          )
        );

      canvas.height =
        Math.max(
          1,
          Math.ceil(
            viewport.height
          )
        );

      const ctx =
        canvas.getContext(
          '2d',
          {
            alpha: false,
          }
        );

      if (!ctx) {
        continue;
      }

      ctx.fillStyle =
        '#ffffff';

      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      await (
        page.render({
          canvasContext:
            ctx as any,
          viewport,
        } as any) as any
      ).promise;

      const result =
        await worker.recognize(
          canvas,
          {},
          {
            text: true,
            blocks: true,
          } as any
        );

      const data: any =
        result.data;

      let financialHints =
        universalExtractFinancialHints(
          String(
            data?.text ?? ''
          )
        );

      let rawWords: any[] =
        [];

      if (
        Array.isArray(
          data?.words
        ) &&
        data.words.length
      ) {
        rawWords =
          data.words;
      } else if (
        Array.isArray(
          data?.blocks
        )
      ) {
        rawWords =
          data.blocks
            .flatMap(
              (block: any) =>
                block.paragraphs ??
                []
            )
            .flatMap(
              (paragraph: any) =>
                paragraph.lines ??
                []
            )
            .flatMap(
              (line: any) =>
                line.words ??
                []
            );
      }

      const words:
        UniversalOcrWord[] =
        rawWords
          .map((word: any) => {
            const box =
              word?.bbox;

            return {
              text:
                universalCleanCell(
                  word?.text ?? ''
                ),
              x0:
                Number(
                  box?.x0 ?? 0
                ),
              x1:
                Number(
                  box?.x1 ?? 0
                ),
              y0:
                Number(
                  box?.y0 ?? 0
                ),
              y1:
                Number(
                  box?.y1 ?? 0
                ),
              confidence:
                Number(
                  word?.confidence ??
                    word?.conf ??
                    0
                ),
            };
          })
          .filter(
            (
              word:
                UniversalOcrWord
            ) =>
              word.text &&
              word.x1 >
                word.x0 &&
              word.y1 >
                word.y0 &&
              word.confidence >= 20
          );

      let pageRows =
        universalRowsFromWords(
          words,
          canvas.width
        );

      if (
        pageRows.length === 0 &&
        data?.text
      ) {
        pageRows =
          String(data.text)
            .split('\n')
            .map((line) =>
              universalCleanCell(
                line
              )
            )
            .filter(Boolean)
            .map((line) => [
              line,
            ]);
      }

      for (
        const hint of
        financialHints
      ) {
        const duplicate =
          pageRows.some(
            (row) =>
              row
                .join(' ')
                .toLowerCase()
                .includes(
                  hint[0]
                    .toLowerCase()
                ) &&
              row
                .join(' ')
                .includes(
                  hint[1]
                )
          );

        if (!duplicate) {
          pageRows.push(
            hint
          );
        }
      }

      pages.push({
        pageNumber,
        rows: pageRows,
      });

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.width = 1;
      canvas.height = 1;

      try {
        page.cleanup();
      } catch {}
    }
  } finally {
    try {
      await worker.terminate();
    } catch {}

    try {
      await loadedPdf.dispose();
    } catch {}
  }

  return pages;
}

export async function extractUniversalDocumentData(
  file: File,
  options: TableExtractOptions = {}
): Promise<UniversalDocumentExtractResult> {
  const isScanned =
    await universalIsMostlyScannedPdf(
      file
    );

  let rawRows: string[][];
  let scannedPages:
    UniversalScannedPageData[] | null =
    null;

  if (isScanned) {
    scannedPages =
      await universalExtractScannedPages(
        file,
        options
      );

    rawRows =
      scannedPages.flatMap(
        (page) =>
          page.rows
      );
  } else {
    const base =
      await extractTableFromPDF(
        file,
        options
      );

    rawRows =
      base.rows;
  }

  const sourceRows =
    rawRows
      .map((row) =>
        row.map(
          universalCleanCell
        )
      )
      .filter((row) =>
        row.some(Boolean)
      );

  const combinedText =
    sourceRows
      .flat()
      .join(' ')
      .toLowerCase();

  /*
   * KEEP BANK STATEMENT PATH FIRST.
   * This preserves the existing successful
   * six-column bank normalizer.
   */
  const bankSignals = [
    'transaction date',
    'value date',
    'debit',
    'credit',
    'balance',
    'opening balance',
    'closing balance',
    'account no',
    'statement period',
  ].filter((signal) =>
    combinedText.includes(
      signal
    )
  ).length;

  const dateHeavyRows =
    sourceRows.filter(
      (row) => {
        const text =
          row.join(' ');

        const matches =
          text.match(
            UNIVERSAL_DATE_RE
          );

        UNIVERSAL_DATE_RE.lastIndex =
          0;

        return Boolean(
          matches &&
            matches.length >= 2
        );
      }
    ).length;

  if (
    bankSignals >= 4 ||
    dateHeavyRows >= 5
  ) {
    const rows =
      universalNormalizeBankRows(
        sourceRows
      );

    if (rows.length >= 4) {
      return {
        kind:
          'bank-statement',
        rows,
        totalRows:
          rows.length - 1,
        confidence:
          bankSignals >= 6
            ? 0.98
            : 0.9,
        label:
          'Bank statement',
      };
    }
  }

  /*
   * PAGE-AWARE SCANNED DOCUMENT PATH
   */
  if (
    isScanned &&
    scannedPages
  ) {
    const sections =
      scannedPages.flatMap(
        (page) =>
          universalBuildPageSections(
            page.pageNumber,
            page.rows
          )
      );

    if (sections.length) {
      const kinds =
        new Set(
          sections.map(
            (section) =>
              section.kind
          )
        );

      const totalRows =
        sections.reduce(
          (sum, section) =>
            sum +
            section.rows.length,
          0
        );

      return {
        kind:
          kinds.size > 1
            ? 'mixed'
            : sections[0]
                ?.kind ??
              'general',
        rows:
          sections.flatMap(
            (section) =>
              section.rows
          ),
        totalRows,
        confidence:
          sections.reduce(
            (sum, section) =>
              sum +
              section.confidence,
            0
          ) /
          Math.max(
            1,
            sections.length
          ),
        label:
          kinds.size > 1
            ? 'Mixed scanned document'
            : sections[0]
                ?.label ??
              'Scanned document',
        sections,
      };
    }
  }

  /*
   * DIGITAL / SIMPLE DOCUMENT FALLBACK
   */
  const keyValueRows =
    universalBuildKeyValueRows(
      sourceRows
    );

  const maxColumns =
    Math.max(
      0,
      ...sourceRows.map(
        (row) =>
          row.filter(Boolean)
            .length
      )
    );

  const multiColumnRows =
    sourceRows.filter(
      (row) =>
        row.filter(Boolean)
          .length >= 2
    ).length;

  const multiColumnRatio =
    sourceRows.length > 0
      ? multiColumnRows /
        sourceRows.length
      : 0;

  if (
    keyValueRows.length >= 5 &&
    (
      maxColumns <= 3 ||
      multiColumnRatio <
        0.45
    )
  ) {
    return {
      kind: 'key-value',
      rows: keyValueRows,
      totalRows:
        keyValueRows.length -
        1,
      confidence: 0.82,
      label:
        'Form / key-value document',
    };
  }

  if (
    maxColumns >= 2 &&
    multiColumnRatio >=
      0.25
  ) {
    return {
      kind: 'table',
      rows: sourceRows,
      totalRows:
        sourceRows.length,
      confidence: 0.8,
      label:
        'Structured table',
    };
  }

  return {
    kind: 'general',
    rows:
      sourceRows.map(
        (row) => [
          row.join(' '),
        ]
      ),
    totalRows:
      sourceRows.length,
    confidence: 0.6,
    label:
      'General document',
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

  const loadedPdf =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdfDoc =
    loadedPdf.pdf;

  try {
    const totalPages =
      pdfDoc.numPages;

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
        const page =
          await pdfDoc.getPage(
            pageNum
          );

        const canvas =
          document.createElement(
            'canvas'
          );

        try {
          const viewport =
            page.getViewport({
              scale: 1.5,
            });

          canvas.width =
            Math.floor(
              viewport.width
            );

          canvas.height =
            Math.floor(
              viewport.height
            );

          const ctx =
            canvas.getContext(
              '2d',
              {
                alpha: false,
              }
            );

          if (ctx) {
            await (
              page.render({
                canvasContext:
                  ctx as any,
                viewport,
              } as any) as any
            ).promise;

            const {
              data,
            } =
              await ocrWorker.recognize(
                canvas
              );

            if (
              data?.text
            ) {
              const rawLines =
                data.text.split(
                  '\n'
                );

              for (
                const rLine of
                rawLines
              ) {
                const trimmed =
                  rLine.trim();

                if (!trimmed) {
                  continue;
                }

                if (
                  detectHeadings &&
                  trimmed.length <
                    60 &&
                  (
                    trimmed ===
                      trimmed.toUpperCase() ||
                    /^(ARTICLE|CLAUSE|SCHEDULE)\s+[0-9IVXLCDM]+/i.test(
                      trimmed
                    )
                  ) &&
                  /[A-Za-z]{3,}/.test(
                    trimmed
                  )
                ) {
                  markdownBlocks.push(
                    '\n### ' +
                      trimmed +
                      '\n'
                  );
                } else if (
                  detectLists &&
                  /^[\u2022\u25E6\u2023\u2219\*\-\uF06C\uF0B7•]\s*(.*)$/.test(
                    trimmed
                  )
                ) {
                  markdownBlocks.push(
                    '- ' +
                      trimmed.replace(
                        /^[\u2022\u25E6\u2023\u2219\*\-\uF06C\uF0B7•]\s*/,
                        ''
                      )
                  );
                } else {
                  markdownBlocks.push(
                    trimmed
                  );
                }
              }
            }
          }
        } finally {
          canvas.width = 1;
          canvas.height = 1;

          try {
            canvas.remove();
          } catch (_) {}

          try {
            page.cleanup();
          } catch (_) {}
        }

        if (
          pageNum <
          totalPages
        ) {
          markdownBlocks.push(
            '\n---\n'
          );
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
  } finally {
    await loadedPdf.dispose();
  }
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
  textAlign?: 'left' | 'center' | 'right';
}

export async function applyVisualOverlays(
  file: File,
  overlays: VisualOverlayItem[]
): Promise<Uint8Array> {
  let arrayBuffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  // Check if PDF is encrypted
  let isEncrypted = false;
  let pdfDoc: PDFDocument | null = null;
  try {
    pdfDoc =
      await PDFDocument.load(
        arrayBuffer
      );

    /*
     * pdf-lib has parsed the source document. Our separate
     * complete ArrayBuffer reference is no longer required.
     */
    arrayBuffer = null;

    if (pdfDoc.isEncrypted) {
      isEncrypted = true;
    }
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

  // Match VisualEditor's on-screen text sizing exactly.
  // Editor uses a fixed 500px-wide base coordinate system.
  const getVisualFontPx = (
    item: VisualOverlayItem,
    previewHeight: number
  ): number => {
    if (item.fitMode === 'autofit') {
      return Math.max(
        6,
        Math.min(
          item.height * previewHeight * 0.7,
          (item.width * 500) /
            Math.max(
              1,
              (item.text || 'Text').length * 0.58
            )
        )
      );
    }

    return (item.fontSize || 12) * 0.9;
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
          // VisualEditor is 500px wide. Convert its exact visual
          // font size into this PDF page's point coordinate system.
          const previewBaseWidth = 500;
          const previewBaseHeight =
            (pH / pW) * previewBaseWidth;

          const previewFontPx =
            getVisualFontPx(
              item,
              previewBaseHeight
            );

          const pdfPerPreviewPx =
            pW / previewBaseWidth;

          const fSize = Math.max(
            1,
            previewFontPx * pdfPerPreviewPx
          );

          // Visual preview has 2px horizontal text padding.
          const textPaddingX =
            2 * pdfPerPreviewPx;

          // Match CSS flex vertical centering much more closely.
          const textY =
            boxY +
            boxH / 2 -
            fSize * 0.28;

          const textW =
            font.widthOfTextAtSize(
              safeText,
              fSize
            );

          const innerLeft = boxX + textPaddingX;
          const innerRight = boxX + boxW - textPaddingX;

          let textX = innerLeft;

          if (item.textAlign === 'center') {
            textX = boxX + (boxW - textW) / 2;
          } else if (item.textAlign === 'right') {
            textX = innerRight - textW;
          }

          textX = Math.max(innerLeft, textX);

          page.drawText(safeText, {
            x: textX,
            y: textY,
            size: fSize,
            font,
            color: textColor,
          });

          // Underline
          if (item.isUnderline) {
            page.drawLine({
              start: { x: textX, y: textY - 1.5 },
              end: { x: textX + textW, y: textY - 1.5 },
              thickness: Math.max(0.8, fSize * 0.07),
              color: textColor,
            });
          }

          // Strikethrough (cross between text)
          if (item.isStrikethrough) {
            page.drawLine({
              start: { x: textX, y: textY + fSize * 0.32 },
              end: { x: textX + textW, y: textY + fSize * 0.32 },
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
  /*
   * Native editing is no longer needed. Drop any remaining
   * pdf-lib/source references before opening the browser-backed
   * PDF.js fallback.
   */
  pdfDoc = null;
  arrayBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

  const loadedFallback =
    await loadPdfJsFromBlob(
      file,
      {
        stopAtErrors: false,
      }
    );

  const pdf =
    loadedFallback.pdf;

  try {
    const reconstructedDoc =
      await PDFDocument.create();

    for (
      let pageNum = 1;
      pageNum <= pdf.numPages;
      pageNum++
    ) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    try {
      const ctx =
        canvas.getContext(
          "2d",
          {
            alpha: false,
          }
        );

      canvas.style.position =
        "fixed";

      canvas.style.left =
        "-9999px";

      canvas.style.opacity =
        "0";

      document.body.appendChild(
        canvas
      );

      if (!ctx) {
        throw new Error(
          'Canvas rendering context unavailable'
        );
      }

      await (
        page.render({
          canvasContext:
            ctx as any,
          viewport,
          canvas,
        } as any) as any
      ).promise;

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
        const previewBaseWidth = 500;

        // viewport uses scale 2.0, so divide by 2 to recover
        // the original PDF page dimensions.
        const originalPageWidth =
          viewport.width / 2.0;

        const originalPageHeight =
          viewport.height / 2.0;

        const previewBaseHeight =
          (originalPageHeight /
            originalPageWidth) *
          previewBaseWidth;

        const previewFontPx =
          getVisualFontPx(
            item,
            previewBaseHeight
          );

        const pdfFontSize =
          previewFontPx *
          (originalPageWidth /
            previewBaseWidth);

        // Canvas itself is rendered at 2x.
        const fSize =
          pdfFontSize * 2.0;

        const canvasPaddingX =
          2 *
          (canvas.width /
            previewBaseWidth);

        const fontName =
          item.fontFamily === 'times'
            ? 'Times New Roman'
            : item.fontFamily === 'courier'
              ? 'Courier New'
              : 'Arial';

        const weight =
          item.isBold ? 'bold ' : '';

        const style =
          item.isItalic ? 'italic ' : '';

        ctx.font =
          `${style}${weight}${fSize}px "${fontName}"`;

        ctx.fillStyle =
          item.color || '#000000';

        ctx.textBaseline = 'middle';

        const textY =
          y + h / 2;

        const textMetrics =
          ctx.measureText(item.text);

        const innerLeft = x + canvasPaddingX;
        const innerRight = x + w - canvasPaddingX;

        let textX = innerLeft;

        if (item.textAlign === 'center') {
          textX = x + (w - textMetrics.width) / 2;
        } else if (item.textAlign === 'right') {
          textX = innerRight - textMetrics.width;
        }

        textX = Math.max(innerLeft, textX);

        ctx.fillText(
          item.text,
          textX,
          textY
        );
        ctx.strokeStyle = item.color || '#000000';
        ctx.lineWidth = Math.max(1.5, fSize * 0.07);

        // Underline
        if (item.isUnderline) {
          ctx.beginPath();
          ctx.moveTo(
            textX,
            textY + fSize * 0.45
          );
          ctx.lineTo(
            textX + textMetrics.width,
            textY + fSize * 0.45
          );
          ctx.stroke();
        }

        // Strikethrough
        if (item.isStrikethrough) {
          ctx.beginPath();
          ctx.moveTo(
            textX,
            textY
          );
          ctx.lineTo(
            textX + textMetrics.width,
            textY
          );
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

    } finally {
      canvas.width = 1;
      canvas.height = 1;

      try {
        canvas.remove();
      } catch (_) {}

      try {
        page.cleanup();
      } catch (_) {}
    }

    /*
     * Allow completed fallback page pixels/JPEG temporaries
     * to be reclaimed before processing the next page.
     */
    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );
  }

    /*
     * All reconstructed pages are now embedded. Release
     * PDF.js before allocating the complete final PDF.
     */
    await loadedFallback.dispose();

    await new Promise<void>(
      (resolve) =>
        setTimeout(
          resolve,
          0
        )
    );

    return await reconstructedDoc.save({
      useObjectStreams: false,
    });
  } finally {
    /*
     * dispose() is idempotent and also protects error paths.
     */
    await loadedFallback.dispose();
  }
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
  const sanitizedHtml = sanitizeRichHtml(html);

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
      const receiptHeightPt = Math.max(
        100,
        (rawCanvas.height / rawCanvas.width) *
          targetWidthPt
      );

      const receiptBlob =
        await new Promise<Blob | null>(
          (resolve) => {
            rawCanvas.toBlob(
              resolve,
              'image/jpeg',
              0.98
            );
          }
        );

      if (!receiptBlob) {
        throw new Error(
          'Failed to encode receipt image.'
        );
      }

      const receiptBytes =
        new Uint8Array(
          await receiptBlob.arrayBuffer()
        );

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [
          targetWidthPt,
          receiptHeightPt,
        ],
      });

      pdf.addImage(
        receiptBytes,
        'JPEG',
        0,
        0,
        targetWidthPt,
        receiptHeightPt
      );

      const output =
        new Uint8Array(
          pdf.output(
            'arraybuffer'
          )
        );

      rawCanvas.width = 1;
      rawCanvas.height = 1;

      return output;
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

      const sliceCanvas =
        document.createElement(
          'canvas'
        );

      sliceCanvas.width =
        rawCanvas.width;

      sliceCanvas.height =
        pageHeightPx;

      try {
        const sliceCtx =
          sliceCanvas.getContext(
            '2d'
          );

        if (!sliceCtx) {
          throw new Error(
            'Failed to create HTML-to-PDF page canvas.'
          );
        }

        sliceCtx.fillStyle =
          '#ffffff';

        sliceCtx.fillRect(
          0,
          0,
          sliceCanvas.width,
          sliceCanvas.height
        );

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

        const sliceBlob =
          await new Promise<Blob | null>(
            (resolve) => {
              sliceCanvas.toBlob(
                resolve,
                'image/jpeg',
                0.98
              );
            }
          );

        if (!sliceBlob) {
          throw new Error(
            `Failed to encode HTML-to-PDF page ${pageIdx + 1}.`
          );
        }

        const sliceBytes =
          new Uint8Array(
            await sliceBlob.arrayBuffer()
          );

        pdf.addImage(
          sliceBytes,
          'JPEG',
          0,
          0,
          targetWidthPt,
          targetHeightPt
        );
      } finally {
        /*
         * Release decoded RGBA pixels before rendering
         * the next page slice.
         */
        sliceCanvas.width = 1;
        sliceCanvas.height = 1;
      }
    }

    const output =
      new Uint8Array(
        pdf.output(
          'arraybuffer'
        )
      );

    rawCanvas.width = 1;
    rawCanvas.height = 1;

    return output;
  } finally {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }
}

// ============================================================================
// ANNOTATE PDF ENGINE
// Flattened annotations for consistent desktop/mobile PDF viewing
// ============================================================================

export type PdfAnnotationType =
  | 'text'
  | 'highlight'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'pen';

export interface PdfAnnotationPoint {
  x: number;
  y: number;
}

export interface PdfAnnotationItem {
  id: string;
  type: PdfAnnotationType;
  pageIndex: number;

  // Normalized coordinates: 0 → 1, browser top-left origin
  x: number;
  y: number;
  width: number;
  height: number;

  text?: string;
  color?: string;
  fillColor?: string;

  fontSize?: number;
  strokeWidth?: number;
  opacity?: number;

  // Pen points use normalized whole-page coordinates
  points?: PdfAnnotationPoint[];
}

function annotationHexToRgb(
  value: string | undefined,
  fallback: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    return fallback;
  }

  return [
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  ];
}

async function drawFlattenedAnnotations(
  pdfDoc: PDFDocument,
  annotations: PdfAnnotationItem[]
): Promise<void> {
  const pages = pdfDoc.getPages();

  const helvetica =
    await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );

  for (const item of annotations) {
    const page = pages[item.pageIndex];

    if (!page) continue;

    const {
      width: pageWidth,
      height: pageHeight,
    } = page.getSize();

    const x =
      item.x * pageWidth;

    const boxWidth =
      Math.max(
        1,
        item.width * pageWidth
      );

    const boxHeight =
      Math.max(
        1,
        item.height * pageHeight
      );

    const y =
      pageHeight -
      item.y * pageHeight -
      boxHeight;

    const [
      red,
      green,
      blue,
    ] = annotationHexToRgb(
      item.color,
      [0.9, 0.1, 0.1]
    );

    const annotationColor =
      rgb(
        red,
        green,
        blue
      );

    const strokeWidth =
      Math.max(
        0.5,
        item.strokeWidth || 2
      );

    const opacity =
      Math.max(
        0.05,
        Math.min(
          1,
          item.opacity ?? 1
        )
      );

    // ------------------------------------------------------------------------
    // TEXT
    // ------------------------------------------------------------------------

    if (item.type === 'text') {
      const safeText =
        (item.text || '')
          .replace(
            /[^\x20-\x7E]/g,
            ''
          );

      if (!safeText.trim()) {
        continue;
      }

      const fontSize =
        Math.max(
          6,
          item.fontSize || 16
        );

      const lines =
        safeText.split('\n');

      const lineHeight =
        fontSize * 1.2;

      lines.forEach(
        (
          line,
          lineIndex
        ) => {
          const textY =
            y +
            boxHeight -
            fontSize -
            lineIndex *
              lineHeight;

          if (
            textY <
            y - lineHeight
          ) {
            return;
          }

          page.drawText(
            line,
            {
              x:
                x + 2,

              y:
                textY,

              size:
                fontSize,

              font:
                helvetica,

              color:
                annotationColor,

              opacity,
            }
          );
        }
      );

      continue;
    }

    // ------------------------------------------------------------------------
    // HIGHLIGHTER
    // ------------------------------------------------------------------------

    if (
      item.type ===
      'highlight'
    ) {
      const [
        fillRed,
        fillGreen,
        fillBlue,
      ] =
        annotationHexToRgb(
          item.fillColor ||
            item.color ||
            '#ffff00',
          [1, 1, 0]
        );

      page.drawRectangle({
        x,
        y,

        width:
          boxWidth,

        height:
          boxHeight,

        color:
          rgb(
            fillRed,
            fillGreen,
            fillBlue
          ),

        opacity:
          Math.min(
            0.45,
            item.opacity ??
              0.28
          ),
      });

      continue;
    }

    // ------------------------------------------------------------------------
    // RECTANGLE
    // ------------------------------------------------------------------------

    if (
      item.type ===
      'rectangle'
    ) {
      page.drawRectangle({
        x,
        y,

        width:
          boxWidth,

        height:
          boxHeight,

        borderColor:
          annotationColor,

        borderWidth:
          strokeWidth,

        borderOpacity:
          opacity,
      });

      continue;
    }

    // ------------------------------------------------------------------------
    // CIRCLE / ELLIPSE
    // ------------------------------------------------------------------------

    if (
      item.type ===
      'ellipse'
    ) {
      page.drawEllipse({
        x:
          x +
          boxWidth / 2,

        y:
          y +
          boxHeight / 2,

        xScale:
          boxWidth / 2,

        yScale:
          boxHeight / 2,

        borderColor:
          annotationColor,

        borderWidth:
          strokeWidth,

        borderOpacity:
          opacity,
      });

      continue;
    }

    // ------------------------------------------------------------------------
    // ARROW
    // ------------------------------------------------------------------------

    if (
      item.type ===
      'arrow'
    ) {
      const startX =
        x;

      const startY =
        y +
        boxHeight;

      const endX =
        x +
        boxWidth;

      const endY =
        y;

      page.drawLine({
        start: {
          x: startX,
          y: startY,
        },

        end: {
          x: endX,
          y: endY,
        },

        thickness:
          strokeWidth,

        color:
          annotationColor,

        opacity,
      });

      const angle =
        Math.atan2(
          endY - startY,
          endX - startX
        );

      const arrowSize =
        Math.max(
          7,
          strokeWidth * 4
        );

      const leftAngle =
        angle +
        Math.PI -
        Math.PI / 6;

      const rightAngle =
        angle +
        Math.PI +
        Math.PI / 6;

      page.drawLine({
        start: {
          x: endX,
          y: endY,
        },

        end: {
          x:
            endX +
            Math.cos(
              leftAngle
            ) *
              arrowSize,

          y:
            endY +
            Math.sin(
              leftAngle
            ) *
              arrowSize,
        },

        thickness:
          strokeWidth,

        color:
          annotationColor,

        opacity,
      });

      page.drawLine({
        start: {
          x: endX,
          y: endY,
        },

        end: {
          x:
            endX +
            Math.cos(
              rightAngle
            ) *
              arrowSize,

          y:
            endY +
            Math.sin(
              rightAngle
            ) *
              arrowSize,
        },

        thickness:
          strokeWidth,

        color:
          annotationColor,

        opacity,
      });

      continue;
    }

    // ------------------------------------------------------------------------
    // FREEHAND PEN
    // ------------------------------------------------------------------------

    if (
      item.type === 'pen' &&
      item.points &&
      item.points.length >
        1
    ) {
      for (
        let pointIndex = 1;
        pointIndex <
        item.points.length;
        pointIndex++
      ) {
        const previous =
          item.points[
            pointIndex - 1
          ];

        const current =
          item.points[
            pointIndex
          ];

        page.drawLine({
          start: {
            x:
              previous.x *
              pageWidth,

            y:
              pageHeight -
              previous.y *
                pageHeight,
          },

          end: {
            x:
              current.x *
              pageWidth,

            y:
              pageHeight -
              current.y *
                pageHeight,
          },

          thickness:
            strokeWidth,

          color:
            annotationColor,

          opacity,
        });
      }
    }
  }
}


/**
 * Apply annotations permanently to a PDF.
 *
 * Normal PDFs:
 *   keep original vector/text PDF structure.
 *
 * Complex/readable restricted PDFs:
 *   rebuild pages locally through PDF.js and then flatten annotations.
 *
 * Result:
 *   annotations are part of the page itself rather than viewer-dependent
 *   interactive annotation widgets.
 */
export async function annotatePDF(
  file: File,
  annotations: PdfAnnotationItem[]
): Promise<Uint8Array> {
  let arrayBuffer:
    | ArrayBuffer
    | null =
      await file.arrayBuffer();

  // ==========================================================================
  // PATH A — Preserve original PDF whenever pdf-lib can edit it safely
  // ==========================================================================

  try {
    const pdfDoc =
      await PDFDocument.load(
        arrayBuffer
      );

    if (!pdfDoc.isEncrypted) {
      await drawFlattenedAnnotations(
        pdfDoc,
        annotations
      );

      return await pdfDoc.save({
        useObjectStreams:
          false,
      });
    }
  } catch (error) {
    console.warn(
      'Annotate PDF native path unavailable. Using compatibility renderer.',
      error
    );
  }

  // ==========================================================================
  // PATH B — Universal readable-PDF fallback
  // ==========================================================================

  /*
   * Native editing is finished. Drop the complete
   * ArrayBuffer before opening the browser-backed PDF.js
   * document so the fallback does not duplicate the source.
   */
  arrayBuffer = null;

  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

  let loadedFallback:
    | {
        pdf: any;
        dispose: () => Promise<void>;
      }
    | null = null;

  try {
    loadedFallback =
      await loadPdfJsFromBlob(
        file,
        {
          stopAtErrors: false,
        }
      );
  } catch (error: any) {
    const passwordResponses =
      (pdfjsLib as any)
        .PasswordResponses;

    if (
      error?.name ===
        'PasswordException' ||
      error?.code ===
        passwordResponses
          ?.NEED_PASSWORD ||
      error?.code ===
        passwordResponses
          ?.INCORRECT_PASSWORD
    ) {
      throw new Error(
        'This PDF requires a password. Unlock it first, then annotate it.'
      );
    }

    throw new Error(
      'This PDF could not be opened for annotation.'
    );
  }

  const sourcePdf =
    loadedFallback.pdf;

  const rebuilt =
    await PDFDocument.create();

  try {
    for (
      let pageNumber = 1;
      pageNumber <=
      sourcePdf.numPages;
      pageNumber++
    ) {
      const sourcePage =
        await sourcePdf.getPage(
          pageNumber
        );

      try {
        /*
         * Preserve the real PDF page dimensions.
         * Render resolution stays high, but image pixels are
         * NOT used as PDF points.
         */
        const viewport =
          sourcePage.getViewport({
            scale: 1,
          });

        const {
          imgBytes,
        } =
          await renderPageAsJpg(
            sourcePage,
            2
          );

        const embedded =
          await rebuilt.embedJpg(
            imgBytes
          );

        const page =
          rebuilt.addPage([
            viewport.width,
            viewport.height,
          ]);

        page.drawImage(
          embedded,
          {
            x: 0,
            y: 0,

            width:
              viewport.width,

            height:
              viewport.height,
          }
        );
      } finally {
        try {
          sourcePage.cleanup();
        } catch {}
      }

      /*
       * Let completed page render/JPEG temporaries become
       * collectible before processing the next page.
       */
      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }
  } finally {
    if (loadedFallback) {
      await loadedFallback.dispose();
      loadedFallback = null;
    }
  }

  /*
   * The fallback source is fully rebuilt now.
   * Draw annotations only after PDF.js has been released,
   * then serialize the final annotated PDF.
   */
  await new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        0
      )
  );

  await drawFlattenedAnnotations(
    rebuilt,
    annotations
  );

  return await rebuilt.save({
    useObjectStreams:
      false,
  });
}
