import {
  writeOpfsFile,
} from './opfsCompat';


const DIRECTORY =
  'oneinto1-sanitize-recovery-v1';

const SOURCE_FILE =
  'source.pdf';

const DB_NAME =
  'oneinto1-sanitize-job-v1';

const STORE_NAME =
  'job';

const ACTIVE_KEY =
  'active';


type SanitizeJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;
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
      SanitizeJobMeta
  ) => {
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
                    'Unable to save Sanitize recovery metadata.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };


export const readSanitizeJobMeta =
  async (): Promise<
    SanitizeJobMeta |
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
  async () => {
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
  async () => {
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


export const sanitizeJobMatchesFile =
  (
    meta:
      SanitizeJobMeta |
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


export const saveSanitizeJobSource =
  async (
    file:
      File
  ) => {
    if (!hasOpfs()) {
      throw new Error(
        'Origin-private storage is unavailable.'
      );
    }

    const existing =
      await readSanitizeJobMeta()
        .catch(
          () => null
        );


    if (
      sanitizeJobMatchesFile(
        existing,
        file
      )
    ) {
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
          stored.size ===
          file.size
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
      } catch {
        // Rebuild below.
      }
    }


    await deleteMeta()
      .catch(
        () => {}
      );

    await removeDirectory();


    /*
     * Write the source completely before advertising recovery.
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


export const restoreSanitizeJobSource =
  async (): Promise<
    File |
    null
  > => {
    if (!hasOpfs()) {
      return null;
    }

    const meta =
      await readSanitizeJobMeta();

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
        'Unable to restore Sanitize source:',
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


export const readSanitizePage =
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
                2
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


export const writeSanitizePage =
  async (
    pageNumber:
      number,

    blob:
      Blob
  ) => {
    await writeOpfsFile(
      DIRECTORY,
      pageName(
        pageNumber
      ),
      blob
    );
  };


export const clearSanitizeRecovery =
  async () => {
    await deleteMeta()
      .catch(
        () => {}
      );

    await removeDirectory();
  };
