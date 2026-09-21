import "./style.css";
import { openPdf, extractPage, deadline, LIMITS } from "./extract.ts";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageModel, ConversionReport, PageSummary } from "./model.ts";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const fileInput = $<HTMLInputElement>("file"),
  convert = $<HTMLButtonElement>("convert"),
  cancel = $<HTMLButtonElement>("cancel"),
  download = $<HTMLAnchorElement>("download"),
  progress = $<HTMLProgressElement>("progress");
let file: File | null = null,
  pdf: PDFDocumentProxy | null = null,
  controller = new AbortController(),
  worker: Worker | null = null,
  objectUrl: string | null = null,
  generation = 0;
function status(text: string, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function clearDownload() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  download.hidden = true;
  $("summary").hidden = true;
}
async function reset() {
  generation++;
  controller.abort();
  controller = new AbortController();
  worker?.terminate();
  worker = null;
  await pdf?.loadingTask.destroy();
  pdf = null;
  clearDownload();
}
fileInput.onchange = async () => {
  await reset();
  const id = generation;
  file = fileInput.files?.[0] || null;
  convert.disabled = true;
  progress.hidden = true;
  if (!file) {
    status("Ready when you are.");
    return;
  }
  $("file-info").textContent =
    `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  status("Reading PDF…");
  try {
    const loaded = await openPdf(file, controller.signal);
    if (id !== generation) {
      await loaded.loadingTask.destroy();
      return;
    }
    pdf = loaded;
    $("file-info").textContent +=
      ` · ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`;
    status("Ready to convert locally.");
    convert.disabled = false;
  } catch (e) {
    if (id === generation)
      status(e instanceof Error ? e.message : "Could not read this PDF.", true);
  }
};
convert.onclick = async () => {
  if (!pdf || !file) return;
  const id = generation,
    started = performance.now(),
    pages: PageModel[] = [];
  clearDownload();
  convert.disabled = true;
  fileInput.disabled = true;
  cancel.hidden = false;
  progress.hidden = false;
  progress.value = 0;
  try {
    let characters = 0,
      imageBytes = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (controller.signal.aborted) throw Error("Conversion cancelled.");
      status(`Analyzing layout · page ${i} of ${pdf.numPages}`);
      const page = await deadline(
        pdf.getPage(i).then((p) => extractPage(p, controller.signal)),
        LIMITS.pageMs,
        `Page ${i}`,
      );
      characters += page.spans.reduce((n, s) => n + s.text.length, 0);
      imageBytes += page.pictures.reduce((n, p) => n + p.data.byteLength, 0);
      if (characters > LIMITS.characters || imageBytes > 50 * 1024 * 1024)
        throw Error(
          "This document exceeds the prototype’s reconstruction memory budget. Try fewer pages.",
        );
      pages.push(page);
      progress.value = (i / pdf.numPages) * 75;
      await new Promise((r) => setTimeout(r, 0));
    }
    status("Reconstructing document · creating Word file…");
    worker = new Worker(new URL("./reconstruct.worker.ts", import.meta.url), {
      type: "module",
    });
    const result = await deadline(
      new Promise<{ bytes: ArrayBuffer; summaries: PageSummary[] }>(
        (resolve, reject) => {
          worker!.onmessage = (e) =>
            e.data.type === "error"
              ? reject(Error(e.data.message))
              : resolve(e.data);
          worker!.onerror = (e) =>
            reject(Error(e.message || "Document worker failed."));
          controller.signal.addEventListener(
            "abort",
            () => reject(Error("Conversion cancelled.")),
            { once: true },
          );
          worker!.postMessage({ pages });
        },
      ),
      60000,
      "Creating the Word file",
    );
    if (id !== generation) return;
    const report: ConversionReport = {
      pages: result.summaries,
      elapsedMs: Math.round(performance.now() - started),
      warnings: [...new Set(result.summaries.flatMap((p) => p.warnings))],
    };
    objectUrl = URL.createObjectURL(
      new Blob([result.bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    download.href = objectUrl;
    download.download = file.name.replace(/\.pdf$/i, "") + "-editable.docx";
    download.hidden = false;
    progress.value = 100;
    const cells = report.pages.reduce((n, p) => n + p.cells, 0),
      tables = report.pages.reduce((n, p) => n + p.tables, 0);
    $("summary").textContent =
      `${pages.length} pages · ${tables} editable tables · ${cells} cells · ${(report.elapsedMs / 1000).toFixed(1)} seconds. ${report.warnings.join(" ")}`;
    $("summary").hidden = false;
    status(
      report.warnings.length
        ? "DOCX ready with reconstruction warnings."
        : "DOCX ready. Review the layout in your Word editor.",
    );
    // Local diagnostics consumed by regression tests; never transmitted.
    Object.assign(window, { conversionReport: report });
  } catch (e) {
    if (id === generation) {
      clearDownload();
      controller.abort();
      await pdf?.loadingTask.destroy();
      pdf = null;
      controller = new AbortController();
      status(
        e instanceof Error
          ? e.message
          : "Conversion failed. Try a simpler PDF.",
        true,
      );
    }
  } finally {
    pages.length = 0;
    worker?.terminate();
    worker = null;
    if (id === generation) {
      cancel.hidden = true;
      fileInput.disabled = false;
      convert.disabled = !pdf;
    }
  }
};
cancel.onclick = async () => {
  await reset();
  fileInput.disabled = false;
  cancel.hidden = true;
  progress.hidden = true;
  convert.disabled = true;
  fileInput.value = "";
  status("Conversion cancelled. Choose a PDF to start again.");
};
window.addEventListener("pagehide", () => {
  controller.abort();
  worker?.terminate();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
