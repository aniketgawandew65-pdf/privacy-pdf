import {
  writeOpfsFile,
} from './opfsCompat';

import type {
  BatesPosition,
} from './pdfEngine';


const DIRECTORY =
  'oneinto1-bates-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-bates-job-v1';

const STORE_NAME =
  'job';

const ACTIVE_KEY =
  'active';


export type BatesRecoverySettings = {
  prefix: string;
  suffix: string;
  startNumber: number;
  digits: number;
  fontSize: number;
  position: BatesPosition;
};


export type BatesJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;

  settings:
    BatesRecoverySettings;

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
      BatesJobMeta
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
                    'Unable to save Bates recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };


export const readBatesJobMeta =
  async (): Promise<
    BatesJobMeta |
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


export const batesJobMatchesFile =
  (
    meta:
      BatesJobMeta |
      null,

    file:
      File
  ) =>
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

    settings:
      BatesRecoverySettings,

    meta:
      BatesJobMeta |
      null
  ) => {
    if (
      !batesJobMatchesFile(
        meta,
        file
      ) ||
      JSON.stringify(
        meta?.settings
      ) !==
        JSON.stringify(
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


export const saveBatesJobSource =
  async (
    file:
      File,

    settings:
      BatesRecoverySettings
  ): Promise<void> => {
    if (!hasOpfs()) {
      throw new Error(
        'Origin-private storage is unavailable.'
      );
    }

    const existing =
      await readBatesJobMeta()
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
        settings,
        updatedAt:
          Date.now(),
      });

      return;
    }

    await deleteMeta()
      .catch(
        () => {}
      );

    await removeDirectory();

    /*
     * Write source.pdf completely BEFORE publishing metadata.
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
      settings,
      updatedAt:
        Date.now(),
    });
  };


export const restoreBatesJobSource =
  async (): Promise<
    {
      file: File;
      settings:
        BatesRecoverySettings;
    } |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    const meta =
      await readBatesJobMeta();

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

        settings:
          meta.settings,
      };
    } catch (
      error
    ) {
      console.warn(
        'Unable to restore Bates source:',
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


export const readBatesPage =
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
       * A checkpoint counts only if the JPEG was completely
       * written: FF D8 ... FF D9.
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


export const writeBatesPage =
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


export const clearBatesRecovery =
  async (): Promise<void> => {
    await deleteMeta()
      .catch(
        () => {}
      );

    await removeDirectory();
  };
