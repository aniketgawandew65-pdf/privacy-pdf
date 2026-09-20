export interface LargeMergeProgress {
  stage: string;
}

interface WorkerProgressMessage {
  type: 'progress';
  stage: string;
}

interface WorkerDoneMessage {
  type: 'done';
  blob: Blob;
  size: number;
}

interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

type WorkerMessage =
  | WorkerProgressMessage
  | WorkerDoneMessage
  | WorkerErrorMessage;

/**
 * Desktop large-file merge engine.
 *
 * Important:
 * - Browser File objects are structured-cloned to the Worker.
 * - qpdf WORKERFS mounts those Blob/File objects directly.
 * - Inputs are NOT converted to full ArrayBuffers first.
 * - A fresh Worker is used for every merge so its WASM heap
 *   is completely released after the task.
 */
export function mergePDFsWithQpdf(
  files: File[],
  onProgress?: (
    progress:
      LargeMergeProgress
  ) => void
): Promise<Blob> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const worker =
        new Worker(
          new URL(
            '../workers/qpdfMerge.worker.ts',
            import.meta.url
          ),
          {
            type:
              'module',
          }
        );

      let settled =
        false;

      const cleanup =
        () => {
          worker.terminate();
        };

      const fail =
        (
          error:
            Error
        ) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          reject(error);
        };

      worker.onerror =
        (
          event
        ) => {
          fail(
            new Error(
              event.message ||
                'The optimized merge worker failed.'
            )
          );
        };

      worker.onmessage =
        (
          event:
            MessageEvent<WorkerMessage>
        ) => {
          const message =
            event.data;

          if (
            message.type ===
            'progress'
          ) {
            onProgress?.({
              stage:
                message.stage,
            });

            return;
          }

          if (
            message.type ===
            'error'
          ) {
            fail(
              new Error(
                message.message
              )
            );

            return;
          }

          if (
            message.type ===
            'done'
          ) {
            if (settled) {
              return;
            }

            settled = true;

            const blob =
              message.blob;

            cleanup();
            resolve(blob);
          }
        };

      worker.postMessage({
        type:
          'merge',
        files,
      });
    }
  );
}
