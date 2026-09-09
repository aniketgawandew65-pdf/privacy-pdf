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
  ZoomIn,
  ZoomOut,
  Trash2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { redactPDF, type RedactionRect, type PageRedaction } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface RedactPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  mode: 'draw' | 'move' | 'resize';
  handle?: ResizeHandle;
  startX: number;
  startY: number;
  initialRect: RedactionRect;
  index?: number;
}

export const RedactPdf: React.FC<RedactPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1); 
  const [redactMode, setRedactMode] = useState<"draw" | "pan">("draw");
  const [pageRedactions, setPageRedactions] = useState<Record<number, RedactionRect[]>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({
    width: 560,
    height: 792,
  });

  const [activeDrawRect, setActiveDrawRect] = useState<RedactionRect | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  const currentRects = pageRedactions[currentPage] || [];

  // Reset state when file changes
  useEffect(() => {
    if (!file) {
      setTotalPages(0);
      setCurrentPage(1);
      setPageRedactions({});
      setSelectedIndex(null);
      setZoomLevel(1.0);
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
        setSelectedIndex(null);
      } catch (err) {
        console.error('Redact doc load error:', err);
        if (isMounted) setErrorMessage((err as any)?.message || String(err));
      } finally {
        if (isMounted) setIsLoadingPage(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // Render current page: canvas scales with zoomLevel so 250% actually enlarges the document
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const baseWidth = 560;
      const aspectRatio = unscaledViewport.height / unscaledViewport.width;
      const baseHeight = Math.round(baseWidth * aspectRatio);
      setPageDimensions({ width: baseWidth, height: baseHeight });

      const dpr = Math.max(window.devicePixelRatio || 1, 2.0);
      const renderScale = (baseWidth / unscaledViewport.width) * dpr * zoomLevel;
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvasContext: ctx as any,
          viewport,
          annotationMode: (pdfjsLib as any).AnnotationMode?.ENABLE ?? 2,
        } as any).promise;
      }
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

  // Normalized coordinate helper [0.0 - 1.0]
  const getNormalizedCoords = useCallback((clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  // Keyboard controls: Arrow keys to nudge, Delete/Backspace to remove selected box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      const rects = pageRedactions[currentPage] || [];
      if (selectedIndex < 0 || selectedIndex >= rects.length) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setPageRedactions((prev) => {
          const updated = [...(prev[currentPage] || [])];
          updated.splice(selectedIndex, 1);
          return { ...prev, [currentPage]: updated };
        });
        setSelectedIndex(null);
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.005;

        setPageRedactions((prev) => {
          const updated = [...(prev[currentPage] || [])];
          const target = { ...updated[selectedIndex] };

          if (e.key === 'ArrowUp') target.y = Math.max(0, target.y - step);
          if (e.key === 'ArrowDown') target.y = Math.min(1 - target.height, target.y + step);
          if (e.key === 'ArrowLeft') target.x = Math.max(0, target.x - step);
          if (e.key === 'ArrowRight') target.x = Math.min(1 - target.width, target.x + step);

          updated[selectedIndex] = target;
          return { ...prev, [currentPage]: updated };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, currentPage, pageRedactions]);

  // Global mouse handlers for drawing, moving, and 8-point resizing
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const current = getNormalizedCoords(e.clientX, e.clientY);
      const dx = current.x - state.startX;
      const dy = current.y - state.startY;

      if (state.mode === 'draw') {
        const x = Math.min(state.startX, current.x);
        const y = Math.min(state.startY, current.y);
        const width = Math.abs(current.x - state.startX);
        const height = Math.abs(current.y - state.startY);
        setActiveDrawRect({ x, y, width, height });
      } else if (state.mode === 'move' && state.index !== undefined) {
        const initial = state.initialRect;
        const nextX = Math.max(0, Math.min(1 - initial.width, initial.x + dx));
        const nextY = Math.max(0, Math.min(1 - initial.height, initial.y + dy));

        setPageRedactions((prev) => {
          const updated = [...(prev[currentPage] || [])];
          updated[state.index!] = { ...initial, x: nextX, y: nextY };
          return { ...prev, [currentPage]: updated };
        });
      } else if (state.mode === 'resize' && state.index !== undefined && state.handle) {
        const initial = state.initialRect;
        const handle = state.handle;
        const minDim = 0.008;

        let { x, y, width, height } = initial;

        if (handle.includes('e')) {
          width = Math.max(minDim, Math.min(1 - x, initial.width + dx));
        }
        if (handle.includes('s')) {
          height = Math.max(minDim, Math.min(1 - y, initial.height + dy));
        }
        if (handle.includes('w')) {
          const rightEdge = initial.x + initial.width;
          const newX = Math.max(0, Math.min(rightEdge - minDim, initial.x + dx));
          x = newX;
          width = rightEdge - newX;
        }
        if (handle.includes('n')) {
          const bottomEdge = initial.y + initial.height;
          const newY = Math.max(0, Math.min(bottomEdge - minDim, initial.y + dy));
          y = newY;
          height = bottomEdge - newY;
        }

        setPageRedactions((prev) => {
          const updated = [...(prev[currentPage] || [])];
          updated[state.index!] = { x, y, width, height };
          return { ...prev, [currentPage]: updated };
        });
      }
    };

    const handleWindowMouseUp = () => {
      const state = dragStateRef.current;
      if (!state) return;

      if (state.mode === 'draw' && activeDrawRect) {
        if (activeDrawRect.width > 0.01 && activeDrawRect.height > 0.01) {
          setPageRedactions((prev) => {
            const list = prev[currentPage] || [];
            return {
              ...prev,
              [currentPage]: [...list, activeDrawRect],
            };
          });
          setSelectedIndex((prev) => (prev !== null ? prev : (pageRedactions[currentPage] || []).length));
        }
      }

      dragStateRef.current = null;
      setActiveDrawRect(null);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("pointermove", handleWindowMouseMove as any);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("pointerup", handleWindowMouseUp as any);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
    window.removeEventListener("pointermove", handleWindowMouseMove as any);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    window.removeEventListener("pointerup", handleWindowMouseUp as any);
    };
  }, [getNormalizedCoords, activeDrawRect, currentPage, pageRedactions]);

  const handleOverlayMouseDown = (e: any) => {
    if (isLoadingPage || isProcessing || downloadUrl) return;
    const coords = getNormalizedCoords(e.clientX, e.clientY);
    setSelectedIndex(null);

    dragStateRef.current = {
      mode: 'draw',
      startX: coords.x,
      startY: coords.y,
      initialRect: { x: coords.x, y: coords.y, width: 0, height: 0 },
    };
    setActiveDrawRect({ x: coords.x, y: coords.y, width: 0.005, height: 0.005 });
  };

  const handleBoxMouseDown = (e: any, index: number) => {
    e.stopPropagation();
    if (isLoadingPage || isProcessing || downloadUrl) return;

    setSelectedIndex(index);
    const coords = getNormalizedCoords(e.clientX, e.clientY);
    const rect = currentRects[index];

    dragStateRef.current = {
      mode: 'move',
      startX: coords.x,
      startY: coords.y,
      initialRect: { ...rect },
      index,
    };
  };

  const handleResizeStart = (e: any, index: number, handle: ResizeHandle) => {
    e.stopPropagation();
    if (isLoadingPage || isProcessing || downloadUrl) return;

    setSelectedIndex(index);
    const coords = getNormalizedCoords(e.clientX, e.clientY);
    const rect = currentRects[index];

    dragStateRef.current = {
      mode: 'resize',
      handle,
      startX: coords.x,
      startY: coords.y,
      initialRect: { ...rect },
      index,
    };
  };

  const handleResetCurrent = () => {
    setPageRedactions((prev) => {
      const next = { ...prev };
      delete next[currentPage];
      return next;
    });
    setSelectedIndex(null);
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

  // Exact rendered dimensions driving authentic zoom
  const displayWidth = Math.round(pageDimensions.width * zoomLevel);
  const displayHeight = Math.round(pageDimensions.height * zoomLevel);

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
          {/* File Card */}
          <div className="flex items-center justify-between p-3 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-xs font-semibold text-zinc-200 truncate">{file.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {totalPages} Pages • {totalRedactionsCount} blackout{totalRedactionsCount !== 1 ? 's' : ''} placed
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

          {/* Page Switcher & Reset Controls */}
          <div className="flex items-center justify-between text-xs text-zinc-300 px-1">
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => {
                  setCurrentPage((p) => p - 1);
                  setSelectedIndex(null);
                }}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setCurrentPage((p) => p + 1);
                  setSelectedIndex(null);
                }}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          {/* Mobile Draw / Pan Toggle */}
          <div className="flex items-center bg-zinc-800 p-1 rounded-lg border border-zinc-700 mx-2">
            <button
              type="button"
              onClick={() => setRedactMode("draw")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${redactMode === "draw" ? "bg-emerald-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}
            >
              ⬛ Draw
            </button>
            <button
              type="button"
              onClick={() => setRedactMode("pan")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${redactMode === "pan" ? "bg-emerald-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}
            >
              ✋ Pan
            </button>
          </div>


            <div className="flex items-center gap-3">
              {selectedIndex !== null && currentRects[selectedIndex] && (
                <button
                  type="button"
                  onClick={() => {
                    setPageRedactions((prev) => {
                      const updated = [...(prev[currentPage] || [])];
                      updated.splice(selectedIndex, 1);
                      return { ...prev, [currentPage]: updated };
                    });
                    setSelectedIndex(null);
                  }}
                  className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 transition cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Box</span>
                </button>
              )}

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
          </div>

          {/* Outer Viewport Frame: Fixed relative wrapper */}
          <div className="relative bg-zinc-950/80 rounded-xl border border-zinc-800 overflow-hidden shadow-inner">
            {isLoadingPage && (
              <div className="absolute inset-0 bg-zinc-950/60 z-40 flex items-center justify-center backdrop-blur-xs">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}

            {/* Scrollable Viewport with generous padding for full 2D movement */}
            <div
              ref={viewportContainerRef}
              className="overflow-auto min-h-[420px] max-h-[620px] p-8 sm:p-16 text-center"
            >
              {/* Centered Document Wrapper */}
              <div
                style={{
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                }}
                className="relative inline-block text-left shadow-2xl bg-white rounded-xs align-middle"
              >
                <canvas
                  ref={canvasRef}
                  style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
                  className="block rounded-xs pointer-events-none"
                />

                <div
                  ref={overlayRef}
                  style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
                  onPointerDown={handleOverlayMouseDown}
                  className={`absolute inset-0 ${redactMode === "draw" ? "cursor-crosshair touch-none z-20" : "pointer-events-none z-0"}`}
                >
                  {currentRects.map((r, i) => {
                    const isSelected = selectedIndex === i;
                    return (
                      <div
                        key={i}
                        onPointerDown={(e) => handleBoxMouseDown(e, i)}
                        className={`absolute bg-black transition-shadow cursor-move ${
                          isSelected ? 'ring-2 ring-emerald-400 shadow-xl z-30' : 'border border-zinc-700 shadow-md z-20'
                        }`}
                        style={{
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          width: `${r.width * 100}%`,
                          height: `${r.height * 100}%`,
                        }}
                      >
                        {/* 8-Side Resize Anchors */}
                        {isSelected && (
                          <>
                            {/* NW (Top-Left) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 'nw')}
                              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-nwse-resize z-40"
                            />
                            {/* N (Top-Center) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 'n')}
                              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-ns-resize z-40"
                            />
                            {/* NE (Top-Right) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 'ne')}
                              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-nesw-resize z-40"
                            />
                            {/* E (Middle-Right) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 'e')}
                              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-ew-resize z-40"
                            />
                            {/* SE (Bottom-Right) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 'se')}
                              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-nwse-resize z-40"
                            />
                            {/* S (Bottom-Center) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 's')}
                              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-ns-resize z-40"
                            />
                            {/* SW (Bottom-Left) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 'sw')}
                              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-nesw-resize z-40"
                            />
                            {/* W (Middle-Left) */}
                            <div
                              onPointerDown={(e) => handleResizeStart(e, i, 'w')}
                              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border-2 border-emerald-500 rounded-xs cursor-ew-resize z-40"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Active Draw Rect Preview */}
                  {activeDrawRect && (
                    <div
                      className="absolute bg-black/80 border border-emerald-400 pointer-events-none z-30"
                      style={{
                        left: `${activeDrawRect.x * 100}%`,
                        top: `${activeDrawRect.y * 100}%`,
                        width: `${activeDrawRect.width * 100}%`,
                        height: `${activeDrawRect.height * 100}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Floating Zoom Bar pinned to bottom-right corner */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-700/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow-2xl z-30">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.75, parseFloat((z - 0.25).toFixed(2))))}
                disabled={zoomLevel <= 0.75}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1.0)}
                className="text-[11px] font-mono font-medium text-zinc-300 hover:text-emerald-400 min-w-[42px] text-center transition cursor-pointer px-1 py-0.5 rounded hover:bg-zinc-800/60"
                title="Reset to 100%"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(2.5, parseFloat((z + 0.25).toFixed(2))))}
                disabled={zoomLevel >= 2.5}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            Click &amp; drag to draw • Hold &amp; drag box to reposition • Drag 8 handles to resize • Arrow keys to nudge • Delete key to remove.
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