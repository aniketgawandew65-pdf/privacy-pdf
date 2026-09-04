import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  Crop,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  Move,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

import { cropPDF, type CropBox } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface CropPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type DragMode = 'draw' | 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | null;
type ToolMode = 'crop' | 'pan';

export const CropPdf: React.FC<CropPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageBoxes, setPageBoxes] = useState<Record<number, CropBox>>({});
  const [applyToAll, setApplyToAll] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [toolMode, setToolMode] = useState<ToolMode>('crop');

  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; box?: CropBox } | null>(null);

  // Pan state
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const currentBox: CropBox | null = applyToAll
    ? pageBoxes[1] || pageBoxes[currentPage] || null
    : pageBoxes[currentPage] || null;

  useEffect(() => {
    if (!file) {
      setTotalPages(0);
      setCurrentPage(1);
      setPageBoxes({});
      setZoomLevel(1.0);
      setToolMode('crop');
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
        setPageBoxes({});
      } catch (err) {
        console.error('Failed to load PDF for cropping:', err);
        if (isMounted) {
          setErrorMessage('Could not open PDF. The document may be encrypted or damaged.');
        }
      } finally {
        if (isMounted) setIsLoadingPage(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const dpr = window.devicePixelRatio || 1;
      const scale = (600 / unscaledViewport.width) * dpr * zoomLevel;
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
  }, [currentPage, zoomLevel]);

  useEffect(() => {
    if (totalPages > 0) {
      renderCurrentPage();
    }
  }, [currentPage, totalPages, zoomLevel, renderCurrentPage]);

  const getNormalizedCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, mode: DragMode = 'draw') => {
    if (isLoadingPage || isProcessing || downloadUrl) return;

    if (toolMode === 'pan') {
      if (containerRef.current) {
        isPanningRef.current = true;
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          scrollLeft: containerRef.current.scrollLeft,
          scrollTop: containerRef.current.scrollTop,
        };
      }
      return;
    }

    e.stopPropagation();
    const coords = getNormalizedCoords(e);
    setDragMode(mode);
    setDragStart({ x: coords.x, y: coords.y, box: currentBox ? { ...currentBox } : undefined });

    if (mode === 'draw') {
      const newBox: CropBox = { x: coords.x, y: coords.y, width: 0.01, height: 0.01 };
      if (applyToAll) {
        const updated: Record<number, CropBox> = {};
        for (let i = 1; i <= totalPages; i++) updated[i] = newBox;
        setPageBoxes(updated);
      } else {
        setPageBoxes((prev) => ({ ...prev, [currentPage]: newBox }));
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode === 'pan') {
      if (isPanningRef.current && containerRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        containerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
        containerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
      }
      return;
    }

    if (!dragMode || !dragStart) return;
    const current = getNormalizedCoords(e);
    const dx = current.x - dragStart.x;
    const dy = current.y - dragStart.y;

    let newBox: CropBox;

    if (dragMode === 'draw') {
      const x = Math.min(dragStart.x, current.x);
      const y = Math.min(dragStart.y, current.y);
      const width = Math.abs(current.x - dragStart.x);
      const height = Math.abs(current.y - dragStart.y);
      newBox = { x, y, width, height };
    } else if (dragMode === 'move' && dragStart.box) {
      const init = dragStart.box;
      const x = Math.max(0, Math.min(1 - init.width, init.x + dx));
      const y = Math.max(0, Math.min(1 - init.height, init.y + dy));
      newBox = { ...init, x, y };
    } else if (dragStart.box) {
      const init = dragStart.box;
      let { x, y, width, height } = init;

      if (dragMode.includes('e')) width = Math.max(0.02, Math.min(1 - x, init.width + dx));
      if (dragMode.includes('s')) height = Math.max(0.02, Math.min(1 - y, init.height + dy));
      if (dragMode.includes('w')) {
        const right = init.x + init.width;
        const newX = Math.max(0, Math.min(right - 0.02, init.x + dx));
        x = newX;
        width = right - newX;
      }
      if (dragMode.includes('n')) {
        const bottom = init.y + init.height;
        const newY = Math.max(0, Math.min(bottom - 0.02, init.y + dy));
        y = newY;
        height = bottom - newY;
      }
      newBox = { x, y, width, height };
    } else {
      return;
    }

    if (applyToAll) {
      const updated: Record<number, CropBox> = {};
      for (let i = 1; i <= totalPages; i++) {
        updated[i] = newBox;
      }
      setPageBoxes(updated);
    } else {
      setPageBoxes((prev) => ({
        ...prev,
        [currentPage]: newBox,
      }));
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
    setDragMode(null);
    setDragStart(null);
    if (currentBox && (currentBox.width < 0.03 || currentBox.height < 0.03)) {
      handleResetCurrent();
    }
  };

  const handleResetCurrent = () => {
    if (applyToAll) {
      setPageBoxes({});
    } else {
      setPageBoxes((prev) => {
        const next = { ...prev };
        delete next[currentPage];
        return next;
      });
    }
  };

  const handleCrop = async () => {
    if (!file) return;

    const hasAnyBox = Object.keys(pageBoxes).length > 0;
    if (!hasAnyBox) {
      setErrorMessage('Please drag a box over at least one page to define a crop area.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const bytes = await cropPDF(file, pageBoxes, applyToAll);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Crop failed:', err);
      setErrorMessage(err.message || 'Failed to crop PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setPageBoxes({});
    setZoomLevel(1.0);
    setToolMode('crop');
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  const configuredPagesCount = Object.keys(pageBoxes).length;

  return (
    <div className="w-full max-w-3xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
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
            if (dropped && dropped.type === 'application/pdf') {
              onFileChange(dropped);
            }
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 focus:border-emerald-500 focus:outline-none transition-all rounded-xl p-8 text-center bg-zinc-950/40"
        >
          <Crop className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to crop margins</p>
          <p className="text-xs text-zinc-500 mt-1">Non-destructive vector trimming directly in browser</p>
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
        <div className="space-y-6 text-left select-none">
          {/* File Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {totalPages > 0 ? `${totalPages} Pages • ` : ''}
                  {configuredPagesCount > 0
                    ? `${configuredPagesCount} of ${totalPages} pages configured`
                    : 'Draw a box to crop'}
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
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoadingPage}
                className="p-1.5 rounded-lg text-zinc-300 disabled:opacity-30 hover:bg-zinc-800 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-zinc-300 px-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoadingPage}
                className="p-1.5 rounded-lg text-zinc-300 disabled:opacity-30 hover:bg-zinc-800 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Toggle & Zoom Slider */}
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setToolMode('crop')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                    toolMode === 'crop' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>Crop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setToolMode('pan')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                    toolMode === 'pan' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>Pan</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-zinc-400">{zoomLevel.toFixed(1)}x</span>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.2"
                  value={zoomLevel}
                  onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                  className="w-20 accent-emerald-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setApplyToAll(checked);
                    if (checked && currentBox) {
                      const updated: Record<number, CropBox> = {};
                      for (let i = 1; i <= totalPages; i++) updated[i] = currentBox;
                      setPageBoxes(updated);
                    }
                  }}
                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                />
                Apply to all {totalPages} pages
              </label>

              {currentBox && (
                <button
                  type="button"
                  onClick={handleResetCurrent}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-red-400 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{applyToAll ? 'Reset All' : 'Reset Box'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Canvas & Interactive Crop Overlay with 360-Degree Panning Workspace */}
          <div
            ref={containerRef}
            className={`relative w-full bg-zinc-950/80 rounded-xl border border-zinc-800 overflow-auto max-h-[600px] select-none ${
              toolMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            onMouseDown={(e) => handleMouseDown(e, 'draw')}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <div className="inline-block p-20 sm:p-32 min-w-full min-h-full">
              {isLoadingPage && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/60 backdrop-blur-xs z-20">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              )}

              <div ref={overlayRef} className={`relative inline-block ${toolMode === 'crop' ? 'cursor-crosshair' : ''}`}>
                <canvas ref={canvasRef} className="block rounded shadow-2xl w-auto h-auto object-contain pointer-events-none" />

                {/* Visual Crop Box Overlay with 8-way adjustable handles */}
                {currentBox && (
                  <>
                    <div
                      className="absolute inset-0 bg-black/50 pointer-events-none"
                      style={{
                        clipPath: `polygon(
                          0% 0%, 100% 0%, 100% 100%, 0% 100%,
                          0% ${currentBox.y * 100}%,
                          ${currentBox.x * 100}% ${currentBox.y * 100}%,
                          ${currentBox.x * 100}% ${(currentBox.y + currentBox.height) * 100}%,
                          ${(currentBox.x + currentBox.width) * 100}% ${(currentBox.y + currentBox.height) * 100}%,
                          ${(currentBox.x + currentBox.width) * 100}% ${currentBox.y * 100}%,
                          0% ${currentBox.y * 100}%
                        )`,
                      }}
                    />
                    <div
                      onMouseDown={(e) => {
                        if (toolMode === 'pan') return;
                        handleMouseDown(e, 'move');
                      }}
                      className="absolute border-2 border-emerald-400 shadow-lg cursor-move pointer-events-auto"
                      style={{
                        left: `${currentBox.x * 100}%`,
                        top: `${currentBox.y * 100}%`,
                        width: `${currentBox.width * 100}%`,
                        height: `${currentBox.height * 100}%`,
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                      }}
                    >
                      {/* 8-way resize grips */}
                      <div onMouseDown={(e) => handleMouseDown(e, 'nw')} className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-nw-resize" />
                      <div onMouseDown={(e) => handleMouseDown(e, 'n')} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-n-resize" />
                      <div onMouseDown={(e) => handleMouseDown(e, 'ne')} className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-ne-resize" />
                      <div onMouseDown={(e) => handleMouseDown(e, 'e')} className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-e-resize" />
                      <div onMouseDown={(e) => handleMouseDown(e, 'se')} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-se-resize" />
                      <div onMouseDown={(e) => handleMouseDown(e, 's')} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-s-resize" />
                      <div onMouseDown={(e) => handleMouseDown(e, 'sw')} className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-sw-resize" />
                      <div onMouseDown={(e) => handleMouseDown(e, 'w')} className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-emerald-400 border border-black rounded-xs cursor-w-resize" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            {toolMode === 'pan'
              ? 'Hand Pan Mode Active: Click and drag anywhere to slide the zoomed view in any direction.'
              : 'Crop Mode Active: Click and drag to draw a box, or use handles to resize.'}
          </p>

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
              onClick={handleCrop}
              disabled={isProcessing || configuredPagesCount === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/25 cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cropping document...</span>
                </>
              ) : (
                <>
                  <Crop className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {applyToAll
                      ? `Crop All ${totalPages} Pages`
                      : `Apply Crop (${configuredPagesCount} page${configuredPagesCount === 1 ? '' : 's'} configured)`}
                  </span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Cropped Successfully (Original Quality Preserved)
              </div>
              <a
                href={downloadUrl}
                download={`cropped_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/25"
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