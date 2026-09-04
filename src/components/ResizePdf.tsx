import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Scaling,
  Maximize2,
  Compass,
} from 'lucide-react';
import {
  resizePDF,
  getPDFPageCount,
  type PageSizePreset,
  type ResizeFitMode,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface ResizePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const ResizePdf: React.FC<ResizePdfProps> = ({ file, onFileChange }) => {
  const [targetSize, setTargetSize] = useState<PageSizePreset>('A4');
  const [fitMode, setFitMode] = useState<ResizeFitMode>('fit');
  const [autoOrientation, setAutoOrientation] = useState(true);
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

  const handleResize = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await resizePDF(file, {
        size: targetSize,
        fitMode,
        autoOrientation,
        onProgress: (curr, total) => {
          setProgressText(`Resizing page ${curr} of ${total} to ${targetSize}...`);
        },
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Resize error:', err);
      setErrorMessage(err.message || 'Failed to resize PDF.');
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

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to resize pages"
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
          <Scaling className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to resize page format</p>
          <p className="text-xs text-zinc-500 mt-1">Standardize mixed pages to A4, US Letter, Legal, or A3</p>
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

          {/* Target Format Preset Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Target Standard Format</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['A4', 'LETTER', 'LEGAL', 'A3', 'A5'] as PageSizePreset[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    setTargetSize(size);
                    revokeDownloadUrl();
                  }}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-all ${
                    targetSize === size
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Fit Strategy */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Page Scaling & Placement</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'fit', label: 'Fit to Page', desc: 'Preserves aspect ratio with margins' },
                { id: 'center', label: 'Center Original', desc: 'No scaling, adjust margins only' },
                { id: 'stretch', label: 'Fill Page', desc: 'Stretches content to edges' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setFitMode(m.id as ResizeFitMode);
                    revokeDownloadUrl();
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    fitMode === m.id
                      ? 'border-emerald-500 bg-emerald-950/40'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${
                      fitMode === m.id ? 'text-emerald-400' : 'text-zinc-300'
                    }`}
                  >
                    {m.label}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Auto Orientation Toggle */}
          <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-xs font-medium text-zinc-200">Auto-Detect Orientation</p>
                <p className="text-[11px] text-zinc-500">
                  Keep landscape pages in landscape format
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoOrientation}
              onChange={(e) => {
                setAutoOrientation(e.target.checked);
                revokeDownloadUrl();
              }}
              className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
            />
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Button */}
          {!downloadUrl ? (
            <button
              onClick={handleResize}
              disabled={isProcessing || pageCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Resizing pages...'}</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 stroke-[2.5]" />
                  <span>Resize All Pages to {targetSize}</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Standardized to {targetSize} Successfully
              </div>
              <a
                href={downloadUrl}
                download={`resized_${targetSize}_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Standardized PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};