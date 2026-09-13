import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  EyeOff,
  FileText,
  Loader2,
  ScanSearch,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { pdfjsLib } from "../utils/pdfjs";

type FindingCategory =
  | "Name"
  | "Address"
  | "Email"
  | "Phone"
  | "Credit Card"
  | "US SSN"
  | "IBAN"
  | "Bank Account"
  | "Passport"
  | "Date of Birth"
  | "IP Address"
  | "AWS Access Key"
  | "OpenAI API Key"
  | "GitHub Token"
  | "JWT"
  | "Password / Secret";

type RedactionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Finding = {
  id: string;
  category: FindingCategory;
  value: string;
  maskedValue: string;

  // TXT / CSV
  textStart?: number;
  textEnd?: number;

  // PDF
  page?: number;
  box?: RedactionBox;

  selected: boolean;
};

type Detector = {
  category: FindingCategory;
  regex: RegExp;
  validate?: (value: string) => boolean;
  captureGroup?: number;
};

const luhnCheck = (input: string) => {
  const digits = input.replace(/\D/g, "");

  if (digits.length < 13 || digits.length > 19) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  let doubleDigit = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);

    if (doubleDigit) {
      n *= 2;
      if (n > 9) n -= 9;
    }

    sum += n;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
};

const validPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

