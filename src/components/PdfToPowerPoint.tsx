import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import {
  convertPdfToPowerPoint,
  inspectPdf,
} from "../utils/pdfToPowerPoint/convert";
import type {
  ConversionMode,
  ConversionReport,
} from "../utils/pdfToPowerPoint/model";
import { checkTaskCredit, commitTaskCredit } from "../utils/taskCreditGate";
import {
  clearProcessingRecovery,
  exclusivelyProcess,
} from "../utils/localProcessing";
import { useObjectUrl } from "../utils/useObjectUrl";
import { useDesktopCapacityRecommendation } from "../hooks/useDesktopCapacityRecommendation";
import { DesktopCapacityStatus } from "./DesktopCapacityStatus";
interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
}
const fileKeys = new WeakMap<File, number>();
let nextFileKey = 0;
export function PdfToPowerPoint(props: Props) {
  if (props.file && !fileKeys.has(props.file))
    fileKeys.set(props.file, ++nextFileKey);
  return (
    <PowerPointSession
      key={props.file ? fileKeys.get(props.file) : "empty"}
      {...props}
    />
  );
}
function PowerPointSession({ file, onFileChange }: Props) {
  const [busy, setBusy] = useState(false),
    [inspecting, setInspecting] = useState(Boolean(file));
  const [error, setError] = useState<string | null>(null),
    [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0),
    [pageCount, setPageCount] = useState<number | null>(null);
  const [pages, setPages] = useState(""),
    [mode, setMode] = useState<ConversionMode>("auto");
  const [report, setReport] = useState<ConversionReport | null>(null);
  const controller = useRef<AbortController | null>(null);
  const { url, createUrl, revokeNow } = useObjectUrl();
  const { recommendation } = useDesktopCapacityRecommendation({
    toolId: "pdf-to-powerpoint",
    selectedBytes: file?.size ?? 0,
    pageCount,
    enabled: Boolean(file),
  });
  useEffect(() => {
    const inspection = new AbortController();
    if (file) {
      void inspectPdf(file, inspection.signal)
        .then((count) => {
          if (!inspection.signal.aborted) setPageCount(count);
        })
        .catch((e) => {
          if (!inspection.signal.aborted)
            setError(
              e instanceof Error ? e.message : "Unable to read this PDF.",
            );
        })
        .finally(() => {
          if (!inspection.signal.aborted) setInspecting(false);
        });
    }
    return () => {
      inspection.abort();
      controller.current?.abort();
      controller.current = null;
    };
  }, [file]);
  function selectFile(selected?: File) {
    if (!selected) return;
    if (
      !selected.name.toLowerCase().endsWith(".pdf") &&
      selected.type !== "application/pdf"
    ) {
      setError("Choose a PDF file to continue.");
      return;
    }
    onFileChange(selected);
  }
  async function convert() {
    if (!file || controller.current) return;
    const run = new AbortController();
    controller.current = run;
    setBusy(true);
    setError(null);
    setReport(null);
    revokeNow();
    setProgress(0);
    setStatus("Reading PDF…");
    try {
      await exclusivelyProcess(async () => {
        try {
          run.signal.throwIfAborted();
          const check = checkTaskCredit(file);
          if (!check.allowed)
            throw Error(
              check.errorMessage ||
                "This task is not available on your current plan.",
            );
          const result = await convertPdfToPowerPoint(
            file,
            run.signal,
            (message, percent, count) => {
              if (controller.current === run) {
                setStatus(message);
                setProgress(percent);
                setPageCount(count);
              }
            },
            { pages, mode },
          );
          run.signal.throwIfAborted();
          createUrl(result.blob);
          setReport(result.report);
          setProgress(100);
          setStatus("PowerPoint file ready.");
          commitTaskCredit();
        } finally {
          clearProcessingRecovery();
        }
      });
    } catch (cause) {
      if (controller.current !== run) return;
      if (run.signal.aborted)
        setStatus("Conversion cancelled. No task credit used.");
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to convert this PDF. Try fewer pages or Best fidelity mode.",
        );
    } finally {
      if (controller.current === run) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  const editable =
    report?.pages.filter((p) => p.editableCharacters > 0).length ?? 0;
  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 text-white space-y-6">
      {!file ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            selectFile(e.dataTransfer.files[0]);
          }}
          className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-2xl p-10 text-center transition cursor-pointer bg-zinc-900/30"
        >
          <input
            id="powerpoint-upload"
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              selectFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="powerpoint-upload"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("powerpoint-upload")?.click();
              }
            }}
            className="cursor-pointer flex flex-col items-center gap-3"
          >
            <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center text-zinc-400">
              <FileText className="w-7 h-7" />
            </div>
            <span className="text-base font-medium text-zinc-200">
              Select PDF to convert to PowerPoint
            </span>
            <span className="text-xs text-zinc-500">
              One page per slide · Digital PDFs and scans · No uploads
            </span>
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="truncate text-sm">
                <span className="text-zinc-200 font-medium">{file.name}</span>
                <span className="text-xs text-zinc-500 block">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                  {pageCount !== null ? ` · ${pageCount} pages` : ""}
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Remove file"
              disabled={busy}
              onClick={() => onFileChange(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {recommendation && (
            <DesktopCapacityStatus recommendation={recommendation} />
          )}
          <p className="text-xs text-zinc-500">
            Auto keeps reliable digital text editable. Scans and complex content
            are preserved as page artwork. Fonts may differ; tables retain their
            appearance without editable table cells.
          </p>
          {!url && (
            <fieldset
              disabled={busy || inspecting}
              className="grid sm:grid-cols-2 gap-4 disabled:opacity-50"
            >
              <label className="text-sm text-zinc-300">
                Pages
                <input
                  aria-label="Pages"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="All pages (or 1-3, 5)"
                  className="block mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3"
                />
              </label>
              <label className="text-sm text-zinc-300">
                Conversion mode
                <select
                  aria-label="Conversion mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ConversionMode)}
                  className="block mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3"
                >
                  <option value="auto">
                    Auto — editable text where reliable
                  </option>
                  <option value="fidelity">
                    Best fidelity — preserve page appearance
                  </option>
                </select>
              </label>
            </fieldset>
          )}
          {inspecting ? (
            <p role="status" className="text-sm">
              Inspecting PDF…
            </p>
          ) : busy ? (
            <div
              aria-busy="true"
              data-processing-active="true"
              className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3"
            >
              <p role="status" className="text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {status}
              </p>
              <progress
                aria-label="Conversion progress"
                value={progress}
                max={100}
                className="w-full accent-emerald-500"
              />
              <button
                type="button"
                className="quiet-button"
                onClick={() => controller.current?.abort()}
              >
                Cancel conversion
              </button>
            </div>
          ) : url && report ? (
            <div className="space-y-3">
              <p role="status" className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {report.pages.length} slides created · {editable} with editable
                text · {report.pages.length - editable} preserved as artwork
              </p>
              <a
                href={url}
                download={file.name.replace(/\.pdf$/i, "") + "-powerpoint.pptx"}
                className="primary-button inline-flex items-center gap-2"
              >
                <Download size={16} />
                Download PowerPoint
              </a>
              <details className="text-xs text-zinc-500">
                <summary className="cursor-pointer">Conversion notes</summary>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  {report.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {report.pages.map((p) => (
                    <li key={p.sourcePage}>
                      Page {p.sourcePage}: {p.reason}
                    </li>
                  ))}
                </ul>
              </details>
              <button
                type="button"
                className="quiet-button block"
                onClick={() => {
                  revokeNow();
                  setReport(null);
                  setStatus("");
                }}
              >
                Change options
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={!pageCount}
                onClick={() => void convert()}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all text-sm disabled:opacity-40"
              >
                <FileText size={16} />
                Convert to PowerPoint
              </button>
              {status && (
                <p role="status" className="text-xs text-zinc-500">
                  {status}
                </p>
              )}
            </>
          )}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
}
