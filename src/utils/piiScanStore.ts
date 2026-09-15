/** Atomic, per-page IndexedDB records. The original PDF remains in OPFS.
 * Bump version whenever recognition settings, geometry or detector rules change. */
const VERSION = 'pii-regions-v3';
const DATABASE = 'oneinto1-pii-scan';
const STORE = 'pages';
export type OcrRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScanPage<T> = {
  findings: T[];
  needsOcr?: boolean;
  scale?: number;
  ocrRegions?: OcrRegion[];
  words?: Array<[string, number, number, number, number]>;
  elapsedMs?: number;
  renderMs?: number;
  recognizeMs?: number;
  detectMs?: number;
};
async function openStore() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openStore();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onabort = () => reject(tx.error || request.error || new Error('Local scan checkpoint failed.'));
      tx.onerror = () => reject(tx.error || request.error);
    });
  } finally { db.close(); }
}
export const scanRecordKey = (id: string, phase: string, page = 0) => `${VERSION}:${id}:${phase}:${page}`;
export const readScanRecord = <T>(id: string, phase: string, page = 0) => operation<T | undefined>('readonly', store => store.get(scanRecordKey(id, phase, page)));
export const writeScanRecord = (id: string, phase: string, page: number, value: unknown) => operation('readwrite', store => store.put(value, scanRecordKey(id, phase, page)));
export async function clearScanRecords(id?: string) {
  if (!id) { await operation('readwrite', store => store.clear()); return; }
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (String(entry.key).includes(`:${id}:`)) entry.delete();
        entry.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function scanDiagnostics(id: string) {
  const totalPages = await readScanRecord<number>(id, 'count') || 0;
  const pages: unknown[] = [];
  for (let page = 1; page <= totalPages; page++) {
    const native = await readScanRecord<ScanPage<unknown>>(id, 'native', page);
    const ocr = await readScanRecord<ScanPage<unknown>>(id, 'ocr', page);
    const batch = await readScanRecord(id, 'batch', page);
    pages.push({
      page,
      nativeMs: native?.elapsedMs,
      needsOcr: native?.needsOcr,
      nativeFindings: native?.findings?.length || 0,
      ocrRegions: native?.ocrRegions?.length || 0,
      ocrMs: ocr?.elapsedMs,
      ocrFindings: ocr?.findings?.length || 0,
      renderMs: ocr?.renderMs,
      recognizeMs: ocr?.recognizeMs,
      detectMs: ocr?.detectMs,
      scale: ocr?.scale,
      completed: !!ocr,
      batch,
    });
  }
  return { version: VERSION, totalPages, lastStage: await readScanRecord(id, 'progress'), pages };
}
