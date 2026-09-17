import {
  writeOpfsFile,
} from './opfsCompat';

import type {
  DarkModeFilter,
} from './pdfEngine';

const DIRECTORY =
  'oneinto1-dark-mode-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-dark-mode-job';

const STORE_NAME =
  'job';

const ACTIVE_KEY =
  'active';

export type DarkModeJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  filter: DarkModeFilter;
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
    meta: DarkModeJobMeta
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
            () => resolve();

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

const readMeta =
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
            () => resolve();

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
      // Missing directory = already clear.
    }
  };

const sourceAlreadyMatches =
  async (
    file: File,
    meta:
      DarkModeJobMeta |
      null,
    filter:
      DarkModeFilter
  ): Promise<boolean> => {
    if (
      !meta ||
      meta.version !== 1 ||
      meta.name !== file.name ||
      meta.size !== file.size ||
      meta.lastModified !==
        (
          file.lastModified ||
          0
        ) ||
      meta.filter !==
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
    file: File,
    filter: DarkModeFilter
  ): Promise<void> => {
    const existing =
      await readMeta()
        .catch(
          () => null
        );

    if (
      await sourceAlreadyMatches(
        file,
        existing,
        filter
      )
    ) {
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
        filter,
        updatedAt:
          Date.now(),
      });

      return;
    }

    /*
     * Different source/filter = old page checkpoints cannot
     * be reused.
     */
    await removeDirectory();

    await writeOpfsFile(
      DIRECTORY,
      SOURCE_FILE,
      file
    );

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
    const meta =
      await readMeta();

    if (
      !meta ||
      meta.version !== 1 ||
      !hasOpfs()
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
            [stored],
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
        'Unable to restore interrupted Dark Mode source:',
        error
      );

      return null;
    }
  };

const pageFileName =
  (
    pageNumber: number
  ) =>
    `page-${pageNumber}.jpg`;

export const readDarkModePage =
  async (
    pageNumber: number
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
            pageFileName(
              pageNumber
            ),
            {
              create: false,
            }
          );

      const stored =
        await handle.getFile();

      if (
        stored.size <
        4
      ) {
        return null;
      }

      /*
       * Ignore an interrupted/partial JPEG write.
       */
      const head =
        new Uint8Array(
          await stored
            .slice(
              0,
              2
            )
            .arrayBuffer()
        );

      const tail =
        new Uint8Array(
          await stored
            .slice(
              stored.size - 2,
              stored.size
            )
            .arrayBuffer()
        );

      if (
        head[0] !== 0xff ||
        head[1] !== 0xd8 ||
        tail[0] !== 0xff ||
        tail[1] !== 0xd9
      ) {
        return null;
      }

      return stored;
    } catch {
      return null;
    }
  };

export const writeDarkModePage =
  async (
    pageNumber: number,
    pageBlob: Blob
  ): Promise<void> => {
    await writeOpfsFile(
      DIRECTORY,
      pageFileName(
        pageNumber
      ),
      pageBlob
    );
  };

export const clearDarkModeRecovery =
  async (): Promise<void> => {
    try {
      await deleteMeta();
    } catch (
      error
    ) {
      console.warn(
        'Unable to clear Dark Mode recovery metadata:',
        error
      );
    }

    await removeDirectory();
  };
