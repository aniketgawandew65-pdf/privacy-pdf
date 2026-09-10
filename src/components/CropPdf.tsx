import React, { useState, useRef, useEffect } from "react";
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
  ZoomIn,
  ZoomOut,
  Move
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropPdfProps {
  file?: File | null;
  onFileChange?: (file: File | null) => void;
}

export const CropPdf: React.FC<CropPdfProps> = ({ file: propFile, onFileChange }) => {
  const [internalFile, setInternalFile] = useState<File | null>(null);
  const file = propFile !== undefined ? propFile : internalFile;

  const setFile = (newFile: File | null) => {
    if (onFileChange) {
      onFileChange(newFile);
    } else {
      setInternalFile(newFile);
    }
  };

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [mode, setMode] = useState<"crop" | "pan">("crop");
  const [applyToAll, setApplyToAll] = useState<boolean>(false);
  const [crops, setCrops] = useState<Record<number, CropArea>>({});
  const [cropBox, setCropBox] = useState<CropArea | null>({ x: 25, y: 25, width: 250, height: 340 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load PDF file
  useEffect(() => {
    if (!file) return;
    let isMounted = true;
    const loadPdf = async () => {
      try {
        setError(null);
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        if (!isMounted) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setCrops({});
        setCropBox({ x: 25, y: 25, width: 250, height: 340 });
      } catch (err: any) {
        if (isMounted) setError("Failed to load PDF file: " + err.message);
      }
    };
    loadPdf();
    return () => { isMounted = false; };
  }, [file]);

  // Render current page to canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let renderTask: any = null;
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const container = containerRef.current;
        const padding = 32;
        const availW = Math.max(200, (container ? container.clientWidth : window.innerWidth) - padding);
        const availH = Math.max(300, (container ? container.clientHeight : window.innerHeight * 0.65) - padding);
        const unscaled = page.getViewport({ scale: 1.0 });
        const fitScale = Math.min(availW / unscaled.width, availH / unscaled.height);
        const activeScale = Math.max(0.1, fitScale) * zoom;
        const viewport = page.getViewport({ scale: activeScale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (_) {}
    };
    renderPage();
    return () => { if (renderTask) renderTask.cancel(); };
  }, [pdfDoc, currentPage, zoom]);

  // Lock container scroll engine completely during Crop mode
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (mode === "crop") {
      el.style.overflow = "hidden";
      el.style.touchAction = "none";
    } else {
      el.style.overflow = "auto";
      el.style.touchAction = "pan-x pan-y";
    }
    const blockTouch = (e: TouchEvent) => {
      if (mode === "crop" && e.cancelable) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", blockTouch, { passive: false });
    return () => el.removeEventListener("touchmove", blockTouch);
  }, [mode]);

  // Sync cropBox when navigating pages
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > numPages) return;
    if (cropBox) {
      setCrops((prev) => ({ ...prev, [currentPage]: cropBox }));
    }
    setCurrentPage(newPage);
    if (!applyToAll && crops[newPage]) {
      setCropBox(crops[newPage]);
    }
  };

  // 8-Handle Move Handler
  const handleBoxPointerDown = (e: any) => {
    e.stopPropagation();
    if (!cropBox) return;
    const startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const startY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const initBox = { ...cropBox };

    const onMove = (me: any) => {
      if (me.cancelable) me.preventDefault();
      const curX = me.clientX ?? (me.touches && me.touches[0]?.clientX) ?? startX;
      const curY = me.clientY ?? (me.touches && me.touches[0]?.clientY) ?? startY;
      const canvasEl = canvasRef.current;
      const maxW = canvasEl ? (canvasEl.clientWidth || canvasEl.width) : 2000;
      const maxH = canvasEl ? (canvasEl.clientHeight || canvasEl.height) : 2000;

      const nextX = Math.max(0, Math.min(maxW - initBox.width, initBox.x + (curX - startX)));
      const nextY = Math.max(0, Math.min(maxH - initBox.height, initBox.y + (curY - startY)));
      setCropBox((prev) => (prev ? { ...prev, x: nextX, y: nextY } : null));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  // 8-Handle Resize Handler
  const handleHandlePointerDown = (e: any, handle: string) => {
    e.stopPropagation();
    if (!cropBox) return;
    const startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const startY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const initBox = { ...cropBox };

    const onMove = (me: any) => {
      if (me.cancelable) me.preventDefault();
      const curX = me.clientX ?? (me.touches && me.touches[0]?.clientX) ?? startX;
      const curY = me.clientY ?? (me.touches && me.touches[0]?.clientY) ?? startY;
      const dx = curX - startX;
      const dy = curY - startY;

      const canvasEl = canvasRef.current;
      const maxW = canvasEl ? (canvasEl.clientWidth || canvasEl.width) : 2000;
      const maxH = canvasEl ? (canvasEl.clientHeight || canvasEl.height) : 2000;

      let x = initBox.x;
      let y = initBox.y;
      let w = initBox.width;
      let h = initBox.height;

      if (handle.includes("w")) {
        const newW = Math.max(30, initBox.width - dx);
        const newX = initBox.x + (initBox.width - newW);
        if (newX >= 0) { x = newX; w = newW; }
      }
      if (handle.includes("e")) {
        w = Math.max(30, Math.min(maxW - x, initBox.width + dx));
      }
      if (handle.includes("n")) {
        const newH = Math.max(30, initBox.height - dy);
        const newY = initBox.y + (initBox.height - newH);
        if (newY >= 0) { y = newY; h = newH; }
      }
      if (handle.includes("s")) {
        h = Math.max(30, Math.min(maxH - y, initBox.height + dy));
      }

      setCropBox({ x, y, width: w, height: h });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  // Export cropped PDF with physical MediaBox resizing
  const handleDownload = async () => {
    if (!file || !cropBox) return;
    setIsProcessing(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const pages = pdf.getPages();

      const canvasEl = canvasRef.current;
      const dispW = canvasEl ? (canvasEl.clientWidth || canvasEl.width || 600) : 600;
      const dispH = canvasEl ? (canvasEl.clientHeight || canvasEl.height || 800) : 800;

      pages.forEach((page, i) => {
        const pageIdx = i + 1;
        const targetCrop = applyToAll ? cropBox : (crops[pageIdx] || (pageIdx === currentPage ? cropBox : null));
        if (!targetCrop) return;

        const mediaBox = page.getMediaBox();
        const originX = mediaBox.x || 0;
        const originY = mediaBox.y || 0;
        const pageWidth = mediaBox.width || page.getWidth();
        const pageHeight = mediaBox.height || page.getHeight();

        const fracX = Math.max(0, targetCrop.x / dispW);
        const fracY = Math.max(0, targetCrop.y / dispH);
        const fracW = Math.min(1 - fracX, targetCrop.width / dispW);
        const fracH = Math.min(1 - fracY, targetCrop.height / dispH);

        const pdfCropX = originX + fracX * pageWidth;
        const pdfCropW = Math.max(10, fracW * pageWidth);
        const pdfCropH = Math.max(10, fracH * pageHeight);
        const pdfCropY = originY + (pageHeight - (fracY + fracH) * pageHeight);

        page.setMediaBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        page.setCropBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        page.setBleedBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        page.setTrimBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
      });

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      setError("Failed to crop PDF: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 text-white space-y-6 select-none">
      {!file && (
        <div className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-2xl p-10 text-center transition cursor-pointer bg-zinc-900/30">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
            className="hidden"
            id="crop-upload"
          />
          <label htmlFor="crop-upload" className="cursor-pointer flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 flex items-center justify-center text-zinc-400">
              <CropIcon className="w-7 h-7" />
            </div>
            <span className="text-base font-medium text-zinc-200">Select PDF to Crop</span>
            <span className="text-xs text-zinc-500">100% In-Browser Privacy Protection</span>
          </label>
        </div>
      )}

      {file && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="truncate text-sm">
                <span className="text-zinc-200 font-medium">{file.name}</span>
                <span className="text-xs text-zinc-500 block">{numPages} Pages</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setFile(null); setPdfDoc(null); setDownloadUrl(null); }}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3">
            <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800/80 rounded-lg p-1">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-2 text-zinc-300">
                {currentPage} / {numPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= numPages}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center bg-zinc-950 border border-zinc-800/80 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setMode("crop")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                  mode === "crop" ? "bg-emerald-500 text-black shadow-sm" : "text-zinc-400 hover:text-white"
                }`}
              >
                <CropIcon className="w-3.5 h-3.5" />
                <span>Crop</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("pan")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
                  mode === "pan" ? "bg-emerald-500 text-black shadow-sm" : "text-zinc-400 hover:text-white"
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>Pan</span>
              </button>
            </div>

            <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800/80 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(0.5, Math.round((prev - 0.1) * 10) / 10))}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono px-2 text-zinc-300 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(2.5, Math.round((prev + 0.1) * 10) / 10))}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1.0)}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0"
              />
              <span>Apply to all {numPages} pages</span>
            </label>
          </div>

          <div
            ref={containerRef}
            style={{
              overflow: mode === "crop" ? "hidden" : "auto",
              touchAction: mode === "crop" ? "none" : "pan-x pan-y",
              overscrollBehavior: "none",
            }}
            className="relative w-full h-[65vh] bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-center p-4 select-none"
          >
            <div className="relative inline-block shadow-2xl">
              <canvas ref={canvasRef} className="block rounded shadow-2xl w-auto h-auto object-contain pointer-events-none" />

              {cropBox && (
                <div
                  style={{
                    position: "absolute",
                    left: `${cropBox.x}px`,
                    top: `${cropBox.y}px`,
                    width: `${cropBox.width}px`,
                    height: `${cropBox.height}px`,
                  }}
                  className="absolute border-2 border-emerald-500 bg-emerald-500/10 cursor-move z-20 select-none touch-none shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  onPointerDown={handleBoxPointerDown}
                  onMouseDown={handleBoxPointerDown}
                >
                  {[
                    { id: "nw", style: { top: 0, left: 0, transform: "translate(-50%, -50%)", cursor: "nwse-resize" } },
                    { id: "n",  style: { top: 0, left: "50%", transform: "translate(-50%, -50%)", cursor: "ns-resize" } },
                    { id: "ne", style: { top: 0, right: 0, transform: "translate(50%, -50%)", cursor: "nesw-resize" } },
                    { id: "e",  style: { top: "50%", right: 0, transform: "translate(50%, -50%)", cursor: "ew-resize" } },
                    { id: "se", style: { bottom: 0, right: 0, transform: "translate(50%, 50%)", cursor: "nwse-resize" } },
                    { id: "s",  style: { bottom: 0, left: "50%", transform: "translate(-50%, 50%)", cursor: "ns-resize" } },
                    { id: "sw", style: { bottom: 0, left: 0, transform: "translate(-50%, 50%)", cursor: "nesw-resize" } },
                    { id: "w",  style: { top: "50%", left: 0, transform: "translate(-50%, -50%)", cursor: "ew-resize" } },
                  ].map((h) => (
                    <div
                      key={h.id}
                      style={h.style as any}
                      onPointerDown={(e: any) => handleHandlePointerDown(e, h.id)}
                      onMouseDown={(e: any) => handleHandlePointerDown(e, h.id)}
                      className="absolute w-3 h-3 bg-white border-2 border-emerald-500 rounded-sm shadow-md touch-none z-30"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setCropBox({ x: 25, y: 25, width: 250, height: 340 })}
              className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium transition"
            >
              Reset Box
            </button>

            {!downloadUrl ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs transition disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{isProcessing ? "Processing..." : "Crop & Download PDF"}</span>
              </button>
            ) : (
              <a
                href={downloadUrl}
                download={`cropped_${file.name}`}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Cropped PDF</span>
              </a>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CropPdf;
