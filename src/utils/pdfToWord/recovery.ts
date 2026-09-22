import type { PageModel } from './model';

const DB_NAME = 'oneinto1-pdf-word-job-v1';
const JOB_STORE = 'job';
const PAGE_STORE = 'pages';
const ACTIVE_KEY = 'active';

export type PdfToWordJobMeta = {
  version: 1;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  updatedAt: number;
};

const openDb = async (): Promise<IDBDatabase> =>
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(JOB_STORE)) db.createObjectStore(JOB_STORE);
      if (!db.objectStoreNames.contains(PAGE_STORE)) db.createObjectStore(PAGE_STORE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const putMeta = async (meta: PdfToWordJobMeta): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(JOB_STORE, 'readwrite');
      tx.objectStore(JOB_STORE).put(meta, ACTIVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(tx.error || new Error('Unable to save PDF to Word recovery metadata.'));
    });
  } finally {
    db.close();
  }
};

export const readPdfToWordJobMeta = async (): Promise<PdfToWordJobMeta | null> => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(JOB_STORE, 'readonly');
      const request = tx.objectStore(JOB_STORE).get(ACTIVE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

const clearDatabase = async (): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([JOB_STORE, PAGE_STORE], 'readwrite');
      tx.objectStore(JOB_STORE).clear();
      tx.objectStore(PAGE_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

export const pdfToWordJobMatchesFile = (
  meta: PdfToWordJobMeta | null,
  file: File,
): boolean =>
  Boolean(
    meta &&
      meta.version === 1 &&
      meta.name === file.name &&
      meta.size === file.size &&
      meta.lastModified === (file.lastModified || 0),
  );

export const preparePdfToWordRecovery = async (file: File): Promise<void> => {
  const existing = await readPdfToWordJobMeta().catch(() => null);

  if (!pdfToWordJobMatchesFile(existing, file)) {
    await clearDatabase().catch(() => {});
  }

  await putMeta({
    version: 1,
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    lastModified: file.lastModified || 0,
    updatedAt: Date.now(),
  });
};

export const readPdfToWordPage = async (
  pageNumber: number,
): Promise<PageModel | null> => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PAGE_STORE, 'readonly');
      const request = tx.objectStore(PAGE_STORE).get(pageNumber);

      request.onsuccess = () => {
        const value = request.result;
        resolve(value && typeof value === 'object' ? (value as PageModel) : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

export const writePdfToWordPage = async (
  pageNumber: number,
  page: PageModel,
): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PAGE_STORE, 'readwrite');
      tx.objectStore(PAGE_STORE).put(page, pageNumber);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(tx.error || new Error('Unable to checkpoint PDF to Word page.'));
    });
  } finally {
    db.close();
  }
};

export const clearPdfToWordRecovery = async (): Promise<void> => {
  await clearDatabase().catch((error) => {
    console.warn('Unable to clear PDF to Word recovery database:', error);
  });
};
