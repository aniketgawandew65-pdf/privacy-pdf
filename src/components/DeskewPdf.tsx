import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Compass,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { loadPdfJsFromBlob } from '../utils/pdfjs';
import { deskewPDF, estimateSkewAngle } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';
import {
  checkTaskCredit,
  commitTaskCredit,
} from '../utils/taskCreditGate';

interface DeskewPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const DeskewPdf: React.FC<DeskewPdfProps> = ({ file, onFileChange }) => {
  const [angle, setAngle] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef =
    useRef<string | null>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  useEffect(() => {
    const previousPreviewUrl =
      previewUrlRef.current;

    if (previousPreviewUrl) {
      try {
        URL.revokeObjectURL(
          previousPreviewUrl
        );
      } catch (_) {}

      previewUrlRef.current =
        null;
    }

    setPreviewUrl(null);

    if (!file) {
      setPreviewUrl(null);
      setAngle(0);
      setZoom(1.0);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    let disposePdf:
      | (() => Promise<void>)
      | null = null;

    (async () => {
      try {
        const loaded =
          await loadPdfJsFromBlob(
            file
          );

        disposePdf =
          loaded.dispose;

        if (!isMounted) {
          await disposePdf();
          disposePdf = null;
          return;
        }

        const pdf =
          loaded.pdf;

        const page =
          await pdf.getPage(1);

        const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
        const unscaled = page.getViewport({ scale: 1.0 });
        const scale = (520 / Math.max(unscaled.width, unscaled.height)) * dpr;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx as any, viewport } as any).promise;
          const previewBlob =
            await new Promise<Blob | null>(
              (resolve) => {
                canvas.toBlob(
                  resolve,
                  'image/jpeg',
                  0.95
                );
              }
            );

          if (
            previewBlob &&
            isMounted
          ) {
            const nextPreviewUrl =
              URL.createObjectURL(
                previewBlob
              );

            previewUrlRef.current =
              nextPreviewUrl;

            setPreviewUrl(
              nextPreviewUrl
            );
          }
        }
        canvas.width = 1;
        canvas.height = 1;

        try {
          page.cleanup();
        } catch (_) {}
      } catch (err) {
        console.error('Deskew preview error:', err);
        if (isMounted) setErrorMessage((err as any)?.message || String(err));
      } finally {
        if (disposePdf) {
          try {
            await disposePdf();
          } catch (_) {}

          disposePdf = null;
        }

        if (isMounted) {
          setIsLoadingPreview(false);
        }
      }
    })();

    return () => {
      isMounted = false;

      if (disposePdf) {
        void disposePdf();
        disposePdf = null;
      }
    };
  }, [file]);

  useEffect(() => {
    return () => {
      const currentPreviewUrl =
        previewUrlRef.current;

      if (currentPreviewUrl) {
        try {
          URL.revokeObjectURL(
            currentPreviewUrl
          );
        } catch (_) {}

        previewUrlRef.current =
          null;
      }
    };
  }, []);

  const handleAutoEstimate = async () => {
    if (!previewUrl) return;
    setIsEstimating(true);

    try {
      const img = new Image();
      img.src = previewUrl;
      await new Promise((res) => (img.onload = res));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const estimated = estimateSkewAngle(ctx, canvas.width, canvas.height);
        setAngle(estimated);
      }
      canvas.width = 0;
      canvas.height = 0;
    } catch (err) {
      console.error('Auto-estimate skew error:', err);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleDeskew = async () => {
    if (!file) return;

    const creditCheck = checkTaskCredit(file);

    if (!creditCheck.allowed) {
      setErrorMessage(
        creditCheck.errorMessage ||
          'This task is not available on your current plan.'
      );
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const bytes = await deskewPDF(file, { angle });
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
      commitTaskCredit();
    } catch (err: any) {
      console.error('Deskew error:', err);
      setErrorMessage(err.message || 'Failed to deskew PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to straighten"
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
            if (dropped && dropped.type === 'application/pdf') onFileChange(dropped);
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Compass className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a scanned PDF to straighten</p>
          <p className="text-xs text-zinc-500 mt-1">High-Definition Visual Alignment • Precision Tilt Tuning</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected && selected.type === 'application/pdf') onFileChange(selected);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-6 text-left">
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
              </div>
            </div>
            <button
              onClick={() => {
                onFileChange(null);
                revokeDownloadUrl();
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* High-DPI Live Deskew Preview with Corner Zoom Widget */}
          <div className="relative w-full h-[360px] bg-zinc-950/80 rounded-xl border border-zinc-800 flex items-center justify-center overflow-auto p-4 select-none">
            {isLoadingPreview ? (
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            ) : previewUrl ? (
              <div className="relative flex items-center justify-center min-w-full min-h-full p-8">
                <img
                  src={previewUrl}
                  alt="Deskew Preview"
                  style={{
                    transform: `rotate(${angle}deg) scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                  className="max-h-[260px] max-w-[260px] object-contain rounded shadow-2xl transition-transform duration-100 ease-out pointer-events-none"
                />
              </div>
            ) : null}

            <span className="absolute bottom-3 left-4 text-[10px] text-zinc-500">Live Page 1 Straighten Preview</span>

            {/* Bottom-Right Floating Zoom Controls */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-zinc-900/90 border border-zinc-700/80 backdrop-blur-md px-2 py-1 rounded-lg shadow-lg z-20">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, parseFloat((z - 0.2).toFixed(1))))}
                disabled={zoom <= 0.6}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-zinc-300 min-w-[36px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3.0, parseFloat((z + 0.2).toFixed(1))))}
                disabled={zoom >= 3.0}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium">Fine Tilt Angle: {angle.toFixed(1)}°</span>
              <button
                type="button"
                onClick={handleAutoEstimate}
                disabled={isEstimating || !previewUrl}
                className="flex items-center gap-1 text-emerald-400 hover:underline cursor-pointer disabled:opacity-40"
              >
                <Sparkles className="w-3 h-3" />
                <span>Auto-Detect Tilt</span>
              </button>
            </div>
            <input
              type="range"
              min="-10"
              max="10"
              step="0.2"
              value={angle}
              onChange={(e) => setAngle(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
            />
          </div>

          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleDeskew}
              disabled={isProcessing}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Straightening PDF...</span>
                </>
              ) : (
                <>
                  <Compass className="w-4 h-4 stroke-[2.5]" />
                  <span>Straighten &amp; Download PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Straightened Successfully
              </div>
              <a
                href={downloadUrl}
                download={`straightened_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Straightened PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};