import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SquareSlash,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { redactPDF, type PageRedaction, type RedactionRect } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface RedactPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const RedactPdf: React.FC<RedactPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [redactions, setRedactions] = useState<Record<number, RedactionRect[]>>({});
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragRect, setCurrentDragRect] = useState<RedactionRect | null>(null);

  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Load document and count pages
  useEffect(() => {
    if (!file) {
      setTotalPages(0);
      setCurrentPage(1);
      setRedactions({});
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
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        if (!isMounted) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error('Failed to load PDF:', err);
        if (isMounted) {
          setErrorMessage('Could not open PDF. The file may be password-protected or corrupted.');
        }
      } finally {
        if (isMounted) setIsLoadingPage(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // Render current page to canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const containerWidth = overlayRef.current?.parentElement?.clientWidth || 600;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = Math.min(1.5, Math.max(0.6, (containerWidth - 32) / unscaledViewport.width));
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;
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

  // Mouse interaction for drawing blackout rectangles
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
    setCurrentDragRect(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart) return;
    const current = getNormalizedCoords(e);
    const x = Math.min(drawStart.x, current.x);
    const y = Math.min(drawStart.y, current.y);
    const width = Math.abs(current.x - drawStart.x);
    const height = Math.abs(current.y - drawStart.y);

    setCurrentDragRect({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentDragRect) {
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentDragRect(null);
      return;
    }

    // Only commit if the box has meaningful dimensions (avoid tiny clicks)
    if (currentDragRect.width > 0.01 && currentDragRect.height > 0.01) {
      const pageIndex = currentPage - 1;
      setRedactions((prev) => ({
        ...prev,
        [pageIndex]: [...(prev[pageIndex] || []), currentDragRect],
      }));
    }

    setIsDrawing(false);
    setDrawStart(null);
    setCurrentDragRect(null);
  };

  const clearCurrentPageRedactions = () => {
    const pageIndex = currentPage - 1;
    setRedactions((prev) => {
      const next = { ...prev };
      delete next[pageIndex];
      return next;
    });
  };

  const handleApplyRedactions = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const payload: PageRedaction[] = Object.entries(redactions).map(([idxStr, rects]) => ({
        pageIndex: parseInt(idxStr, 10),
        rects,
      }));

      const bytes = await redactPDF(file, payload, (curr, total) => {
        setProgressText(`Burning redactions into page ${curr} of ${total}...`);
      });

      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Redaction failed:', err);
      setErrorMessage(err.message || 'Failed to redact PDF.');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setRedactions({});
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const currentPageRedactions = redactions[currentPage - 1] || [];
  const totalRedactionCount = Object.values(redactions).reduce((acc, list) => acc + list.length, 0);

  return (
    <div className="w-full max-w-3xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
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
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <SquareSlash className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to permanently redact text</p>
          <p className="text-xs text-zinc-500 mt-1">Draw blackout boxes to destroy sensitive text & rasterize</p>
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
                  {totalRedactionCount} total redaction{totalRedactionCount === 1 ? '' : 's'}
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

          {/* Page Toolbar */}
          <div className="flex items-center justify-between gap-2 p-2 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoadingPage}
                className="p-1.5 rounded-lg text-zinc-300 disabled:opacity-30 hover:bg-zinc-800 transition"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-zinc-300 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoadingPage}
                className="p-1.5 rounded-lg text-zinc-300 disabled:opacity-30 hover:bg-zinc-800 transition"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearCurrentPageRedactions}
                disabled={currentPageRedactions.length === 0}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-zinc-400 hover:text-red-400 disabled:opacity-30 transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear Page</span>
              </button>
            </div>
          </div>

          {/* Canvas & Interactive Redaction Overlay */}
          <div className="relative w-full flex justify-center bg-zinc-950/80 rounded-xl border border-zinc-800 p-2 overflow-auto select-none min-h-[350px]">
            {isLoadingPage && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 backdrop-blur-xs z-20">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}

            <div
              ref={overlayRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="relative cursor-crosshair inline-block"
            >
              <canvas ref={canvasRef} className="block rounded shadow-md" />

              {/* Persisted Blackout Rectangles for Current Page */}
              {currentPageRedactions.map((rect, idx) => (
                <div
                  key={idx}
                  className="absolute bg-black pointer-events-none border border-red-500/40"
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                  }}
                />
              ))}

              {/* Active Drawing Drag Rectangle */}
              {currentDragRect && (
                <div
                  className="absolute bg-black/80 border border-emerald-400 pointer-events-none"
                  style={{
                    left: `${currentDragRect.x * 100}%`,
                    top: `${currentDragRect.y * 100}%`,
                    width: `${currentDragRect.width * 100}%`,
                    height: `${currentDragRect.height * 100}%`,
                  }}
                />
              )}
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            Click & drag over text or numbers to draw a blackout box. Applied boxes are rasterized directly into the bitmap image layer.
          </p>

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
              onClick={handleApplyRedactions}
              disabled={isProcessing || totalRedactionCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{progressText || 'Burning redactions into PDF...'}</span>
                </>
              ) : (
                <>
                  <SquareSlash className="w-4 h-4 stroke-[2.5]" />
                  <span>Apply True Redactions ({totalRedactionCount})</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Redacted & Rasterized Successfully
              </div>
              <a
                href={downloadUrl}
                download={`redacted_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
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