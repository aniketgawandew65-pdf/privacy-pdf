/*
 * ============================================================
 * PDF -> MARKDOWN PAGE RECOVERY STORE
 * ============================================================
 *
 * Same recovery principle used by Private PII:
 *
 * - original PDF stays in OPFS
 * - each COMPLETED page is committed atomically to IndexedDB
 * - an interrupted page is simply processed again
 * - already completed pages are never OCRed again after reload
 *
 * Bump VERSION if Markdown extraction semantics change.
 */

const VERSION =
  'markdown-pages-v1';

const DATABASE =
  'oneinto1-markdown-pages';

const STORE =
  'pages';

const openStore =
  async () =>
    await new Promise<IDBDatabase>(
      (
        resolve,
        reject
      ) => {
        const request =
          indexedDB.open(
            DATABASE,
            1
          );

        request.onupgradeneeded =
          () => {
            if (
              !request.result
                .objectStoreNames
                .contains(
                  STORE
                )
            ) {
              request.result
                .createObjectStore(
                  STORE
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

const operation =
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
      await openStore();

    try {
      return await new Promise<T>(
        (
          resolve,
          reject
        ) => {
          const tx =
            db.transaction(
              STORE,
              mode
            );

          const request =
            action(
              tx.objectStore(
                STORE
              )
            );

          tx.oncomplete =
            () =>
              resolve(
                request.result as T
              );

          tx.onabort =
            () =>
              reject(
                tx.error ||
                request.error ||
                new Error(
                  'Markdown recovery checkpoint failed.'
                )
              );

          tx.onerror =
            () =>
              reject(
                tx.error ||
                request.error
              );
        }
      );
    } finally {
      db.close();
    }
  };

const pageKey =
  (
    identity:
      string,

    page:
      number
  ) =>
    `${VERSION}:${identity}:page:${page}`;

export const readMarkdownPage =
  async (
    identity:
      string,

    page:
      number
  ): Promise<
    string |
    undefined
  > =>
    await operation<
      string |
      undefined
    >(
      'readonly',
      (store) =>
        store.get(
          pageKey(
            identity,
            page
          )
        )
    );

export const writeMarkdownPage =
  async (
    identity:
      string,

    page:
      number,

    markdown:
      string
  ): Promise<void> => {
    await operation(
      'readwrite',
      (store) =>
        store.put(
          markdown,
          pageKey(
            identity,
            page
          )
        )
    );
  };

export const clearMarkdownPages =
  async (
    identity?:
      string
  ): Promise<void> => {
    if (!identity) {
      await operation(
        'readwrite',
        (store) =>
          store.clear()
      );

      return;
    }

    const db =
      await openStore();

    try {
      await new Promise<void>(
        (
          resolve,
          reject
        ) => {
          const tx =
            db.transaction(
              STORE,
              'readwrite'
            );

          const cursor =
            tx.objectStore(
              STORE
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

          tx.onabort =
            tx.onerror =
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
