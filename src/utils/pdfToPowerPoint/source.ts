import {
  getDocument,
  PDFDataRangeTransport,
  PDFWorker,
  type PDFDocumentProxy,
} from "pdfjs-word-dist";
import workerUrl from "pdfjs-word-dist/build/pdf.worker.min.mjs?url";
import { LocalPdfAssets } from "./assets";
import { validateTaskFiles } from "../fileSizeGuard";
const CHUNK = 256 * 1024;

export async function bounded<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  message: string,
  ms = 60_000,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      cleanup();
      reject(new DOMException("Conversion cancelled.", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Error(message));
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    };
    signal.addEventListener("abort", cancel, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
class FileRanges extends PDFDataRangeTransport {
  source: File;
  stopped = false;
  constructor(file: File, initial: Uint8Array) {
    super(file.size, initial, false);
    this.source = file;
  }
  requestDataRange(start: number, end: number) {
    if (this.stopped) return;
    void this.source
      .slice(Math.max(0, start), Math.min(end, this.source.size))
      .arrayBuffer()
      .then((data) => {
        if (!this.stopped) this.onDataRange(start, new Uint8Array(data));
      })
      .catch(() => {
        if (!this.stopped) this.onDataRange(start, new Uint8Array(0));
      });
  }
  abort() {
    this.stopped = true;
  }
}
export async function openSource(
  file: File,
  signal: AbortSignal,
): Promise<{ pdf: PDFDocumentProxy; close: () => Promise<void> }> {
  const check = validateTaskFiles([file]);
  if (!check.allowed)
    throw Error(check.errorMessage || "This file exceeds the device limit.");
  signal.throwIfAborted();
  if (
    !file.size ||
    !new TextDecoder()
      .decode(await file.slice(0, 1024).arrayBuffer())
      .includes("%PDF-")
  )
    throw Error("Choose a valid, non-empty PDF file.");
  const initial = new Uint8Array(await file.slice(0, CHUNK).arrayBuffer());
  signal.throwIfAborted();
  // Explicit worker ownership avoids changing PDF.js globals used by other tools.
  const port = new Worker(workerUrl, { type: "module" });
  const worker = new PDFWorker({ port } as unknown as ConstructorParameters<
    typeof PDFWorker
  >[0]);
  const ranges = new FileRanges(file, initial);
  const task = getDocument({
    worker,
    BinaryDataFactory: LocalPdfAssets,
    useWorkerFetch: false,
    stopAtErrors: true,
    range: ranges,
    rangeChunkSize: CHUNK,
    disableStream: true,
    disableAutoFetch: true,
    fontExtraProperties: true,
    enableXfa: false,
    useSystemFonts: true,
    canvasMaxAreaInBytes: 24_000_000,
  });
  let protectedFile = false,
    closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    ranges.abort();
    signal.removeEventListener("abort", abort);
    try {
      await task.destroy();
    } finally {
      worker.destroy();
      port.terminate();
    }
  };
  const abort = () => {
    void close().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  let rejectPassword: (error: Error) => void = () => {};
  const passwordFailure = new Promise<never>((_, reject) => {
    rejectPassword = reject;
  });
  task.onPassword = () => {
    protectedFile = true;
    rejectPassword(Error("Password required."));
    abort();
  };
  try {
    const pdf = await bounded(
      Promise.race([task.promise, passwordFailure]),
      signal,
      "Reading this PDF took too long. Try a smaller selection.",
      30_000,
    );
    if (pdf.numPages < 1) throw Error("This PDF has no pages.");
    return { pdf, close };
  } catch (error) {
    await close().catch(() => {});
    if (signal.aborted)
      throw new DOMException("Conversion cancelled.", "AbortError");
    if (protectedFile)
      throw Error(
        "This PDF is password-protected. Unlock a copy before converting it.",
        { cause: error },
      );
    throw Error(
      error instanceof Error
        ? `Unable to read this PDF: ${error.message}`
        : "Unable to read this PDF. It may be damaged.",
      { cause: error },
    );
  }
}
