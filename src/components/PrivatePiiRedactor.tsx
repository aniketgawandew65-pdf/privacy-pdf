import { exclusivelyProcess, localContentId, clearProcessingRecovery } from '../utils/localProcessing';
import {
  readScanRecord,
  writeScanRecord,
  clearScanRecords,
  scanDiagnostics,
  type ScanPage,
  type OcrRegion,
} from '../utils/piiScanStore';
import {
  normalizeForSafetyCheck,
  verifyFinishedPdf,
} from "../utils/pdfSafetyVerifier";
import { createWorker } from 'tesseract.js';
import {
  recognizeMobileOcrTile,
} from '../utils/mobileOcrEngine';
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
  type PageRedaction,
} from "../utils/pdfEngine";
import {
  redactPDFToFile, clearRedactionStreams,
} from "../utils/streamingRedact";
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
  | "India UIDAI Reference"
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
  pendingRedactedPdf: Blob | null;
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

/*
 * Aadhaar Verhoeff checksum validation allows detection of a
 * valid Aadhaar even if OCR loses the word "Aadhaar".
 */
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const validAadhaar = (
  value: string
) => {
  const digits =
    value.replace(
      /\D/g,
      ""
    );

  if (
    !/^[2-9]\d{11}$/.test(
      digits
    )
  ) {
    return false;
  }

  let checksum =
    0;

  for (
    let index = 0;
    index < digits.length;
    index++
  ) {
    const digit =
      Number(
        digits[
          digits.length -
            1 -
            index
        ]
      );

    checksum =
      VERHOEFF_D[
        checksum
      ][
        VERHOEFF_P[
          index % 8
        ][
          digit
        ]
      ];
  }

  return checksum === 0;
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
    regex:
      /\b(?:(?:full|customer|client|employee|owner|tenant|licensor|licensee|presenter|applicant|witness|party|person)\s+)?name(?:\s*[/|]\s*[^:\r\n]{0,56})?\s*[:=-]\s*((?:(?:mr|mrs|ms|miss|dr)\.?\s+)?[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,5})/gi,
    captureGroup: 1,
  },
  {
    /*
     * Identity-table rows such as:
     *   Person Name, Female, UIDAI-reference
     */
    category: "Name",
    regex:
      /\b((?:(?:mr|mrs|ms|miss|dr)\.?\s+)?[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,5})\s*,\s*(?:male|female|other)\b/gi,
    captureGroup: 1,
  },
  {
    /*
     * Legal-document rows such as:
     *   Mrs Person Name, Age : About 56 Years
     */
    category: "Name",
    regex:
      /\b((?:(?:mr|mrs|ms|miss|dr)\.?\s+)?[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,5})\s*,\s*age\b/gi,
    captureGroup: 1,
  },
  {
    /*
     * Broader structured/bilingual address labels.
     */
    category: "Address",
    regex:
      /\b(?:home\s+address|billing\s+address|shipping\s+address|postal\s+address|permanent\s+address|present\s+address|residential\s+address|rented\s+property\s+address|owner\s+address|tenant(?:'s)?\s+address|licensor\s+address|licensee\s+address|residing\s+at|residence|address)(?:\s*[/|]\s*[^:\r\n]{0,56})?\s*[:=-]?\s*([^\r\n]{5,180}?)(?=\s+(?:(?:owner|tenant|licensor|licensee)\s+)?(?:mobile|phone|email|e-mail|pan|occupation|city|state|pin(?:code)?|age|gender)\b|$)/gi,
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
    validate: validAadhaar,
  },
  {
    /*
     * Checksum-valid Aadhaar even when its OCR label is missing.
     */
    category: "India Aadhaar",
    regex:
      /(?<!\d)([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})(?!\d)/g,
    captureGroup: 1,
    validate: validAadhaar,
  },
  {
    /*
     * UIDAI / Aadhaar reference IDs can be longer than Aadhaar.
     */
    category: "India UIDAI Reference",
    regex:
      /\b(?:uidai|uid|aadhaar(?:\s*\/\s*|\s+)ref(?:erence)?|aadhar(?:\s*\/\s*|\s+)ref(?:erence)?)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*(\d{12,24})\b/gi,
    captureGroup: 1,
  },
  {
    /*
     * UIDAI identity-table row:
     *   Female, 123456789012345678
     */
    category: "India UIDAI Reference",
    regex:
      /\b(?:male|female|other)\s*[,;|]\s*(\d{12,24})\b/gi,
    captureGroup: 1,
  },
  {
    category: "India PAN",
    regex:
      /\b(?:pan|permanent\s+account\s+number)(?:\s+(?:number|no\.?|#))?\s*[:=-]?\s*([A-Z]{5}\s*\d{4}\s*[A-Z])\b/gi,
    captureGroup: 1,
  },
  {
    /*
     * PAN format itself is distinctive enough to detect without
     * relying on a surviving "PAN" OCR label.
     */
    category: "India PAN",
    regex:
      /\b[A-Z]{5}\s*\d{4}\s*[A-Z]\b/gi,
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
    /*
     * Indian form fields often store mobile numbers as one
     * continuous 10-digit value.
     */
    category: "Phone",
    regex:
      /\b(?:mobile|mob(?:ile)?\s+no\.?|phone|contact(?:\s+no\.?)?)\s*[:=-]?\s*((?:\+?91[\s.-]?)?[6-9]\d{9})\b/gi,
    captureGroup: 1,
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
    "India Aadhaar": 98,
    "India UIDAI Reference": 97,
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
  const scanAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => scanAbortRef.current?.abort(), []);
  const assertScanning = () => scanAbortRef.current?.signal.throwIfAborted();
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
  const [scanComplete, setScanComplete] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (file && workspaceHydrated && !isScanning) {
      void localContentId(file).then(id => readScanRecord<boolean>(id, 'complete')).then(complete => {
        if (!cancelled && complete) setScanComplete(true);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [file, workspaceHydrated, isScanning]);
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
    useRef<Blob | null>(
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

      const left =
        Math.max(
          0,
          Math.min(
            finding.pageWidth,
            box.x
          )
        );

      const top =
        Math.max(
          0,
          Math.min(
            finding.pageHeight,
            box.y
          )
        );

      const right =
        Math.max(
          0,
          Math.min(
            finding.pageWidth,
            box.x + box.width
          )
        );

      const bottom =
        Math.max(
          0,
          Math.min(
            finding.pageHeight,
            box.y + box.height
          )
        );

      if (
        right <= left ||
        bottom <= top
      ) {
        return null;
      }

      return {
        x:
          left /
          finding.pageWidth,
        y:
          top /
          finding.pageHeight,
        width:
          (right - left) /
          finding.pageWidth,
        height:
          (bottom - top) /
          finding.pageHeight,
      };
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
    scanAbortRef.current?.abort();
    clearProcessingRecovery();
    if (file) {
      void localContentId(file).then(id => clearScanRecords(id)).catch(console.warn);
      void clearRedactionStreams(file).catch(console.warn);
    }
    redactorSessionCache = {
      ...EMPTY_REDACTOR_SESSION,
    };

    setScanComplete(false);
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

    void clearToolWorkspace(
      'private-pii-redactor-output'
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
    const identity = await localContentId(nextFile);
    let loaded: Awaited<ReturnType<typeof loadPdfJsFromBlob>> | null = null;
    let totalPages = await readScanRecord<number>(identity, 'count') || 0;
    const nextFindings: Finding[] = [];
    const dedicatedOcrPages: number[] = [];
    let pagesInBatch = 0;

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

        /*
         * PDF.js text transforms can occasionally place a text
         * span fractionally outside the physical CropBox.
         * Clamp the final sensitive region to the real page.
         */
        const left =
          Math.max(
            0,
            Math.min(
              pageWidth,
              minX - horizontalGuard
            )
          );

        const top =
          Math.max(
            0,
            Math.min(
              pageHeight,
              minY - 3
            )
          );

        const right =
          Math.max(
            0,
            Math.min(
              pageWidth,
              maxX + horizontalGuard
            )
          );

        const bottom =
          Math.max(
            0,
            Math.min(
              pageHeight,
              maxY + 3
            )
          );

        /*
         * Never create a redaction target that has collapsed
         * completely outside the actual page.
         */
        if (
          right <= left ||
          bottom <= top
        ) {
          continue;
        }

        const x = left;
        const y = top;
        const width = right - left;
        const height = bottom - top;

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

    /*
     * Extract the actual painted image rectangles from the
     * PDF operator list instead of treating ANY image as a
     * reason to OCR the entire page.
     *
     * Coordinates are returned in the same scale-1 viewport
     * space used by digitalSpans.
     */
    const mergeOcrRegions = (
      input: OcrRegion[],
      pageWidth: number,
      pageHeight: number
    ): OcrRegion[] => {
      const regions = input
        .filter(
          (region) =>
            Number.isFinite(region.x) &&
            Number.isFinite(region.y) &&
            Number.isFinite(region.width) &&
            Number.isFinite(region.height) &&
            region.width > 1 &&
            region.height > 1
        )
        .map((region) => ({
          x: Math.max(0, region.x),
          y: Math.max(0, region.y),
          width: Math.min(
            pageWidth - Math.max(0, region.x),
            region.width
          ),
          height: Math.min(
            pageHeight - Math.max(0, region.y),
            region.height
          ),
        }))
        .filter(
          (region) =>
            region.width > 1 &&
            region.height > 1
        );

      let changed = true;

      while (changed) {
        changed = false;

        outer:
        for (let i = 0; i < regions.length; i++) {
          for (let j = i + 1; j < regions.length; j++) {
            const a = regions[i];
            const b = regions[j];

            const gap = 8;

            const separated =
              a.x + a.width + gap < b.x ||
              b.x + b.width + gap < a.x ||
              a.y + a.height + gap < b.y ||
              b.y + b.height + gap < a.y;

            if (separated) {
              continue;
            }

            const left =
              Math.min(a.x, b.x);

            const top =
              Math.min(a.y, b.y);

            const right =
              Math.max(
                a.x + a.width,
                b.x + b.width
              );

            const bottom =
              Math.max(
                a.y + a.height,
                b.y + b.height
              );

            regions[i] = {
              x: left,
              y: top,
              width: right - left,
              height: bottom - top,
            };

            regions.splice(j, 1);
            changed = true;
            break outer;
          }
        }
      }

      return regions;
    };

    const extractImageRegions = (
      ops: any,
      viewport: any
    ): OcrRegion[] => {
      const fullPage: OcrRegion = {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
      };

      const simpleImageOps =
        new Set<number>([
          pdfjsLib.OPS.paintImageXObject,
          pdfjsLib.OPS.paintInlineImageXObject,
          pdfjsLib.OPS.paintImageMaskXObject,
        ]);

      /*
       * Repeated/group image operators have more complex
       * placement data. For those rare cases retain the safe
       * old behaviour: OCR the whole page.
       */
      const complexImageOps =
        new Set<number>([
          pdfjsLib.OPS.paintImageXObjectRepeat,
          pdfjsLib.OPS.paintImageMaskXObjectRepeat,
          pdfjsLib.OPS.paintInlineImageXObjectGroup,
          pdfjsLib.OPS.paintImageMaskXObjectGroup,
        ]);

      let ctm =
        [1, 0, 0, 1, 0, 0];

      const stack: number[][] = [];
      const regions: OcrRegion[] = [];

      for (
        let index = 0;
        index < ops.fnArray.length;
        index++
      ) {
        const op =
          ops.fnArray[index];

        const args =
          ops.argsArray[index];

        if (op === pdfjsLib.OPS.save) {
          stack.push([...ctm]);
          continue;
        }

        if (op === pdfjsLib.OPS.restore) {
          const restored =
            stack.pop();

          if (restored) {
            ctm = restored;
          }

          continue;
        }

        if (op === pdfjsLib.OPS.transform) {
          if (
            Array.isArray(args) &&
            args.length >= 6 &&
            args
              .slice(0, 6)
              .every(Number.isFinite)
          ) {
            ctm =
              pdfjsLib.Util.transform(
                ctm,
                args.slice(0, 6)
              );
          }

          continue;
        }

        if (complexImageOps.has(op)) {
          return [fullPage];
        }

        if (!simpleImageOps.has(op)) {
          continue;
        }

        const matrix =
          pdfjsLib.Util.transform(
            viewport.transform,
            ctm
          );

        const corners = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([x, y]) =>
          pdfjsLib.Util.applyTransform(
            [x, y],
            matrix
          )
        );

        const xs =
          corners.map(
            (point: number[]) =>
              point[0]
          );

        const ys =
          corners.map(
            (point: number[]) =>
              point[1]
          );

        /*
         * Small margin protects characters touching the
         * edge of an embedded scan/image.
         */
        const margin = 8;

        const left =
          Math.max(
            0,
            Math.min(...xs) -
              margin
          );

        const top =
          Math.max(
            0,
            Math.min(...ys) -
              margin
          );

        const right =
          Math.min(
            viewport.width,
            Math.max(...xs) +
              margin
          );

        const bottom =
          Math.min(
            viewport.height,
            Math.max(...ys) +
              margin
          );

        if (
          right > left + 1 &&
          bottom > top + 1
        ) {
          regions.push({
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          });
        }
      }

      return mergeOcrRegions(
        regions,
        viewport.width,
        viewport.height
      );
    };

    /*
     * A full-page scan frequently already contains a complete
     * hidden/searchable OCR text layer.
     *
     * We only trust that layer when it is genuinely rich and
     * spread through a LARGE image region. A digital header
     * alone will not satisfy this test, so mixed scanned bodies
     * continue to OCR.
     */
    const largeImageHasRichTextCoverage = (
      region: OcrRegion,
      spans: PositionedSpan[],
      pageWidth: number,
      pageHeight: number
    ) => {
      const pageArea =
        Math.max(
          1,
          pageWidth *
            pageHeight
        );

      const regionArea =
        region.width *
        region.height;

      if (
        regionArea /
          pageArea <
        0.65
      ) {
        return false;
      }

      const inside =
        spans.filter((span) => {
          const centerX =
            span.x +
            span.width / 2;

          const centerY =
            span.y +
            span.height / 2;

          return (
            centerX >= region.x &&
            centerX <=
              region.x +
                region.width &&
            centerY >= region.y &&
            centerY <=
              region.y +
                region.height
          );
        });

      const characters =
        inside.reduce(
          (sum, span) =>
            sum +
            span.text
              .replace(/\s/g, "")
              .length,
          0
        );

      if (
        characters < 220 ||
        inside.length < 12
      ) {
        return false;
      }

      /*
       * Require text to be vertically distributed through at
       * least four of six bands. This prevents a long digital
       * header/footer from hiding a scanned image body.
       */
      const occupiedBands =
        new Set<number>();

      for (const span of inside) {
        const centerY =
          span.y +
          span.height / 2;

        const relative =
          (
            centerY -
            region.y
          ) /
          Math.max(
            1,
            region.height
          );

        const band =
          Math.max(
            0,
            Math.min(
              5,
              Math.floor(
                relative * 6
              )
            )
          );

        occupiedBands.add(
          band
        );
      }

      return (
        occupiedBands.size >=
        4
      );
    };

    try {
      if (!totalPages) {
        loaded = await loadPdfJsFromBlob(nextFile);
        totalPages = loaded.pdf.numPages;
        await writeScanRecord(identity, 'count', 0, totalPages);
      }
      for (
        let pageNumber = 1;
        pageNumber <= totalPages;
        pageNumber++
      ) {
        assertScanning();
        const cached = await readScanRecord<ScanPage<Finding>>(identity, 'native', pageNumber);
        if (cached) {
          nextFindings.push(...cached.findings);
          if (cached.needsOcr) dedicatedOcrPages.push(pageNumber);
          continue;
        }
        if (pagesInBatch === 4 && loaded) {
          await loaded.dispose();
          loaded = null;
          pagesInBatch = 0;
        }
        loaded ??= await loadPdfJsFromBlob(nextFile);
        pagesInBatch++;
        const startedAt = performance.now();
        const findingStart = nextFindings.length;
        const savePage = async (
          needsOcr: boolean,
          scale = 1.6,
          ocrRegions: OcrRegion[] = []
        ) => {
          await writeScanRecord(identity, 'native', pageNumber, {
            findings: nextFindings.slice(findingStart),
            needsOcr,
            scale,
            ocrRegions,
            elapsedMs: performance.now() - startedAt,
          });
        };
        setStatus(`Reading page ${pageNumber} of ${totalPages}…`);
        await writeScanRecord(identity, 'progress', 0, { page: pageNumber, stage: 'native-text' });
        const page = await loaded.pdf.getPage(pageNumber);
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
            `Preparing page ${pageNumber} of ${totalPages} for private OCR…`
          );

          try {
            page.cleanup();
          } catch (_) {}

          await savePage(true);
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
            `Preparing scanned page ${pageNumber} of ${totalPages} for private OCR…`
          );

          try {
            page.cleanup();
          } catch (_) {}

          await savePage(true);
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

        await writeScanRecord(
          identity,
          'progress',
          0,
          {
            page: pageNumber,
            stage: 'classify-images',
          }
        );

        let ocrRegions: OcrRegion[] = [];

        if (hasUsableDigitalText) {
          const ops =
            await page.getOperatorList();

          const imageRegions =
            extractImageRegions(
              ops,
              viewport
            );

          /*
           * Smaller embedded scans/images are kept for regional
           * OCR. A near-full-page image is skipped only when the
           * PDF already has a rich distributed searchable text
           * layer over it.
           */
          ocrRegions =
            imageRegions.filter(
              (region) =>
                !largeImageHasRichTextCoverage(
                  region,
                  digitalSpans,
                  viewport.width,
                  viewport.height
                )
            );
        }

        const needsOcr =
          !hasUsableDigitalText ||
          ocrRegions.length > 0;

        if (needsOcr) {
          dedicatedOcrPages.push(
            pageNumber
          );
        }

        await savePage(
          needsOcr,
          hasUsableDigitalText
            ? 1.6
            : 2,
          ocrRegions
        );

        try {
          page.cleanup();
        } catch (_) {}
      }

      setFindings(nextFindings);

      return {
        totalPages,
        dedicatedOcrPages,
      };
    } finally {
      await loaded?.dispose();
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

      /*
       * Clamp OCR geometry to the real page before creating a
       * finding. Tesseract can occasionally report coordinates
       * slightly outside a tile/page boundary.
       */
      const pagePixelWidth =
        pageWidth * renderScale;

      const pagePixelHeight =
        pageHeight * renderScale;

      const left =
        Math.max(
          0,
          Math.min(
            pagePixelWidth,
            minX - padX
          )
        );

      const top =
        Math.max(
          0,
          Math.min(
            pagePixelHeight,
            minY - padY
          )
        );

      const right =
        Math.max(
          0,
          Math.min(
            pagePixelWidth,
            maxX + padX
          )
        );

      const bottom =
        Math.max(
          0,
          Math.min(
            pagePixelHeight,
            maxY + padY
          )
        );

      /*
       * A finding completely outside the physical page has no
       * safe redaction target and must not enter the result set.
       */
      if (
        right <= left ||
        bottom <= top
      ) {
        return;
      }

      const x =
        left / renderScale;

      const y =
        top / renderScale;

      const width =
        (right - left) /
        renderScale;

      const height =
        (bottom - top) /
        renderScale;

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
          width,
          height,
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
    const identity = await localContentId(nextFile);

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
    let totalPages = await readScanRecord<number>(identity, 'count') || 0;

    try {
      if (!totalPages) {
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
      await writeScanRecord(identity, 'count', 0, totalPages);
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

    const requested =
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

    const pagesToScan: number[] = [];
    for (const pageNumber of requested) {
      assertScanning();
      const cached = await readScanRecord<ScanPage<Finding>>(identity, 'ocr', pageNumber);
      if (cached) nextFindings.push(...cached.findings);
      else pagesToScan.push(pageNumber);
    }

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
        assertScanning();
        const parseStart = performance.now();
        loaded = await loadPdfJsFromBlob(nextFile);
        const parseMs = performance.now() - parseStart;
        const workerStart = performance.now();
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
              workerBlobURL: false,
            }
          );

        await writeScanRecord(identity, 'batch', batchPages[0], { parseMs, workerStartupMs: performance.now() - workerStart });
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

          assertScanning();
          const startedAt = performance.now();
          const findingStart = nextFindings.length;
          let renderMs = 0, recognizeMs = 0, detectMs = 0;
          const pageWordsForCache: Array<[string, number, number, number, number]> = [];
          const native = await readScanRecord<ScanPage<Finding>>(identity, 'native', pageNumber);
          const renderScale = native?.scale || 1.6;
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
             * ==================================================
             * REGIONAL OCR
             * ==================================================
             *
             * Native classification stores image rectangles in
             * scale-1 PDF.js viewport coordinates.
             *
             * - Mixed/searchable PDF:
             *     OCR only those image regions.
             *
             * - Truly scanned/sparse PDF:
             *     no regions are stored, so OCR the whole page.
             *
             * OCR resolution/model are unchanged.
             */
            const savedRegions =
              Array.isArray(
                native?.ocrRegions
              ) &&
              native!.ocrRegions!.length > 0
                ? native!.ocrRegions!
                : [
                    {
                      x: 0,
                      y: 0,
                      width:
                        baseViewport.width,
                      height:
                        baseViewport.height,
                    },
                  ];

            const pixelRegions =
              savedRegions
                .map(
                  (
                    region
                  ) => {
                    const left =
                      Math.max(
                        0,
                        Math.min(
                          fullWidth,
                          Math.floor(
                            region.x *
                              renderScale
                          )
                        )
                      );

                    const top =
                      Math.max(
                        0,
                        Math.min(
                          fullHeight,
                          Math.floor(
                            region.y *
                              renderScale
                          )
                        )
                      );

                    const right =
                      Math.max(
                        0,
                        Math.min(
                          fullWidth,
                          Math.ceil(
                            (
                              region.x +
                              region.width
                            ) *
                              renderScale
                          )
                        )
                      );

                    const bottom =
                      Math.max(
                        0,
                        Math.min(
                          fullHeight,
                          Math.ceil(
                            (
                              region.y +
                              region.height
                            ) *
                              renderScale
                          )
                        )
                      );

                    return {
                      left,
                      top,
                      right,
                      bottom,
                    };
                  }
                )
                .filter(
                  (
                    region
                  ) =>
                    region.right >
                      region.left &&
                    region.bottom >
                      region.top
                );

            /*
             * Defensive fallback:
             * malformed region metadata must never silently
             * suppress OCR on a page that was classified for it.
             */
            if (
              pixelRegions.length ===
              0
            ) {
              pixelRegions.push({
                left: 0,
                top: 0,
                right:
                  fullWidth,
                bottom:
                  fullHeight,
              });
            }

            let tileIndex =
              0;

            for (
              let regionIndex = 0;
              regionIndex <
              pixelRegions.length;
              regionIndex++
            ) {
              const region =
                pixelRegions[
                  regionIndex
                ];

              const regionWidth =
                Math.max(
                  1,
                  region.right -
                    region.left
                );

              /*
               * Use the COMPLETE safe pixel budget.
               *
               * Previously an extra 1100px height cap caused a
               * normal A4 page to be split into multiple
               * Tesseract calls even when its total bitmap was
               * already below MAX_TILE_PIXELS.
               *
               * Memory remains bounded by MAX_TILE_PIXELS.
               */
              const calculatedHeight =
                Math.floor(
                  MAX_TILE_PIXELS /
                    regionWidth
                );

              const tileHeight =
                Math.min(
                  region.bottom -
                    region.top,
                  calculatedHeight
                );

              if (
                tileHeight <=
                TILE_OVERLAP * 2
              ) {
                throw new Error(
                  `Page ${pageNumber} is too wide for safe OCR at its original resolution.`
                );
              }

              let tileTop =
                region.top;

              while (
                tileTop <
                region.bottom
              ) {
                assertScanning();

                const tileBottom =
                  Math.min(
                    region.bottom,
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
                  regionWidth;

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
                   * Render ONLY this image region/tile.
                   *
                   * The original fullViewport remains in use,
                   * therefore pixel scale and OCR quality are
                   * identical to the previous implementation.
                   */
                  await writeScanRecord(
                    identity,
                    'progress',
                    0,
                    {
                      page:
                        pageNumber,
                      region:
                        regionIndex,
                      tile:
                        tileIndex,
                      stage:
                        'render',
                      width:
                        regionWidth,
                      height:
                        currentHeight,
                    }
                  );

                  const renderStart =
                    performance.now();

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
                      -region.left,
                      -tileTop,
                    ],
                  } as any).promise;

                  renderMs +=
                    performance.now() -
                    renderStart;

                  await writeScanRecord(
                    identity,
                    'progress',
                    0,
                    {
                      page:
                        pageNumber,
                      region:
                        regionIndex,
                      tile:
                        tileIndex,
                      stage:
                        'recognize',
                    }
                  );

                  const recognizeStart =
                    performance.now();

                  setStatus(
                    pixelRegions.length > 1
                      ? `OCR page ${pageNumber} of ${totalPages} · image ${regionIndex + 1} of ${pixelRegions.length}…`
                      : `OCR page ${pageNumber} of ${totalPages} · section ${tileIndex + 1}…`
                  );

                  /*
                   * Shared OCR recognition contract.
                   *
                   * This is functionally identical to the
                   * previous Private PII call:
                   *
                   * text=true, blocks=true, hocr=true.
                   */
                  let result: any =
                    await recognizeMobileOcrTile(
                      worker,
                      canvas
                    );

                  recognizeMs +=
                    performance.now() -
                    recognizeStart;

                  const detectStart =
                    performance.now();

                  let lines =
                    extractOcrLines(
                      result?.data ||
                        {}
                    );

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

                      /*
                       * Tesseract coordinates are local to this
                       * regional tile. Restore BOTH X and Y to
                       * full-page render-space before converting
                       * them back to PDF coordinates.
                       */
                      const pageWords =
                        words.map(
                          (
                            word
                          ) => ({
                            ...word,
                            x0:
                              word.x0 +
                              region.left,
                            x1:
                              word.x1 +
                              region.left,
                            y0:
                              word.y0 +
                              tileTop,
                            y1:
                              word.y1 +
                              tileTop,
                          })
                        );

                      pageWordsForCache.push(
                        ...pageWords.map(
                          word =>
                            [
                              word.text,
                              word.x0,
                              word.y0,
                              word.x1,
                              word.y1,
                            ] as [
                              string,
                              number,
                              number,
                              number,
                              number
                            ]
                        )
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
                          `region-${regionIndex}-tile-${tileIndex}-${lineIndex}`
                        )
                      );
                    }
                  );

                  detectMs +=
                    performance.now() -
                    detectStart;

                  result =
                    null;

                  lines.length =
                    0;
                } finally {
                  /*
                   * Immediately destroy the tile bitmap.
                   */
                  canvas.width =
                    1;

                  canvas.height =
                    1;
                }

                tileIndex++;

                if (
                  tileBottom >=
                  region.bottom
                ) {
                  break;
                }

                tileTop =
                  Math.max(
                    tileTop + 1,
                    tileBottom -
                      TILE_OVERLAP
                  );

                await yieldToMobile(
                  25
                );
              }
            }
          } finally {
            try {
              page.cleanup();
            } catch (_) {}
          }

          assertScanning();
          await writeScanRecord(identity, 'ocr', pageNumber, {
            findings: nextFindings.slice(findingStart), words: pageWordsForCache,
            scale: renderScale, elapsedMs: performance.now() - startedAt, renderMs, recognizeMs, detectMs,
          });
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

    const combine = (existing: Finding[]) => {
      const seen = new Set<string>();
      return [...existing, ...nextFindings].filter(finding => {
        const key = JSON.stringify([finding.page, finding.category, finding.value, finding.box]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    setFindings(current => combine(appendToExisting ? current : []));
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
      assertScanning();
      if (isPdfPasswordError(err)) throw new Error('This PDF is password-protected. Please unlock it first.');
      // Per-page text extraction failures already route to tiled OCR.
      // Do not turn storage/rendering failures into an uncheckpointed full rescan.
      throw err;
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

    /*
     * Scanned/mixed pages still use the SAME dedicated OCR
     * implementation as before.
     *
     * Fully scanned PDF:
     *   replace findings with OCR findings.
     *
     * Mixed PDF:
     *   retain native findings and add dedicated OCR findings.
     */
    await scanPdfWithOcr(
      nextFile,
      classification
        .dedicatedOcrPages,
      true
    );
  };

  const scanFile = async (nextFile: File) => {
    if (scanAbortRef.current) return;
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanComplete(false);
    setFile(nextFile);
    setFindings([]);
    setSourceText("");
    setError(null);
    setStatus(null);
    setIsScanning(true);

    try {
      await exclusivelyProcess(async () => {
      if (!await saveToolWorkspaceFiles('private-pii-redactor', [nextFile])) {
        throw new Error('Unable to save the local source PDF. Free browser storage and retry.');
      }
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

      await writeScanRecord(await localContentId(nextFile), 'complete', 0, true);
      });
      setScanComplete(true);
      setStatus("Scan complete.");
    } catch (err: any) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to scan this file. Please try another document."
      );

      setStatus(null);
    } finally {
      scanAbortRef.current = null;
      setIsScanning(false);
    }
  };

  const handleFile = (nextFile?: File | null) => {
    if (!nextFile || !workspaceHydrated) return;

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

    /*
     * Refuse malformed geometry before starting an expensive
     * large-PDF reconstruction.
     *
     * This also makes a geometry problem immediately visible
     * instead of making the Auto-Redact button appear inactive.
     */
    const invalidGeometry =
      selected.filter(
        (finding) => {
          const box = finding.box!;
          const pageWidth =
            finding.pageWidth!;
          const pageHeight =
            finding.pageHeight!;

          if (
            ![
              box.x,
              box.y,
              box.width,
              box.height,
              pageWidth,
              pageHeight,
            ].every(Number.isFinite)
          ) {
            return true;
          }

          if (
            pageWidth <= 0 ||
            pageHeight <= 0 ||
            box.width <= 0 ||
            box.height <= 0
          ) {
            return true;
          }

          const left =
            Math.max(
              0,
              Math.min(
                pageWidth,
                box.x
              )
            );

          const top =
            Math.max(
              0,
              Math.min(
                pageHeight,
                box.y
              )
            );

          const right =
            Math.max(
              0,
              Math.min(
                pageWidth,
                box.x + box.width
              )
            );

          const bottom =
            Math.max(
              0,
              Math.min(
                pageHeight,
                box.y + box.height
              )
            );

          return (
            right <= left ||
            bottom <= top
          );
        }
      );

    if (
      invalidGeometry.length >
      0
    ) {
      setError(
        `${invalidGeometry.length} selected sensitive item${
          invalidGeometry.length === 1
            ? ""
            : "s"
        } had invalid page coordinates. Please run a fresh scan before redacting.`
      );

      setStatus(null);
      return false;
    }

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
    /*
     * ========================================================
     * STREAMING BROWSER-BACKED OUTPUT
     * ========================================================
     *
     * Heavy PDFs never become one giant completed Uint8Array.
     * The output is written directly to OPFS page-by-page.
     */
    setStatus(
      "Creating secure redacted pages…"
    );

    const workingPdf =
      await redactPDFToFile(
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

    await new Promise<void>(
      (
        resolve
      ) =>
        setTimeout(
          resolve,
          250
        )
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
        workingPdf,
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
     * SINGLE-PASS LARGE-PDF POLICY
     * ========================================================
     *
     * The finished PDF has already been securely reconstructed
     * once and is now browser-backed in workingPdf.
     *
     * Do NOT rebuild a 150 MB document a second time merely
     * because the independent verifier requests review.
     *
     * If verification is uncertain, preserve PASS 1 and send
     * the user directly to manual review instead.
     *
     * Security is NOT weakened:
     *
     * - automatic download still requires verification.passed
     * - uncertain output remains blocked from automatic download
     * - manual review remains available
     * - failed output must be repaired before download
     */

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

      /*
       * Exact failed IDs are preferred.
       *
       * Some structural verifier failures can be page-level
       * rather than tied to one exact finding. In that case,
       * review ALL selected boxes instead of returning an empty
       * list and accidentally showing Auto-Redact again.
       */
      const reviewItems =
        failedIdSet.size >
          0
          ? selected.filter(
              (
                finding
              ) =>
                failedIdSet.has(
                  finding.id
                )
            )
          : selected;

      /*
       * Keep the exact already-redacted output available for the
       * manual repair workflow.
       */
      pendingRedactedPdfRef.current =
        workingPdf;

      redactorSessionCache.pendingRedactedPdf =
        workingPdf;

      await saveToolWorkspaceFiles(
        'private-pii-redactor-pending',
        [
          new File(
            [
              workingPdf,
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

    void clearToolWorkspace(
      'private-pii-redactor-output'
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
      workingPdf,
      `${base}-redacted.pdf`
    );

    return true;
  };

  const createRedactedCopy = async () => {
    if (!file || selectedCount === 0 || !scanComplete || isRedacting) return;

    pendingRedactedPdfRef.current = null;
    redactorSessionCache.pendingRedactedPdf = null;

    void clearToolWorkspace(
      'private-pii-redactor-pending'
    );

    void clearToolWorkspace(
      'private-pii-redactor-output'
    );

    setError(null);
    setManualReviewFindings([]);
    setIsRedacting(true);

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() || "";

      let completed = false;

      if (extension === "pdf" || file.type === "application/pdf") {
        completed = await exclusivelyProcess(() => redactPdf());
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

        {file && !scanComplete && !isScanning && (
          <button type="button" disabled={!workspaceHydrated || isRedacting}
            onClick={() => void scanFile(file)}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-white">
            Resume scan from saved pages
          </button>
        )}

        {file && !isScanning && !isRedacting && (
          <button type="button" className="mt-3 text-xs underline" onClick={() => {
            void localContentId(file).then(scanDiagnostics).then(data => downloadBlob(
              new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'local-scan-diagnostics.json'
            )).catch(error => setError(String(error)));
          }}>Download scan timings (no document text)</button>
        )}

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

      {file && !isScanning && scanComplete && (
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
                    The secure copy was created once. The independent
                    final safety check flagged these areas for manual
                    review before sharing:
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

                  <p className="mt-2 text-center text-[11px] leading-4 text-amber-900">
                    This copy did not pass the final safety check.
                    Repair the flagged areas before downloading.
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
