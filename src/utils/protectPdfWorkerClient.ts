type ProtectWorkerMessage =
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


const createRequestId =
  () =>
    (
      crypto.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`
    );


export const protectPdfInWorker =
  (
    file: File,
    password: string,
    onProgress?: (
      progress: number
    ) => void
  ): Promise<Uint8Array> =>
    new Promise(
      (
        resolve,
        reject
      ) => {
        const worker =
          new Worker(
            new URL(
              '../workers/protectPdf.worker.ts',
              import.meta.url
            ),
            {
              type:
                'module',
            }
          );


        const requestId =
          createRequestId();


        let finished =
          false;


        const stopWorker =
          () => {
            try {
              worker.terminate();
            } catch (_) {}
          };


        const fail =
          (
            error:
              Error
          ) => {
            if (
              finished
            ) {
              return;
            }

            finished =
              true;

            stopWorker();

            reject(
              error
            );
          };


        worker.onmessage =
          (
            event:
              MessageEvent<
                ProtectWorkerMessage
              >
          ) => {
            const message =
              event.data;


            if (
              !message ||
              message
                .requestId !==
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
              message.type ===
                'error'
            ) {
              const raw =
                message.message ||
                'Unable to protect PDF.';


              const lower =
                raw.toLowerCase();


              if (
                lower.includes(
                  'password'
                ) ||
                lower.includes(
                  'encrypted'
                )
              ) {
                fail(
                  new Error(
                    'This PDF is already protected. Unlock it first, then apply the new password.'
                  )
                );

                return;
              }


              fail(
                new Error(
                  raw
                )
              );

              return;
            }


            if (
              message.type ===
                'success'
            ) {
              if (
                finished
              ) {
                return;
              }


              finished =
                true;


              onProgress?.(
                100
              );


              const output =
                new Uint8Array(
                  message.buffer
                );


              stopWorker();

              resolve(
                output
              );
            }
          };


        worker.onerror =
          (
            event
          ) => {
            event.preventDefault();


            fail(
              new Error(
                'The local PDF protection engine stopped unexpectedly. Your original PDF was not changed. Please retry.'
              )
            );
          };


        worker.onmessageerror =
          () => {
            fail(
              new Error(
                'The protected PDF could not be returned from the local protection engine. Please retry.'
              )
            );
          };


        /*
         * File/Blob is structured-cloned to the worker without
         * first allocating file.arrayBuffer() on the main UI
         * thread.
         */
        worker.postMessage({
          requestId,
          file,
          password,
        });
      }
    );
