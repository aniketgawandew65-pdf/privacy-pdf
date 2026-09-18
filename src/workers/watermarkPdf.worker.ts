import createQpdfModule from '@neslinesli93/qpdf-wasm';
import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';


type Request = {
  requestId: string;
  file: File;
  stampBuffer: ArrayBuffer;
};


const INPUT_DIR =
  '/watermark-input';

const OUTPUT_DIRECTORY =
  'oneinto1-watermark-output-v1';

const OUTPUT_FILE =
  'watermarked-output.pdf';


const getExitCode =
  (
    error:
      any
  ):
    number |
    null => {
    if (
      error &&
      typeof error.status ===
        'number'
    ) {
      return error.status;
    }

    return null;
  };


const openOutputStream =
  async () => {
    if (
      !navigator.storage ||
      typeof navigator.storage
        .getDirectory !==
        'function'
    ) {
      throw new Error(
        'Browser-local file storage is unavailable.'
      );
    }


    const root =
      await navigator.storage
        .getDirectory();


    const directory =
      await root
        .getDirectoryHandle(
          OUTPUT_DIRECTORY,
          {
            create:
              true,
          }
        );


    const fileHandle:
      any =
      await directory
        .getFileHandle(
          OUTPUT_FILE,
          {
            create:
              true,
          }
        );


    if (
      typeof fileHandle
        .createSyncAccessHandle !==
      'function'
    ) {
      throw new Error(
        'This browser does not support memory-safe large PDF output.'
      );
    }


    /*
     * SyncAccessHandle is allowed inside a Dedicated Worker.
     * qpdf can therefore write bytes directly to OPFS without
     * building the finished PDF in JavaScript memory.
     */
    const access =
      await fileHandle
        .createSyncAccessHandle();


    access.truncate(
      0
    );


    const chunk =
      new Uint8Array(
        64 *
        1024
      );


    let chunkLength =
      0;

    let fileOffset =
      0;

    let closed =
      false;


    const flushChunk =
      () => {
        if (
          chunkLength ===
          0
        ) {
          return;
        }


        let writtenTotal =
          0;


        while (
          writtenTotal <
          chunkLength
        ) {
          const written =
            access.write(
              chunk.subarray(
                writtenTotal,
                chunkLength
              ),
              {
                at:
                  fileOffset +
                  writtenTotal,
              }
            );


          if (
            !Number.isFinite(
              written
            ) ||
            written <=
              0
          ) {
            throw new Error(
              'Unable to write watermarked PDF to browser-local storage.'
            );
          }


          writtenTotal +=
            written;
        }


        fileOffset +=
          chunkLength;

        chunkLength =
          0;
      };


    const writeByte =
      (
        byte:
          number |
          null
      ) => {
        if (
          byte ===
          null
        ) {
          return;
        }


        chunk[
          chunkLength
        ] =
          byte &
          0xff;


        chunkLength++;


        if (
          chunkLength ===
          chunk.length
        ) {
          flushChunk();
        }
      };


    const finish =
      () => {
        if (
          closed
        ) {
          return;
        }


        flushChunk();

        access.flush();

        /*
         * Guarantee there are no stale bytes from a previous
         * larger output using the same OPFS filename.
         */
        access.truncate(
          fileOffset
        );

        access.close();

        closed =
          true;
      };


    const abort =
      () => {
        if (
          closed
        ) {
          return;
        }


        try {
          access.close();
        } catch (_) {}


        closed =
          true;
      };


    return {
      directory,
      fileHandle,
      writeByte,
      finish,
      abort,
      getSize:
        () =>
          fileOffset,
    };
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


    let outputStream:
      Awaited<
        ReturnType<
          typeof openOutputStream
        >
      > |
      null =
        null;


    let qpdf:
      any =
        null;


    try {
      sendProgress(
        10
      );


      /*
       * noFSInit lets us install our OWN stdout handler.
       *
       * qpdf's binary PDF output will be written directly
       * into OPFS instead of MEMFS or a giant JS array.
       */
      qpdf =
        await (
          createQpdfModule as
            any
        )({
          locateFile:
            () =>
              qpdfWasmUrl,

          noInitialRun:
            true,

          noFSInit:
            true,
        });


      sendProgress(
        20
      );


      outputStream =
        await openOutputStream();


      /*
       * Capture only a small amount of stderr for useful
       * qpdf error messages.
       */
      const stderrBytes:
        number[] =
          [];

      const STDERR_LIMIT =
        64 *
        1024;


      const writeErrorByte =
        (
          byte:
            number |
            null
        ) => {
          if (
            byte ===
              null ||
            stderrBytes.length >=
              STDERR_LIMIT
          ) {
            return;
          }


          stderrBytes.push(
            byte &
              0xff
          );
        };


      /*
       * stdin = null
       * stdout = direct OPFS writer
       * stderr = tiny bounded diagnostic buffer
       */
      qpdf.FS.init(
        null,
        outputStream.writeByte,
        writeErrorByte
      );


      sendProgress(
        30
      );


      try {
        qpdf.FS.mkdir(
          INPUT_DIR
        );
      } catch (_) {}


      const stampBlob =
        new Blob(
          [
            stampBuffer,
          ],
          {
            type:
              'application/pdf',
          }
        );


      /*
       * ORIGINAL SOURCE:
       * browser File/Blob mounted directly using WORKERFS.
       *
       * There is no:
       * file.arrayBuffer()
       * Uint8Array(source)
       * MEMFS source copy
       */
      qpdf.FS.mount(
        qpdf.WORKERFS,
        {
          blobs: [
            {
              name:
                'source.pdf',

              data:
                file,
            },

            {
              name:
                'stamp.pdf',

              data:
                stampBlob,
            },
          ],
        },
        INPUT_DIR
      );


      const sourcePath =
        `${INPUT_DIR}/source.pdf`;

      const stampPath =
        `${INPUT_DIR}/stamp.pdf`;


      sendProgress(
        40
      );


      let exitCode =
        0;


      try {
        /*
         * "-" = qpdf standard output.
         *
         * Our FS.init stdout callback immediately streams those
         * PDF bytes into the OPFS SyncAccessHandle.
         *
         * Original page content remains lossless.
         */
        exitCode =
          qpdf.callMain([
            '--overlay',
            stampPath,
            '--',
            sourcePath,
            '-',
          ]);
      } catch (
        error:
          any
      ) {
        const status =
          getExitCode(
            error
          );


        if (
          status ===
          null
        ) {
          throw error;
        }


        exitCode =
          status;
      }


      if (
        exitCode !==
          0 &&
        exitCode !==
          3
      ) {
        outputStream.abort();


        const stderr =
          new TextDecoder()
            .decode(
              new Uint8Array(
                stderrBytes
              )
            )
            .trim();


        throw new Error(
          stderr ||
            `qpdf watermark failed with exit code ${exitCode}.`
        );
      }


      /*
       * Flush final partial 64 KB chunk and close the disk file.
       */
      outputStream.finish();


      sendProgress(
        90
      );


      try {
        qpdf.FS.unmount(
          INPUT_DIR
        );
      } catch (_) {}


      const outputFile =
        await outputStream
          .fileHandle
          .getFile();


      if (
        outputFile.size <
        5
      ) {
        throw new Error(
          'Watermarked PDF output is empty.'
        );
      }


      sendProgress(
        98
      );


      /*
       * Send the browser-backed File object.
       *
       * DO NOT:
       * output.arrayBuffer()
       * FS.readFile()
       * transfer a 150 MB ArrayBuffer
       */
      (
        self as any
      ).postMessage({
        type:
          'success',

        requestId,

        file:
          outputFile,
      });
    } catch (
      error:
        any
    ) {
      try {
        outputStream
          ?.abort();
      } catch (_) {}


      try {
        qpdf?.FS?.unmount?.(
          INPUT_DIR
        );
      } catch (_) {}


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
