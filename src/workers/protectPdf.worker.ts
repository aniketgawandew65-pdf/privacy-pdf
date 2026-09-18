import {
  createPdfToolkit,
} from 'pdfstudio';

type ProtectRequest = {
  requestId: string;
  file: File;
  password: string;
};

type WorkerMessage =
  | {
      type: 'progress';
      requestId: string;
      progress: number;
    }
  | {
      type: 'success';
      requestId: string;
      buffer: ArrayBuffer;
    }
  | {
      type: 'error';
      requestId: string;
      message: string;
    };

const send = (
  message: WorkerMessage,
  transfer: Transferable[] = []
) => {
  (
    self as any
  ).postMessage(
    message,
    transfer
  );
};


self.onmessage =
  async (
    event:
      MessageEvent<
        ProtectRequest
      >
  ) => {
    const {
      requestId,
      file,
      password,
    } = event.data;


    try {
      send({
        type:
          'progress',
        requestId,
        progress:
          10,
      });


      /*
       * qpdf runs entirely inside this dedicated Worker.
       *
       * The main React/Safari UI process never parses the PDF
       * into a giant JavaScript object graph.
       */
      const toolkit =
        await createPdfToolkit();


      send({
        type:
          'progress',
        requestId,
        progress:
          30,
      });


      /*
       * IMPORTANT:
       *
       * Feed qpdf the ORIGINAL File directly.
       *
       * No pdf-lib normalization.
       * No PDF.js rasterization.
       * No OCR.
       * No inspection of page contents.
       *
       * qpdf performs a content-preserving encryption rewrite.
       */
      const protectedBytes =
        await toolkit.lock(
          file,
          {
            userPassword:
              password,

            ownerPassword:
              password,

            keyLength:
              128,
          }
        );


      send({
        type:
          'progress',
        requestId,
        progress:
          95,
      });


      /*
       * Transfer ownership of the final ArrayBuffer back to the
       * main thread instead of cloning the whole protected PDF.
       */
      const ownedBytes =
        protectedBytes.byteOffset ===
          0 &&
        protectedBytes.byteLength ===
          protectedBytes.buffer
            .byteLength
          ? protectedBytes
          : protectedBytes.slice();


      const outputBuffer =
        ownedBytes.buffer as
          ArrayBuffer;


      send(
        {
          type:
            'success',

          requestId,

          buffer:
            outputBuffer,
        },
        [
          outputBuffer,
        ]
      );
    } catch (
      error:
        any
    ) {
      send({
        type:
          'error',

        requestId,

        message:
          String(
            error?.message ||
              error ||
              'Unable to protect PDF.'
          ),
      });
    }
  };
