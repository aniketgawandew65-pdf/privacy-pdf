import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2,
  FileText,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  SplitSquareVertical,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';


if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  
}

type DiffViewMode = 'overlay' | 'split';

export const ComparePdf: React.FC = () => {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  const [pdfDocA, setPdfDocA] = useState<any>(null);
  const [pdfDocB, setPdfDocB] = useState<any>(null);

  const [pageCountA, setPageCountA] = useState(0);
  const [pageCountB, setPageCountB] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [viewMode, setViewMode] = useState<DiffViewMode>('overlay');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);

  // Smooth zoom state with fine-grain control
  const [zoom, setZoom] = useState<number>(100);

  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasSplitARef = useRef<HTMLCanvasElement>(null);
  const canvasSplitBRef = useRef<HTMLCanvasElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Fine 5% step increments
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 5, 250));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 5, 50));
  const handleResetZoom = () => setZoom(100);

  // Load Document A
  useEffect(() => {
    if (!fileA) {
      setPdfDocA(null);
      setPageCountA(0);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        setErrorMessage(null);
        const buffer = await fileA.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ isEvalSupported: false, data: new Uint8Array(buffer) }).promise;
        if (!isMounted) return;
        setPdfDocA(doc);
        setPageCountA(doc.numPages);
      } catch (err: any) {
        console.error('Failed to load Document A:', err);
        if (isMounted) setErrorMessage(err.message || 'Failed to open Document A.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [fileA]);

  // Load Document B
  useEffect(() => {
    if (!fileB) {
      setPdfDocB(null);
      setPageCountB(0);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        setErrorMessage(null);
        const buffer = await fileB.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ isEvalSupported: false, data: new Uint8Array(buffer) }).promise;
        if (!isMounted) return;
        setPdfDocB(doc);
        setPageCountB(doc.numPages);
      } catch (err: any) {
        console.error('Failed to load Document B:', err);
        if (isMounted) setErrorMessage(err.message || 'Failed to open Document B.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [fileB]);

  const maxPages = Math.max(pageCountA, pageCountB);

  // Render Diff Canvas
  const renderComparison = useCallback(async () => {
    if (!pdfDocA || !pdfDocB) return;
    setIsRendering(true);
    setErrorMessage(null);

    try {
      const pageA = currentPage <= pageCountA ? await pdfDocA.getPage(currentPage) : null;
      const pageB = currentPage <= pageCountB ? await pdfDocB.getPage(currentPage) : null;

      const scale = 1.4;
      const viewportA = pageA ? pageA.getViewport({ scale }) : null;
      const viewportB = pageB ? pageB.getViewport({ scale }) : null;

      const renderWidth = Math.max(viewportA?.width || 0, viewportB?.width || 0);
      const renderHeight = Math.max(viewportA?.height || 0, viewportB?.height || 0);

      if (viewMode === 'split') {
        if (canvasSplitARef.current && pageA && viewportA) {
          const canvasA = canvasSplitARef.current;
          canvasA.width = viewportA.width;
          canvasA.height = viewportA.height;
          const ctxA = canvasA.getContext('2d');
          if (ctxA) {
            await pageA.render({ canvasContext: ctxA, viewport: viewportA }).promise;
          }
        }

        if (canvasSplitBRef.current && pageB && viewportB) {
          const canvasB = canvasSplitBRef.current;
          canvasB.width = viewportB.width;
          canvasB.height = viewportB.height;
          const ctxB = canvasB.getContext('2d');
          if (ctxB) {
            await pageB.render({ canvasContext: ctxB, viewport: viewportB }).promise;
          }
        }
      } else {
        if (canvasOverlayRef.current) {
          const mainCanvas = canvasOverlayRef.current;
          mainCanvas.width = renderWidth;
          mainCanvas.height = renderHeight;
          const mainCtx = mainCanvas.getContext('2d');
          if (!mainCtx) return;

          mainCtx.fillStyle = '#FFFFFF';
          mainCtx.fillRect(0, 0, renderWidth, renderHeight);

          const offCanvasA = document.createElement('canvas');
          offCanvasA.width = renderWidth;
          offCanvasA.height = renderHeight;
          const ctxA = offCanvasA.getContext('2d');

          if (ctxA && pageA && viewportA) {
            await pageA.render({ canvasContext: ctxA, viewport: viewportA }).promise;
          }

          const offCanvasB = document.createElement('canvas');
          offCanvasB.width = renderWidth;
          offCanvasB.height = renderHeight;
          const ctxB = offCanvasB.getContext('2d');

          if (ctxB && pageB && viewportB) {
            await pageB.render({ canvasContext: ctxB, viewport: viewportB }).promise;
          }

          mainCtx.globalAlpha = 1.0;
          mainCtx.drawImage(offCanvasA, 0, 0);

          mainCtx.globalCompositeOperation = 'difference';
          mainCtx.globalAlpha = overlayOpacity;
          mainCtx.drawImage(offCanvasB, 0, 0);

          mainCtx.globalCompositeOperation = 'source-over';
          mainCtx.globalAlpha = 1.0;

          offCanvasA.width = 0;
          offCanvasA.height = 0;
          offCanvasB.width = 0;
          offCanvasB.height = 0;
        }
      }
    } catch (err: any) {
      console.error('Diff render error:', err);
      setErrorMessage(err.message || 'Error rendering document comparison.');
    } finally {
      setIsRendering(false);
    }
  }, [pdfDocA, pdfDocB, currentPage, pageCountA, pageCountB, viewMode, overlayOpacity]);

  useEffect(() => {
    if (pdfDocA && pdfDocB) {
      renderComparison();
    }
  }, [renderComparison, pdfDocA, pdfDocB]);

  return (
    <div className="w-full max-w-5xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {/* Document Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Document A Upload Box */}
        <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 text-left relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400">Document A (Original)</span>
            {fileA && (
              <button
                onClick={() => setFileA(null)}
                className="p-1 rounded text-zinc-400 hover:text-red-400 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {!fileA ? (
            <button
              onClick={() => fileInputARef.current?.click()}
              className="w-full py-6 border-2 border-dashed border-zinc-800 hover:border-rose-500/50 rounded-lg text-center transition flex flex-col items-center gap-1.5"
            >
              <FileText className="w-6 h-6 text-rose-400 stroke-[1.5]" />
              <span className="text-xs text-zinc-300 font-medium">Select Original PDF</span>
              <span className="text-[10px] text-zinc-500">Base revision</span>
            </button>
          ) : (
            <div className="truncate py-2">
              <p className="text-xs font-semibold text-zinc-200 truncate">{fileA.name}</p>
              <p className="text-[11px] text-zinc-500">{pageCountA} pages • {Math.round(fileA.size / 1024)} KB</p>
            </div>
          )}
          <input
            ref={fileInputARef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFileA(f);
              e.target.value = '';
            }}
          />
        </div>

        {/* Document B Upload Box */}
        <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 text-left relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Document B (Modified)</span>
            {fileB && (
              <button
                onClick={() => setFileB(null)}
                className="p-1 rounded text-zinc-400 hover:text-red-400 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {!fileB ? (
            <button
              onClick={() => fileInputBRef.current?.click()}
              className="w-full py-6 border-2 border-dashed border-zinc-800 hover:border-emerald-500/50 rounded-lg text-center transition flex flex-col items-center gap-1.5"
            >
              <FileText className="w-6 h-6 text-emerald-400 stroke-[1.5]" />
              <span className="text-xs text-zinc-300 font-medium">Select Modified PDF</span>
              <span className="text-[10px] text-zinc-500">New revision to compare</span>
            </button>
          ) : (
            <div className="truncate py-2">
              <p className="text-xs font-semibold text-zinc-200 truncate">{fileB.name}</p>
              <p className="text-[11px] text-zinc-500">{pageCountB} pages • {Math.round(fileB.size / 1024)} KB</p>
            </div>
          )}
          <input
            ref={fileInputBRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFileB(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Comparison Canvas & Controls */}
      {fileA && fileB && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-950/70 rounded-xl border border-zinc-800">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <button
                type="button"
                onClick={() => setViewMode('overlay')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === 'overlay'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Pixel Overlay Diff</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === 'split'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>Side by Side</span>
              </button>
            </div>

            {/* Page Navigation */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1 || isRendering}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-zinc-300">
                Page {currentPage} of {maxPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= maxPages || isRendering}
                onClick={() => setCurrentPage((p) => Math.min(maxPages, p + 1))}
                className="p-1.5 rounded-lg text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* User-Controlled Smooth Zoom (Slider + 5% Fine Step Buttons) */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 50}
                className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 rounded hover:bg-zinc-800 transition"
                title="Zoom Out (-5%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <input
                type="range"
                min="50"
                max="250"
                step="5"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-20 sm:w-24 accent-emerald-400 cursor-pointer"
                title="Drag to zoom continuously"
              />

              <span className="text-xs font-mono font-medium text-zinc-300 min-w-[3rem] text-center select-none">
                {zoom}%
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 250}
                className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 rounded hover:bg-zinc-800 transition"
                title="Zoom In (+5%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition"
                title="Reset Zoom to 100%"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Difference Opacity Slider for Overlay mode */}
            {viewMode === 'overlay' && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Blend:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                  className="w-20 accent-emerald-400 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Render Area: 4-Way Panning with Zero Left-Clipping */}
          <div className="relative min-h-[450px] max-h-[78vh] bg-zinc-950 rounded-xl border border-zinc-800 overflow-auto p-6">
            {isRendering && (
              <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-xs flex items-center justify-center z-20">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}

            {/* Layout Scaffolding: Keeps content in positive coordinates so left side never clips */}
            <div
              className="flex items-start transition-all duration-150 ease-out"
              style={{
                width: zoom > 100 ? `${zoom}%` : '100%',
                minWidth: '100%',
                justifyContent: zoom > 100 ? 'flex-start' : 'center',
                paddingRight: zoom > 100 ? '2rem' : undefined,
                paddingBottom: zoom > 100 ? '3rem' : undefined,
              }}
            >
              <div
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: zoom > 100 ? 'top left' : 'top center',
                }}
                className="transition-transform duration-150 ease-out w-full flex justify-center shrink-0"
              >
                {viewMode === 'overlay' ? (
                  <div className="flex flex-col items-center gap-2">
                    <canvas ref={canvasOverlayRef} className="rounded shadow-xl max-w-full border border-zinc-800" />
                    <p className="text-[11px] text-zinc-500">
                      Identical elements appear white/inverted; shifts, additions, and edits highlight in high-contrast color.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Document A</span>
                      <canvas ref={canvasSplitARef} className="rounded shadow-md max-w-full border border-zinc-800 bg-white" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Document B</span>
                      <canvas ref={canvasSplitBRef} className="rounded shadow-md max-w-full border border-zinc-800 bg-white" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};