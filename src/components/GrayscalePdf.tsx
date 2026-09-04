import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Printer,
  Sliders,
  Eye,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { convertToGrayscalePDF } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface GrayscalePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const GrayscalePdf: React.FC<GrayscalePdfProps> = ({ file, onFileChange }) => {
  const [mode, setMode] = useState<'grayscale' | 'pure-bw'>('grayscale');
  const [threshold, setThreshold] = useState<number>(135);
  const [totalPages, setTotalPages] = useState<number>(0);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Generate real-time preview of page 1
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setTotalPages(0);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (!isMounted) return;

        setTotalPages(pdf.numPages);
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.8 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          await page.render({
            canvasContext: ctx as any,
            viewport,
          } as any).promise;

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const val = mode === 'pure-bw' ? (gray < threshold ? 0 : 255) : gray;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
          }

          ctx.putImageData(imgData, 0, 0);
          if (isMounted) {
            setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
          }
        }
        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        console.error('Preview error:', err);
        if (isMounted) {
          setErrorMessage('Could not render document preview.');
        }
      } finally {
        if (isMounted) setIsLoadingPreview(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file, mode, threshold]);

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await convertToGrayscalePDF(file, {
        mode,
        threshold,
        onProgress: (curr, total) => {
          setProgressText(`Converting page ${curr} of ${total}...`);
        },
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Grayscale error:', err);
      setErrorMessage(err.message || 'Failed to convert PDF to grayscale.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setPreviewUrl(null);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to convert to black and white"
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
          <Printer className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to convert to B&W / Grayscale</p>
          <p className="text-xs text-zinc-500 mt-1">Optimize for printing, toner saving, and legal filings</p>
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
                  {totalPages > 0 ? `${totalPages} Pages • ` : ''}
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
                setMode('grayscale');
                revokeDownloadUrl();
              }}
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                mode === 'grayscale'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Smooth Grayscale</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('pure-bw');
                revokeDownloadUrl();
              }}
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                mode === 'pure-bw'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Pure B&W (Photocopy)</span>
            </button>
          </div>

          {/* Threshold Slider (Only for Pure B&W) */}
          {mode === 'pure-bw' && (
            <div className="space-y-2 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-300 font-medium">Scan Contrast Threshold</span>
                <span className="text-emerald-400 font-semibold">{threshold}</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={threshold}
                onChange={(e) => {
                  setThreshold(Number(e.target.value));
                  revokeDownloadUrl();
                }}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <p className="text-[11px] text-zinc-500">
                Lower values make text thinner; higher values darken text and scan details.
              </p>
            </div>
          )}

          {/* Real-time Page 1 Preview Card */}
          {previewUrl && (
            <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 self-start">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Page 1 Live Preview:</span>
              </div>
              <div className="w-36 aspect-[3/4] bg-zinc-900 rounded border border-zinc-700 overflow-hidden flex items-center justify-center">
                {isLoadingPreview ? (
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                ) : (
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                )}
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

          {/* Action Trigger */}
          {!downloadUrl ? (
            <button
              onClick={handleConvert}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Converting to monochrome...'}</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 stroke-[2.5]" />
                  <span>Convert to {mode === 'pure-bw' ? 'Pure B&W' : 'Grayscale'}</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Converted Successfully
              </div>
              <a
                href={downloadUrl}
                download={`grayscale_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Grayscale PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};