/*
 * ============================================================
 * CROSS-BROWSER OPFS WRITER
 * ============================================================
 *
 * Chrome / newer Safari:
 *   FileSystemFileHandle.createWritable()
 *
 * Safari versions without createWritable():
 *   worker + createSyncAccessHandle()
 *
 * No network.
 * No cloud.
 * No document data leaves the browser.
 */

const WORKER_TIMEOUT_MS =
  120_000;

const makeRequestId =
  () =>
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

const writeUsingSyncWorker =
  async (
    directoryName:
      string,
    fileName:
      string,
    blob:
      Blob
  ): Promise<void> => {
    if (
      typeof Worker ===
      "undefined"
    ) {
      throw new Error(
        "Background OPFS writer is unavailable."
      );
    }

    const worker =
      new Worker(
        new URL(
          "../workers/opfsSyncWriter.ts",
          import.meta.url
        ),
        {
          type: "module",
        }
      );

    const requestId =
      makeRequestId();

    try {
      await new Promise<void>(
        (
          resolve,
          reject
        ) => {
          let settled =
            false;

          const finish =
            (
              callback:
                () => void
            ) => {
              if (
                settled
              ) {
                return;
              }

              settled =
                true;

              window.clearTimeout(
                timeout
              );

              callback();
            };

          const timeout =
            window.setTimeout(
              () =>
                finish(
                  () =>
                    reject(
                      new Error(
                        "OPFS worker write timed out."
                      )
                    )
                ),
              WORKER_TIMEOUT_MS
            );

          worker.onerror =
            (
              event
            ) => {
              finish(
                () =>
                  reject(
                    new Error(
                      event.message ||
                        "OPFS worker failed."
                    )
                  )
              );
            };

          worker.onmessage =
            (
              event:
                MessageEvent
            ) => {
              const result =
                event.data;

              if (
                !result ||
                result.requestId !==
                  requestId
              ) {
                return;
              }

              if (
                result.ok
              ) {
                finish(
                  resolve
                );

                return;
              }

              finish(
                () =>
                  reject(
                    new Error(
                      result.error ||
                        "OPFS worker write failed."
                    )
                  )
              );
            };

          /*
           * Blob structured-cloning does not require us to build
           * one complete ArrayBuffer on the main UI thread.
           */
          worker.postMessage({
            requestId,
            directoryName,
            fileName,
            blob,
          });
        }
      );
    } finally {
      worker.terminate();
    }
  };

export const writeOpfsFile =
  async (
    directoryName:
      string,
    fileName:
      string,
    blob:
      Blob
  ): Promise<void> => {
    if (
      typeof navigator ===
        "undefined" ||
      !navigator.storage ||
      typeof navigator.storage
        .getDirectory !==
        "function"
    ) {
      throw new Error(
        "Origin-private storage is unavailable."
      );
    }

    const root =
      await navigator.storage
        .getDirectory();

    const directory =
      await root
        .getDirectoryHandle(
          directoryName,
          {
            create: true,
          }
        );

    const handle:
      any =
      await directory
        .getFileHandle(
          fileName,
          {
            create: true,
          }
        );

    /*
     * Preferred async writer.
     *
     * Chrome, Android Chrome and newer Safari.
     */
    if (
      typeof handle
        .createWritable ===
      "function"
    ) {
      const writable =
        await handle
          .createWritable();

      try {
        await writable.write(
          blob
        );
      } finally {
        await writable.close();
      }

      return;
    }

    /*
     * Safari compatibility path.
     *
     * createSyncAccessHandle() is only legal in a Dedicated
     * Worker, so hand the Blob to our local worker.
     */
    await writeUsingSyncWorker(
      directoryName,
      fileName,
      blob
    );
  };
