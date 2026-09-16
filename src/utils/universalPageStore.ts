/*
 * Universal Data Extractor recovery.
 *
 * The source PDF remains in the existing OPFS workspace.
 * Each fully completed OCR page is committed independently
 * to IndexedDB.
 *
 * If Safari/WebKit kills the page, only the unfinished page
 * needs to be processed again.
 */

const DB_NAME =
  'oneinto1-universal-pages';

const STORE_NAME =
  'pages';

const VERSION =
  'universal-pages-v1';


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


const keyFor =
  (
    identity: string,
    pageNumber: number
  ) =>
    `${VERSION}:${identity}:page:${pageNumber}`;


const transact =
  async <T>(
    mode:
      IDBTransactionMode,

    action:
      (
        store:
          IDBObjectStore
      ) => IDBRequest
  ): Promise<T> => {
    const db =
      await openDb();

    try {
      return await new Promise<T>(
        (
          resolve,
          reject
        ) => {
          const tx =
            db.transaction(
              STORE_NAME,
              mode
            );

          const request =
            action(
              tx.objectStore(
                STORE_NAME
              )
            );

          tx.oncomplete =
            () =>
              resolve(
                request.result as T
              );

          tx.onerror =
            tx.onabort =
              () =>
                reject(
                  tx.error ||
                  request.error ||
                  new Error(
                    'Universal recovery storage failed.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };


export const readUniversalPage =
  async (
    identity: string,
    pageNumber: number
  ): Promise<
    unknown |
    undefined
  > =>
    await transact(
      'readonly',
      (store) =>
        store.get(
          keyFor(
            identity,
            pageNumber
          )
        )
    );


export const writeUniversalPage =
  async (
    identity: string,
    pageNumber: number,
    value: unknown
  ): Promise<void> => {
    await transact(
      'readwrite',
      (store) =>
        store.put(
          value,
          keyFor(
            identity,
            pageNumber
          )
        )
    );
  };


export const clearUniversalPages =
  async (): Promise<void> => {
    await transact(
      'readwrite',
      (store) =>
        store.clear()
    );
  };
