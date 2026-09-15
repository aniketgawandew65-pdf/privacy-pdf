/*
 * 1into1 PDF
 * Streaming OPFS writer for large local-only PDF exports.
 *
 * Everything stays on-device.
 *
 * Preferred on iPhone Safari:
 *   createSyncAccessHandle() inside this Dedicated Worker.
 *
 * Fallback:
 *   createWritable() where supported.
 */

const scope: any =
  self as any;

let syncHandle:
  any =
  null;

let writable:
  any =
  null;

let position =
  0;

const closeCurrent =
  async () => {
    if (syncHandle) {
      try {
        syncHandle.flush?.();
      } catch (_) {}

      try {
        syncHandle.close();
      } catch (_) {}

      syncHandle =
        null;
    }

    if (writable) {
      try {
        await writable.close();
      } catch (_) {}

      writable =
        null;
    }
  };

const send =
  (
    requestId: string,
    ok: boolean,
    extra:
      Record<string, unknown> = {}
  ) => {
    scope.postMessage({
      requestId,
      ok,
      ...extra,
    });
  };

scope.onmessage =
  async (
    event: MessageEvent
  ) => {
    const message =
      event.data || {};

    const requestId =
      String(
        message.requestId || ""
      );

    try {
      if (
        message.type ===
        "init"
      ) {
        await closeCurrent();

        const directoryName =
          String(
            message.directoryName || ""
          );

        const fileName =
          String(
            message.fileName || ""
          );

        const truncateTo =
          Math.max(
            0,
            Number(
              message.truncateTo || 0
            )
          );

        if (
          !directoryName ||
          !fileName
        ) {
          throw new Error(
            "Invalid streaming PDF destination."
          );
        }

        const root =
          await scope.navigator
            .storage
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
         * Safari-compatible path.
         */
        if (
          typeof handle
            .createSyncAccessHandle ===
          "function"
        ) {
          syncHandle =
            await handle
              .createSyncAccessHandle();

          syncHandle.truncate(
            truncateTo
          );

          position =
            truncateTo;

          send(
            requestId,
            true,
            {
              position,
              mode:
                "sync",
            }
          );

          return;
        }

        /*
         * Chrome/newer Safari path.
         */
        if (
          typeof handle
            .createWritable ===
          "function"
        ) {
          writable =
            await handle
              .createWritable({
                keepExistingData:
                  truncateTo >
                  0,
              });

          await writable.truncate(
            truncateTo
          );

          if (
            truncateTo >
            0
          ) {
            await writable.seek(
              truncateTo
            );
          }

          position =
            truncateTo;

          send(
            requestId,
            true,
            {
              position,
              mode:
                "async",
            }
          );

          return;
        }

        throw new Error(
          "This browser does not expose a compatible local streaming file API."
        );
      }

      if (
        message.type ===
        "append"
      ) {
        if (
          !message.data
        ) {
          throw new Error(
            "Missing streaming PDF data."
          );
        }

        const bytes =
          new Uint8Array(
            message.data
          );

        if (
          syncHandle
        ) {
          const written =
            syncHandle.write(
              bytes,
              {
                at:
                  position,
              }
            );

          if (
            written !==
            bytes.byteLength
          ) {
            throw new Error(
              `Incomplete PDF write at byte ${position}.`
            );
          }
        } else if (
          writable
        ) {
          await writable.write(
            bytes
          );
        } else {
          throw new Error(
            "Streaming PDF writer is not initialized."
          );
        }

        position +=
          bytes.byteLength;

        send(
          requestId,
          true,
          {
            position,
          }
        );

        return;
      }

      if (
        message.type ===
        "finish"
      ) {
        if (
          syncHandle
        ) {
          syncHandle.flush?.();
          syncHandle.close();

          syncHandle =
            null;
        }

        if (
          writable
        ) {
          await writable.close();

          writable =
            null;
        }

        send(
          requestId,
          true,
          {
            position,
          }
        );

        return;
      }

      if (
        message.type ===
        "abort"
      ) {
        if (
          syncHandle
        ) {
          try {
            syncHandle.close();
          } catch (_) {}

          syncHandle =
            null;
        }

        if (
          writable
        ) {
          try {
            if (
              typeof writable
                .abort ===
              "function"
            ) {
              await writable.abort();
            } else {
              await writable.close();
            }
          } catch (_) {}

          writable =
            null;
        }

        send(
          requestId,
          true,
          {
            position,
          }
        );

        return;
      }

      throw new Error(
        `Unknown streaming command: ${message.type}`
      );
    } catch (
      error: any
    ) {
      send(
        requestId,
        false,
        {
          error:
            error?.message ||
            String(error),
        }
      );
    }
  };

export {};
