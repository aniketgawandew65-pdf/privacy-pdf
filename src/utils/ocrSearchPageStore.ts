/*
 * ============================================================
 * SEARCHABLE PDF OCR RECOVERY STORE
 * ============================================================
 *
 * The source PDF remains in the existing OPFS workspace.
 *
 * Each fully completed OCR page stores only:
 * - page number
 * - OCR viewport dimensions
 * - recognized word text + bounding boxes
 *
 * No source PDF bytes and no rendered page images are stored
 * here.
 *
 * If Safari/WebKit kills its WebContent process, completed OCR
 * pages are skipped and recognition resumes at the first page
 * that does not have an atomic page record.
 */

const DB_NAME =
  'oneinto1-ocr-search-pages';

const STORE_NAME =
  'pages';

const VERSION =
  'ocr-search-pages-v1';


export type OcrSearchWordRecord = {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};


export type OcrSearchPageRecord = {
  pageNumber: number;
  viewportWidth: number;
  viewportHeight: number;
  words: OcrSearchWordRecord[];
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
                    'Searchable OCR recovery storage failed.'
                  )
                );
        }
      );
    } finally {
      db.close();
    }
  };


export const readOcrSearchPage =
  async (
    identity: string,
    pageNumber: number
  ): Promise<
    OcrSearchPageRecord |
    undefined
  > =>
    await transact<
      OcrSearchPageRecord |
      undefined
    >(
      'readonly',
      (store) =>
        store.get(
          keyFor(
            identity,
            pageNumber
          )
        )
    );


export const writeOcrSearchPage =
  async (
    identity: string,
    pageNumber: number,
    value: OcrSearchPageRecord
  ): Promise<void> => {
    await transact<IDBValidKey>(
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


export const clearOcrSearchPages =
  async (
    identity?: string
  ): Promise<void> => {
    if (!identity) {
      await transact<undefined>(
        'readwrite',
        (store) =>
          store.clear()
      );

      return;
    }

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

          const cursor =
            tx.objectStore(
              STORE_NAME
            ).openCursor();

          cursor.onsuccess =
            () => {
              const entry =
                cursor.result;

              if (!entry) {
                return;
              }

              if (
                String(
                  entry.key
                ).startsWith(
                  `${VERSION}:${identity}:`
                )
              ) {
                entry.delete();
              }

              entry.continue();
            };

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
