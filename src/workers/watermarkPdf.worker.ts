import createQpdfModule from '@neslinesli93/qpdf-wasm';
import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';


type Request = {
  requestId: string;
  file: File;
  stampBuffer: ArrayBuffer;
};


const INPUT_DIR =
  '/watermark-input';


const getExitCode =
  (
    error:
      any
  ):
    number |
    null => {
    if (
      error &&
      typeof error.status ===
        'number'
    ) {
      return error.status;
    }

    return null;
  };


self.onmessage =
  async (
    event:
      MessageEvent<Request>
  ) => {
    const {
      requestId,
      file,
      stampBuffer,
    } =
      event.data;


    const sendProgress =
      (
        progress:
          number
      ) => {
        (
          self as any
        ).postMessage({
          type:
            'progress',
          requestId,
          progress,
        });
      };


    try {
      sendProgress(
        10
      );


      /*
       * ======================================================
       * TRUE LARGE-FILE WORKERFS PATH
       * ======================================================
       *
       * The previous pdfstudio worker still did:
       *
       * File -> arrayBuffer -> Uint8Array -> MEMFS
       *
       * which copied the entire 150 MB PDF into WebAssembly
       * memory before qpdf could even start.
       *
       * WORKERFS mounts the browser File/Blob directly.
       * The original PDF is therefore NOT first converted into
       * a giant JavaScript ArrayBuffer.
       */
      const qpdf =
        await createQpdfModule({
          locateFile:
            () =>
              qpdfWasmUrl,
        });


      sendProgress(
        25
      );


      try {
        qpdf.FS.mkdir(
          INPUT_DIR
        );
      } catch (_) {}


      const stampBlob =
        new Blob(
          [
            stampBuffer,
          ],
          {
            type:
              'application/pdf',
          }
        );


      /*
       * source.pdf remains browser/Blob-backed.
       * stamp.pdf is tiny compared with the source PDF.
       */
      qpdf.FS.mount(
        qpdf.WORKERFS,
        {
          blobs: [
            {
              name:
                'source.pdf',
              data:
                file,
            },
            {
              name:
                'stamp.pdf',
              data:
                stampBlob,
            },
          ],
        },
        INPUT_DIR
      );


      sendProgress(
        35
      );


      const sourcePath =
        `${INPUT_DIR}/source.pdf`;

      const stampPath =
        `${INPUT_DIR}/stamp.pdf`;

      const outputPath =
        '/watermarked-output.pdf';


      let exitCode =
        0;


      try {
        /*
         * qpdf overlays the stamp PDF over the original pages.
         *
         * The stamp document contains matching page dimensions,
         * so the exact approved preview geometry is retained.
         *
         * Original PDF pages are NOT rasterized.
         */
        exitCode =
          qpdf.callMain([
            '--overlay',
            stampPath,
            '--',
            sourcePath,
            outputPath,
          ]);
      } catch (
        error:
          any
      ) {
        const status =
          getExitCode(
            error
          );

        if (
          status ===
          null
        ) {
          throw error;
        }

        exitCode =
          status;
      }


      if (
        exitCode !==
          0 &&
        exitCode !==
          3
      ) {
        throw new Error(
          `qpdf watermark failed with exit code ${exitCode}.`
        );
      }


      sendProgress(
        85
      );


      /*
       * Source is no longer needed.
       * Detach WORKERFS before materializing the final output.
       */
      try {
        qpdf.FS.unmount(
          INPUT_DIR
        );
      } catch (_) {}


      /*
       * Only the FINAL result enters MEMFS/JS memory.
       *
       * Most importantly:
       * there is no simultaneous 150 MB source ArrayBuffer +
       * source MEMFS copy + output copy anymore.
       */
      const output =
        qpdf.FS.readFile(
          outputPath
        );


      const transferable:
        ArrayBuffer =
          (
            output.byteOffset ===
              0 &&
            output.byteLength ===
              output.buffer.byteLength
          )
            ? (
                output.buffer as
                  ArrayBuffer
              )
            : (
                output.slice()
                  .buffer as
                  ArrayBuffer
              );


      sendProgress(
        95
      );


      (
        self as any
      ).postMessage(
        {
          type:
            'success',
          requestId,
          buffer:
            transferable,
        },
        [
          transferable,
        ]
      );
    } catch (
      error:
        any
    ) {
      (
        self as any
      ).postMessage({
        type:
          'error',
        requestId,
        message:
          String(
            error?.message ||
              error ||
              'Unable to apply watermark.'
          ),
      });
    }
  };
