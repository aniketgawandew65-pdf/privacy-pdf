import {
  normalizeForSafetyCheck,
  verifyFinishedPdf,
} from "../utils/pdfSafetyVerifier";
import { createWorker } from 'tesseract.js';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  EyeOff,
  FileText,
  Loader2,
  ScanSearch,
  ShieldCheck,
  Trash2,
  X,
  Upload,
} from "lucide-react";
import {
  loadPdfJsFromBlob,
  pdfjsLib,
} from "../utils/pdfjs";
import {
  redactPDF,
  type PageRedaction,
} from "../utils/pdfEngine";
import {
  saveToolWorkspaceFiles,
  restoreToolWorkspaceFiles,
  clearToolWorkspace,
  saveToolWorkspaceState,
  restoreToolWorkspaceState,
} from "../utils/localWorkspace";

type FindingCategory =
  | "Name"
  | "Address"
  | "Email"
  | "Phone"
  | "Credit Card"
  | "US SSN"
  | "India Aadhaar"
  | "India PAN"
  | "UK National Insurance"
  | "UK NHS Number"
  | "Canada SIN"
  | "Australia TFN"
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
  pageWidth?: number;
  pageHeight?: number;

  selected: boolean;
};

type RedactorSessionCache = {
  file: File | null;
  findings: Finding[];
  sourceText: string;
  error: string | null;
  status: string | null;
  manualReviewFindings: Finding[];
  pendingRedactedPdf: Uint8Array | null;
};

const EMPTY_REDACTOR_SESSION: RedactorSessionCache = {
  file: null,
  findings: [],
  sourceText: "",
  error: null,
  status: null,
  manualReviewFindings: [],
  pendingRedactedPdf: null,
};

let redactorSessionCache: RedactorSessionCache = {
  ...EMPTY_REDACTOR_SESSION,
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

const validUkNhs = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return false;

  const sum = digits
    .slice(0, 9)
    .split("")
    .reduce(
      (total, digit, index) =>
        total + Number(digit) * (10 - index),
      0
    );

  const remainder = sum % 11;
  const check = 11 - remainder;
  const expected = check === 11 ? 0 : check === 10 ? -1 : check;

  return expected >= 0 && expected === Number(digits[9]);
};

const validCanadaSin = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 9) return false;

  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[i]);

    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }

    sum += n;
  }

  return sum % 10 === 0;
};

