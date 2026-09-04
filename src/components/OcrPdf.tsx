import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  ScanText,
  Languages,
  Search,
} from 'lucide-react';
import {
  ocrPDFToSearchable,
  getPDFPageCount,
  type OcrProgress,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface OcrPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'eng', label: 'English (Installed Offline)' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'hin', label: 'Hindi' },
];

export const OcrPdf: React.FC<OcrPdfProps> = ({ file, onFileChange }) => {
  const [language, setLanguage] = useState('eng');
  const [pageCount, setPageCount] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressInfo, setProgressInfo] = useState<OcrProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  useEffect(() => {
    if (!file) {
      setPageCount(0);
      revokeDownloadUrl();
      setErrorMessage(null);
      setProgressInfo(null);
      return;
    }

    let isMounted = true;
    getPDFPageCount(file)
      .then((count) => {
        if (isMounted) setPageCount(count);
      })
      .catch((err) => {
        console.error('Error reading PDF:', err);
        if (isMounted) {
          setErrorMessage('Could not inspect PDF. The file may be password-protected.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

  const handleRunOcr = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await ocrPDFToSearchable(file, language, (progress) => {
        setProgressInfo(progress);
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('OCR Error:', err);
      setErrorMessage(err.message || 'Failed to OCR document. Ensure worker files can load.');
    } finally {
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  const handleClear = () => {
    if (isProcessing) return;
    onFileChange(null);
    revokeDownloadUrl();
    setErrorMessage(null);
    setProgressInfo(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a scanned PDF to make searchable"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <ScanText className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a scanned PDF to make it searchable</p>
          <p className="text-xs text-zinc-500 mt-1">Client-side OCR via Tesseract.js • Zero cloud uploads</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') {
                onFileChange(selected);
              }
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-6 text-left">
          {/* File Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {pageCount > 0 ? `${pageCount} Pages • ` : ''}
                  {Math.round(file.size / 1024)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              disabled={isProcessing}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Language Selection */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <Languages className="w-3.5 h-3.5 text-emerald-400" />
              <span>OCR Language</span>
            </label>
            <select
              value={language}
              disabled={isProcessing}
              onChange={(e) => {
                setLanguage(e.target.value);
                revokeDownloadUrl();
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Value Prop Banner */}
          <div className="p-3 bg-zinc-950/50 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 flex items-start gap-2.5">
            <Search className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Embeds an invisible, coordinate-accurate text layer beneath your scans. The visual presentation remains unchanged, but all words become selectable and searchable via Ctrl+F / Cmd+F.
            </span>
          </div>

          {/* Progress Indicator */}
          {isProcessing && progressInfo && (
            <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">{progressInfo.status}</span>
                <span className="text-emerald-400 font-semibold">{progressInfo.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressInfo.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger / Download State */}
          {!downloadUrl ? (
            <button
              onClick={handleRunOcr}
              disabled={isProcessing || pageCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing OCR in browser...</span>
                </>
              ) : (
                <>
                  <ScanText className="w-4 h-4 stroke-[2.5]" />
                  <span>Make PDF Searchable ({pageCount} Pages)</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Searchable PDF Generated Successfully
              </div>
              <a
                href={downloadUrl}
                download={`searchable_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Searchable PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};