import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { redactPDF, type RedactionRect, type PageRedaction } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface RedactPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const RedactPdf: React.FC<RedactPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageRedactions, setPageRedactions] = useState<Record<number, RedactionRect[]>>({});

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [activeRect, setActiveRect] = useState<RedactionRect | null>(null);

  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const currentRects = pageRedactions[currentPage] || [];

  useEffect(() => {
    if (!file) {
      setTotalPages(0);
      setCurrentPage(1);
      setPageRedactions({});
      revokeDownloadUrl();
      setErrorMessage(null);
      pdfDocRef.current = null;
      return;
    }

    let isMounted = true;
    setIsLoadingPage(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer).slice() }).promise;
        if (!isMounted) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        setPageRedactions({});
      } catch (err) {
        console.error('Redact doc load error:', err);
        if (isMounted) setErrorMessage('Failed to open PDF document.');
      } finally {
        if (isMounted) setIsLoadingPage(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // High-DPI 2.0x Retina rendering so fine text/numbers can be read clearly
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
      const targetWidth = overlayRef.current?.parentElement?.clientWidth ? overlayRef.current.parentElement.clientWidth - 32 : 560;
      const targetHeight = 560;
      const scale = Math.min(targetWidth / unscaledViewport.width, targetHeight / unscaledViewport.height) * dpr;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx as any, viewport } as any).promise;
      }
    } catch (err) {
      console.error('Page render error:', err);
    } finally {
      setIsLoadingPage(false);
    }
  }, [currentPage]);

  useEffect(() => {
    if (totalPages > 0) {
      renderCurrentPage();
    }
  }, [currentPage, totalPages, renderCurrentPage]);

  const getNormalizedCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLoadingPage || isProcessing || downloadUrl) return;
    const coords = getNormalizedCoords(e);
    setIsDrawing(true);
    setDrawStart(coords);
    setActiveRect({ x: coords.x, y: coords.y, width: 0.01, height: 0.01 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart) return;
    const current = getNormalizedCoords(e);
    const x = Math.min(drawStart.x, current.x);
    const y = Math.min(drawStart.y, current.y);
    const width = Math.abs(current.x - drawStart.x);
    const height = Math.abs(current.y - drawStart.y);
    setActiveRect({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (activeRect && activeRect.width > 0.01 && activeRect.height > 0.01) {
      setPageRedactions((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), activeRect],
      }));
    }
    setIsDrawing(false);
    setDrawStart(null);
    setActiveRect(null);
  };

  const handleResetCurrent = () => {
    setPageRedactions((prev) => {
      const next = { ...prev };
      delete next[currentPage];
      return next;
    });
  };

  const handleApplyRedactions = async () => {
    if (!file) return;

    const payload: PageRedaction[] = Object.entries(pageRedactions).map(([pNum, rects]) => ({
      pageIndex: parseInt(pNum, 10) - 1,
      rects,
    }));

    if (payload.length === 0) {
      setErrorMessage('Please draw at least one blackout rectangle to redact.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const bytes = await redactPDF(file, payload);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Redaction error:', err);
      setErrorMessage(err.message || 'Failed to redact PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalRedactionsCount = Object.values(pageRedactions).reduce((sum, r) => sum + r.length, 0);

  return (
    <div className="w-full max-w-2xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to redact"
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
          <ShieldAlert className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to permanently redact</p>
          <p className="text-xs text-zinc-500 mt-1">High-Definition View • Underlying Text Layer Destroyed</p>
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
        <div className="space-y-4 text-left select-none">
          <div className="flex items-center justify-between p-3 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-semibold text-zinc-200 truncate">{file.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {totalPages} Pages • {totalRedactionsCount} blackouts placed
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                onFileChange(null);
                revokeDownloadUrl();
              }}
              className="p-1 rounded text-zinc-400 hover:text-red-400 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-300 px-1">
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {currentRects.length > 0 && (
              <button
                onClick={handleResetCurrent}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-red-400 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear Page Blackouts</span>
              </button>
            )}
          </div>

          {/* High-DPI Canvas & Redaction Overlay */}
          <div className="relative bg-zinc-950/80 rounded-xl border border-zinc-800 flex items-center justify-center p-2 overflow-hidden min-h-[300px]">
            {isLoadingPage && (
              <div className="absolute inset-0 bg-zinc-950/60 z-20 flex items-center justify-center backdrop-blur-xs">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}

            <div className="relative inline-block leading-none">
              <canvas ref={canvasRef} className="block rounded shadow-md max-h-[520px] w-auto h-auto object-contain pointer-events-none" />

              <div
                ref={overlayRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="absolute inset-0 cursor-crosshair z-10"
              >
                {currentRects.map((r, i) => (
                  <div
                    key={i}
                    className="absolute bg-black border border-zinc-800 shadow-md"
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.width * 100}%`,
                      height: `${r.height * 100}%`,
                    }}
                  />
                ))}

                {activeRect && (
                  <div
                    className="absolute bg-black/80 border border-red-500"
                    style={{
                      left: `${activeRect.x * 100}%`,
                      top: `${activeRect.y * 100}%`,
                      width: `${activeRect.width * 100}%`,
                      height: `${activeRect.height * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            Click and drag across sensitive text or numbers to burn permanent blackout boxes.
          </p>

          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleApplyRedactions}
              disabled={isProcessing || totalRedactionsCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Permanently Redacting Document...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 stroke-[2.5]" />
                  <span>Burn Blackouts &amp; Download PDF</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Redacted Permanently
              </div>
              <a
                href={downloadUrl}
                download={`redacted_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Redacted PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};