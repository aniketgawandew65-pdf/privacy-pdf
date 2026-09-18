import {
  Zip,
  ZipPassThrough,
} from 'fflate';

import {
  EXTRACT_IMAGES_DIRECTORY,
} from '../utils/extractImagesStorage';


type ZipImage = {
  name:
    string;

  blob:
    Blob;
};


type Request = {
  requestId:
    string;

  baseName:
    string;

  images:
    ZipImage[];
};


const OUTPUT_FILE =
  'extracted-images.zip';


const cleanBaseName =
  (
    value:
      string
  ) =>
    value.replace(
      /\.[^/.]+$/,
      ''
    );


self.onmessage =
  async (
    event:
      MessageEvent<Request>
  ) => {
    const {
      requestId,
      baseName,
      images,
    } =
      event.data;


    const sendProgress =
      (
        current:
          number,

        total:
          number
      ) => {
        (
          self as any
        ).postMessage({
          type:
            'progress',

          requestId,

          current,

          total,
        });
      };


    let access:
      any =
        null;


    try {
      if (
        !navigator.storage ||
        typeof navigator.storage
          .getDirectory !==
          'function'
      ) {
        throw new Error(
          'Browser-local storage is unavailable.'
        );
      }


      const root =
        await navigator.storage
          .getDirectory();


      const directory =
        await root
          .getDirectoryHandle(
            EXTRACT_IMAGES_DIRECTORY,
            {
              create:
                true,
            }
          );


      const handle:
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
        typeof handle
          .createSyncAccessHandle !==
        'function'
      ) {
        throw new Error(
          'Memory-safe ZIP creation is unavailable in this browser.'
        );
      }


      access =
        await handle
          .createSyncAccessHandle();


      access.truncate(
        0
      );


      let outputOffset =
        0;


      const writeChunk =
        (
          data:
            Uint8Array
        ) => {
        /*
         * Write ZIP output directly to OPFS in bounded slices.
         *
         * No giant ZIP chunks[] array is retained in memory.
         */
        const WRITE_SLICE =
          256 *
          1024;


        let sourceOffset =
          0;


        while (
          sourceOffset <
          data.length
        ) {
          const end =
            Math.min(
              data.length,
              sourceOffset +
                WRITE_SLICE
            );


          const view =
            data.subarray(
              sourceOffset,
              end
            );


          let writtenFromView =
            0;


          while (
            writtenFromView <
            view.length
          ) {
            const written =
              access!.write(
                view.subarray(
                  writtenFromView
                ) as any,
                {
                  at:
                    outputOffset,
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
                'Unable to write ZIP archive to browser-local storage.'
              );
            }


            writtenFromView +=
              written;

            outputOffset +=
              written;
          }


          sourceOffset =
            end;
        }
      };


      let zipFailure:
        unknown =
          null;


      let resolveFinished!:
        () => void;


      let rejectFinished!:
        (
          reason:
            unknown
        ) => void;


      const zipFinished =
        new Promise<void>(
          (
            resolve,
            reject
          ) => {
            resolveFinished =
              resolve;

            rejectFinished =
              reject;
          }
        );


      const zip =
        new Zip(
          (
            error,
            data,
            final
          ) => {
            if (error) {
              zipFailure =
                error;

              rejectFinished(
                error
              );

              return;
            }


            try {
              if (
                data &&
                data.length
              ) {
                writeChunk(
                  data
                );
              }


              if (final) {
                resolveFinished();
              }
            } catch (
              writeError
            ) {
              zipFailure =
                writeError;

              rejectFinished(
                writeError
              );
            }
          }
        );


      const prefix =
        cleanBaseName(
          baseName
        );


      for (
        let index = 0;
        index <
        images.length;
        index++
      ) {
        if (zipFailure) {
          throw zipFailure;
        }


        const image =
          images[index];


        sendProgress(
          index + 1,
          images.length
        );


        const entry =
          new ZipPassThrough(
            `${prefix}_${image.name}`
          );


        zip.add(
          entry
        );


        /*
         * Read exactly ONE OPFS-backed image into memory.
         * Once ZipPassThrough emits it to our OPFS writer,
         * this ArrayBuffer can be reclaimed before the next image.
         */
        const bytes =
          new Uint8Array(
            await image.blob
              .arrayBuffer()
          );


        entry.push(
          bytes,
          true
        );


        if (zipFailure) {
          throw zipFailure;
        }


        await new Promise<void>(
          (
            resolve
          ) =>
            setTimeout(
              resolve,
              0
            )
        );
      }


      zip.end();


      await zipFinished;


      if (zipFailure) {
        throw zipFailure;
      }


      access.flush();

      access.truncate(
        outputOffset
      );

      access.close();

      access =
        null;


      const outputFile =
        await handle.getFile();


      if (
        outputFile.size <
        4
      ) {
        throw new Error(
          'Extracted images ZIP is empty.'
        );
      }


      /*
       * File is browser-storage-backed.
       * Do not convert the complete ZIP into an ArrayBuffer.
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
      if (access) {
        try {
          access.close();
        } catch (_) {}
      }


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
              'Unable to create extracted images ZIP.'
          ),
      });
    }
  };
