import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Columns2,
  Square,
} from 'lucide-react';
import {
  createNUpPDF,
  getPDFPageCount,
  type NUpLayout,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface NUpPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const NUpPdf: React.FC<NUpPdfProps> = ({ file, onFileChange }) => {
  const [pagesPerSheet, setPagesPerSheet] = useState<NUpLayout>(2);
  const [drawPageBorders, setDrawPageBorders] = useState(true);
  const [pageCount, setPageCount] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  useEffect(() => {
    if (!file) {
      setPageCount(0);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    getPDFPageCount(file)
      .then((count) => {
        if (isMounted) setPageCount(count);
      })
      .catch((err) => {
        console.error('Error reading pages:', err);
        if (isMounted) {
          setErrorMessage('Could not load PDF details. File may be encrypted.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

  const handleGenerate = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await createNUpPDF(file, {
        pagesPerSheet,
        drawPageBorders,
        onProgress: (curr, total) => {
          setProgressText(`Placing page ${curr} of ${total} onto sheets...`);
        },
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('N-Up generation error:', err);
      setErrorMessage(err.message || 'Failed to arrange multi-page layout.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const totalOutputSheets = pageCount > 0 ? Math.ceil(pageCount / pagesPerSheet) : 0;

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to create handouts and multi-page layouts"
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
          <Columns2 className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to combine pages per sheet</p>
          <p className="text-xs text-zinc-500 mt-1">2-in-1, 4-in-1, or 9-in-1 handouts for printing and study notes</p>
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
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Layout Configuration */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Pages per Sheet</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { count: 2 as NUpLayout, label: '2-on-1', sub: 'Side by Side (Landscape)' },
                { count: 4 as NUpLayout, label: '4-on-1', sub: '2×2 Grid (Portrait)' },
                { count: 9 as NUpLayout, label: '9-on-1', sub: '3×3 Grid (Thumbnails)' },
              ].map((layout) => (
                <button
                  key={layout.count}
                  type="button"
                  onClick={() => {
                    setPagesPerSheet(layout.count);
                    revokeDownloadUrl();
                  }}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    pagesPerSheet === layout.count
                      ? 'border-emerald-500 bg-emerald-950/40'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${
                      pagesPerSheet === layout.count ? 'text-emerald-400' : 'text-zinc-200'
                    }`}
                  >
                    {layout.label}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{layout.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Page Border Option */}
          <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Square className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-xs font-medium text-zinc-200">Draw Page Boundaries</p>
                <p className="text-[11px] text-zinc-500">Add thin bounding borders around each sub-page</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={drawPageBorders}
              onChange={(e) => {
                setDrawPageBorders(e.target.checked);
                revokeDownloadUrl();
              }}
              className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
            />
          </div>

          {/* Output Summary Banner */}
          {pageCount > 0 && (
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs text-zinc-400 flex items-center justify-between">
              <span>Original: <strong className="text-zinc-200">{pageCount}</strong> pages</span>
              <span>→</span>
              <span>Output: <strong className="text-emerald-400">{totalOutputSheets}</strong> sheets ({Math.round((1 - totalOutputSheets / pageCount) * 100)}% paper saved)</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Button / Download State */}
          {!downloadUrl ? (
            <button
              onClick={handleGenerate}
              disabled={isProcessing || pageCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Generating N-Up document...'}</span>
                </>
              ) : (
                <>
                  <Columns2 className="w-4 h-4 stroke-[2.5]" />
                  <span>Combine into {totalOutputSheets} Sheets ({pagesPerSheet}-Up)</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Multi-Page Layout Generated Successfully
              </div>
              <a
                href={downloadUrl}
                download={`handout_${pagesPerSheet}up_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Handout PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};