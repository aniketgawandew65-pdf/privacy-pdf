import * as pdfjsLib from 'pdfjs-dist';

if (
  typeof window !== 'undefined' &&
  !pdfjsLib.GlobalWorkerOptions.workerSrc
) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    '/pdf.worker.min.js';
}

/*
 * ============================================================
 * LOCAL BLOB RANGE TRANSPORT
 * ============================================================
 *
 * Large local PDFs must stay browser-backed.
 *
 * Do NOT:
 *   File -> full ArrayBuffer -> PDF.js
 *
 * Do NOT rely on:
 *   blob: URL -> PDF.js network layer
 *
 * Instead PDF.js requests only the byte ranges it needs and
 * Blob.slice() supplies those ranges.
 */

const RANGE_CHUNK_SIZE =
  256 * 1024;

class LocalBlobRangeTransport extends
  (pdfjsLib as any).PDFDataRangeTransport {
  private readonly source:
    Blob;

  private stopped =
    false;

  constructor(
    source:
      Blob,
    initialData:
      Uint8Array
  ) {
    super(
      source.size,
      initialData,
      false
    );

    this.source =
      source;
  }

  requestDataRange(
    begin:
      number,
    end:
      number
  ) {
    if (
      this.stopped
    ) {
      return;
    }

    const safeBegin =
      Math.max(
        0,
        Math.min(
          this.source.size,
          begin
        )
      );

    const safeEnd =
      Math.max(
        safeBegin,
        Math.min(
          this.source.size,
          end
        )
      );

    void this.source
      .slice(
        safeBegin,
        safeEnd
      )
      .arrayBuffer()
      .then(
        (
          buffer
        ) => {
          if (
            this.stopped
          ) {
            return;
          }

          this.onDataRange(
            safeBegin,
            new Uint8Array(
              buffer
            )
          );
        }
      )
      .catch(
        (
          error
        ) => {
          console.error(
            'Local PDF range read failed:',
            error
          );

          if (
            !this.stopped
          ) {
            this.onDataRange(
              safeBegin,
              new Uint8Array(
                0
              )
            );
          }
        }
      );
  }

  abort() {
    this.stopped =
      true;
  }
}

export const loadPdfJsFromBlob = async (
  blob:
    Blob,
  options:
    Record<string, unknown> = {}
) => {
  /*
   * Give PDF.js only a small initial prefix.
   * Remaining bytes are requested through Blob.slice().
   */
  const firstChunkEnd =
    Math.min(
      blob.size,
      RANGE_CHUNK_SIZE
    );

  const initialData =
    new Uint8Array(
      await blob
        .slice(
          0,
          firstChunkEnd
        )
        .arrayBuffer()
    );

  const rangeTransport =
    new LocalBlobRangeTransport(
      blob,
      initialData
    );

  let loadingTask:
    any =
    null;

  let pdf:
    any =
    null;

  try {
    loadingTask =
      pdfjsLib.getDocument({
        ...options,

        range:
          rangeTransport as any,

        rangeChunkSize:
          RANGE_CHUNK_SIZE,

        /*
         * Force range-driven access.
         *
         * This prevents PDF.js from automatically pulling the
         * complete 147 MB source into another contiguous buffer.
         */
        disableRange:
          false,

        disableStream:
          true,

        disableAutoFetch:
          true,

        isEvalSupported:
          false,
      });

    pdf =
      await loadingTask.promise;
  } catch (
    error
  ) {
    rangeTransport.abort();

    try {
      await loadingTask
        ?.destroy?.();
    } catch (_) {}

    throw error;
  }

  let disposed =
    false;

  return {
    pdf,

    dispose:
      async () => {
        if (
          disposed
        ) {
          return;
        }

        disposed =
          true;

        rangeTransport.abort();

        try {
          await pdf
            ?.destroy?.();
        } catch (_) {
          try {
            await loadingTask
              ?.destroy?.();
          } catch (_) {}
        }
      },
  };
};

export { pdfjsLib };
