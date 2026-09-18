import type {
  ExtractedImage,
} from './pdfEngine';


type WorkerMessage =
  | {
      type:
        'progress';

      requestId:
        string;

      current:
        number;

      total:
        number;
    }
  | {
      type:
        'success';

      requestId:
        string;

      file:
        File;
    }
  | {
      type:
        'error';

      requestId:
        string;

      message:
        string;
    };


const makeRequestId =
  () =>
    crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random()}`;


export const packageExtractedImagesToZipWorker =
  (
    images:
      ExtractedImage[],

    baseName:
      string,

    onProgress?:
      (
        current:
          number,

        total:
          number
      ) => void
  ):
    Promise<Blob> =>
    new Promise(
      (
        resolve,
        reject
      ) => {
        const worker =
          new Worker(
            new URL(
              '../workers/extractImagesZip.worker.ts',
              import.meta.url
            ),
            {
              type:
                'module',
            }
          );


        const requestId =
          makeRequestId();


        let settled =
          false;


        const finish =
          () => {
            try {
              worker.terminate();
            } catch (_) {}
          };


        worker.onmessage =
          (
            event:
              MessageEvent<WorkerMessage>
          ) => {
            const message =
              event.data;


            if (
              !message ||
              message.requestId !==
                requestId
            ) {
              return;
            }


            if (
              message.type ===
              'progress'
            ) {
              onProgress?.(
                message.current,
                message.total
              );

              return;
            }


            if (settled) {
              return;
            }


            settled =
              true;


            if (
              message.type ===
              'success'
            ) {
              finish();

              resolve(
                message.file
              );

              return;
            }


            finish();

            reject(
              new Error(
                message.message ||
                  'Unable to create extracted images ZIP.'
              )
            );
          };


        worker.onerror =
          (
            event
          ) => {
            if (settled) {
              return;
            }


            settled =
              true;

            event.preventDefault();

            finish();


            reject(
              new Error(
                'The background ZIP engine stopped unexpectedly.'
              )
            );
          };


        /*
         * Blob/File structured cloning does not require us to
         * build one combined ArrayBuffer of every extracted image.
         */
        worker.postMessage({
          requestId,

          baseName,

          images:
            images.map(
              (
                image
              ) => ({
                name:
                  image.name,

                blob:
                  image.blob,
              })
            ),
        });
      }
    );
