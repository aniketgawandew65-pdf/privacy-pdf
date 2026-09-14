import * as pdfjsLib from 'pdfjs-dist';

if (
  typeof window !== 'undefined' &&
  !pdfjsLib.GlobalWorkerOptions.workerSrc
) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    '/pdf.worker.min.js';
}

/*
 * Load a browser File/Blob into PDF.js without first calling
 * file.arrayBuffer().
 *
 * This is important for large PDFs:
 *
 * Old path:
 * File -> ArrayBuffer -> Uint8Array -> optional slice -> PDF.js
 *
 * A 150 MB PDF could therefore create one or more additional
 * 150 MB JavaScript buffers before PDF.js even starts.
 *
 * Blob URLs keep the original File/Blob browser-backed and let
 * PDF.js consume it without us creating that initial full-size
 * JS copy.
 */
export const loadPdfJsFromBlob = async (
  blob: Blob,
  options: Record<string, unknown> = {}
) => {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error(
      'Local PDF loading is not supported in this browser.'
    );
  }

  const objectUrl =
    URL.createObjectURL(blob);

  let pdf: any = null;

  try {
    const loadingTask =
      pdfjsLib.getDocument({
        ...options,
        url: objectUrl,
        isEvalSupported: false,
      });

    pdf = await loadingTask.promise;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }

  let disposed = false;

  return {
    pdf,

    /*
     * Always use dispose() when finished.
     * It releases both PDF.js resources and the temporary
     * browser Blob URL.
     */
    dispose: async () => {
      if (disposed) return;

      disposed = true;

      try {
        await pdf?.destroy();
      } catch (_) {
        // Cleanup should never hide the original operation result.
      } finally {
        URL.revokeObjectURL(
          objectUrl
        );
      }
    },
  };
};

export { pdfjsLib };