const DETECTORS: Detector[] = [
  {
    category: "Name",
    regex: /\b(?:full\s+name|customer\s+name|client\s+name|employee\s+name|name)\s*[:=-]\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4})/gi,
    captureGroup: 1,
  },
  {
    category: "Address",
    regex: /\b(?:home\s+address|billing\s+address|shipping\s+address|postal\s+address|address)\s*[:=-]\s*([^\r\n]{5,120})/gi,
    captureGroup: 1,
  },
  {
    category: "Email",
    regex:
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    category: "US SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: "Credit Card",
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    validate: luhnCheck,
  },
  {
    category: "IBAN",
    regex: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/gi,
  },
  {
    category: "Phone",
    regex:
      /(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?!\w)/g,
    validate: validPhone,
  },
  {
    category: "Bank Account",
    regex:
      /\b(?:bank\s+account|account|acct|a\/c)\s*(?:number|no\.?|#)?\s*[:=-]?\s*([A-Z0-9-]{6,24})\b/gi,
    captureGroup: 1,
  },
  {
    category: "Passport",
    regex:
      /\bpassport\s*(?:number|no\.?|#)?\s*[:=-]?\s*([A-Z0-9]{6,12})\b/gi,
    captureGroup: 1,
  },
  {
    category: "Date of Birth",
    regex:
      /\b(?:dob|date\s+of\s+birth)\s*[:=-]?\s*((?:\d{1,2}[./-]){2}\d{2,4})\b/gi,
    captureGroup: 1,
  },
  {
    category: "IP Address",
    regex:
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
  {
    category: "AWS Access Key",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    category: "OpenAI API Key",
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    category: "GitHub Token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  },
  {
    category: "JWT",
    regex:
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  {
    category: "Password / Secret",
    regex:
      /\b(?:password|passwd|pwd|secret|api[_ -]?key|access[_ -]?token|auth[_ -]?token)\s*[:=]\s*["']?([^\s"'`,;]{6,})["']?/gi,
    captureGroup: 1,
  },
];

const maskValue = (value: string) => {
  const clean = value.trim();

  if (clean.length <= 5) return "•••••";

  if (
    /password|secret|token|api[_ -]?key/i.test(clean) ||
    clean.startsWith("sk-") ||
    clean.startsWith("gh") ||
    clean.startsWith("eyJ")
  ) {
    return `${clean.slice(0, 3)}••••••••••`;
  }

  return `${clean.slice(0, 2)}${"•".repeat(
    Math.min(12, Math.max(4, clean.length - 4))
  )}${clean.slice(-2)}`;
};

const detectText = (text: string) => {
  const matches: {
    category: FindingCategory;
    value: string;
    start: number;
    end: number;
  }[] = [];

  const seen = new Set<string>();

  for (const detector of DETECTORS) {
    const regex = new RegExp(detector.regex.source, detector.regex.flags);

    for (const match of text.matchAll(regex)) {
      const fullMatch = match[0];

      const value =
        detector.captureGroup && match[detector.captureGroup]
          ? match[detector.captureGroup]
          : fullMatch;

      const fullStart = match.index ?? 0;
      const offsetInsideMatch = fullMatch.indexOf(value);
      const start = fullStart + Math.max(0, offsetInsideMatch);
      const end = start + value.length;

      if (detector.validate && !detector.validate(value)) continue;

      const key = `${start}:${end}:${detector.category}`;
      if (seen.has(key)) continue;

      seen.add(key);

      matches.push({
        category: detector.category,
        value,
        start,
        end,
      });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const PrivatePiiRedactor: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [sourceText, setSourceText] = useState("");

  const [isScanning, setIsScanning] = useState(false);
  const [isRedacting, setIsRedacting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<FindingCategory, Finding[]>();

    for (const finding of findings) {
      const list = map.get(finding.category) || [];
      list.push(finding);
      map.set(finding.category, list);
    }

    return Array.from(map.entries());
  }, [findings]);

  const selectedCount = findings.filter((x) => x.selected).length;

  const clearAll = () => {
    setFile(null);
    setFindings([]);
    setSourceText("");
    setError(null);
    setStatus(null);

    if (inputRef.current) inputRef.current.value = "";
  };

  const scanPlainText = async (nextFile: File) => {
    const text = await nextFile.text();
    setSourceText(text);

    const matches = detectText(text);

    setFindings(
      matches.map((match, index) => ({
        id: `text-${index}-${match.start}`,
        category: match.category,
        value: match.value,
        maskedValue: maskValue(match.value),
        textStart: match.start,
        textEnd: match.end,
        selected: true,
      }))
    );
  };

  const scanPdf = async (nextFile: File) => {
    const bytes = new Uint8Array(await nextFile.arrayBuffer());

    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    const nextFindings: Finding[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      setStatus(`Scanning page ${pageNumber} of ${pdf.numPages}…`);

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      textContent.items.forEach((rawItem: any, itemIndex: number) => {
        if (!rawItem || typeof rawItem.str !== "string") return;

        const text = rawItem.str;
        if (!text.trim()) return;

        const matches = detectText(text);
        if (!matches.length) return;

        const transformed = pdfjsLib.Util.transform(
          viewport.transform,
          rawItem.transform
        );

        const fontHeight = Math.max(
          7,
          Math.hypot(transformed[2], transformed[3])
        );

        const itemWidth = Math.max(
          2,
          Number(rawItem.width || text.length * fontHeight * 0.5) *
            viewport.scale
        );

        const baseX = transformed[4];
        const baseY = transformed[5] - fontHeight;

        for (const match of matches) {
          const startRatio =
            text.length > 0 ? match.start / text.length : 0;

          const endRatio =
            text.length > 0 ? match.end / text.length : 1;

          const horizontalGuard = Math.max(5, fontHeight * 0.45);

          const rawX = baseX + itemWidth * startRatio;
          const x = Math.max(0, rawX - horizontalGuard);
          const y = Math.max(0, baseY - 3);

          const width = Math.min(
            viewport.width - x,
            Math.max(
              8,
              itemWidth * (endRatio - startRatio) +
                horizontalGuard * 2
            )
          );

          const height = Math.min(
            viewport.height - y,
            Math.max(10, fontHeight + 6)
          );

          nextFindings.push({
            id: `pdf-${pageNumber}-${itemIndex}-${match.start}-${match.category}`,
            category: match.category,
            value: match.value,
            maskedValue: maskValue(match.value),
            page: pageNumber,
            box: {
              x,
              y,
              width,
              height,
            },
            selected: true,
          });
        }
      });
    }

    setFindings(nextFindings);

    try {
      await pdf.destroy();
    } catch (_) {}
  };

  const scanFile = async (nextFile: File) => {
    setFile(nextFile);
    setFindings([]);
    setSourceText("");
    setError(null);
    setStatus(null);
    setIsScanning(true);

    try {
      const extension =
        nextFile.name.split(".").pop()?.toLowerCase() || "";

      if (extension === "pdf" || nextFile.type === "application/pdf") {
        await scanPdf(nextFile);
      } else if (
        extension === "txt" ||
        extension === "csv" ||
        nextFile.type.startsWith("text/")
      ) {
        await scanPlainText(nextFile);
      } else {
        throw new Error(
          "This first version supports PDF, TXT and CSV files."
        );
      }

      setStatus("Scan complete.");
    } catch (err: any) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to scan this file. Please try another document."
      );

      setStatus(null);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFile = (nextFile?: File | null) => {
    if (!nextFile) return;

    const maxSize = 150 * 1024 * 1024;

    if (nextFile.size > maxSize) {
      setError("Please choose a file smaller than 150 MB.");
      return;
    }

    scanFile(nextFile);
  };

  const toggleFinding = (id: string) => {
    setFindings((current) =>
      current.map((finding) =>
        finding.id === id
          ? { ...finding, selected: !finding.selected }
          : finding
      )
    );
  };

  const toggleCategory = (
    category: FindingCategory,
    selected: boolean
  ) => {
    setFindings((current) =>
      current.map((finding) =>
        finding.category === category
          ? { ...finding, selected }
          : finding
      )
    );
  };

  const redactPlainText = async () => {
    if (!file) return;

    const selected = findings
      .filter(
        (finding) =>
          finding.selected &&
          typeof finding.textStart === "number" &&
          typeof finding.textEnd === "number"
      )
      .sort((a, b) => (b.textStart || 0) - (a.textStart || 0));

    let output = sourceText;

    for (const finding of selected) {
      const start = finding.textStart!;
      const end = finding.textEnd!;

      output =
        output.slice(0, start) +
        "█".repeat(Math.max(8, end - start)) +
        output.slice(end);
    }

    const extension =
      file.name.split(".").pop()?.toLowerCase() === "csv"
        ? "csv"
        : "txt";

    const base = file.name.replace(/\.[^.]+$/, "");

    downloadBlob(
      new Blob([output], {
        type:
          extension === "csv"
            ? "text/csv;charset=utf-8"
            : "text/plain;charset=utf-8",
      }),
      `${base}-redacted.${extension}`
    );
  };

  const redactPdf = async () => {
    if (!file) return;

    const originalBytes = new Uint8Array(await file.arrayBuffer());

    const pdf = await pdfjsLib.getDocument({
      data: originalBytes.slice(),
    }).promise;

    const outputPdf = await PDFDocument.create();

    const selected = findings.filter(
      (finding) =>
        finding.selected && finding.page && finding.box
    );

    const renderScale = 1.7;

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      setStatus(
        `Creating secure redacted page ${pageNumber} of ${pdf.numPages}…`
      );

      const page = await pdf.getPage(pageNumber);

      const baseViewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({
        scale: renderScale,
      });

      const canvas = document.createElement("canvas");

      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);

      const ctx = canvas.getContext("2d", {
        alpha: false,
      });

      if (!ctx) {
        throw new Error("Unable to create secure PDF renderer.");
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: renderViewport,
        canvas,
      } as any).promise;

      const pageFindings = selected.filter(
        (finding) => finding.page === pageNumber
      );

      ctx.fillStyle = "#000000";

      for (const finding of pageFindings) {
        const box = finding.box!;

        const x = box.x * renderScale;
        const y = box.y * renderScale;
        const width = box.width * renderScale;
        const height = box.height * renderScale;

        ctx.fillRect(
          Math.max(0, x),
          Math.max(0, y),
          Math.max(2, width),
          Math.max(2, height)
        );
      }

      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Unable to render PDF page."));
          },
          "image/jpeg",
          0.94
        );
      });

      const imageBytes = new Uint8Array(
        await imageBlob.arrayBuffer()
      );

      const image = await outputPdf.embedJpg(imageBytes);

      const outputPage = outputPdf.addPage([
        baseViewport.width,
        baseViewport.height,
      ]);

      outputPage.drawImage(image, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });

      canvas.width = 1;
      canvas.height = 1;
    }

    outputPdf.setTitle("");
    outputPdf.setAuthor("");
    outputPdf.setSubject("");
    outputPdf.setKeywords([]);
    outputPdf.setCreator("1into1");
    outputPdf.setProducer("1into1");

    const bytes = await outputPdf.save();

    const base = file.name.replace(/\.pdf$/i, "");

    downloadBlob(
      new Blob([bytes as any], {
        type: "application/pdf",
      }),
      `${base}-redacted.pdf`
    );

    try {
      await pdf.destroy();
    } catch (_) {}
  };

  const createRedactedCopy = async () => {
    if (!file || selectedCount === 0) return;

    setError(null);
    setIsRedacting(true);

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "";

      if (extension === "pdf" || file.type === "application/pdf") {
        await redactPdf();
      } else {
        await redactPlainText();
      }

      setStatus(
        "Redacted copy created locally. Your original file was never uploaded."
      );
    } catch (err: any) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to create the redacted copy."
      );
    } finally {
      setIsRedacting(false);
    }
  };

  return (
    <div className="pii-redactor w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-5 text-black">
      <div className="rounded-2xl border border-zinc-300 bg-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-black text-xs font-bold tracking-wide uppercase">
              <ShieldCheck className="w-4 h-4" />
              Local Privacy Scanner
            </div>

            <h2 className="text-xl sm:text-2xl font-semibold mt-2 tracking-tight">
              Private PII &amp; Secrets Auto-Redactor
            </h2>

            <p className="text-sm text-zinc-950 mt-2 max-w-2xl leading-6">
              Find sensitive information before sharing a file.
              Review what was detected, choose what to remove,
              and create a redacted copy directly on your device.
            </p>
          </div>

          {file && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl border !border-zinc-950 !bg-white !text-zinc-950 text-sm font-semibold hover:!bg-zinc-100 hover:!text-black transition"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFile(event.dataTransfer.files?.[0]);
            }}
            className="mt-6 w-full min-h-[220px] rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-emerald-50/40 hover:border-emerald-500 transition flex flex-col items-center justify-center text-center p-8"
          >
            <Upload className="w-8 h-8 text-emerald-700" />

            <strong className="mt-4 text-base">
              Drop a private file here
            </strong>

            <span className="mt-2 text-sm text-zinc-950">
              or click to choose a PDF, TXT or CSV file
            </span>

            <span className="mt-4 text-xs text-zinc-950">
              Processed locally in your browser · No file upload
            </span>
          </button>
        ) : (
          <div className="mt-6 rounded-xl border border-zinc-800 p-4 flex items-center gap-3"
            style={{ backgroundColor: "#18181b", color: "#ffffff" }}>
            <FileText className="w-5 h-5 text-emerald-700 shrink-0" />

            <div className="min-w-0 flex-1">
              <strong className="block text-sm truncate" style={{ color: "#ffffff" }}>
                {file.name}
              </strong>

              <span className="text-xs" style={{ color: "#d4d4d8" }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>

            {isScanning ? (
              <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
          className="hidden"
          onChange={(event) =>
            handleFile(event.target.files?.[0])
          }
        />

        {status && (
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-950">
            {isScanning || isRedacting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ScanSearch className="w-4 h-4" />
            )}
            {status}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {file && !isScanning && (
        <div className="rounded-2xl border border-zinc-300 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                Sensitive information found
              </h3>

              <p className="text-xs text-zinc-950 mt-1">
                {findings.length === 0
                  ? "No supported sensitive patterns were detected."
                  : `${findings.length} item${
                      findings.length === 1 ? "" : "s"
                    } detected · ${selectedCount} selected for redaction`}
              </p>
            </div>

            {findings.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFindings((current) =>
                      current.map((x) => ({
                        ...x,
                        selected: true,
                      }))
                    )
                  }
                  className="pii-secondary-button min-h-10 px-3 rounded-lg border border-zinc-950 bg-white text-black text-xs font-medium transition"
                >
                  Select all
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFindings((current) =>
                      current.map((x) => ({
                        ...x,
                        selected: false,
                      }))
                    )
                  }
                  className="pii-secondary-button min-h-10 px-3 rounded-lg border border-zinc-950 bg-white text-black text-xs font-medium transition"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>

          {grouped.length > 0 && (
            <div className="mt-5 space-y-3">
              {grouped.map(([category, items]) => {
                const allSelected = items.every(
                  (item) => item.selected
                );

                return (
                  <div
                    key={category}
                    className="rounded-xl border border-zinc-200 overflow-hidden"
                  >
                    <label className="flex items-center gap-3 p-3 border-b border-zinc-800 cursor-pointer"
                      style={{ backgroundColor: "#18181b", color: "#ffffff" }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) =>
                          toggleCategory(
                            category,
                            event.target.checked
                          )
                        }
                        className="w-4 h-4"
                      />

                      <EyeOff className="w-4 h-4 !text-emerald-400" />

                      <strong className="text-sm" style={{ color: "#ffffff" }}>
                        {category}
                      </strong>

                      <span className="ml-auto text-xs" style={{ color: "#d4d4d8" }}>
                        {items.length}
                      </span>
                    </label>

                    <div className="divide-y divide-zinc-100">
                      {items.map((finding) => (
                        <label
                          key={finding.id}
                          className="pii-finding-row flex items-center gap-3 p-3 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={finding.selected}
                            onChange={() =>
                              toggleFinding(finding.id)
                            }
                            className="w-4 h-4 shrink-0"
                          />

                          <code className="text-xs text-zinc-950 break-all">
                            {finding.maskedValue}
                          </code>

                          {finding.page && (
                            <span className="ml-auto text-[11px] text-zinc-950 whitespace-nowrap">
                              Page {finding.page}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {findings.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                disabled={
                  selectedCount === 0 || isRedacting
                }
                onClick={createRedactedCopy}
                className="w-full min-h-12 px-5 rounded-xl !bg-emerald-600 !text-white hover:!bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-semibold transition"
              >
                {isRedacting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating secure copy…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Redact {selectedCount} selected item
                    {selectedCount === 1 ? "" : "s"} &amp; Download
                  </>
                )}
              </button>

              <p className="mt-3 text-center text-[11px] leading-5 text-zinc-950">
                PDF exports are flattened into a new document so
                selected redacted text is not retained as a
                selectable text layer.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <ShieldCheck className="w-4 h-4 text-emerald-700 mb-2" />
          <strong className="block">Private by design</strong>
          <span className="block mt-1 text-zinc-950 leading-5">
            Your document stays on your device.
          </span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <ScanSearch className="w-4 h-4 text-emerald-700 mb-2" />
          <strong className="block">Automatic detection</strong>
          <span className="block mt-1 text-zinc-950 leading-5">
            Finds common PII, financial data and exposed secrets.
          </span>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <EyeOff className="w-4 h-4 text-emerald-700 mb-2" />
          <strong className="block">You stay in control</strong>
          <span className="block mt-1 text-zinc-950 leading-5">
            Review every finding before anything is removed.
          </span>
        </div>
      </div>
    </div>
  );
};

export default PrivatePiiRedactor;
