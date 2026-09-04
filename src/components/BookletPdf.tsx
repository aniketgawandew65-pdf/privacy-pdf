import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import {
  createBookletPDF,
  getPDFPageCount,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface BookletPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const BookletPdf: React.FC<BookletPdfProps> = ({ file, onFileChange }) => {
  const [sheetSize, setSheetSize] = useState<'A4' | 'LETTER'>('A4');
  const [addFoldLine, setAddFoldLine] = useState(true);
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

  const handleGenerateBooklet = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await createBookletPDF(file, {
        sheetSize,
        addFoldLine,
        onProgress: (curr, total) => {
          setProgressText(`Assembling sheet spread ${curr} of ${total}...`);
        },
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Booklet creation error:', err);
      setErrorMessage(err.message || 'Failed to generate booklet layout.');
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

  const paddedCount = pageCount > 0 ? Math.ceil(pageCount / 4) * 4 : 0;
  const blankPagesAdded = paddedCount - pageCount;
  const sheetsNeeded = paddedCount / 4;

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to convert to a printable booklet"
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
          <BookOpen className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to create a printable booklet</p>
          <p className="text-xs text-zinc-500 mt-1">Saddle-stitch imposition: print double-sided, fold, and staple</p>
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

          {/* Paper Size Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Target Paper Format</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'A4', label: 'A4 Landscape', desc: 'Standard international paper' },
                { id: 'LETTER', label: 'US Letter Landscape', desc: 'Standard US/North American paper' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSheetSize(opt.id as 'A4' | 'LETTER');
                    revokeDownloadUrl();
                  }}
                  className={`p-3 text-left rounded-xl border transition-all ${
                    sheetSize === opt.id
                      ? 'border-emerald-500 bg-emerald-950/40'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${
                      sheetSize === opt.id ? 'text-emerald-400' : 'text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Center Fold Line Toggle */}
          <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-200">Center Fold Line</p>
              <p className="text-[11px] text-zinc-500">Draw subtle dashed guides along the middle fold</p>
            </div>
            <input
              type="checkbox"
              checked={addFoldLine}
              onChange={(e) => {
                setAddFoldLine(e.target.checked);
                revokeDownloadUrl();
              }}
              className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
            />
          </div>

          {/* Imposition Summary Card */}
          {pageCount > 0 && (
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs text-zinc-400 space-y-1">
              <div className="flex justify-between">
                <span>Original Pages:</span>
                <strong className="text-zinc-200">{pageCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Blank Pages Padded:</span>
                <strong className="text-zinc-200">{blankPagesAdded}</strong>
              </div>
              <div className="flex justify-between border-t border-zinc-800/60 pt-1 text-emerald-400 font-medium">
                <span>Physical Sheets to Print:</span>
                <strong>{sheetsNeeded} sheets (double-sided)</strong>
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
              onClick={handleGenerateBooklet}
              disabled={isProcessing || pageCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Creating booklet imposition...'}</span>
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4 stroke-[2.5]" />
                  <span>Generate Printable Booklet</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Booklet Imposition Created Successfully
              </div>
              <a
                href={downloadUrl}
                download={`booklet_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Booklet PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};