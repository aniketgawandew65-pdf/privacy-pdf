import {
  createPdfToolkit,
} from 'pdfstudio';


type Request = {
  requestId: string;
  file: File;
  stampBuffer: ArrayBuffer;
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
       * Dedicated worker:
       * the React/main Safari thread never loads the 150 MB
       * source into pdf-lib.
       */
      const toolkit =
        await createPdfToolkit();


      sendProgress(
        30
      );


      const protectedStamp =
        new Uint8Array(
          stampBuffer
        );


      /*
       * qpdf overlays the watermark PDF onto the ORIGINAL PDF.
       *
       * No page rasterization.
       * No JPEG conversion.
       * No loss of source resolution.
       */
      const output =
        await toolkit.watermark(
          file,
          protectedStamp,
          {
            mode:
              'overlay',
          }
        );


      sendProgress(
        92
      );


      /*
       * Convert to Blob INSIDE the worker.
       *
       * The main React thread receives a Blob instead of a
       * second giant Uint8Array living in its JS heap.
       */
      /*
       * pdfstudio returns Uint8Array<ArrayBufferLike>.
       * Copy it into a normal ArrayBuffer-backed Uint8Array so
       * TypeScript/Blob accepts it safely in all browsers.
       */
      const outputCopy =
        new Uint8Array(
          output.byteLength
        );

      outputCopy.set(
        output
      );

      const blob =
        new Blob(
          [
            outputCopy.buffer,
          ],
          {
            type:
              'application/pdf',
          }
        );


      (
        self as any
      ).postMessage({
        type:
          'success',

        requestId,

        blob,
      });
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
