import React, { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  Archive,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { splitPdfToZip, getPDFPageCount } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface SplitterProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type SplitMode = 'range' | 'burst';

export const Splitter: React.FC<SplitterProps> = ({ file, onFileChange }) => {
  const [splitMode, setSplitMode] = useState<SplitMode>('range');
  const [pageCount, setPageCount] = useState<number>(0);
  const [rangeInput, setRangeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  useEffect(() => {
    if (!file) {
      setPageCount(0);
      setRangeInput('');
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    getPDFPageCount(file)
      .then((count) => {
        if (isMounted) {
          setPageCount(count);
          setRangeInput(`1-${count}`);
        }
      })
      .catch((err) => {
        console.error('Failed to read page count:', err);
        if (isMounted) {
          setErrorMessage('Failed to read PDF. The document may be corrupted or password-protected.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

  const parsePageRange = (input: string, maxPages: number): number[] => {
    const pages = new Set<number>();
    const parts = input.split(',').map((p) => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(maxPages, Math.max(start, end));
          for (let i = from; i <= to; i++) {
            pages.add(i);
          }
        }
      } else {
        const page = parseInt(part, 10);
        if (!isNaN(page) && page >= 1 && page <= maxPages) {
          pages.add(page);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleSplit = async () => {
    if (!file || pageCount === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      if (splitMode === 'burst') {
        setProgressText('Bursting pages to ZIP...');
        const zipBlob = await splitPdfToZip(file, (curr, total) => {
          setProgressText(`Packaging page ${curr} of ${total} into ZIP...`);
        });
        createUrl(zipBlob);
      } else {
        setProgressText('Extracting pages...');
        const selectedPages = parsePageRange(rangeInput, pageCount);
        if (selectedPages.length === 0) {
          throw new Error('Please specify a valid page range.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const newDoc = await PDFDocument.create();

        const pageIndices = selectedPages.map((p) => p - 1);
        const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach((page) => newDoc.addPage(page));

        const pdfBytes = await newDoc.save({ useObjectStreams: true });
        const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
        createUrl(blob);
      }
    } catch (err: any) {
      console.error('Split error:', err);
      setErrorMessage(err.message || 'Failed to split PDF.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    revokeDownloadUrl();
    setErrorMessage(null);
    setRangeInput('');
  };

  const isZipOutput = splitMode === 'burst';
  const downloadFileName = file
    ? isZipOutput
      ? `${file.name.replace(/\.[^/.]+$/, '')}_all_pages.zip`
      : `split_${file.name}`
    : 'download';

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to split or burst"
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
          <Scissors className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to split or burst</p>
          <p className="text-xs text-zinc-500 mt-1">Extract specific ranges or download every page as a ZIP</p>
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

          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSplitMode('range');
                revokeDownloadUrl();
              }}
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                splitMode === 'range'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Extract Range</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSplitMode('burst');
                revokeDownloadUrl();
              }}
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                splitMode === 'burst'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Archive className="w-4 h-4" />
              <span>Burst All to ZIP</span>
            </button>
          </div>

          {/* Conditional Input for Range */}
          {splitMode === 'range' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Page Range <span className="text-zinc-500 font-normal">(e.g. 1-3, 5, 8-10)</span>
              </label>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => {
                  setRangeInput(e.target.value);
                  revokeDownloadUrl();
                }}
                placeholder="1-3, 5"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          ) : (
            <div className="p-3 bg-zinc-950/50 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 flex items-start gap-2.5">
              <Archive className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Every page will be extracted as an individual PDF and bundled into a single ZIP archive client-side.
              </span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger */}
          {!downloadUrl ? (
            <button
              onClick={handleSplit}
              disabled={isProcessing || pageCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Splitting PDF...'}</span>
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4 stroke-[2.5]" />
                  <span>{splitMode === 'burst' ? 'Burst to ZIP Archive' : 'Extract Selected Pages'}</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" />{' '}
                {isZipOutput ? 'ZIP Archive Generated Successfully' : 'Pages Extracted Successfully'}
              </div>
              <a
                href={downloadUrl}
                download={downloadFileName}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>{isZipOutput ? 'Download All Pages (.ZIP)' : 'Download Split PDF'}</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};