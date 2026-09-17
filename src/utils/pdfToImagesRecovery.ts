import {
  writeOpfsFile,
} from './opfsCompat';

export type PdfImageRecoveryFormat =
  'jpg' |
  'png' |
  'webp';

const DIRECTORY =
  'oneinto1-pdf-images-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-pdf-images-job-v1';

const STORE_NAME =
  'job';

const ACTIVE_KEY =
  'active';

export type PdfToImagesJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  format: PdfImageRecoveryFormat;
  quality: number;
  updatedAt: number;
};

const hasOpfs =
  () =>
    typeof navigator !==
      'undefined' &&
    Boolean(
      navigator.storage
    ) &&
    typeof navigator.storage
      .getDirectory ===
      'function';

const openDb =
  async (): Promise<IDBDatabase> =>
    await new Promise(
      (
        resolve,
        reject
      ) => {
        const request =
          indexedDB.open(
            DB_NAME,
            1
          );

        request.onupgradeneeded =
          () => {
            const db =
              request.result;

            if (
              !db.objectStoreNames
                .contains(
                  STORE_NAME
                )
            ) {
              db.createObjectStore(
                STORE_NAME
              );
            }
          };

        request.onsuccess =
          () =>
            resolve(
              request.result
            );

        request.onerror =
          () =>
            reject(
              request.error
            );
      }
    );

