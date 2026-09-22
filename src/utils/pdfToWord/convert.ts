import { openPdf, extractPage, deadline, LIMITS } from './extract';
import type { ConversionReport, PageModel, PageSummary } from './model';

export type PdfToWordRecoveryHooks = {
  readPage?: (pageNumber: number) => Promise<PageModel | null>;
  writePage?: (pageNumber: number, page: PageModel) => Promise<void>;
};

export async function convertPdfToWord(
  file: File,
  signal: AbortSignal,
  onProgress: (message: string, percent: number, pages: number) => void,
  recovery: PdfToWordRecoveryHooks = {},
): Promise<{ blob: Blob; report: ConversionReport }> {
  const started = performance.now();
  signal.throwIfAborted();
  const pdf = await openPdf(file, signal);
  let worker: Worker | undefined;
  const pages: PageModel[] = [];
  try {
    for (let page = 1; page <= pdf.numPages; page++) {
      signal.throwIfAborted();

      const restored = recovery.readPage
        ? await recovery.readPage(page)
        : null;

      if (restored) {
        pages.push(restored);
        onProgress(
          `Restored page ${page} of ${pdf.numPages}…`,
          75 * page / pdf.numPages,
          pdf.numPages,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        continue;
      }

      onProgress(
        `Reading page ${page} of ${pdf.numPages}…`,
        75 * (page - 1) / pdf.numPages,
        pdf.numPages,
      );

      const extracted = await deadline(
        pdf.getPage(page).then((source) => extractPage(source, signal)),
        LIMITS.pageMs,
        `Page ${page}`,
      );

      pages.push(extracted);

      if (recovery.writePage) {
        await recovery.writePage(page, extracted);
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    onProgress('Creating editable Word document…', 80, pdf.numPages);
    worker = new Worker(new URL('./reconstruct.worker.ts', import.meta.url), { type: 'module' });
    const currentWorker = worker;
    const result = await new Promise<{ bytes: ArrayBuffer; summaries: PageSummary[] }>((resolve, reject) => {
      const abort = () => { cleanup(); currentWorker.terminate(); reject(new DOMException('Conversion cancelled.', 'AbortError')); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      currentWorker.onmessage = ({ data }) => {
        cleanup();
        if (data.type === 'error') reject(new Error(data.message));
        else resolve(data);
      };
      currentWorker.onerror = (event) => { cleanup(); reject(new Error(event.message || 'Document worker failed.')); };
      signal.addEventListener('abort', abort, { once: true });
      // Move artwork buffers into the worker instead of duplicating them.
      currentWorker.postMessage({ pages }, pages.flatMap((p) => p.pictures.map((pic) => pic.data.buffer as ArrayBuffer)));
    });
    signal.throwIfAborted();
    return {
      blob: new Blob([result.bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      report: {
        pages: result.summaries,
        elapsedMs: Math.round(performance.now() - started),
        warnings: [...new Set(result.summaries.flatMap((p) => p.warnings))],
      },
    };
  } finally {
    worker?.terminate();
    pages.length = 0;
    await pdf.loadingTask.destroy();
  }
}
