/*
 * 1into1 PDF
 * Crash-safe streaming OPFS writer.
 *
 * Rules:
 *
 * 1. Never acknowledge a checkpoint until bytes are durable.
 * 2. Never resume beyond the durable file size.
 * 3. SyncAccessHandle.write() may perform a partial write,
 *    therefore keep writing until the complete chunk is stored.
 */

const scope:
  any =
  self as any;

let fileHandle:
  any =
  null;

let syncHandle:
  any =
  null;

let writable:
  any =
  null;

let position =
  0;

const send =
  (
    requestId:
      string,
    ok:
      boolean,
    extra:
      Record<string, unknown> = {}
  ) => {
    scope.postMessage({
      requestId,
      ok,
      ...extra,
    });
  };

const closeCurrent =
  async () => {
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
        await writable.close();
      } catch (_) {}

      writable =
        null;
    }

    fileHandle =
      null;
  };

const getDurableSize =
  async (
    handle:
      any
  ) => {
    if (
      !handle ||
      typeof handle.getFile !==
        'function'
    ) {
      throw new Error(
        'Unable to verify durable local PDF size.'
      );
    }

    const file =
      await handle.getFile();

    const size =
      Number(
        file?.size
      );

    if (
      !Number.isFinite(
        size
      ) ||
      size <
        0
    ) {
      throw new Error(
        'Invalid durable local PDF size.'
      );
    }

    return size;
  };

const reopenWritable =
  async () => {
    if (
      !fileHandle ||
      typeof fileHandle
        .createWritable !==
        'function'
    ) {
      throw new Error(
        'Unable to reopen local PDF writer.'
      );
    }

    writable =
      await fileHandle
        .createWritable({
          keepExistingData:
            true,
        });

    if (
      position >
        0
    ) {
      await writable.seek(
        position
      );
    }
  };

const writeSyncFully =
  (
    bytes:
      Uint8Array
  ) => {
    if (
      !syncHandle
    ) {
      throw new Error(
        'Synchronous PDF writer is unavailable.'
      );
    }

    let writtenTotal =
      0;

    while (
      writtenTotal <
      bytes.byteLength
    ) {
      const remaining =
        bytes.subarray(
          writtenTotal
        );

      const written =
        Number(
          syncHandle.write(
            remaining,
            {
              at:
                position +
                writtenTotal,
            }
          )
        );

      if (
        !Number.isFinite(
          written
        ) ||
        written <=
          0 ||
        written >
          remaining.byteLength
      ) {
        throw new Error(
          `Incomplete PDF write at byte ${
            position +
            writtenTotal
          }.`
        );
      }

      writtenTotal +=
        written;
    }
  };

scope.onmessage =
  async (
    event:
      MessageEvent
  ) => {
    const message =
      event.data ||
      {};

    const requestId =
      String(
        message.requestId ||
          ''
      );

    try {
      if (
        message.type ===
        'init'
      ) {
        await closeCurrent();

        const directoryName =
          String(
            message.directoryName ||
              ''
          );

        const fileName =
          String(
            message.fileName ||
              ''
          );

        const truncateTo =
          Math.max(
            0,
            Number(
              message.truncateTo ||
                0
            )
          );

        if (
          !directoryName ||
          !fileName
        ) {
          throw new Error(
            'Invalid streaming PDF destination.'
          );
        }

        const root =
          await scope
            .navigator
            .storage
            .getDirectory();

        const directory =
          await root
            .getDirectoryHandle(
              directoryName,
              {
                create:
                  true,
              }
            );

        fileHandle =
          await directory
            .getFileHandle(
              fileName,
              {
                create:
                  true,
              }
            );

        /*
         * CRITICAL RESUME INVARIANT
         *
         * A checkpoint may only point to bytes that are already
         * present in the durable file.
         *
         * Never silently extend a file to satisfy a corrupt or
         * premature checkpoint.
         */
        const durableSize =
          await getDurableSize(
            fileHandle
          );

        if (
          truncateTo >
          durableSize
        ) {
          throw new Error(
            `Resume checkpoint ${truncateTo} exceeds durable PDF size ${durableSize}.`
          );
        }

        /*
         * Preferred worker-local synchronous OPFS path.
         */
        if (
          typeof fileHandle
            .createSyncAccessHandle ===
          'function'
        ) {
          syncHandle =
            await fileHandle
              .createSyncAccessHandle();

          /*
           * Remove any uncommitted tail beyond the known-good
           * checkpoint. This becomes durable only on commit().
           */
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
                'sync',
            }
          );

          return;
        }

        /*
         * Async OPFS fallback.
         */
        if (
          typeof fileHandle
            .createWritable ===
          'function'
        ) {
          writable =
            await fileHandle
              .createWritable({
                keepExistingData:
                  true,
              });

          /*
           * Same rule: discard everything after the last known
           * durable checkpoint.
           */
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
                'async',
            }
          );

          return;
        }

        throw new Error(
          'No compatible local streaming file API is available.'
        );
      }

      if (
        message.type ===
        'append'
      ) {
        if (
          !message.data
        ) {
          throw new Error(
            'Missing streaming PDF data.'
          );
        }

        const bytes =
          new Uint8Array(
            message.data
          );

        if (
          syncHandle
        ) {
          /*
           * SyncAccessHandle.write() is allowed to perform a
           * partial write.
           *
           * Keep writing until the entire buffer is stored.
           */
          writeSyncFully(
            bytes
          );
        } else if (
          writable
        ) {
          await writable.write(
            bytes
          );
        } else {
          throw new Error(
            'Streaming PDF writer is not initialized.'
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

      /*
       * ======================================================
       * DURABLE PAGE COMMIT
       * ======================================================
       *
       * streamingRedact.ts is only allowed to advance its page
       * checkpoint AFTER this operation succeeds.
       */
      if (
        message.type ===
        'commit'
      ) {
        if (
          syncHandle
        ) {
          /*
           * flush() is the durability boundary for the sync path.
           */
          syncHandle.flush();
        } else if (
          writable
        ) {
          /*
           * FileSystemWritableFileStream commits its temporary
           * file when close() succeeds.
           */
          await writable.close();

          writable =
            null;

          /*
           * Reopen the now-durable file and continue appending at
           * the same logical position.
           */
          await reopenWritable();
        } else {
          throw new Error(
            'Streaming PDF writer is not initialized.'
          );
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
        'finish'
      ) {
        if (
          syncHandle
        ) {
          syncHandle.flush();
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

        fileHandle =
          null;

        send(
          requestId,
          true,
          {
            position,
          }
        );

        return;
      }

      /*
       * Abort must NOT make uncommitted bytes durable.
       */
      if (
        message.type ===
        'abort'
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
              'function'
            ) {
              await writable.abort();
            } else {
              await writable.close();
            }
          } catch (_) {}

          writable =
            null;
        }

        fileHandle =
          null;

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
      error:
        any
    ) {
      send(
        requestId,
        false,
        {
          error:
            error?.message ||
            String(
              error
            ),
        }
      );
    }
  };

export {};
