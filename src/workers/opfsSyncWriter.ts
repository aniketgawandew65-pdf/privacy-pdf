/*
 * ============================================================
 * 1into1 OPFS COMPATIBILITY WRITER
 * ============================================================
 *
 * Safari versions which expose OPFS but do not expose
 * FileSystemFileHandle.createWritable() can still write OPFS
 * files using createSyncAccessHandle().
 *
 * createSyncAccessHandle() is intentionally worker-only.
 *
 * Large Blobs are written in short chunks so a 150 MB PDF is
 * never duplicated into one giant ArrayBuffer inside the worker.
 */

const workerScope: any =
  self as any;

const CHUNK_SIZE =
  4 * 1024 * 1024;

workerScope.onmessage =
  async (
    event: MessageEvent
  ) => {
    const {
      requestId,
      directoryName,
      fileName,
      blob,
    } = event.data || {};

    let accessHandle:
      any =
      null;

    try {
      if (
        !directoryName ||
        !fileName ||
        !(blob instanceof Blob)
      ) {
        throw new Error(
          "Invalid OPFS worker write request."
        );
      }

      const root =
        await (
          workerScope.navigator
            .storage
            .getDirectory()
        );

      const directory =
        await root
          .getDirectoryHandle(
            directoryName,
            {
              create: true,
            }
          );

      const fileHandle =
        await directory
          .getFileHandle(
            fileName,
            {
              create: true,
            }
          );

      if (
        typeof fileHandle
          .createSyncAccessHandle !==
        "function"
      ) {
        throw new Error(
          "This browser does not provide a compatible OPFS write API."
        );
      }

      accessHandle =
        await fileHandle
          .createSyncAccessHandle();

      /*
       * Start from an empty file.
       */
      accessHandle.truncate(
        0
      );

      let offset =
        0;

      while (
        offset <
        blob.size
      ) {
        const end =
          Math.min(
            blob.size,
            offset +
              CHUNK_SIZE
          );

        const chunk =
          new Uint8Array(
            await blob
              .slice(
                offset,
                end
              )
              .arrayBuffer()
          );

        const written =
          accessHandle.write(
            chunk,
            {
              at: offset,
            }
          );

        if (
          written !==
          chunk.byteLength
        ) {
          throw new Error(
            `Incomplete OPFS write at byte ${offset}.`
          );
        }

        offset +=
          written;
      }

      accessHandle.truncate(
        blob.size
      );

      if (
        typeof accessHandle
          .flush ===
        "function"
      ) {
        accessHandle.flush();
      }

      accessHandle.close();
      accessHandle =
        null;

      workerScope.postMessage({
        requestId,
        ok: true,
      });
    } catch (
      error: any
    ) {
      try {
        accessHandle?.close();
      } catch (_) {}

      workerScope.postMessage({
        requestId,
        ok: false,
        error:
          error?.message ||
          String(error),
      });
    }
  };

export {};