const validAustraliaTfn = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8 && digits.length !== 9) return false;

  const normalized =
    digits.length === 8 ? `0${digits}` : digits;

  const weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];

  const sum = normalized
    .split("")
    .reduce(
      (total, digit, index) =>
        total + Number(digit) * weights[index],
      0
    );

  return sum % 11 === 0;
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
      /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)*\s*\.\s*[A-Z]{2,}\b/gi,
  },
  {
    category: "US SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: "India Aadhaar",
    regex:
      /\b(?:aadhaar|aadhar)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})\b/gi,
    captureGroup: 1,
  },
  {
    category: "India PAN",
    regex:
      /\b(?:pan|permanent\s+account\s+number)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*([A-Z]{5}\d{4}[A-Z])\b/gi,
    captureGroup: 1,
  },
  {
    category: "UK National Insurance",
    regex:
      /\b(?:national\s+insurance|ni)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*([A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D])\b/gi,
    captureGroup: 1,
  },
  {
    category: "UK NHS Number",
    regex:
      /\b(?:nhs)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*(\d{3}[\s-]?\d{3}[\s-]?\d{4})\b/gi,
    captureGroup: 1,
    validate: validUkNhs,
  },
  {
    category: "Canada SIN",
    regex:
      /\b(?:sin|social\s+insurance\s+number)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/gi,
    captureGroup: 1,
    validate: validCanadaSin,
  },
  {
    category: "Australia TFN",
    regex:
      /\b(?:tfn|tax\s+file\s+number)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*(\d{3}[\s-]?\d{3}[\s-]?\d{2,3})\b/gi,
    captureGroup: 1,
    validate: validAustraliaTfn,
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

  const priority: Record<FindingCategory, number> = {
    "Credit Card": 100,
    "US SSN": 95,
    "India Aadhaar": 96,
    "India PAN": 96,
    "UK National Insurance": 96,
    "UK NHS Number": 96,
    "Canada SIN": 96,
    "Australia TFN": 96,
    "IBAN": 90,
    "Bank Account": 88,
    "Passport": 86,
    "Date of Birth": 84,
    "AWS Access Key": 100,
    "OpenAI API Key": 100,
    "GitHub Token": 100,
    "JWT": 100,
    "Password / Secret": 92,
    "Email": 90,
    "IP Address": 88,
    "Phone": 50,
    "Name": 70,
    "Address": 70,
  };

  const accepted: typeof matches = [];

  for (const candidate of [...matches].sort((a, b) => {
    const priorityDiff =
      priority[b.category] - priority[a.category];

    if (priorityDiff !== 0) return priorityDiff;

    return (b.end - b.start) - (a.end - a.start);
  })) {
    const overlapsHigherPriority = accepted.some(
      (existing) =>
        candidate.start < existing.end &&
        candidate.end > existing.start
    );

    if (!overlapsHigherPriority) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
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

type ManualRedactionMap = Record<
  number,
  Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>
>;

type ManualReviewItem = {
  id: string;
  category: FindingCategory;
  value: string;
  maskedValue: string;
  page: number;
  target: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

interface PrivatePiiRedactorProps {
  onContinueManual?: (
    file: File,
    initialRedactions: ManualRedactionMap,
    manualReviewItems?: ManualReviewItem[]
  ) => void;
}

export const PrivatePiiRedactor: React.FC<PrivatePiiRedactorProps> = ({
  onContinueManual,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(
    () => redactorSessionCache.file
  );

  const [workspaceHydrated, setWorkspaceHydrated] =
    useState(false);

  const [findings, setFindings] = useState<Finding[]>(
    () => redactorSessionCache.findings
  );

  const [sourceText, setSourceText] = useState(
    () => redactorSessionCache.sourceText
  );

  const [isScanning, setIsScanning] = useState(false);
  const [isRedacting, setIsRedacting] = useState(false);

  const [error, setError] = useState<string | null>(
    () => redactorSessionCache.error
  );

  const [status, setStatus] = useState<string | null>(
    () => redactorSessionCache.status
  );

  const [manualReviewFindings, setManualReviewFindings] =
    useState<Finding[]>(
      () => redactorSessionCache.manualReviewFindings
    );

  /*
   * Holds the exact auto-redacted PDF when the final
   * safety check still requires manual review.
   *
   * In-memory only — never localStorage/sessionStorage.
   */
  const pendingRedactedPdfRef =
    useRef<Uint8Array | null>(
      redactorSessionCache.pendingRedactedPdf
    );

  /*
   * Restore the current PII session if a mobile/native PDF
   * preview recreated the web app.
   *
   * The original source file is kept in OPFS.
   * Findings/checklist state is browser-session only and is
   * removed on real refresh by the shared workspace reset.
   *
   * OCR/scanner logic is NOT rerun automatically here.
   */
  useEffect(() => {
    let cancelled = false;

    const restorePiiWorkspace = async () => {
      try {
        const restored =
          await restoreToolWorkspaceFiles(
            'private-pii-redactor'
          );

        const restoredSensitiveStateFiles =
          await restoreToolWorkspaceFiles(
            'private-pii-redactor-state'
          );

        /*
         * findings/manualReviewFindings are kept here only as
         * legacy migration fields. New builds never write raw
         * PII values to sessionStorage.
         */
        const savedState =
          restoreToolWorkspaceState<{
            findings?: Finding[];
            manualReviewFindings?: Finding[];
            error?: string | null;
            status?: string | null;
          }>('private-pii-redactor');

        let sensitiveState:
          | {
              findings?: Finding[];
              manualReviewFindings?: Finding[];
            }
          | null =
            null;

        if (
          restoredSensitiveStateFiles[0]
        ) {
          try {
            sensitiveState =
              JSON.parse(
                await restoredSensitiveStateFiles[0]
                  .text()
              );
          } catch (_) {
            sensitiveState = null;
          }
        }

        /*
         * Migrate a workspace created by the previous build.
         * The old sessionStorage entry is immediately replaced
         * with a small, non-PII state object.
         */
        if (
          sensitiveState === null &&
          (
            Array.isArray(
              savedState?.findings
            ) ||
            Array.isArray(
              savedState?.manualReviewFindings
            )
          )
        ) {
          sensitiveState = {
            findings:
              savedState?.findings || [],
            manualReviewFindings:
              savedState
                ?.manualReviewFindings ||
              [],
          };

          await saveToolWorkspaceFiles(
            'private-pii-redactor-state',
            [
              new File(
                [
                  JSON.stringify(
                    sensitiveState
                  ),
                ],
                'pii-findings.json',
                {
                  type:
                    'application/json',
                  lastModified:
                    Date.now(),
                }
              ),
            ]
          );
        }

        /*
         * Purge any legacy raw findings from sessionStorage now,
         * before the component continues.
         */
        saveToolWorkspaceState(
          'private-pii-redactor',
          {
            error:
              savedState?.error ??
              null,
            status:
              savedState?.status ??
              null,
          }
        );

        if (cancelled) return;

        const restoredFile =
          restored[0] || null;

        if (restoredFile) {
          setFile(restoredFile);

          const extension =
            restoredFile.name
              .split('.')
              .pop()
              ?.toLowerCase() || '';

          if (
            extension === 'txt' ||
            extension === 'csv' ||
            restoredFile.type.startsWith('text/')
          ) {
            try {
              const text =
                await restoredFile.text();

              if (!cancelled) {
                setSourceText(text);
              }
            } catch {
              // File itself remains available.
            }
          }
        }

        if (
          Array.isArray(
            sensitiveState?.findings
          )
        ) {
          setFindings(
            sensitiveState!.findings!
          );
        }

        if (
          Array.isArray(
            sensitiveState
              ?.manualReviewFindings
          )
        ) {
          setManualReviewFindings(
            sensitiveState!
              .manualReviewFindings!
          );
        }

        if (
          savedState &&
          'error' in savedState
        ) {
          setError(
            savedState.error ?? null
          );
        }

        if (
          savedState &&
          'status' in savedState
        ) {
          setStatus(
            savedState.status ?? null
          );
        }
      } catch (error) {
        console.warn(
          'Unable to restore PII workspace:',
          error
        );
      } finally {
        if (!cancelled) {
          setWorkspaceHydrated(true);
        }
      }
    };

    void restorePiiWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Persist the original source file.
   */
  useEffect(() => {
    if (!workspaceHydrated) return;

    if (file) {
      void saveToolWorkspaceFiles(
        'private-pii-redactor',
        [file]
      );
    }
  }, [
    file,
    workspaceHydrated,
  ]);

  /*
   * ==========================================================
   * PRIVATE PII WORKSPACE PERSISTENCE
   * ==========================================================
   *
   * Progress/status messages can change once per page.
   *
   * They must NOT trigger a rewrite of the sensitive findings
   * payload in OPFS every time the progress text changes.
   *
   * Keep lightweight UI state and sensitive finding state on
   * separate lifecycles.
   */

  /*
   * Lightweight UI state.
   *
   * sessionStorage writes are tiny and contain no raw detected
   * PII values.
   */
  useEffect(() => {
    if (
      !workspaceHydrated ||
      !file
    ) {
      return;
    }

    saveToolWorkspaceState(
      'private-pii-redactor',
      {
        error,
        status,
      }
    );
  }, [
    file,
    error,
    status,
    workspaceHydrated,
  ]);

  /*
   * Sensitive detection state.
   *
   * Finding.value contains real detected private information,
   * therefore this payload stays exclusively inside the local
   * browser workspace.
   *
   * IMPORTANT:
   * This now runs ONLY when the findings themselves change.
   *
   * A page-by-page progress/status update no longer causes a
   * JSON serialization + local-file write.
   */
  useEffect(() => {
    if (
      !workspaceHydrated ||
      !file
    ) {
      return;
    }

    void saveToolWorkspaceFiles(
      'private-pii-redactor-state',
      [
        new File(
          [
            JSON.stringify({
              findings,
              manualReviewFindings,
            }),
          ],
          'pii-findings.json',
          {
            type:
              'application/json',
            lastModified:
              Date.now(),
          }
        ),
      ]
    );
  }, [
    file,
    findings,
    manualReviewFindings,
    workspaceHydrated,
  ]);

  useEffect(() => {
    redactorSessionCache = {
      file,
      findings,
      sourceText,
      error,
      status,
      manualReviewFindings,
      pendingRedactedPdf:
        pendingRedactedPdfRef.current,
    };
  }, [
    file,
    findings,
    sourceText,
    error,
    status,
    manualReviewFindings,
  ]);


  useEffect(() => {
    const piiOcrAssets = [
      "/tessdata/worker.min.js",
      "/tessdata/tesseract-core-simd-lstm.wasm.js",
      "/tessdata/eng.traineddata.gz",
    ];

    piiOcrAssets.forEach((url) => {
      fetch(url, {
        cache: "force-cache",
      }).catch(() => {});
    });
  }, []);

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

  const isPdfFile = Boolean(
    file &&
      (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      )
  );

  const continueToManualRedaction = (
    reviewOnly?: Finding[]
  ) => {
    if (!file || !onContinueManual || !isPdfFile) return;

    /*
     * If final verification already produced unresolved items,
     * EVERY path into Manual Redaction must carry that same
     * review list.
     *
     * This prevents the lower general manual button from opening
     * a second manual session with no review checklist.
     */
    const effectiveReviewFindings =
      reviewOnly ??
      (
        manualReviewFindings.length > 0
          ? manualReviewFindings
          : []
      );

    const initialRedactions: ManualRedactionMap = {};

    const normalizeBox = (finding: Finding) => {
      if (
        !finding.page ||
        !finding.box ||
        !finding.pageWidth ||
        !finding.pageHeight
      ) {
        return null;
      }

      const box = finding.box;

      const normalized = {
        x: Math.max(
          0,
          Math.min(1, box.x / finding.pageWidth)
        ),
        y: Math.max(
          0,
          Math.min(1, box.y / finding.pageHeight)
        ),
        width: Math.max(
          0.002,
          Math.min(1, box.width / finding.pageWidth)
        ),
        height: Math.max(
          0.002,
          Math.min(1, box.height / finding.pageHeight)
        ),
      };

      normalized.width = Math.min(
        normalized.width,
        1 - normalized.x
      );

      normalized.height = Math.min(
        normalized.height,
        1 - normalized.y
      );

      return normalized;
    };

    /*
     * Keep ALL selected automatic redaction boxes
     * when moving into Manual Redaction.
     */
    const selectedFindings =
      findings.filter((finding) => finding.selected);

    for (const finding of selectedFindings) {
      const normalized = normalizeBox(finding);

      if (!normalized || !finding.page) {
        continue;
      }

      if (!initialRedactions[finding.page]) {
        initialRedactions[finding.page] = [];
      }

      initialRedactions[finding.page].push(
        normalized
      );
    }

    /*
     * Separately carry only the items that failed
     * final verification, without exposing raw PII.
     */
    const manualReviewItems: ManualReviewItem[] =
      effectiveReviewFindings
        .map((finding) => {
          const target = normalizeBox(finding);

          if (!target || !finding.page) {
            return null;
          }

          return {
            id: finding.id,
            category: finding.category,
            value: finding.value,
            maskedValue: finding.maskedValue,
            page: finding.page,
            target,
          };
        })
        .filter(
          (
            item
          ): item is ManualReviewItem =>
            item !== null
        );

    onContinueManual(
      file,
      initialRedactions,
      manualReviewItems
    );
  };

  const clearAll = () => {
    redactorSessionCache = {
      ...EMPTY_REDACTOR_SESSION,
    };

    setFile(null);
    setFindings([]);
    setSourceText("");
    setError(null);
    setStatus(null);
    setManualReviewFindings([]);
    pendingRedactedPdfRef.current = null;
    redactorSessionCache.pendingRedactedPdf = null;

    void clearToolWorkspace(
      'private-pii-redactor'
    );

    void clearToolWorkspace(
      'private-pii-redactor-state'
    );

    void clearToolWorkspace(
      'private-pii-redactor-pending'
    );

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

  const scanPdfWithTextLayer = async (
    nextFile: File
  ): Promise<{
    totalPages: number;
    dedicatedOcrPages: number[];
  }> => {
    const {
      pdf,
      dispose: disposePdf,
    } = await loadPdfJsFromBlob(
      nextFile
    );

    const nextFindings: Finding[] = [];

    /*
     * Pages classified as genuinely scanned/image-only during
     * THIS SAME traversal are sent to the existing dedicated
     * OCR scanner afterwards.
     *
     * This removes the separate full-document inspection pass.
     */
    const dedicatedOcrPages: number[] = [];

    let ocrWorker: any = null;

    type PositionedSpan = {
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };

    const groupIntoLines = (input: PositionedSpan[]) => {
      const sorted = [...input].sort((a, b) => {
        const ay = a.y + a.height / 2;
        const by = b.y + b.height / 2;

        if (Math.abs(ay - by) > 4) return ay - by;
        return a.x - b.x;
      });

      const lines: {
        centerY: number;
        avgHeight: number;
        spans: PositionedSpan[];
      }[] = [];

      for (const span of sorted) {
        if (!span.text.trim()) continue;

        const centerY = span.y + span.height / 2;

        let target = lines.find((line) => {
          const tolerance = Math.max(
            5,
            Math.min(14, Math.max(line.avgHeight, span.height) * 0.7)
          );

          return Math.abs(line.centerY - centerY) <= tolerance;
        });

        if (!target) {
          target = {
            centerY,
            avgHeight: span.height,
            spans: [],
          };

          lines.push(target);
        }

        target.spans.push(span);

        const count = target.spans.length;

        target.centerY =
          ((target.centerY * (count - 1)) + centerY) / count;

        target.avgHeight =
          ((target.avgHeight * (count - 1)) + span.height) / count;
      }

      return lines
        .sort((a, b) => a.centerY - b.centerY)
        .map((line) => ({
          ...line,
          spans: line.spans.sort((a, b) => a.x - b.x),
        }));
    };

    const detectPositionedLine = (
      pageNumber: number,
      spans: PositionedSpan[],
      pageWidth: number,
      pageHeight: number,
      idPrefix: string
    ) => {
      if (!spans.length) return 0;

      let lineText = "";

      const mapped: Array<
        PositionedSpan & {
          start: number;
          end: number;
        }
      > = [];

      for (const original of spans) {
        const text = original.text.trim();
        if (!text) continue;

        if (lineText.length > 0) {
          lineText += " ";
        }

        const start = lineText.length;
        lineText += text;
        const end = lineText.length;

        mapped.push({
          ...original,
          text,
          start,
          end,
        });
      }

      if (!lineText.trim()) return 0;

      const matches = detectText(lineText);
      let added = 0;

      for (const match of matches) {
        const segments: Array<{
          x0: number;
          y0: number;
          x1: number;
          y1: number;
          height: number;
        }> = [];

        for (const span of mapped) {
          const overlapStart = Math.max(match.start, span.start);
          const overlapEnd = Math.min(match.end, span.end);

          if (overlapEnd <= overlapStart) continue;

          const textLength = Math.max(1, span.end - span.start);

          const startRatio =
            (overlapStart - span.start) / textLength;

          const endRatio =
            (overlapEnd - span.start) / textLength;

          segments.push({
            x0: span.x + span.width * startRatio,
            x1: span.x + span.width * endRatio,
            y0: span.y,
            y1: span.y + span.height,
            height: span.height,
          });
        }

        if (!segments.length) continue;

        const minX = Math.min(...segments.map((x) => x.x0));
        const maxX = Math.max(...segments.map((x) => x.x1));
        const minY = Math.min(...segments.map((x) => x.y0));
        const maxY = Math.max(...segments.map((x) => x.y1));

        const maxHeight = Math.max(
          ...segments.map((x) => x.height)
        );

        const horizontalGuard = Math.max(
          5,
          maxHeight * 0.4
        );

        const x = Math.max(0, minX - horizontalGuard);
        const y = Math.max(0, minY - 3);

        const width = Math.min(
          pageWidth - x,
          Math.max(
            8,
            maxX - minX + horizontalGuard * 2
          )
        );

        const height = Math.min(
          pageHeight - y,
          Math.max(
            10,
            maxY - minY + 6
          )
        );

        nextFindings.push({
          id: `${idPrefix}-${pageNumber}-${nextFindings.length}-${match.start}-${match.category}`,
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
          pageWidth,
          pageHeight,
          selected: true,
        });

        added++;
      }

      return added;
    };

    const getOcrWorker = async () => {
      if (ocrWorker) return ocrWorker;

      setStatus("Initializing private local OCR engine…");

      const { createWorker } = await import("tesseract.js");

      ocrWorker = await createWorker("eng", 1, {
        workerPath: "/tessdata/worker.min.js",
        corePath: "/tessdata/tesseract-core-simd-lstm.wasm.js",
        langPath: "/tessdata",
        gzip: true,
      });

      return ocrWorker;
    };

    try {
      for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
      ) {
        setStatus(
          `Scanning page ${pageNumber} of ${pdf.numPages}…`
        );

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });

        let textContent: any;

        try {
          textContent =
            await page.getTextContent();
        } catch (_) {
          /*
           * Preserve the old inspection behaviour:
           * an unusual page whose text layer cannot be read is
           * treated as an OCR page rather than rejecting the PDF.
           */
          dedicatedOcrPages.push(
            pageNumber
          );

          setStatus(
            `Preparing page ${pageNumber} of ${pdf.numPages} for private OCR…`
          );

          try {
            page.cleanup();
          } catch (_) {}

          continue;
        }

        /*
         * Same scanned-page rule previously used by the
         * separate inspection pass.
         *
         * We now calculate it from the textContent object that
         * is already required for PII detection.
         */
        const meaningfulTextLength =
          textContent.items
            .map(
              (item: any) =>
                typeof item?.str ===
                "string"
                  ? item.str
                  : ""
            )
            .join(" ")
            .replace(
              /\s+/g,
              ""
            )
            .trim()
            .length;

        if (
          meaningfulTextLength <
          8
        ) {
          dedicatedOcrPages.push(
            pageNumber
          );

          setStatus(
            `Preparing scanned page ${pageNumber} of ${pdf.numPages} for private OCR…`
          );

          try {
            page.cleanup();
          } catch (_) {}

          continue;
        }

        const digitalSpans: PositionedSpan[] = [];

        for (const rawItem of textContent.items as any[]) {
          if (
            !rawItem ||
            typeof rawItem.str !== "string" ||
            !rawItem.str.trim()
          ) {
            continue;
          }

          const transformed = pdfjsLib.Util.transform(
            viewport.transform,
            rawItem.transform
          );

          const fontHeight = Math.max(
            7,
            Math.hypot(
              transformed[2],
              transformed[3]
            )
          );

          const width = Math.max(
            2,
            Number(
              rawItem.width ||
                rawItem.str.length * fontHeight * 0.5
            ) * viewport.scale
          );

          digitalSpans.push({
            text: rawItem.str,
            x: transformed[4],
            y: transformed[5] - fontHeight,
            width,
            height: fontHeight,
          });
        }

        const digitalCharacters = digitalSpans.reduce(
          (sum, item) =>
            sum + item.text.replace(/\s/g, "").length,
          0
        );

        let digitalFindings = 0;

        const digitalLines =
          groupIntoLines(digitalSpans);

        for (const line of digitalLines) {
          digitalFindings += detectPositionedLine(
            pageNumber,
            line.spans,
            viewport.width,
            viewport.height,
            "pdf"
          );
        }

        const hasUsableDigitalText =
          digitalCharacters >= 40 ||
          digitalSpans.length >= 8 ||
          digitalFindings > 0;

        if (!hasUsableDigitalText) {
          setStatus(
            `Page ${pageNumber} appears scanned — running private OCR…`
          );

          const worker = await getOcrWorker();
          const ocrScale = 2;

          const ocrViewport = page.getViewport({
            scale: ocrScale,
          });

          const canvas =
            document.createElement("canvas");

          canvas.width = Math.ceil(
            ocrViewport.width
          );

          canvas.height = Math.ceil(
            ocrViewport.height
          );

          const ctx = canvas.getContext("2d", {
            alpha: false,
          });

          if (!ctx) {
            throw new Error(
              "Unable to initialize local OCR canvas."
            );
          }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(
            0,
            0,
            canvas.width,
            canvas.height
          );

          await page.render({
            canvasContext: ctx,
            viewport: ocrViewport,
            canvas,
          } as any).promise;

          const { data } =
            await worker.recognize(
              canvas,
              {},
              {
                text: true,
                blocks: true,
              } as any
            );

          let ocrLines: any[][] = [];

          if (
            Array.isArray((data as any)?.blocks)
          ) {
            ocrLines = (data as any).blocks
              .flatMap(
                (block: any) =>
                  block?.paragraphs || []
              )
              .flatMap(
                (paragraph: any) =>
                  paragraph?.lines || []
              )
              .map(
                (line: any) =>
                  line?.words || []
              )
              .filter(
                (words: any[]) =>
                  words.length > 0
              );
          }

          if (
            ocrLines.length === 0 &&
            Array.isArray((data as any)?.words)
          ) {
            const positionedWords: PositionedSpan[] =
              (data as any).words
                .filter(
                  (word: any) =>
                    word?.text?.trim() &&
                    word?.bbox
                )
                .map((word: any) => ({
                  text: word.text,
                  x:
                    word.bbox.x0 /
                    ocrScale,
                  y:
                    word.bbox.y0 /
                    ocrScale,
                  width:
                    (word.bbox.x1 -
                      word.bbox.x0) /
                    ocrScale,
                  height:
                    (word.bbox.y1 -
                      word.bbox.y0) /
                    ocrScale,
                }));

            const fallbackLines =
              groupIntoLines(positionedWords);

            for (const line of fallbackLines) {
              detectPositionedLine(
                pageNumber,
                line.spans,
                viewport.width,
                viewport.height,
                "ocr"
              );
            }
          } else {
            for (
              let lineIndex = 0;
              lineIndex < ocrLines.length;
              lineIndex++
            ) {
              const words =
                ocrLines[lineIndex];

              const positioned: PositionedSpan[] =
                words
                  .filter(
                    (word: any) =>
                      word?.text?.trim() &&
                      word?.bbox
                  )
                  .map((word: any) => ({
                    text: word.text,
                    x:
                      word.bbox.x0 /
                      ocrScale,
                    y:
                      word.bbox.y0 /
                      ocrScale,
                    width:
                      (word.bbox.x1 -
                        word.bbox.x0) /
                      ocrScale,
                    height:
                      (word.bbox.y1 -
                        word.bbox.y0) /
                      ocrScale,
                  }));

              detectPositionedLine(
                pageNumber,
                positioned,
                viewport.width,
                viewport.height,
                `ocr-${lineIndex}`
              );
            }
          }

          ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
          );

          canvas.width = 1;
          canvas.height = 1;
        }

        try {
          page.cleanup();
        } catch (_) {}
      }

      setFindings(nextFindings);

      return {
        totalPages:
          pdf.numPages,
        dedicatedOcrPages,
      };
    } finally {
      if (ocrWorker) {
        try {
          await ocrWorker.terminate();
        } catch (_) {}
      }

      try {
        await disposePdf();
      } catch (_) {}
    }
  };


  const isPdfPasswordError = (err: any) => {
    const name = String(err?.name || "").toLowerCase();
    const message = String(err?.message || "").toLowerCase();

    return (
      name.includes("password") ||
      message.includes("password") ||
      message.includes("need_password") ||
      message.includes("incorrect_password")
    );
  };

  type OcrWordBox = {
    text: string;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };

  const parseOcrBbox = (
    title: string | null
  ): Omit<OcrWordBox, "text"> | null => {
    if (!title) return null;

    const match = title.match(
      /bbox\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/
    );

    if (!match) return null;

    return {
      x0: Number(match[1]),
      y0: Number(match[2]),
      x1: Number(match[3]),
      y1: Number(match[4]),
    };
  };

  const detectOcrLine = (
    words: OcrWordBox[],
    pageNumber: number,
    pageWidth: number,
    pageHeight: number,
    renderScale: number,
    idPrefix: string
  ): Finding[] => {
    if (!words.length) return [];

    const cleanWords = words
      .filter(
        (word) =>
          word.text.trim() &&
          Number.isFinite(word.x0) &&
          Number.isFinite(word.y0) &&
          Number.isFinite(word.x1) &&
          Number.isFinite(word.y1)
      )
      .sort((a, b) => a.x0 - b.x0);

    if (!cleanWords.length) return [];

    let lineText = "";

    const mapped: Array<
      OcrWordBox & {
        start: number;
        end: number;
      }
    > = [];

    for (const word of cleanWords) {
      const text = word.text.trim();
      if (!text) continue;

      if (lineText.length > 0) {
        lineText += " ";
      }

      const start = lineText.length;
      lineText += text;
      const end = lineText.length;

      mapped.push({
        ...word,
        text,
        start,
        end,
      });
    }

    if (!lineText.trim()) return [];

    const matches = detectText(lineText);
    const results: Finding[] = [];

    matches.forEach((match, matchIndex) => {
      const overlapping = mapped.filter(
        (word) =>
          match.start < word.end &&
          match.end > word.start
      );

      if (!overlapping.length) return;

      const minX = Math.min(...overlapping.map((x) => x.x0));
      const minY = Math.min(...overlapping.map((x) => x.y0));
      const maxX = Math.max(...overlapping.map((x) => x.x1));
      const maxY = Math.max(...overlapping.map((x) => x.y1));

      // Small safety padding around OCR boxes.
      const padX = Math.max(3, (maxY - minY) * 0.18);
      const padY = Math.max(2, (maxY - minY) * 0.10);

      const x =
        Math.max(0, minX - padX) /
        renderScale;

      const y =
        Math.max(0, minY - padY) /
        renderScale;

      const width =
        Math.min(
          pageWidth * renderScale,
          maxX + padX
        ) /
          renderScale -
        x;

      const height =
        Math.min(
          pageHeight * renderScale,
          maxY + padY
        ) /
          renderScale -
        y;

      results.push({
        id:
          `ocr-${pageNumber}-${idPrefix}-${matchIndex}-` +
          `${match.category}-${Math.round(x)}-${Math.round(y)}`,
        category: match.category,
        value: match.value,
        maskedValue: maskValue(match.value),
        page: pageNumber,
        box: {
          x,
          y,
          width: Math.max(2, width),
          height: Math.max(2, height),
        },
        pageWidth,
        pageHeight,
        selected: true,
      });
    });

    return results;
  };

  const extractOcrLines = (data: any): OcrWordBox[][] => {
    const result: OcrWordBox[][] = [];

    // --------------------------------------------------------
    // Preferred path: hOCR gives excellent positional data.
    // --------------------------------------------------------
    if (
      typeof data?.hocr === "string" &&
      data.hocr.trim()
    ) {
      try {
        const doc = new DOMParser().parseFromString(
          data.hocr,
          "text/html"
        );

        const lineElements = Array.from(
          doc.querySelectorAll(
            ".ocr_line, .ocrx_line"
          )
        );

        for (const lineElement of lineElements) {
          const words: OcrWordBox[] = [];

          const wordElements = Array.from(
            lineElement.querySelectorAll(".ocrx_word")
          );

          for (const wordElement of wordElements) {
            const text =
              wordElement.textContent?.trim() || "";

            const bbox = parseOcrBbox(
              wordElement.getAttribute("title")
            );

            if (!text || !bbox) continue;

            words.push({
              text,
              ...bbox,
            });
          }

          if (words.length) {
            result.push(words);
          }
        }
      } catch (_) {
        // Continue to structured fallback below.
      }
    }

    if (result.length) {
      return result;
    }

    // --------------------------------------------------------
    // Tesseract structured blocks fallback.
    // --------------------------------------------------------
    if (Array.isArray(data?.blocks)) {
      for (const block of data.blocks) {
        const paragraphs =
          Array.isArray(block?.paragraphs)
            ? block.paragraphs
            : [];

        for (const paragraph of paragraphs) {
          const lines =
            Array.isArray(paragraph?.lines)
              ? paragraph.lines
              : [];

          for (const line of lines) {
            const rawWords =
              Array.isArray(line?.words)
                ? line.words
                : [];

            const words: OcrWordBox[] = [];

            for (const word of rawWords) {
              const text =
                String(word?.text || "").trim();

              const bbox = word?.bbox;

              if (
                !text ||
                !bbox ||
                !Number.isFinite(bbox.x0) ||
                !Number.isFinite(bbox.y0) ||
                !Number.isFinite(bbox.x1) ||
                !Number.isFinite(bbox.y1)
              ) {
                continue;
              }

              words.push({
                text,
                x0: bbox.x0,
                y0: bbox.y0,
                x1: bbox.x1,
                y1: bbox.y1,
              });
            }

            if (words.length) {
              result.push(words);
            }
          }
        }
      }
    }

    if (result.length) {
      return result;
    }

    // --------------------------------------------------------
    // Older Tesseract versions expose data.words directly.
    // Group them by OCR line.
    // --------------------------------------------------------
    if (Array.isArray(data?.words)) {
      const groups = new Map<string, OcrWordBox[]>();

      data.words.forEach(
        (word: any) => {
          const text =
            String(word?.text || "").trim();

          const bbox = word?.bbox;

          if (
            !text ||
            !bbox ||
            !Number.isFinite(bbox.x0) ||
            !Number.isFinite(bbox.y0) ||
            !Number.isFinite(bbox.x1) ||
            !Number.isFinite(bbox.y1)
          ) {
            return;
          }

          const key =
            word?.line_num != null
              ? `${word.block_num ?? 0}:` +
                `${word.par_num ?? 0}:` +
                `${word.line_num}`
              : `fallback-${Math.round(
                  bbox.y0 / 12
                )}`;

          const current = groups.get(key) || [];

          current.push({
            text,
            x0: bbox.x0,
            y0: bbox.y0,
            x1: bbox.x1,
            y1: bbox.y1,
          });

          groups.set(key, current);
        }
      );

      return Array.from(groups.values());
    }

    return result;
  };

  const scanPdfWithOcr = async (
    nextFile: File,
    requestedPages?: number[],
    appendToExisting = false
  ) => {
    const nextFindings: Finding[] = [];

    /*
     * ==========================================================
     * HARD-BATCHED + TILED MOBILE OCR
     * ==========================================================
     *
     * Two separate memory boundaries protect mobile Safari:
     *
     * 1. The PDF.js document and Tesseract WASM worker live for
     *    only a few pages.
     *
     * 2. Each page is rendered/OCR'd as overlapping horizontal
     *    strips instead of one giant full-page bitmap.
     *
     * OCR resolution remains EXACTLY 1.6x.
     */

    const OCR_BATCH_SIZE =
      4;

    const renderScale =
      1.6;

    /*
     * Keep each OCR bitmap around ~1.4 million pixels.
     *
     * RGBA browser memory for that bitmap is roughly 5.6 MB,
     * before Tesseract's internal representation.
     */
    const MAX_TILE_PIXELS =
      1_400_000;

    /*
     * Vertical overlap ensures words / text lines close to a
     * strip boundary are present fully in at least one tile.
     */
    const TILE_OVERLAP =
      96;

    const yieldToMobile =
      (
        delay = 35
      ) =>
        new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              delay
            )
        );

    /*
     * Short probe only to obtain page count.
     */
    let totalPages =
      0;

    try {
      const probe =
        await loadPdfJsFromBlob(
          nextFile
        );

      try {
        totalPages =
          probe.pdf.numPages;
      } finally {
        await probe.dispose();
      }
    } catch (err: any) {
      if (
        isPdfPasswordError(
          err
        )
      ) {
        throw new Error(
          "This PDF is password-protected. Please unlock it first."
        );
      }

      throw err;
    }

    const pagesToScan =
      requestedPages &&
      requestedPages.length
        ? requestedPages
        : Array.from(
            {
              length:
                totalPages,
            },
            (
              _,
              index
            ) =>
              index + 1
          );

    for (
      let batchStart = 0;
      batchStart <
        pagesToScan.length;
      batchStart +=
        OCR_BATCH_SIZE
    ) {
      const batchPages =
        pagesToScan.slice(
          batchStart,
          batchStart +
            OCR_BATCH_SIZE
        );

      let loaded:
        | Awaited<
            ReturnType<
              typeof loadPdfJsFromBlob
            >
          >
        | null =
        null;

      let worker: any =
        null;

      try {
        /*
         * Fresh PDF.js document for this short batch.
         */
        loaded =
          await loadPdfJsFromBlob(
            nextFile
          );

        const pdf =
          loaded.pdf;

        /*
         * Same local OCR engine/model as before.
         */
        worker =
          await createWorker(
            "eng",
            1,
            {
              workerPath:
                "/tessdata/worker.min.js",
              corePath:
                "/tessdata/tesseract-core-simd-lstm.wasm.js",
              langPath:
                "/tessdata",
              gzip: true,
            }
          );

        for (
          let localIndex = 0;
          localIndex <
            batchPages.length;
          localIndex++
        ) {
          const pageNumber =
            batchPages[
              localIndex
            ];

          setStatus(
            `Scanning page ${pageNumber} of ${totalPages} with memory-safe local OCR…`
          );

          const page =
            await pdf.getPage(
              pageNumber
            );

          try {
            const baseViewport =
              page.getViewport({
                scale: 1,
              });

            /*
             * This viewport determines the EXACT same 1.6x
             * page pixels used before.
             *
             * We simply never allocate all of them together.
             */
            const fullViewport =
              page.getViewport({
                scale:
                  renderScale,
              });

            const fullWidth =
              Math.max(
                1,
                Math.ceil(
                  fullViewport.width
                )
              );

            const fullHeight =
              Math.max(
                1,
                Math.ceil(
                  fullViewport.height
                )
              );

            /*
             * Dynamically choose strip height according to page
             * width so unusually wide pages also remain bounded.
             */
            const calculatedHeight =
              Math.floor(
                MAX_TILE_PIXELS /
                  fullWidth
              );

            const tileHeight =
              Math.max(
                320,
                Math.min(
                  1100,
                  calculatedHeight
                )
              );

            let tileTop =
              0;

            let tileIndex =
              0;

            while (
              tileTop <
              fullHeight
            ) {
              const tileBottom =
                Math.min(
                  fullHeight,
                  tileTop +
                    tileHeight
                );

              const currentHeight =
                Math.max(
                  1,
                  tileBottom -
                    tileTop
                );

              const canvas =
                document.createElement(
                  "canvas"
                );

              canvas.width =
                fullWidth;

              canvas.height =
                currentHeight;

              try {
                const ctx =
                  canvas.getContext(
                    "2d",
                    {
                      alpha:
                        false,
                    }
                  );

                if (!ctx) {
                  throw new Error(
                    "Unable to create local OCR tile renderer."
                  );
                }

                ctx.fillStyle =
                  "#ffffff";

                ctx.fillRect(
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );

                /*
                 * Render the full-resolution page translated
                 * upward so this canvas receives ONLY the
                 * requested strip.
                 *
                 * Pixel scale remains 1.6x.
                 */
                await page.render({
                  canvasContext:
                    ctx as any,
                  viewport:
                    fullViewport,
                  canvas,
                  transform: [
                    1,
                    0,
                    0,
                    1,
                    0,
                    -tileTop,
                  ],
                } as any).promise;

                setStatus(
                  `OCR page ${pageNumber} of ${totalPages} · section ${tileIndex + 1}…`
                );

                /*
                 * Normal structured-coordinate OCR.
                 */
                let result: any =
                  await (
                    worker as any
                  ).recognize(
                    canvas,
                    {},
                    {
                      text:
                        true,
                      blocks:
                        true,
                    }
                  );

                let lines =
                  extractOcrLines(
                    result?.data ||
                      {}
                  );

                /*
                 * Preserve the existing hOCR compatibility path
                 * when structured coordinates are unavailable.
                 */
                if (
                  lines.length ===
                  0
                ) {
                  result =
                    await (
                      worker as any
                    ).recognize(
                      canvas,
                      {},
                      {
                        text:
                          true,
                        hocr:
                          true,
                        blocks:
                          true,
                      }
                    );

                  lines =
                    extractOcrLines(
                      result?.data ||
                        {}
                    );
                }

                /*
                 * Each adjacent tile overlaps.
                 *
                 * Give every text line to exactly ONE tile using
                 * the vertical centre of the line. This prevents
                 * duplicate findings while preserving overlap.
                 */
                const halfOverlap =
                  Math.floor(
                    TILE_OVERLAP /
                      2
                  );

                const ownedTop =
                  tileTop === 0
                    ? tileTop
                    : tileTop +
                      halfOverlap;

                const ownedBottom =
                  tileBottom ===
                  fullHeight
                    ? tileBottom
                    : tileBottom -
                      halfOverlap;

                lines.forEach(
                  (
                    words,
                    lineIndex
                  ) => {
                    if (
                      !words.length
                    ) {
                      return;
                    }

                    const minLocalY =
                      Math.min(
                        ...words.map(
                          (
                            word
                          ) =>
                            word.y0
                        )
                      );

                    const maxLocalY =
                      Math.max(
                        ...words.map(
                          (
                            word
                          ) =>
                            word.y1
                        )
                      );

                    const globalCenterY =
                      tileTop +
                      (
                        minLocalY +
                        maxLocalY
                      ) /
                        2;

                    /*
                     * The overlapping neighbour owns this line.
                     */
                    if (
                      globalCenterY <
                        ownedTop ||
                      globalCenterY >=
                        ownedBottom
                    ) {
                      return;
                    }

                    /*
                     * Tesseract coordinates are local to the tile.
                     * Convert them back into full 1.6x page-space.
                     */
                    const pageWords =
                      words.map(
                        (
                          word
                        ) => ({
                          ...word,
                          y0:
                            word.y0 +
                            tileTop,
                          y1:
                            word.y1 +
                            tileTop,
                        })
                      );

                    nextFindings.push(
                      ...detectOcrLine(
                        pageWords,
                        pageNumber,
                        baseViewport
                          .width,
                        baseViewport
                          .height,
                        renderScale,
                        `tile-${tileIndex}-${lineIndex}`
                      )
                    );
                  }
                );

                /*
                 * Drop large Tesseract result trees immediately.
                 */
                result =
                  null;

                lines.length =
                  0;
              } finally {
                /*
                 * Immediately destroy this strip's pixel buffer.
                 */
                canvas.width =
                  1;

                canvas.height =
                  1;
              }

              tileIndex++;

              if (
                tileBottom >=
                fullHeight
              ) {
                break;
              }

              /*
               * Advance with overlap.
               */
              tileTop =
                Math.max(
                  tileTop + 1,
                  tileBottom -
                    TILE_OVERLAP
                );

              /*
               * Let iOS process canvas destruction between strips.
               */
              await yieldToMobile(
                25
              );
            }
          } finally {
            try {
              page.cleanup();
            } catch (_) {}
          }

          /*
           * Recovery between complete pages.
           */
          await yieldToMobile(
            50
          );
        }
      } catch (err: any) {
        if (
          isPdfPasswordError(
            err
          )
        ) {
          throw new Error(
            "This PDF is password-protected. Please unlock it first."
          );
        }

        throw err;
      } finally {
        /*
         * Hard reset BOTH engines after every short batch.
         */
        if (worker) {
          try {
            await worker
              .terminate();
          } catch (_) {}

          worker =
            null;
        }

        if (loaded) {
          try {
            await loaded
              .dispose();
          } catch (_) {}

          loaded =
            null;
        }
      }

      /*
       * Give Safari time to release worker/canvas/PDF native
       * allocations before the next batch starts.
       */
      if (
        batchStart +
          OCR_BATCH_SIZE <
        pagesToScan.length
      ) {
        const nextPage =
          pagesToScan[
            Math.min(
              batchStart +
                OCR_BATCH_SIZE,
              pagesToScan.length -
                1
            )
          ];

        setStatus(
          `OCR memory cleared — continuing with page ${nextPage}…`
        );

        await yieldToMobile(
          350
        );
      }
    }

    /*
     * Commit React state only when OCR has finished.
     */
    if (
      appendToExisting
    ) {
      const replacedPages =
        new Set(
          pagesToScan
        );

      setFindings(
        (
          current
        ) => [
          ...current.filter(
            (
              finding
            ) =>
              !finding.page ||
              !replacedPages.has(
                finding.page
              )
          ),
          ...nextFindings,
        ]
      );
    } else {
      setFindings(
        nextFindings
      );
    }
  };

  // ==========================================================
  // UNIVERSAL PDF SCANNER
  //
  // Digital PDF  -> current scanner
  // Scanned PDF  -> local OCR
  // Mixed PDF    -> current scanner + OCR only scanned pages
  // Weird page   -> OCR fallback rather than rejecting PDF
  // Password PDF -> explicit password message
  // ==========================================================
  const scanPdf = async (nextFile: File) => {
    let classification: {
      totalPages: number;
      dedicatedOcrPages: number[];
    };

    /*
     * One traversal now performs BOTH:
     *
     * 1. digital PII detection
     * 2. scanned-page classification
     *
     * Previously we traversed the PDF once for classification
     * and again for actual text-layer detection.
     */
    try {
      classification =
        await scanPdfWithTextLayer(
          nextFile
        );
    } catch (err: any) {
      if (
        isPdfPasswordError(
          err
        )
      ) {
        throw new Error(
          "This PDF is password-protected. Please unlock it first."
        );
      }

      /*
       * Preserve the existing universal fallback.
       *
       * If an unusual but renderable PDF cannot use the normal
       * text-layer scanner, process the complete document using
       * the dedicated OCR route rather than rejecting it.
       */
      await scanPdfWithOcr(
        nextFile,
        undefined,
        false
      );

      return;
    }

    if (
      classification
        .dedicatedOcrPages
        .length === 0
    ) {
      /*
       * Fully digital document.
       *
       * Detection is already complete.
       * No second PDF traversal and no dedicated OCR pass.
       */
      return;
    }

    const allPagesNeedDedicatedOcr =
      classification.totalPages >
        0 &&
      classification
        .dedicatedOcrPages
        .length ===
        classification.totalPages;

    /*
     * Scanned/mixed pages still use the SAME dedicated OCR
     * implementation as before.
     *
     * Fully scanned PDF:
     *   replace findings with OCR findings.
     *
     * Mixed PDF:
     *   keep digital findings and replace only scanned pages
     *   with dedicated OCR findings.
     */
    await scanPdfWithOcr(
      nextFile,
      classification
        .dedicatedOcrPages,
      !allPagesNeedDedicatedOcr
    );
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

  const redactPlainText = async (): Promise<boolean> => {
    if (!file) return false;

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

    setStatus("Running final safety verification…");

    const normalizedOutput =
      normalizeForSafetyCheck(output);

    const leakedValues = findings
      .filter((finding) => finding.selected)
      .filter((finding) => {
        const value =
          normalizeForSafetyCheck(finding.value);

        return (
          value.length >= 4 &&
          normalizedOutput.includes(value)
        );
      });

    if (leakedValues.length > 0) {
      setError(
        `Final safety verification stopped the download because ${leakedValues.length} selected sensitive item${leakedValues.length === 1 ? "" : "s"} may still be visible. Review the document manually.`
      );

      setStatus(
        "Final safety verification needs manual review."
      );

      return false;
    }

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

    return true;
  };

  const redactPdf = async (): Promise<boolean> => {
    if (!file) {
      return false;
    }

    const selected =
      findings.filter(
        (finding) =>
          finding.selected &&
          Boolean(
            finding.page &&
            finding.box &&
            finding.pageWidth &&
            finding.pageHeight
          )
      );

    if (
      selected.length ===
      0
    ) {
      setError(
        "No valid PDF redaction areas are selected."
      );

      return false;
    }

    /*
     * ========================================================
     * PRIVATE PII -> SHARED SECURE REDACT ENGINE
     * ========================================================
     *
     * Private PII no longer maintains a second full-document
     * rasterization implementation.
     *
     * The normal Redact tool already has the mobile-optimized
     * secure engine:
     *
     * - only pages containing blackouts are rasterized
     * - blackout pixels are permanently burned into those pages
     * - original content streams from redacted pages are NOT
     *   copied into the result
     * - untouched pages remain lossless/vector
     *
     * This dramatically reduces memory for large PDFs.
     */

    const buildPayload =
      (
        strengthenIds:
          ReadonlySet<string> =
            new Set<string>()
      ): PageRedaction[] => {
        const byPage =
          new Map<
            number,
            PageRedaction
          >();

        for (
          const finding of
            selected
        ) {
          const page =
            finding.page!;

          const box =
            finding.box!;

          const pageWidth =
            finding.pageWidth!;

          const pageHeight =
            finding.pageHeight!;

          const strengthen =
            strengthenIds.has(
              finding.id
            );

          /*
           * Normal automatic findings already contain safety
           * padding from the scanner.
           *
           * Automatic repair adds extra padding only around a
           * value which the final verifier could still read.
           */
          const extraX =
            strengthen
              ? Math.max(
                  6,
                  box.height *
                    0.5
                )
              : 0;

          const extraY =
            strengthen
              ? Math.max(
                  4,
                  box.height *
                    0.3
                )
              : 0;

          const left =
            Math.max(
              0,
              box.x -
                extraX
            );

          const top =
            Math.max(
              0,
              box.y -
                extraY
            );

          const right =
            Math.min(
              pageWidth,
              box.x +
                box.width +
                extraX
            );

          const bottom =
            Math.min(
              pageHeight,
              box.y +
                box.height +
                extraY
            );

          const rect = {
            x:
              left /
              pageWidth,
            y:
              top /
              pageHeight,
            width:
              Math.max(
                0.002,
                (
                  right -
                  left
                ) /
                  pageWidth
              ),
            height:
              Math.max(
                0.002,
                (
                  bottom -
                  top
                ) /
                  pageHeight
              ),
          };

          const pageIndex =
            page - 1;

          const existing =
            byPage.get(
              page
            );

          if (existing) {
            existing.rects.push(
              rect
            );
          } else {
            byPage.set(
              page,
              {
                pageIndex,
                rects: [
                  rect,
                ],
              }
            );
          }
        }

        return Array.from(
          byPage.values()
        );
      };

    const redactedPages =
      new Set<number>(
        selected.map(
          (finding) =>
            finding.page!
        )
      );

    /*
     * Exact expected blackout geometry in normalized page space.
     *
     * Final verification checks these regions on the FINISHED
     * output PDF. It does not rerun OCR.
     */
    const verificationTargets =
      selected.map(
        (finding) => ({
          id:
            finding.id,

          value:
            finding.value,

          page:
            finding.page!,

          region: {
            x:
              finding.box!.x /
              finding.pageWidth!,

            y:
              finding.box!.y /
              finding.pageHeight!,

            width:
              finding.box!.width /
              finding.pageWidth!,

            height:
              finding.box!.height /
              finding.pageHeight!,
          },
        })
      );

    /*
     * Run the same hardened Redact engine already proven on the
     * large mobile-PDF workflow.
     */
    setStatus(
      "Creating secure redacted pages…"
    );

    let bytes =
      await redactPDF(
        file,
        buildPayload(),
        (
          current,
          total
        ) => {
          setStatus(
            `Securely redacting page ${current} of ${total}…`
          );
        }
      );

    /*
     * ========================================================
     * FINAL SAFETY CHECK
     * ========================================================
     *
     * Only redacted pages are expected to be flattened now.
     *
     * Untouched pages intentionally remain lossless and may
     * retain normal selectable text.
     */
    setStatus(
      "Checking the finished redacted pages…"
    );

    let verification =
      await verifyFinishedPdf(
        bytes,
        verificationTargets,
        (
          message
        ) =>
          setStatus(
            message
          ),
        {
          flattenedPages:
            redactedPages,
        }
      );

    /*
     * ========================================================
     * ONE AUTOMATIC REPAIR PASS
     * ========================================================
     *
     * If a selected value is still visually readable, rebuild
     * from the ORIGINAL PDF using larger destructive blackouts
     * only around the affected values.
     *
     * We do not repair by drawing over the already-produced PDF.
     */
    if (
      !verification.passed &&
      verification
        .failedTargetIds
        .length >
        0
    ) {
      const failedIds =
        new Set<string>(
          verification
            .failedTargetIds
        );

      setStatus(
        `Strengthening ${verification.leakedValues.length} redaction${
          verification.leakedValues.length === 1
            ? ""
            : "s"
        } automatically…`
      );

      /*
       * Release our reference to PASS 1 before producing PASS 2.
       */
      bytes =
        new Uint8Array(
          0
        );

      await new Promise<void>(
        (
          resolve
        ) =>
          setTimeout(
            resolve,
            0
          )
      );

      bytes =
        await redactPDF(
          file,
          buildPayload(
            failedIds
          ),
          (
            current,
            total
          ) => {
            setStatus(
              `Strengthening page ${current} of ${total}…`
            );
          }
        );

      setStatus(
        "Re-checking strengthened redactions…"
      );

      verification =
        await verifyFinishedPdf(
          bytes,
          verificationTargets,
          (
            message
          ) =>
            setStatus(
              message
            ),
          {
            flattenedPages:
              redactedPages,
          }
        );
    }

    /*
     * ========================================================
     * STILL UNSAFE -> MANUAL REVIEW
     * ========================================================
     */
    if (
      !verification.passed
    ) {
      const failedIdSet =
        new Set<string>(
          verification
            .failedTargetIds
        );

      const reviewItems =
        selected.filter(
          (
            finding
          ) =>
            failedIdSet.has(
              finding.id
            )
        );

      /*
       * Keep the exact already-redacted output available for the
       * existing explicit Download Anyway workflow.
       */
      pendingRedactedPdfRef.current =
        bytes;

      redactorSessionCache.pendingRedactedPdf =
        bytes;

      void saveToolWorkspaceFiles(
        'private-pii-redactor-pending',
        [
          new File(
            [
              bytes as unknown as BlobPart,
            ],
            'pending-redacted.pdf',
            {
              type:
                'application/pdf',
              lastModified:
                Date.now(),
            }
          ),
        ]
      );

      setManualReviewFindings(
        reviewItems
      );

      if (
        reviewItems.length >
        0
      ) {
        setError(
          `${reviewItems.length} sensitive item${
            reviewItems.length === 1
              ? ""
              : "s"
          } still need your review after automatic strengthening.`
        );

        setStatus(
          `${reviewItems.length} item${
            reviewItems.length === 1
              ? ""
              : "s"
          } need manual review before download.`
        );
      } else if (
        verification
          .selectableTextFound
      ) {
        setError(
          "A redacted page still contains selectable text where a permanently flattened page was expected. Download was blocked for your protection."
        );

        setStatus(
          "A redacted page needs manual review before download."
        );
      } else {
        setError(
          "The safety check could not confirm every selected redaction. Download was blocked for your protection."
        );

        setStatus(
          "The PDF needs manual review before download."
        );
      }

      return false;
    }

    /*
     * ========================================================
     * PASSED
     * ========================================================
     */
    pendingRedactedPdfRef.current =
      null;

    redactorSessionCache.pendingRedactedPdf =
      null;

    void clearToolWorkspace(
      'private-pii-redactor-pending'
    );

    setManualReviewFindings(
      []
    );

    setStatus(
      "Safety check passed. Preparing download…"
    );

    const base =
      file.name.replace(
        /\.pdf$/i,
        ""
      );

    downloadBlob(
      new Blob(
        [
          bytes as unknown as BlobPart,
        ],
        {
          type:
            "application/pdf",
        }
      ),
      `${base}-redacted.pdf`
    );

    return true;
  };

  const downloadCurrentRedactedPdf = async () => {
    if (!file) {
      return;
    }

    let pendingBytes =
      pendingRedactedPdfRef.current;

    /*
     * After mobile Preview -> Back the JS heap may have been
     * recreated. Load the exact pending PDF only when needed,
     * instead of putting a potentially large PDF back into
     * memory during page startup.
     */
    if (!pendingBytes) {
      try {
        const restoredPending =
          await restoreToolWorkspaceFiles(
            'private-pii-redactor-pending'
          );

        if (restoredPending[0]) {
          pendingBytes =
            new Uint8Array(
              await restoredPending[0].arrayBuffer()
            );

          pendingRedactedPdfRef.current =
            pendingBytes;

          redactorSessionCache.pendingRedactedPdf =
            pendingBytes;
        }
      } catch (error) {
        console.warn(
          'Unable to restore pending redacted PDF:',
          error
        );
      }
    }

    if (!pendingBytes) {
      setError(
        'The pending redacted copy is no longer available. Run Auto-Redact again before downloading.'
      );
      return;
    }

    const itemCount =
      manualReviewFindings.length;

    const confirmed = window.confirm(
      `The final safety check found ${itemCount} item${itemCount === 1 ? "" : "s"} that may still be readable. Downloading now will skip manual review. Download anyway?`
    );

    if (!confirmed) return;

    const base =
      file.name.replace(/\.pdf$/i, "");

    downloadBlob(
      new Blob(
        [pendingBytes as any],
        { type: "application/pdf" }
      ),
      `${base}-redacted-review-needed.pdf`
    );
  };

  const createRedactedCopy = async () => {
    if (!file || selectedCount === 0) return;

    pendingRedactedPdfRef.current = null;
    redactorSessionCache.pendingRedactedPdf = null;

    void clearToolWorkspace(
      'private-pii-redactor-pending'
    );

    setError(null);
    setManualReviewFindings([]);
    setIsRedacting(true);

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "";

      let completed = false;

      if (extension === "pdf" || file.type === "application/pdf") {
        completed = await redactPdf();
      } else {
        completed = await redactPlainText();
      }

      if (completed) {
        setStatus(
          "Final safety verification passed. Redacted copy created locally and downloaded."
        );
      }
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

            <div className="flex items-center gap-2 shrink-0">
              {isScanning ? (
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}

              <button
                type="button"
                onClick={clearAll}
                disabled={isScanning || isRedacting}
                className="pii-file-remove inline-flex items-center justify-center w-9 h-9 rounded-lg border transition"
                aria-label="Remove file"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
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

        {status && isScanning && (
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-950">
            <Loader2 className="w-4 h-4 animate-spin" />
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

          {isPdfFile &&
            onContinueManual &&
            manualReviewFindings.length === 0 && (
            <div
              className="pii-manual-card mt-6 rounded-xl border p-4 sm:flex sm:items-center sm:justify-between gap-4"
            >
              <div>
                <strong className="block text-sm" style={{ color: "#ffffff" }}>
                  {manualReviewFindings.length > 0
                    ? "Manual review still needed"
                    : "Something sensitive was missed?"}
                </strong>

                <span
                  className="block mt-1 text-xs leading-5"
                  style={{ color: "#d4d4d8" }}
                >
                  {manualReviewFindings.length > 0 ? (
                    <>
                      Continue reviewing the same PDF with the flagged items and
                      existing automatic redaction boxes preserved. No second
                      upload or new scan required.
                    </>
                  ) : (
                    <>
                      Open the same PDF with all selected automatic redaction boxes
                      already placed. Resize, move or delete them, then add anything
                      the scanner missed. No second upload required.
                    </>
                  )}
                </span>
              </div>

              <button
                type="button"
                onClick={() => continueToManualRedaction()}
                className="pii-manual-handoff mt-4 sm:mt-0 w-full sm:w-auto shrink-0 min-h-12 px-5 rounded-xl border-2 inline-flex items-center justify-center gap-2 text-xs font-semibold transition"
              >
                {manualReviewFindings.length > 0
                  ? `Continue Manual Review (${manualReviewFindings.length})`
                  : "Auto-Redact & Continue Manually"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {findings.length > 0 && (
            <div className="mt-6">
              {manualReviewFindings.length === 0 && (
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
                    Auto-Redact {selectedCount} selected item
                    {selectedCount === 1 ? "" : "s"}
                  </>
                )}
              </button>
              )}

              {status && isRedacting && (
                <div
                  className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                  style={{ opacity: 1 }}
                >
                  <div
                    className="flex items-center justify-center gap-2 text-xs font-semibold"
                    style={{
                      color: "#18181b",
                      opacity: 1,
                    }}
                  >
                    <Loader2
                      className="w-4 h-4 animate-spin shrink-0"
                      style={{
                        color: "#047857",
                        opacity: 1,
                      }}
                    />
                    <span
                      style={{
                        color: "#18181b",
                        opacity: 1,
                      }}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              )}

              {manualReviewFindings.length > 0 && (
                <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
                  <strong className="block text-sm text-amber-950">
                    {manualReviewFindings.length} item
                    {manualReviewFindings.length === 1 ? "" : "s"} need your review
                  </strong>

                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    We automatically tried a stronger redaction once.
                    These are the areas the final safety check could
                    still read:
                  </p>

                  <div className="mt-3 space-y-2">
                    {manualReviewFindings.map((finding) => (
                      <div
                        key={`review-${finding.id}`}
                        className="flex items-center gap-3 rounded-lg border border-amber-300 bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <strong className="block text-xs text-zinc-950">
                            {finding.category}
                          </strong>

                          <code className="block mt-0.5 text-xs text-zinc-700 truncate">
                            {finding.maskedValue}
                          </code>
                        </div>

                        {finding.page && (
                          <span className="shrink-0 text-xs font-semibold text-zinc-700">
                            Page {finding.page}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      continueToManualRedaction(
                        manualReviewFindings
                      )
                    }
                    className="mt-3 w-full min-h-11 rounded-xl border-2 border-zinc-950 bg-zinc-950 px-4 text-sm font-semibold text-white inline-flex items-center justify-center gap-2"
                  >
                    Continue Manual Review ({manualReviewFindings.length})
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={downloadCurrentRedactedPdf}
                    className="mt-2 w-full min-h-11 rounded-xl border-2 border-amber-700 bg-white px-4 text-sm font-semibold text-amber-950 inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Current PDF Anyway
                  </button>

                  <p className="mt-2 text-center text-[11px] leading-4 text-amber-900">
                    This copy did not pass the final safety check.
                    Manual review is recommended before sharing it.
                  </p>
                </div>
              )}

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
