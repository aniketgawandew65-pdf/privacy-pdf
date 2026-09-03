import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Download, Loader2, CheckCircle2, X, Trash2 } from 'lucide-react';
import { removePagesFromPDF, getPDFPageCount } from '../utils/pdfEngine';

interface RemovePagesProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const RemovePages: React.FC<RemovePagesProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pagesInput, setPagesInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file) {
      getPDFPageCount(file).then((count) => {
        setTotalPages(count);
        setPagesInput('');
        setDownloadUrl(null);
        setError(null);
      }).catch(() => {
        setError('Failed to read PDF pages.');
      });
    } else {
      setTotalPages(0);
      setPagesInput('');
      setDownloadUrl(null);
      setError(null);
    }
  }, [file]);

  const parsePageNumbers = (input: string, max: number): number[] => {
    const pages = new Set<number>();
    const parts = input.split(',').map((p) => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= max) pages.add(i);
          }
        }
      } else {
        const pageNum = parseInt(part, 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= max) {
          pages.add(pageNum);
        }
      }
    }

    return Array.from(pages);
  };

  const handleRemove = async () => {
    if (!file || totalPages === 0) return;
    setError(null);

    const pagesToRemove = parsePageNumbers(pagesInput, totalPages);
    if (pagesToRemove.length === 0) {
      setError('Please specify valid page number(s) to remove.');
      return;
    }

    if (pagesToRemove.length >= totalPages) {
      setError('Cannot remove all pages from the PDF.');
      return;
    }

    setIsProcessing(true);
    try {
      const outputBytes = await removePagesFromPDF(file, pagesToRemove);
      const blob = new Blob([outputBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err) {
      console.error(err);
      setError('Failed to process PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setDownloadUrl(null);
    setPagesInput('');
    setError(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]?.type === 'application/pdf') {
              onFileChange(e.dataTransfer.files[0]);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to remove pages</p>
          <p className="text-xs text-zinc-500 mt-1">Processed 100% locally on your machine</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]?.type === 'application/pdf') {
                onFileChange(e.target.files[0]);
              }
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
                  {Math.round(file.size / 1024)} KB • {totalPages} {totalPages === 1 ? 'page' : 'pages'}
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

          {/* Page input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">
              Pages to remove (e.g. 2, 4-6)
            </label>
            <input
              type="text"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              placeholder="e.g. 1, 3, 5-7"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleRemove}
              disabled={isProcessing || !pagesInput.trim()}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Removing pages...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Remove Pages & Download</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Pages successfully removed!</span>
              </div>
              <a
                href={downloadUrl}
                download={`${file.name.replace('.pdf', '')}_modified.pdf`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Clean PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};