import "./style.css";
import { openPdf, extractPage, deadline, LIMITS } from "./extract.ts";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageModel, ConversionReport, PageSummary } from "./model.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const fileInput = $<HTMLInputElement>("file"),
  chooseFile = $<HTMLButtonElement>("choose-file"),
  removeFile = $<HTMLButtonElement>("remove-file"),
  dropZone = $<HTMLDivElement>("empty-state"),
  selectedPanel = $<HTMLDivElement>("selected-panel"),
  convert = $<HTMLButtonElement>("convert"),
  cancel = $<HTMLButtonElement>("cancel"),
  download = $<HTMLAnchorElement>("download"),
  progress = $<HTMLProgressElement>("progress"),
  processingCard = $<HTMLDivElement>("processing-card"),
  readyStatus = $<HTMLDivElement>("ready-status"),
  resultCard = $<HTMLDivElement>("result-card"),
  errorBox = $<HTMLDivElement>("error-box"),
  capacityCard = $<HTMLElement>("capacity-card");

let file: File | null = null,
  pdf: PDFDocumentProxy | null = null,
  controller = new AbortController(),
  worker: Worker | null = null,
  objectUrl: string | null = null,
  generation = 0;

const MB = 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function estimatedComfortableBytes() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  let factor = mobile ? 0.45 : 0.8;
  if (memory !== undefined) {
    if (memory <= 2) factor = mobile ? 0.3 : 0.42;
    else if (memory <= 4) factor = mobile ? 0.4 : 0.58;
    else if (memory <= 8) factor = mobile ? 0.5 : 0.82;
    else factor = mobile ? 0.58 : 1;
  }
  if (cores <= 4) factor *= 0.85;

  return Math.max(8 * MB, Math.min(LIMITS.bytes, Math.round(LIMITS.bytes * factor)));
}

function updateCapacity(selectedBytes: number) {
  const estimated = estimatedComfortableBytes();
  const ratio = selectedBytes / Math.max(1, estimated);
  const aboveHardLimit = selectedBytes > LIMITS.bytes;

  const signal = aboveHardLimit || ratio > 1 ? "red" : ratio > 0.75 ? "amber" : "green";
  const badge =
    aboveHardLimit
      ? "Above tool limit"
      : signal === "red"
        ? "High workload"
        : signal === "amber"
          ? "Near estimated range"
          : "Within range";

  const copy =
    aboveHardLimit
      ? "This file is above the current 30 MB preview limit."
      : signal === "red"
        ? "This file is above the comfortable estimate for this browser."
        : signal === "amber"
          ? "This file is close to the comfortable estimate for this browser."
          : "This file is comfortably within the estimated range for this browser.";

  capacityCard.dataset.signal = signal;
  $("capacity-badge").textContent = badge;
  $("capacity-copy").textContent = copy;
  $("selected-size").textContent = formatBytes(selectedBytes);
  $("estimated-size").textContent = `~${formatBytes(estimated)}`;
  ($("capacity-fill") as HTMLSpanElement).style.width =
    `${Math.min(100, Math.max(3, ratio * 100))}%`;
}

function showSelectedFile(nextFile: File | null) {
  const hasFile = Boolean(nextFile);
  dropZone.hidden = hasFile;
  selectedPanel.hidden = !hasFile;

  if (!nextFile) {
    $("file-name").textContent = "Selected PDF";
    $("file-info").textContent = "No file selected";
    readyStatus.textContent = "Ready when you are.";
    readyStatus.hidden = true;
    return;
  }

  $("file-name").textContent = nextFile.name;
  $("file-info").textContent = `${formatBytes(nextFile.size)} · Reading pages…`;
  updateCapacity(nextFile.size);
  readyStatus.hidden = false;
}

function status(text: string, error = false) {
  $("status").textContent = text;
  readyStatus.textContent = text;

  if (error) {
    errorBox.textContent = text;
    errorBox.hidden = false;
    readyStatus.hidden = true;
  } else {
    errorBox.hidden = true;
  }
}

function setProcessing(active: boolean) {
  processingCard.hidden = !active;
  readyStatus.hidden = active || !file;
  if (active) resultCard.hidden = true;
}

function clearDownload() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  download.hidden = true;
  resultCard.hidden = true;
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
  setProcessing(false);
  progress.hidden = true;
  errorBox.hidden = true;
}

async function prepareFile(nextFile: File | null) {
  await reset();
  const id = generation;
  file = nextFile;
  convert.disabled = true;
  progress.hidden = true;

  if (!file) {
    showSelectedFile(null);
    status("Ready when you are.");
    return;
  }

  showSelectedFile(file);
  status("Reading PDF…");

  try {
    const loaded = await openPdf(file, controller.signal);
    if (id !== generation) {
      await loaded.loadingTask.destroy();
      return;
    }

    pdf = loaded;
    $("file-info").textContent =
      `${formatBytes(file.size)} · ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`;
    status("Ready to convert to editable Word.");
    convert.disabled = false;
  } catch (e) {
    if (id === generation)
      status(e instanceof Error ? e.message : "Could not read this PDF.", true);
  }
}

fileInput.onchange = async () => {
  await prepareFile(fileInput.files?.[0] || null);
};

chooseFile.onclick = (event) => {
  event.stopPropagation();
  fileInput.click();
};

dropZone.onclick = () => fileInput.click();

dropZone.onkeydown = (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
};

dropZone.ondragover = (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
};

dropZone.ondragleave = () => {
  dropZone.classList.remove("is-dragging");
};

dropZone.ondrop = async (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  const dropped = event.dataTransfer?.files?.[0] || null;
  if (!dropped) return;
  if (
    dropped.type !== "application/pdf" &&
    !dropped.name.toLowerCase().endsWith(".pdf")
  ) {
    showSelectedFile(null);
    errorBox.textContent = "Choose a PDF file to continue.";
    errorBox.hidden = false;
    return;
  }
  await prepareFile(dropped);
};

removeFile.onclick = async () => {
  await reset();
  file = null;
  fileInput.value = "";
  showSelectedFile(null);
};

convert.onclick = async () => {
  if (!pdf || !file) return;
  const id = generation,
    started = performance.now(),
    pages: PageModel[] = [];

  clearDownload();
  errorBox.hidden = true;
  convert.disabled = true;
  fileInput.disabled = true;
  removeFile.disabled = true;
  cancel.hidden = false;
  progress.hidden = false;
  progress.value = 0;
  setProcessing(true);

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

      if (characters > LIMITS.characters || imageBytes > 50 * MB)
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
        ? "Word file ready with reconstruction notes."
        : "Word file ready.",
    );

    setProcessing(false);
    readyStatus.hidden = true;
    resultCard.hidden = false;

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
      setProcessing(false);
      cancel.hidden = true;
      fileInput.disabled = false;
      removeFile.disabled = false;
      convert.disabled = !pdf;

      if (!resultCard.hidden) readyStatus.hidden = true;
      else if (!errorBox.hidden) readyStatus.hidden = true;
      else readyStatus.hidden = !file;
    }
  }
};

cancel.onclick = async () => {
  await reset();
  file = null;
  fileInput.disabled = false;
  fileInput.value = "";
  removeFile.disabled = false;
  cancel.hidden = true;
  convert.disabled = true;
  showSelectedFile(null);
};

window.addEventListener("pagehide", () => {
  controller.abort();
  worker?.terminate();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
