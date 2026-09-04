import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  RotateCw,
  Wand2,
  Grid,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { deskewPDF, estimateSkewAngle } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface DeskewPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const DeskewPdf: React.FC<DeskewPdfProps> = ({ file, onFileChange }) => {
  const [angle, setAngle] = useState<number>(0);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [totalPages, setTotalPages] = useState<number>(0);

  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Load document & render base page 1
  useEffect(() => {
    if (!file) {
      setTotalPages(0);
      setAngle(0);
      revokeDownloadUrl();
      setErrorMessage(null);
      pdfDocRef.current = null;
      rawCanvasRef.current = null;
      return;
    }

    let isMounted = true;
    setIsLoadingDoc(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (!isMounted) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.0 });

        const raw = document.createElement('canvas');
        raw.width = Math.floor(viewport.width);
        raw.height = Math.floor(viewport.height);
        const rawCtx = raw.getContext('2d', { willReadFrequently: true });

        if (rawCtx) {
        await (
        page.render({
        canvasContext: rawCtx as any,
        viewport,
        canvas: raw,
        } as any) as any
        ).promise;
          rawCanvasRef.current = raw;
        }
      } catch (err) {
        console.error('Deskew init error:', err);
        if (isMounted) setErrorMessage('Could not load PDF document.');
      } finally {
        if (isMounted) setIsLoadingDoc(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // Render live preview with applied rotation and alignment grid
  const renderPreview = useCallback(() => {
    if (!rawCanvasRef.current || !canvasRef.current) return;
    const raw = rawCanvasRef.current;
    const canvas = canvasRef.current;

    canvas.width = raw.width;
    canvas.height = raw.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(raw, -raw.width / 2, -raw.height / 2);
    ctx.restore();

    // Draw alignment grid overlay
    if (showGrid) {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.28)'; // Emerald guideline
      ctx.lineWidth = 1;
      const step = 40;

      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
  }, [angle, showGrid]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  // Run automatic skew angle detector
  const handleAutoDetect = () => {
    if (!rawCanvasRef.current) return;
    setIsDetecting(true);
    revokeDownloadUrl();

    setTimeout(() => {
      try {
        const raw = rawCanvasRef.current!;
        const ctx = raw.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          const detected = estimateSkewAngle(ctx, raw.width, raw.height);
          setAngle(Math.round(detected * 10) / 10);
        }
      } catch (err) {
        console.error('Detection failed:', err);
      } finally {
        setIsDetecting(false);
      }
    }, 50);
  };

  const handleApplyDeskew = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await deskewPDF(file, {
        angle,
        onProgress: (curr, total) => {
          setProgressText(`Straightening page ${curr} of ${total}...`);
        },
      });

      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Deskew error:', err);
      setErrorMessage(err.message || 'Failed to deskew PDF.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setAngle(0);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to straighten tilted scans"
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
          <RotateCw className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a scanned PDF here to deskew & straighten</p>
          <p className="text-xs text-zinc-500 mt-1">Automatic angle detection & precision alignment grid</p>
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

          {/* Controls Bar */}
          <div className="p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleAutoDetect}
                disabled={isDetecting || isLoadingDoc}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                {isDetecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>Auto-Detect Tilt Angle</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGrid((g) => !g)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                  showGrid
                    ? 'border-emerald-500/40 bg-zinc-900 text-emerald-400'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Alignment Grid</span>
              </button>
            </div>

            {/* Rotation Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-300 font-medium">Straighten Rotation Angle</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {angle > 0 ? `+${angle.toFixed(1)}°` : `${angle.toFixed(1)}°`}
                </span>
              </div>
              <input
                type="range"
                min="-15"
                max="15"
                step="0.1"
                value={angle}
                onChange={(e) => {
                  setAngle(parseFloat(e.target.value));
                  revokeDownloadUrl();
                }}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>-15° (Counter-clockwise)</span>
                <button
                  type="button"
                  onClick={() => {
                    setAngle(0);
                    revokeDownloadUrl();
                  }}
                  className="hover:text-zinc-300 underline"
                >
                  Reset to 0°
                </button>
                <span>+15° (Clockwise)</span>
              </div>
            </div>
          </div>

          {/* Interactive Live Alignment Preview Canvas */}
          <div className="relative w-full flex justify-center bg-zinc-950/80 rounded-xl border border-zinc-800 p-3 overflow-auto min-h-[320px]">
            {isLoadingDoc && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 backdrop-blur-xs z-20">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}
            <canvas ref={canvasRef} className="block rounded shadow-lg max-w-full max-h-[460px] object-contain" />
          </div>

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
              onClick={handleApplyDeskew}
              disabled={isProcessing || isLoadingDoc}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Deskewing all document pages...'}</span>
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4 stroke-[2.5]" />
                  <span>Straighten Document ({angle > 0 ? `+${angle}°` : `${angle}°`})</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Document Straightened Successfully
              </div>
              <a
                href={downloadUrl}
                download={`deskewed_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
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