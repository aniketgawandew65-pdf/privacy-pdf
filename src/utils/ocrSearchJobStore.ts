import {
  writeOpfsFile,
} from './opfsCompat';


/*
 * ============================================================
 * SEARCHABLE OCR DURABLE JOB
 * ============================================================
 *
 * Why this exists:
 *
 * Safari/iOS can recreate its WebContent process during a large
 * local OCR operation.
 *
 * IndexedDB page checkpoints already survive that event, but
 * sessionStorage is not reliable enough to be the only locator
 * for the original 150 MB source file.
 *
 * This store keeps:
 *
 * OPFS:
 *   the active source PDF
 *
 * IndexedDB:
 *   only small file/job metadata
 *
 * No document bytes leave the device.
 */


const DIRECTORY =
  'oneinto1-ocr-search-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-ocr-search-job';

const STORE_NAME =
  'job';

const ACTIVE_KEY =
  'active';


export type OcrSearchJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  language: string;
  updatedAt: number;
};


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
      OcrSearchJobMeta
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
                    'Unable to save OCR recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };


const readMeta =
  async (): Promise<
    OcrSearchJobMeta |
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


const durableSourceAlreadyMatches =
  async (
    file: File,
    meta: OcrSearchJobMeta | null
  ): Promise<boolean> => {
    if (
      !meta ||
      meta.version !== 1 ||
      meta.name !== file.name ||
      meta.size !== file.size ||
      meta.lastModified !==
        (file.lastModified || 0)
    ) {
      return false;
    }

    if (
      typeof navigator ===
        'undefined' ||
      !navigator.storage ||
      typeof navigator.storage
        .getDirectory !==
        'function'
    ) {
      return false;
    }

    try {
      const root =
        await navigator.storage
          .getDirectory();

      const directory =
        await root.getDirectoryHandle(
          DIRECTORY,
          {
            create: false,
          }
        );

      const handle =
        await directory.getFileHandle(
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


export const saveOcrSearchJobSource =
  async (
    file:
      File,

    language:
      string
  ): Promise<void> => {
    /*
     * Browser recovery can call this function many times.
     *
     * Never rewrite the same 147 MB source merely because
     * Safari recreated the JS process.
     */
    const existingMeta =
      await readMeta()
        .catch(
          () => null
        );

    if (
      await durableSourceAlreadyMatches(
        file,
        existingMeta
      )
    ) {
      /*
       * The source bytes already exist intact in OPFS.
       * Refresh only the tiny job metadata.
       */
      await putMeta({
        version: 1,
        name: file.name,
        type:
          file.type ||
          'application/pdf',
        size: file.size,
        lastModified:
          file.lastModified ||
          0,
        language,
        updatedAt:
          Date.now(),
      });

      return;
    }

    /*
     * IMPORTANT:
     *
     * Write the complete OPFS file BEFORE publishing metadata.
     *
     * A browser kill during the write therefore never advertises
     * a half-written source as a recoverable OCR job.
     */
    await writeOpfsFile(
      DIRECTORY,
      SOURCE_FILE,
      file
    );


    await putMeta({
      version:
        1,

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

      language,

      updatedAt:
        Date.now(),
    });
  };


export const restoreOcrSearchJobSource =
  async (): Promise<
    {
      file: File;
      language: string;
    } |
    null
  > => {
    const meta =
      await readMeta();

    if (
      !meta ||
      meta.version !==
        1
    ) {
      return null;
    }


    if (
      typeof navigator ===
        'undefined' ||
      !navigator.storage ||
      typeof navigator.storage
        .getDirectory !==
        'function'
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
              create:
                false,
            }
          );


      const handle =
        await directory
          .getFileHandle(
            SOURCE_FILE,
            {
              create:
                false,
            }
          );


      const stored =
        await handle
          .getFile();


      /*
       * Reject an incomplete/corrupt recovery source.
       */
      if (
        stored.size !==
        meta.size
      ) {
        return null;
      }


      const restored =
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
        );


      return {
        file:
          restored,

        language:
          meta.language ||
          'eng',
      };
    } catch (
      error
    ) {
      console.warn(
        'Unable to restore durable Searchable OCR source:',
        error
      );

      return null;
    }
  };


export const clearOcrSearchJobSource =
  async (): Promise<void> => {
    /*
     * Remove metadata first so a failure deleting an old OPFS
     * directory can never resurrect a completed job.
     */
    try {
      await deleteMeta();
    } catch (
      error
    ) {
      console.warn(
        'Unable to clear Searchable OCR recovery metadata:',
        error
      );
    }


    if (
      typeof navigator ===
        'undefined' ||
      !navigator.storage ||
      typeof navigator.storage
        .getDirectory !==
        'function'
    ) {
      return;
    }


    try {
      const root =
        await navigator.storage
          .getDirectory();


      await root.removeEntry(
        DIRECTORY,
        {
          recursive:
            true,
        }
      );
    } catch {
      /*
       * Missing directory = already cleared.
       */
    }
  };