const putMeta =
  async (
    meta:
      PdfToImagesJobMeta
  ): Promise<void> => {
    const db =
      await openDb();

    try {
      await new Promise<void>(
        (
          resolve,
          reject
        ) => {
          const tx =
            db.transaction(
              STORE_NAME,
              'readwrite'
            );

          tx.objectStore(
            STORE_NAME
          ).put(
            meta,
            ACTIVE_KEY
          );

          tx.oncomplete =
            () =>
              resolve();

          tx.onerror =
            tx.onabort =
              () =>
                reject(
                  tx.error ||
                  new Error(
                    'Unable to save PDF image recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };

export const readPdfToImagesJobMeta =
  async (): Promise<
    PdfToImagesJobMeta |
    null
  > => {
    const db =
      await openDb();

    try {
      return await new Promise(
        (
          resolve,
          reject
        ) => {
          const tx =
            db.transaction(
              STORE_NAME,
              'readonly'
            );

          const request =
            tx.objectStore(
              STORE_NAME
            ).get(
              ACTIVE_KEY
            );

          request.onsuccess =
            () =>
              resolve(
                request.result ||
                null
              );

          request.onerror =
            () =>
              reject(
                request.error
              );
        }
      );
    } finally {
      db.close();
    }
  };

const deleteMeta =
  async (): Promise<void> => {
    const db =
      await openDb();

    try {
      await new Promise<void>(
        (
          resolve,
          reject
        ) => {
          const tx =
            db.transaction(
              STORE_NAME,
              'readwrite'
            );

          tx.objectStore(
            STORE_NAME
          ).delete(
            ACTIVE_KEY
          );

          tx.oncomplete =
            () =>
              resolve();

          tx.onerror =
            tx.onabort =
              () =>
                reject(
                  tx.error
                );
        }
      );
    } finally {
      db.close();
    }
  };

const removeDirectory =
  async (): Promise<void> => {
    if (!hasOpfs()) {
      return;
    }

    try {
      const root =
        await navigator.storage
          .getDirectory();

      await root.removeEntry(
        DIRECTORY,
        {
          recursive: true,
        }
      );
    } catch {
      // Already absent.
    }
  };

export const pdfToImagesJobMatchesFile =
  (
    meta:
      PdfToImagesJobMeta |
      null,

    file:
      File
  ): boolean =>
    Boolean(
      meta &&
      meta.version ===
        1 &&
      meta.name ===
        file.name &&
      meta.size ===
        file.size &&
      meta.lastModified ===
        (
          file.lastModified ||
          0
        )
    );

const storedSourceMatches =
  async (
    file:
      File,

    format:
      PdfImageRecoveryFormat,

    quality:
      number,

    meta:
      PdfToImagesJobMeta |
      null
  ): Promise<boolean> => {
    if (
      !pdfToImagesJobMatchesFile(
        meta,
        file
      ) ||
      meta?.format !==
        format ||
      meta?.quality !==
        quality ||
      !hasOpfs()
    ) {
      return false;
    }

    try {
      const root =
        await navigator.storage
          .getDirectory();

      const directory =
        await root
          .getDirectoryHandle(
            DIRECTORY,
            {
              create: false,
            }
          );

      const handle =
        await directory
          .getFileHandle(
            SOURCE_FILE,
            {
              create: false,
            }
          );

      const stored =
        await handle.getFile();

      return (
        stored.size ===
        file.size
      );
    } catch {
      return false;
    }
  };

export const savePdfToImagesJobSource =
  async (
    file:
      File,

    format:
      PdfImageRecoveryFormat,

    quality:
      number
  ): Promise<void> => {
    if (!hasOpfs()) {
      throw new Error(
        'Origin-private storage is unavailable.'
      );
    }

    const existing =
      await readPdfToImagesJobMeta()
        .catch(
          () => null
        );

    if (
      await storedSourceMatches(
        file,
        format,
        quality,
        existing
      )
    ) {
      await putMeta({
        version: 1,
        name:
          file.name,
        type:
          file.type ||
          'application/pdf',
        size:
          file.size,
        lastModified:
          file.lastModified ||
          0,
        format,
        quality,
        updatedAt:
          Date.now(),
      });

      return;
    }

    /*
     * Never advertise an incomplete replacement recovery job.
     */
    await deleteMeta()
      .catch(
        () => {}
      );

    await removeDirectory();

    /*
     * Source finishes writing before metadata becomes active.
     */
    await writeOpfsFile(
      DIRECTORY,
      SOURCE_FILE,
      file
    );

    await putMeta({
      version: 1,
      name:
        file.name,
      type:
        file.type ||
        'application/pdf',
      size:
        file.size,
      lastModified:
        file.lastModified ||
        0,
      format,
      quality,
      updatedAt:
        Date.now(),
    });
  };

export const restorePdfToImagesJobSource =
  async (): Promise<
    {
      file: File;
      format: PdfImageRecoveryFormat;
      quality: number;
    } |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    const meta =
      await readPdfToImagesJobMeta();

    if (
      !meta ||
      meta.version !==
        1
    ) {
      return null;
    }

    try {
      const root =
        await navigator.storage
          .getDirectory();

      const directory =
        await root
          .getDirectoryHandle(
            DIRECTORY,
            {
              create: false,
            }
          );

      const handle =
        await directory
          .getFileHandle(
            SOURCE_FILE,
            {
              create: false,
            }
          );

      const stored =
        await handle.getFile();

      if (
        stored.size !==
        meta.size
      ) {
        return null;
      }

      return {
        file:
          new File(
            [
              stored,
            ],
            meta.name,
            {
              type:
                meta.type ||
                'application/pdf',

              lastModified:
                meta.lastModified ||
                Date.now(),
            }
          ),

        format:
          meta.format,

        quality:
          meta.quality,
      };
    } catch (
      error
    ) {
      console.warn(
        'Unable to restore PDF to Image source:',
        error
      );

      return null;
    }
  };

const pageName =
  (
    pageNumber:
      number,

    format:
      PdfImageRecoveryFormat
  ) =>
    `page-${pageNumber}.${format}`;

const validEncodedPage =
  async (
    file:
      File,

    format:
      PdfImageRecoveryFormat
  ): Promise<boolean> => {
    if (
      file.size <
      12
    ) {
      return false;
    }

    const head =
      new Uint8Array(
        await file
          .slice(
            0,
            12
          )
          .arrayBuffer()
      );

    if (
      format ===
      'jpg'
    ) {
      return (
        head[0] ===
          0xff &&
        head[1] ===
          0xd8
      );
    }

    if (
      format ===
      'png'
    ) {
      return (
        head[0] === 0x89 &&
        head[1] === 0x50 &&
        head[2] === 0x4e &&
        head[3] === 0x47
      );
    }

    return (
      String.fromCharCode(
        head[0],
        head[1],
        head[2],
        head[3]
      ) ===
        'RIFF' &&
      String.fromCharCode(
        head[8],
        head[9],
        head[10],
        head[11]
      ) ===
        'WEBP'
    );
  };

export const readPdfToImagesPage =
  async (
    pageNumber:
      number,

    format:
      PdfImageRecoveryFormat
  ): Promise<
    Blob |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    try {
      const root =
        await navigator.storage
          .getDirectory();

      const directory =
        await root
          .getDirectoryHandle(
            DIRECTORY,
            {
              create: false,
            }
          );

      const handle =
        await directory
          .getFileHandle(
            pageName(
              pageNumber,
              format
            ),
            {
              create: false,
            }
          );

      const file =
        await handle.getFile();

      if (
        !await validEncodedPage(
          file,
          format
        )
      ) {
        return null;
      }

      /*
       * OPFS does not reliably preserve the original MIME type.
       * Safari needs the correct content type for image preview
       * and individual Save links.
       *
       * slice() keeps this lightweight/file-backed; it does not
       * require loading the complete image into JS memory.
       */
      const mimeType =
        format === 'png'
          ? 'image/png'
          : format === 'webp'
            ? 'image/webp'
            : 'image/jpeg';

      return file.slice(
        0,
        file.size,
        mimeType
      );
    } catch {
      return null;
    }
  };

export const writePdfToImagesPage =
  async (
    pageNumber:
      number,

    format:
      PdfImageRecoveryFormat,

    blob:
      Blob
  ): Promise<void> => {
    await writeOpfsFile(
      DIRECTORY,
      pageName(
        pageNumber,
        format
      ),
      blob
    );
  };

export const finalizePdfToImagesRecovery =
  async (): Promise<void> => {
    /*
     * Conversion succeeded.
     *
     * Remove the active-job metadata so Safari will NOT treat
     * this as an interrupted conversion after a reload.
     *
     * Keep page-N image files because the preview and individual
     * Save buttons are still using them.
     */
    await deleteMeta()
      .catch(
        (
          error
        ) => {
          console.warn(
            'Unable to finalize PDF image recovery metadata:',
            error
          );
        }
      );

    if (!hasOpfs()) {
      return;
    }

    try {
      const root =
        await navigator.storage
          .getDirectory();

      const directory =
        await root
          .getDirectoryHandle(
            DIRECTORY,
            {
              create: false,
            }
          );

      /*
       * The original 150 MB PDF is no longer needed after all
       * image pages have been successfully created.
       */
      await directory.removeEntry(
        SOURCE_FILE
      );
    } catch {
      // Source may already be absent.
    }
  };


export const clearPdfToImagesRecovery =
  async (): Promise<void> => {
    /*
     * Metadata first so partial cleanup cannot resurrect a
     * completed conversion.
     */
    await deleteMeta()
      .catch(
        (
          error
        ) => {
          console.warn(
            'Unable to clear PDF image recovery metadata:',
            error
          );
        }
      );

    await removeDirectory();
  };
