import {
  writeOpfsFile,
} from './opfsCompat';

export type PdfToCsvDelimiter =
  ',' |
  ';' |
  '\t';

export type PdfToCsvSettings = {
  delimiter: PdfToCsvDelimiter;
  yTolerance: number;
  minColumnGap: number;
};

export type PdfToCsvPageCheckpoint = {
  digitalCompleted: boolean;
  digitalRows: string[][];
  digitalItemCount: number;
  ocrCompleted: boolean;
  ocrRows: string[][];
};

export type PdfToCsvJobMeta = {
  version: 2;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  delimiter: PdfToCsvDelimiter;
  yTolerance: number;
  minColumnGap: number;
  updatedAt: number;
};

const DIRECTORY =
  'oneinto1-pdf-csv-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-pdf-csv-job-v1';

const JOB_STORE =
  'job';

const PAGE_STORE =
  'pages';

const ACTIVE_KEY =
  'active';


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
      PdfToCsvJobMeta
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
                    'Unable to save PDF to CSV recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };


export const readPdfToCsvJobMeta =
  async (): Promise<
    PdfToCsvJobMeta |
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


const clearDatabase =
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


const sameSettings =
  (
    meta:
      PdfToCsvJobMeta,

    settings:
      PdfToCsvSettings
  ) =>
    meta.delimiter ===
      settings.delimiter &&
    meta.yTolerance ===
      settings.yTolerance &&
    meta.minColumnGap ===
      settings.minColumnGap;


export const pdfToCsvJobMatchesFile =
  (
    meta:
      PdfToCsvJobMeta |
      null,

    file:
      File
  ): boolean =>
    Boolean(
      meta &&
      meta.version === 2 &&
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

    settings:
      PdfToCsvSettings,

    meta:
      PdfToCsvJobMeta |
      null
  ): Promise<boolean> => {
    if (
      !meta ||
      !pdfToCsvJobMatchesFile(
        meta,
        file
      ) ||
      !sameSettings(
        meta,
        settings
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


export const savePdfToCsvJobSource =
  async (
    file:
      File,

    settings:
      PdfToCsvSettings
  ): Promise<void> => {
    if (!hasOpfs()) {
      throw new Error(
        'Origin-private storage is unavailable.'
      );
    }

    const existing =
      await readPdfToCsvJobMeta()
        .catch(
          () => null
        );

    if (
      await storedSourceMatches(
        file,
        settings,
        existing
      )
    ) {
      await putMeta({
        version: 2,
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
        delimiter:
          settings.delimiter,
        yTolerance:
          settings.yTolerance,
        minColumnGap:
          settings.minColumnGap,
        updatedAt:
          Date.now(),
      });

      return;
    }

    /*
     * A new file or changed parsing settings must not reuse
     * page results from the old extraction.
     */
    await clearDatabase()
      .catch(
        () => {}
      );

    await removeDirectory();

    /*
     * Write all source bytes before making this recovery job
     * active.
     */
    await writeOpfsFile(
      DIRECTORY,
      SOURCE_FILE,
      file
    );

    await putMeta({
      version: 2,
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
      delimiter:
        settings.delimiter,
      yTolerance:
        settings.yTolerance,
      minColumnGap:
        settings.minColumnGap,
      updatedAt:
        Date.now(),
    });
  };


export const restorePdfToCsvJobSource =
  async (): Promise<
    {
      file: File;
      settings: PdfToCsvSettings;
    } |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    const meta =
      await readPdfToCsvJobMeta();

    if (
      !meta ||
      meta.version !==
        2
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

        settings: {
          delimiter:
            meta.delimiter,

          yTolerance:
            meta.yTolerance,

          minColumnGap:
            meta.minColumnGap,
        },
      };
    } catch (
      error
    ) {
      console.warn(
        'Unable to restore PDF to CSV source:',
        error
      );

      return null;
    }
  };


export const readPdfToCsvPage =
  async (
    pageNumber:
      number
  ): Promise<
    PdfToCsvPageCheckpoint |
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
              const value =
                request.result;

              if (
                value &&
                typeof value ===
                  'object'
              ) {
                resolve(
                  value as
                    PdfToCsvPageCheckpoint
                );
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


export const writePdfToCsvPage =
  async (
    pageNumber:
      number,

    checkpoint:
      PdfToCsvPageCheckpoint
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

          tx.objectStore(
            PAGE_STORE
          ).put(
            checkpoint,
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
                    'Unable to checkpoint PDF to CSV page.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };


export const clearPdfToCsvRecovery =
  async (): Promise<void> => {
    await clearDatabase()
      .catch(
        (
          error
        ) => {
          console.warn(
            'Unable to clear PDF to CSV recovery database:',
            error
          );
        }
      );

    await removeDirectory();
  };
