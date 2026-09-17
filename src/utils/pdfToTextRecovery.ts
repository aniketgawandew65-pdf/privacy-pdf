import {
  writeOpfsFile,
} from './opfsCompat';

const DIRECTORY =
  'oneinto1-pdf-text-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-pdf-text-job-v1';

const JOB_STORE =
  'job';

const PAGE_STORE =
  'pages';

const ACTIVE_KEY =
  'active';

export type PdfToTextJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  updatedAt: number;
};

export type PdfToTextPageResult = {
  completed: true;
  text: string;
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
                  JOB_STORE
                )
            ) {
              db.createObjectStore(
                JOB_STORE
              );
            }

            if (
              !db.objectStoreNames
                .contains(
                  PAGE_STORE
                )
            ) {
              db.createObjectStore(
                PAGE_STORE
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
      PdfToTextJobMeta
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
              JOB_STORE,
              'readwrite'
            );

          tx.objectStore(
            JOB_STORE
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
                    'Unable to save PDF text recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };

export const readPdfToTextJobMeta =
  async (): Promise<
    PdfToTextJobMeta |
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
              JOB_STORE,
              'readonly'
            );

          const request =
            tx.objectStore(
              JOB_STORE
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

const clearDb =
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
              [
                JOB_STORE,
                PAGE_STORE,
              ],
              'readwrite'
            );

          tx.objectStore(
            JOB_STORE
          ).clear();

          tx.objectStore(
            PAGE_STORE
          ).clear();

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

export const pdfToTextJobMatchesFile =
  (
    meta:
      PdfToTextJobMeta |
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

    meta:
      PdfToTextJobMeta |
      null
  ): Promise<boolean> => {
    if (
      !pdfToTextJobMatchesFile(
        meta,
        file
      ) ||
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

export const savePdfToTextJobSource =
  async (
    file:
      File
  ): Promise<void> => {
    if (!hasOpfs()) {
      throw new Error(
        'Origin-private storage is unavailable.'
      );
    }

    const existing =
      await readPdfToTextJobMeta()
        .catch(
          () => null
        );

    if (
      await storedSourceMatches(
        file,
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
        updatedAt:
          Date.now(),
      });

      return;
    }

    /*
     * New/different source: old page checkpoints must not leak
     * into this extraction.
     */
    await clearDb()
      .catch(
        () => {}
      );

    await removeDirectory();

    /*
     * Write the complete large PDF before publishing metadata.
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
      updatedAt:
        Date.now(),
    });
  };

export const restorePdfToTextJobSource =
  async (): Promise<
    File |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    const meta =
      await readPdfToTextJobMeta();

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

      return new File(
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
    } catch (
      error
    ) {
      console.warn(
        'Unable to restore PDF to Text source:',
        error
      );

      return null;
    }
  };

export const readPdfToTextPage =
  async (
    pageNumber:
      number
  ): Promise<
    PdfToTextPageResult |
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
              PAGE_STORE,
              'readonly'
            );

          const request =
            tx.objectStore(
              PAGE_STORE
            ).get(
              pageNumber
            );

          request.onsuccess =
            () => {
              if (
                typeof request.result ===
                  'string'
              ) {
                resolve({
                  completed:
                    true,
                  text:
                    request.result,
                });
              } else {
                resolve(
                  null
                );
              }
            };

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

export const writePdfToTextPage =
  async (
    pageNumber:
      number,

    text:
      string
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
              PAGE_STORE,
              'readwrite'
            );

          /*
           * Empty string is valid: it means the page completed
           * but no readable text was found.
           */
          tx.objectStore(
            PAGE_STORE
          ).put(
            text,
            pageNumber
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
                    'Unable to checkpoint extracted page text.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };

export const clearPdfToTextRecovery =
  async (): Promise<void> => {
    await clearDb()
      .catch(
        (
          error
        ) => {
          console.warn(
            'Unable to clear PDF to Text recovery database:',
            error
          );
        }
      );

    await removeDirectory();
  };
