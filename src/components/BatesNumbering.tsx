import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  FileDigit,
  Layout,
} from 'lucide-react';
import {
  addBatesNumbersToPDF,
  getPDFPageCount,
  type BatesPosition,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface BatesNumberingProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const BatesNumbering: React.FC<BatesNumberingProps> = ({ file, onFileChange }) => {
  const [prefix, setPrefix] = useState('CONF-');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [digits, setDigits] = useState<number>(6);
  const [suffix, setSuffix] = useState('');
  const [position, setPosition] = useState<BatesPosition>('bottom-right');
  const [fontSize, setFontSize] = useState<number>(10);
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
        console.error('Error reading PDF:', err);
        if (isMounted) {
          setErrorMessage('Could not load PDF details. File may be encrypted.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

  const handleApplyBates = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await addBatesNumbersToPDF(file, {
        prefix,
        startNumber,
        digits,
        suffix,
        position,
        fontSize,
        onProgress: (curr, total) => {
          setProgressText(`Stamping page ${curr} of ${total}...`);
        },
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Bates Stamping error:', err);
      setErrorMessage(err.message || 'Failed to apply Bates numbering.');
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

  const previewFirst = `${prefix}${String(startNumber).padStart(digits, '0')}${suffix}`;
  const previewLast = `${prefix}${String(startNumber + Math.max(0, pageCount - 1)).padStart(digits, '0')}${suffix}`;

  const positionOptions: { id: BatesPosition; label: string }[] = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-center', label: 'Top Center' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-center', label: 'Bottom Center' },
    { id: 'bottom-right', label: 'Bottom Right' },
  ];

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to apply Bates numbering"
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
          <FileDigit className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to add Bates numbering</p>
          <p className="text-xs text-zinc-500 mt-1">Confidential legal numbering & discovery stamping offline</p>
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

          {/* Numbering Format Controls */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Prefix</label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => {
                  setPrefix(e.target.value);
                  revokeDownloadUrl();
                }}
                placeholder="e.g. CASE- / CONF-"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Suffix (Optional)</label>
              <input
                type="text"
                value={suffix}
                onChange={(e) => {
                  setSuffix(e.target.value);
                  revokeDownloadUrl();
                }}
                placeholder="e.g. -PROD"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Start Number</label>
              <input
                type="number"
                min="1"
                value={startNumber}
                onChange={(e) => {
                  setStartNumber(Math.max(1, parseInt(e.target.value, 10) || 1));
                  revokeDownloadUrl();
                }}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Total Digits</label>
              <input
                type="number"
                min="1"
                max="12"
                value={digits}
                onChange={(e) => {
                  setDigits(Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1)));
                  revokeDownloadUrl();
                }}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Font Size (pt)</label>
              <input
                type="number"
                min="6"
                max="24"
                value={fontSize}
                onChange={(e) => {
                  setFontSize(Math.max(6, parseInt(e.target.value, 10) || 10));
                  revokeDownloadUrl();
                }}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Position Selector */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <Layout className="w-3.5 h-3.5 text-emerald-400" />
              <span>Stamp Position</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {positionOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPosition(opt.id);
                    revokeDownloadUrl();
                  }}
                  className={`py-2 px-2 text-center rounded-xl text-xs font-semibold border transition-all ${
                    position === opt.id
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-1 text-xs">
            <span className="text-zinc-400 font-medium">Stamp Sequence Preview:</span>
            <div className="flex items-center justify-between font-mono text-emerald-400 text-[11px] pt-1">
              <span>p.1: {previewFirst}</span>
              {pageCount > 1 && <span>→</span>}
              {pageCount > 1 && <span>p.{pageCount}: {previewLast}</span>}
            </div>
          </div>

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
              onClick={handleApplyBates}
              disabled={isProcessing || pageCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Stamping document...'}</span>
                </>
              ) : (
                <>
                  <FileDigit className="w-4 h-4 stroke-[2.5]" />
                  <span>Apply Bates Numbers ({pageCount} Pages)</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Bates Stamping Applied Successfully
              </div>
              <a
                href={downloadUrl}
                download={`bates_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Bates Stamped PDF</span>
              </a>
            </div>
          )}
        </div>  
      )}
    </div>
  );
};