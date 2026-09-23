import { AnnotationMode, type PDFPageProxy } from "pdfjs-word-dist";
import { isMobileSafetyEnvironment } from "../deviceCapability";
import { deckSize, parsePages, renderScale, safeLink } from "./geometry";
import { openSource, bounded } from "./source";
import { editableText } from "./text";
import type {
  ConversionMode,
  ConversionReport,
  SlideLink,
  SlidePage,
  Size,
} from "./model";
const mime =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export interface ConvertOptions {
  pages?: string;
  mode?: ConversionMode;
}
export async function inspectPdf(
  file: File,
  signal: AbortSignal,
): Promise<number> {
  const source = await openSource(file, signal);
  try {
    return source.pdf.numPages;
  } finally {
    await source.close();
  }
}
export async function convertPdfToPowerPoint(
  file: File,
  signal: AbortSignal,
  onProgress: (status: string, percent: number, pages: number) => void,
  options: ConvertOptions = {},
): Promise<{ blob: Blob; report: ConversionReport }> {
  const start = performance.now(),
    source = await openSource(file, signal);
  let worker: Worker | undefined;
  const report: ConversionReport = {
    pages: [],
    elapsedMs: 0,
    mixedSizes: false,
    warnings: [],
  };
  const chunks: BlobPart[] = [];
  let sequence = 0,
    pending:
      | { id: number; resolve: () => void; reject: (e: Error) => void }
      | undefined;
  let workerFailure: Error | undefined,
    final = false;
  try {
    const selected = parsePages(options.pages ?? "", source.pdf.numPages);
    worker = new Worker(new URL("./package.worker.ts", import.meta.url), {
      type: "module",
    });
    const failure = (error: Error) => {
      workerFailure = error;
      pending?.reject(error);
      pending = undefined;
    };
    worker.onerror = () =>
      failure(
        Error(
          "Unable to create the PowerPoint file. Try a smaller page range.",
        ),
      );
    worker.onmessage = (event) => {
      const data = event.data;
      if (data.type === "error") failure(Error(data.message));
      if (data.type === "chunk") {
        chunks.push(data.data as Uint8Array<ArrayBuffer>);
        final = data.final;
      }
      if (data.type === "ack" && pending && pending.id === data.id) {
        pending.resolve();
        pending = undefined;
      }
    };
    const send = async (
      type: string,
      value: object,
      transfer: Transferable[] = [],
    ) => {
      signal.throwIfAborted();
      if (workerFailure) throw workerFailure;
      await bounded(
        new Promise<void>((resolve, reject) => {
          const id = ++sequence;
          pending = { id, resolve, reject };
          worker!.postMessage({ id, type, ...value }, transfer);
        }),
        signal,
        "Creating the presentation took too long. Try fewer pages.",
      );
    };
    let size: Size | undefined, firstPage: Size | undefined;
    const mobile = isMobileSafetyEnvironment();
    for (let i = 0; i < selected.length; i++) {
      signal.throwIfAborted();
      onProgress(
        `Reading page ${selected[i]} (${i + 1} of ${selected.length})…`,
        (i / selected.length) * 94,
        source.pdf.numPages,
      );
      let page: PDFPageProxy | undefined;
      const canvas = document.createElement("canvas");
      try {
        page = await bounded(
          source.pdf.getPage(selected[i]),
          signal,
          "Unable to read this PDF page.",
        );
        const points = page.getViewport({ scale: 1 });
        if (!size) {
          firstPage = { width: points.width, height: points.height };
          size = deckSize(points);
          await send("start", { size });
        }
        if (
          i > 0 &&
          (Math.abs(points.width - firstPage!.width) > 0.1 ||
            Math.abs(points.height - firstPage!.height) > 0.1)
        )
          report.mixedSizes = true;
        const viewport = page.getViewport({
          scale: renderScale(points, mobile),
        });
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context)
          throw Error(
            "The device could not allocate a page canvas. Try fewer pages.",
          );
        const render = async (omit?: Set<number>) => {
          const task = page!.render({
            canvas,
            canvasContext: context,
            viewport,
            annotationMode: AnnotationMode.ENABLE,
            recordOperations: !omit,
            background: "rgb(255,255,255)",
            operationsFilter: omit
              ? (index: number) => !omit.has(index)
              : undefined,
          });
          const cancel = () => task.cancel();
          signal.addEventListener("abort", cancel, { once: true });
          try {
            await bounded(
              task.promise,
              signal,
              "Rendering this page took too long. Try a smaller PDF.",
              90_000,
            );
          } finally {
            signal.removeEventListener("abort", cancel);
            task.cancel();
          }
        };
        await render();
        const extracted =
          options.mode === "fidelity"
            ? {
                texts: [],
                omit: new Set<number>(),
                total: 0,
                reason: "Best fidelity mode preserves the rendered page.",
              }
            : await bounded(
                editableText(page),
                signal,
                "Text analysis took too long. Try Best fidelity mode.",
              );
        if (extracted.omit.size) await render(extracted.omit);
        const links: SlideLink[] = [];
        for (const annotation of await page.getAnnotations({
          intent: "display",
        })) {
          const url = safeLink(annotation.url);
          if (!url || !annotation.rect) continue;
          const [x1, y1] = points.convertToViewportPoint(
            annotation.rect[0],
            annotation.rect[1],
          );
          const [x2, y2] = points.convertToViewportPoint(
            annotation.rect[2],
            annotation.rect[3],
          );
          const x = Math.max(0, Math.min(x1, x2)),
            y = Math.max(0, Math.min(y1, y2));
          const width = Math.min(points.width, Math.max(x1, x2)) - x,
            height = Math.min(points.height, Math.max(y1, y2)) - y;
          if (width > 0 && height > 0) links.push({ x, y, width, height, url });
        }
        const type = extracted.texts.length ? "png" : "jpg";
        const imageBlob = await bounded(
          new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) =>
                b
                  ? resolve(b)
                  : reject(Error("Unable to encode the page image.")),
              type === "png" ? "image/png" : "image/jpeg",
              0.94,
            ),
          ),
          signal,
          "Encoding this page took too long.",
        );
        const bytes = new Uint8Array(await imageBlob.arrayBuffer());
        const slide: SlidePage = {
          width: points.width,
          height: points.height,
          sourcePage: selected[i],
          texts: extracted.texts,
          lines: [],
          links,
          image: bytes,
          imageType: type,
        };
        const editableCharacters = extracted.texts.reduce(
          (n, t) => n + t.text.length,
          0,
        );
        await send("page", { page: slide }, [bytes.buffer]);
        report.pages.push({
          sourcePage: selected[i],
          kind: editableCharacters
            ? editableCharacters >= extracted.total
              ? "editable"
              : "hybrid"
            : "image",
          editableCharacters,
          preservedCharacters: Math.max(
            0,
            extracted.total - editableCharacters,
          ),
          reason: extracted.reason,
          renderPixels: canvas.width * canvas.height,
        });
      } finally {
        canvas.width = canvas.height = 0;
        page?.cleanup();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    onProgress("Finishing PowerPoint…", 96, source.pdf.numPages);
    await send("end", {});
    signal.throwIfAborted();
    if (!final || workerFailure)
      throw (
        workerFailure ?? Error("The presentation did not finish. Please retry.")
      );
    const blob = new Blob(chunks, { type: mime });
    if (blob.size < 500) throw Error("The presentation could not be created.");
    report.elapsedMs = performance.now() - start;
    if (report.pages.some((p) => p.editableCharacters))
      report.warnings.push(
        "Editable text uses substitute fonts. Check line spacing in your presentation app.",
      );
    if (report.mixedSizes)
      report.warnings.push(
        "Different page sizes are centered and fitted to the first selected page’s slide size.",
      );
    return { blob, report };
  } finally {
    worker?.terminate();
    chunks.length = 0;
    await source.close();
  }
}
