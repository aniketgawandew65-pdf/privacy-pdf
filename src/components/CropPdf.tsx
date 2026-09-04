import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Crop as CropIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { cropPDF, getPDFPageCount, type SnipBox } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface CropPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type DragMode = 'draw' | 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | null;

export const CropPdf: React.FC<CropPdfProps> = ({ file, onFileChange }) => {
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [applyToAll, setApplyToAll] = useState(false);

  // Crop box state per page (normalized 0 to 1)
  const [cropBoxes, setCropBoxes] = useState<Record<number, SnipBox>>({});

  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<any>(null);

  const dragModeRef = useRef<DragMode>(null);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialBoxRef = useRef<SnipBox | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const currentBox = cropBoxes[currentPage] || null;

  // Initialize PDF doc on selection
  useEffect(() => {
    if (!file) {
      setPageCount(0);
      setCurrentPage(1);
      setCropBoxes({});
      revokeDownloadUrl();
      pdfDocRef.current = null;
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const count = await getPDFPageCount(file);
        if (!isMounted) return;
        setPageCount(count);

        const buffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer).slice() }).promise;
        if (!isMounted) return;
        pdfDocRef.current = doc;
        renderCurrentPage();
      } catch (err: any) {
        console.error('PDF load error:', err);
        if (isMounted) setErrorMessage('Could not load PDF document.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // Render Page to Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const targetHeight = 520;
      const targetWidth = overlayRef.current?.parentElement?.clientWidth ? overlayRef.current.parentElement.clientWidth - 32 : 560;
      const scale = Math.min(targetWidth / unscaledViewport.width, targetHeight / unscaledViewport.height);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx as any, viewport } as any).promise;
      }
    } catch (err) {
      console.error('Render page error:', err);
    } finally {
      setIsLoadingPage(false);
    }
  }, [currentPage]);

  useEffect(() => {
    if (pdfDocRef.current) renderCurrentPage();
  }, [currentPage, renderCurrentPage]);

  // Helper coordinate getters
  const getCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clientY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, mode: DragMode) => {
    e.stopPropagation();
    dragModeRef.current = mode;
    const { x, y } = getCoords(e);
    startPosRef.current = { x, y };
    initialBoxRef.current = currentBox ? { ...currentBox } : null;

    if (mode === 'draw') {
      setCropBoxes((prev) => ({
        ...prev,
        [currentPage]: { x, y, width: 0.01, height: 0.01 },
      }));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragModeRef.current) return;
    const { x, y } = getCoords(e);
    const start = startPosRef.current;
    const init = initialBoxRef.current;

    setCropBoxes((prev) => {
      const mode = dragModeRef.current;
      let newBox: SnipBox = { x: 0, y: 0, width: 0, height: 0 };

      if (mode === 'draw') {
        newBox = {
          x: Math.min(start.x, x),
          y: Math.min(start.y, y),
          width: Math.abs(x - start.x),
          height: Math.abs(y - start.y),
        };
      } else if (mode === 'move' && init) {
        const dx = x - start.x;
        const dy = y - start.y;
        const newX = Math.max(0, Math.min(1 - init.width, init.x + dx));
        const newY = Math.max(0, Math.min(1 - init.height, init.y + dy));
        newBox = { ...init, x: newX, y: newY };
      } else if (init) {
        let { x: bx, y: by, width: bw, height: bh } = init;
        const dx = x - start.x;
        const dy = y - start.y;

        if (mode?.includes('e')) bw = Math.max(0.02, Math.min(1 - bx, init.width + dx));
        if (mode?.includes('s')) bh = Math.max(0.02, Math.min(1 - by, init.height + dy));
        if (mode?.includes('w')) {
          const right = init.x + init.width;
          const newLeft = Math.max(0, Math.min(right - 0.02, init.x + dx));
          bx = newLeft;
          bw = right - newLeft;
        }
        if (mode?.includes('n')) {
          const bottom = init.y + init.height;
          const newTop = Math.max(0, Math.min(bottom - 0.02, init.y + dy));
          by = newTop;
          bh = bottom - newTop;
        }
        newBox = { x: bx, y: by, width: bw, height: bh };
      }

      return { ...prev, [currentPage]: newBox };
    });
  };

  const handleMouseUp = () => {
    dragModeRef.current = null;
  };

  const handleResetCrop = () => {
    setCropBoxes((prev) => {
      const updated = { ...prev };
      delete updated[currentPage];
      return updated;
    });
  };

  const handleApplyCrop = async () => {
    if (!file || !currentBox) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const bytes = await cropPDF(file, cropBoxes, applyToAll, currentPage - 1);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Crop execution error:', err);
      setErrorMessage(err.message || 'Failed to crop document.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to crop"
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
          <CropIcon className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to crop</p>
          <p className="text-xs text-zinc-500 mt-1">Snip &amp; Whiteout outside area • 100% In-Browser</p>
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
          {/* File Header */}
          <div className="flex items-center justify-between p-3 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-semibold text-zinc-200 truncate">{file.name}</p>
                <p className="text-[11px] text-zinc-500">{pageCount} Pages • Draw a box around what you want to keep</p>
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

          {/* Page Controls */}
          <div className="flex items-center justify-between text-xs text-zinc-300 px-1">
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage} of {pageCount}</span>
              <button
                disabled={currentPage >= pageCount}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {currentBox && (
                <button
                  onClick={handleResetCrop}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-red-400 transition cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Box</span>
                </button>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                />
                <span>Apply to all {pageCount} pages</span>
              </label>
            </div>
          </div>

          {/* Interactive Document Viewport */}
          <div
            className="relative bg-zinc-950/80 rounded-xl border border-zinc-800 flex items-center justify-center p-2 overflow-hidden min-h-[300px]"
            onMouseUp={handleMouseUp}
          >
            {isLoadingPage && (
              <div className="absolute inset-0 bg-zinc-950/60 z-20 flex items-center justify-center backdrop-blur-xs">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}

            <div className="relative inline-block leading-none">
              <canvas ref={canvasRef} className="block rounded shadow-md max-h-[520px] w-auto h-auto object-contain pointer-events-none" />

              {/* Gesture Overlay */}
              <div
                ref={overlayRef}
                onMouseDown={(e) => handleMouseDown(e, 'draw')}
                onMouseMove={handleMouseMove}
                className="absolute inset-0 cursor-crosshair z-10"
              >
                {currentBox && currentBox.width > 0 && currentBox.height > 0 && (
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'move')}
                    className="absolute border-2 border-emerald-500 shadow-sm cursor-move"
                    style={{
                      left: `${currentBox.x * 100}%`,
                      top: `${currentBox.y * 100}%`,
                      width: `${currentBox.width * 100}%`,
                      height: `${currentBox.height * 100}%`,
                      backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    }}
                  >
                    {/* Corner & Edge Resize Grips (8-way) */}
                    <div onMouseDown={(e) => handleMouseDown(e, 'nw')} className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-nw-resize" />
                    <div onMouseDown={(e) => handleMouseDown(e, 'n')} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-n-resize" />
                    <div onMouseDown={(e) => handleMouseDown(e, 'ne')} className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-ne-resize" />
                    <div onMouseDown={(e) => handleMouseDown(e, 'e')} className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-e-resize" />
                    <div onMouseDown={(e) => handleMouseDown(e, 'se')} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-se-resize" />
                    <div onMouseDown={(e) => handleMouseDown(e, 's')} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-s-resize" />
                    <div onMouseDown={(e) => handleMouseDown(e, 'sw')} className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-sw-resize" />
                    <div onMouseDown={(e) => handleMouseDown(e, 'w')} className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-w-resize" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger */}
          {!downloadUrl ? (
            <button
              onClick={handleApplyCrop}
              disabled={isProcessing || !currentBox}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer text-xs shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cropping &amp; Blanking Rest...</span>
                </>
              ) : (
                <>
                  <CropIcon className="w-4 h-4 stroke-[2.5]" />
                  <span>Crop Selected Area &amp; Download</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Document Cropped Successfully
              </div>
              <a
                href={downloadUrl}
                download={`cropped_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Cropped PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};