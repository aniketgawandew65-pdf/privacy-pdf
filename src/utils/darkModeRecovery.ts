import {
  writeOpfsFile,
} from './opfsCompat';

import type {
  DarkModeFilter,
} from './pdfEngine';

const DIRECTORY =
  'oneinto1-dark-mode-recovery-v2';

const LEGACY_DIRECTORY =
  'oneinto1-dark-mode-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-dark-mode-job-v2';

const STORE_NAME =
  'job';

const ACTIVE_KEY =
  'active';

export type DarkModeJobMeta = {
  version: 2;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  filter: DarkModeFilter;
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
      DarkModeJobMeta
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
                    'Unable to save Dark Mode recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };

export const readDarkModeJobMeta =
  async (): Promise<
    DarkModeJobMeta |
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
  async (
    name:
      string
  ): Promise<void> => {
    if (!hasOpfs()) {
      return;
    }

    try {
      const root =
        await navigator.storage
          .getDirectory();

      await root.removeEntry(
        name,
        {
          recursive: true,
        }
      );
    } catch {
      // Already absent.
    }
  };

export const darkModeJobMatchesFile =
  (
    meta:
      DarkModeJobMeta |
      null,

    file:
      File
  ): boolean =>
    Boolean(
      meta &&
      meta.version ===
        2 &&
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

    filter:
      DarkModeFilter,

    meta:
      DarkModeJobMeta |
      null
  ): Promise<boolean> => {
    if (
      !darkModeJobMatchesFile(
        meta,
        file
      ) ||
      meta?.filter !==
        filter ||
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

export const saveDarkModeJobSource =
  async (
    file:
      File,

    filter:
      DarkModeFilter
  ): Promise<void> => {
    if (!hasOpfs()) {
      throw new Error(
        'Origin-private storage is unavailable.'
      );
    }

    /*
     * Remove leftovers from the first test implementation.
     */
    await removeDirectory(
      LEGACY_DIRECTORY
    );

    const existing =
      await readDarkModeJobMeta()
        .catch(
          () => null
        );

    if (
      await storedSourceMatches(
        file,
        filter,
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
        filter,
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

    await removeDirectory(
      DIRECTORY
    );

    /*
     * Complete source write first.
     */
    await writeOpfsFile(
      DIRECTORY,
      SOURCE_FILE,
      file
    );

    /*
     * Publish metadata only after the source exists intact.
     */
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
      filter,
      updatedAt:
        Date.now(),
    });
  };

export const restoreDarkModeJobSource =
  async (): Promise<
    {
      file: File;
      filter: DarkModeFilter;
    } |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    const meta =
      await readDarkModeJobMeta();

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

        filter:
          meta.filter,
      };
    } catch (
      error
    ) {
      console.warn(
        'Unable to restore Dark Mode source:',
        error
      );

      return null;
    }
  };

const pageName =
  (
    pageNumber:
      number
  ) =>
    `page-${pageNumber}.jpg`;

export const readDarkModePage =
  async (
    pageNumber:
      number
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
              pageNumber
            ),
            {
              create: false,
            }
          );

      const file =
        await handle.getFile();

      if (
        file.size <
        4
      ) {
        return null;
      }

      /*
       * Only accept a completely-written JPEG checkpoint.
       */
      const head =
        new Uint8Array(
          await file
            .slice(
              0,
              2
            )
            .arrayBuffer()
        );

      const tail =
        new Uint8Array(
          await file
            .slice(
              file.size -
                2,
              file.size
            )
            .arrayBuffer()
        );

      if (
        head[0] !==
          0xff ||
        head[1] !==
          0xd8 ||
        tail[0] !==
          0xff ||
        tail[1] !==
          0xd9
      ) {
        return null;
      }

      return file;
    } catch {
      return null;
    }
  };

export const writeDarkModePage =
  async (
    pageNumber:
      number,

    blob:
      Blob
  ): Promise<void> => {
    await writeOpfsFile(
      DIRECTORY,
      pageName(
        pageNumber
      ),
      blob
    );
  };

export const clearDarkModeRecovery =
  async (): Promise<void> => {
    /*
     * Metadata first: an incomplete cleanup can never resurrect
     * a finished job.
     */
    await deleteMeta()
      .catch(
        (
          error
        ) => {
          console.warn(
            'Unable to clear Dark Mode recovery metadata:',
            error
          );
        }
      );

    await removeDirectory(
      DIRECTORY
    );

    await removeDirectory(
      LEGACY_DIRECTORY
    );
  };
