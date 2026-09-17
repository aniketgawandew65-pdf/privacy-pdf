import {
  writeOpfsFile,
} from './opfsCompat';

export type GrayscaleRecoveryMode =
  'grayscale' |
  'pure-bw';

const DIRECTORY =
  'oneinto1-grayscale-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-grayscale-job-v1';

const STORE_NAME =
  'job';

const ACTIVE_KEY =
  'active';

export type GrayscaleJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  mode: GrayscaleRecoveryMode;
  threshold: number;
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
      GrayscaleJobMeta
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
                    'Unable to save Grayscale recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };

export const readGrayscaleJobMeta =
  async (): Promise<
    GrayscaleJobMeta |
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

export const grayscaleJobMatchesFile =
  (
    meta:
      GrayscaleJobMeta |
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

    mode:
      GrayscaleRecoveryMode,

    threshold:
      number,

    meta:
      GrayscaleJobMeta |
      null
  ): Promise<boolean> => {
    if (
      !grayscaleJobMatchesFile(
        meta,
        file
      ) ||
      meta?.mode !==
        mode ||
      meta?.threshold !==
        threshold ||
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

export const saveGrayscaleJobSource =
  async (
    file:
      File,

    mode:
      GrayscaleRecoveryMode,

    threshold:
      number
  ): Promise<void> => {
    if (!hasOpfs()) {
      throw new Error(
        'Origin-private storage is unavailable.'
      );
    }

    const existing =
      await readGrayscaleJobMeta()
        .catch(
          () => null
        );

    if (
      await storedSourceMatches(
        file,
        mode,
        threshold,
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
        mode,
        threshold,
        updatedAt:
          Date.now(),
      });

      return;
    }

    /*
     * Never publish metadata for an incomplete replacement.
     */
    await deleteMeta()
      .catch(
        () => {}
      );

    await removeDirectory();

    /*
     * Write the complete source first.
     */
    await writeOpfsFile(
      DIRECTORY,
      SOURCE_FILE,
      file
    );

    /*
     * Publish the tiny metadata only after source.pdf exists.
     */
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
      mode,
      threshold,
      updatedAt:
        Date.now(),
    });
  };

export const restoreGrayscaleJobSource =
  async (): Promise<
    {
      file: File;
      mode: GrayscaleRecoveryMode;
      threshold: number;
    } |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    const meta =
      await readGrayscaleJobMeta();

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

        mode:
          meta.mode,

        threshold:
          meta.threshold,
      };
    } catch (
      error
    ) {
      console.warn(
        'Unable to restore Grayscale source:',
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

export const readGrayscalePage =
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
       * Only a completely-written JPEG counts as a checkpoint.
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

export const writeGrayscalePage =
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

export const clearGrayscaleRecovery =
  async (): Promise<void> => {
    /*
     * Remove metadata first so partial cleanup never resurrects
     * a finished conversion.
     */
    await deleteMeta()
      .catch(
        (
          error
        ) => {
          console.warn(
            'Unable to clear Grayscale recovery metadata:',
            error
          );
        }
      );

    await removeDirectory();
  };
