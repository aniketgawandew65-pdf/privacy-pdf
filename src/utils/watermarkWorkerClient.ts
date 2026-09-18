type WorkerMessage =
  | {
      type:
        'progress';

      requestId:
        string;

      progress:
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


export const watermarkPdfInWorker =
  (
    file:
      File,

    stampBytes:
      Uint8Array,

    onProgress?:
      (
        progress:
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
              '../workers/watermarkPdf.worker.ts',
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
                message.progress
              );

              return;
            }


            if (
              settled
            ) {
              return;
            }


            settled =
              true;


            if (
              message.type ===
              'success'
            ) {
              onProgress?.(
                100
              );


              finish();


              /*
               * File extends Blob.
               *
               * useObjectUrl can use this browser-backed OPFS
               * File directly. No 150 MB JS copy is created.
               */
              resolve(
                message.file
              );

              return;
            }


            finish();


            reject(
              new Error(
                message.message ||
                  'Unable to apply watermark.'
              )
            );
          };


        worker.onerror =
          (
            event
          ) => {
            if (
              settled
            ) {
              return;
            }


            settled =
              true;

            event.preventDefault();

            finish();


            reject(
              new Error(
                'The background watermark engine stopped unexpectedly.'
              )
            );
          };


        /*
         * Only the SMALL stamp PDF is transferred.
         *
         * The large original remains a File and WORKERFS mounts
         * it directly inside the worker.
         */
        const stampBuffer:
          ArrayBuffer =
            (
              stampBytes.byteOffset ===
                0 &&
              stampBytes.byteLength ===
                stampBytes.buffer.byteLength
            )
              ? (
                  stampBytes.buffer as
                    ArrayBuffer
                )
              : (
                  stampBytes.slice()
                    .buffer as
                    ArrayBuffer
                );


        worker.postMessage(
          {
            requestId,

            file,

            stampBuffer,
          },
          [
            stampBuffer,
          ]
        );
      }
    );
