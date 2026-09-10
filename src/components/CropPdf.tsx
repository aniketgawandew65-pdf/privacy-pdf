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
  Move,
  Trash2
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
  const [numPages, setNumPages] = useState<number>(0); void setNumPages;
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [mode, setMode] = useState<"crop" | "pan">("crop");
  const [applyToAll, setApplyToAll] = useState<boolean>(false);
  const [crops, setCrops] = useState<Record<number, CropArea | null>>({});
  const [cropBox, setCropBox] = useState<CropArea | null>({ x: 25, y: 25, width: 250, height: 340 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Invalidate generated download URL whenever crop changes occur
  const updateCropBox = (updater: any) => {
    setDownloadUrl(null);
    setCropBox(updater);
  };

  // Load PDF file
  useEffect(() => {
    if (!file) return;
    let isMounted = true;
    const loadPdf = async () => {
      try {
        setError(null);
        setDownloadUrl(null);
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

  // Render current page to canvas with high-DPI Retina resolution
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

        // High-DPI Retina scaling
        const dpr = Math.max(window.devicePixelRatio || 1, 2);
        const renderViewport = page.getViewport({ scale: activeScale * dpr });

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });
        await renderTask.promise;
      } catch (_) {}
    };
    renderPage();
    return () => { if (renderTask) renderTask.cancel(); };
  }, [pdfDoc, currentPage, zoom]);

  // Lock container scroll engine during Crop mode
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (mode === "crop") {
      el.style.overflow = "hidden";
      el.style.touchAction = "none";
    } else {
      el.style.overflow = "auto";
      el.style.touchAction = "none";
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
    setDownloadUrl(null);
    if (!applyToAll) {
      setCrops((prev) => ({ ...prev, [currentPage]: cropBox }));
      setCurrentPage(newPage);
      if (crops[newPage] !== undefined) {
        setCropBox(crops[newPage]);
      } else {
        const canvasEl = canvasRef.current;
        const w = canvasEl ? (canvasEl.clientWidth || 250) : 250;
        const h = canvasEl ? (canvasEl.clientHeight || 340) : 340;
        setCropBox({
          x: Math.round(w * 0.1),
          y: Math.round(h * 0.1),
          width: Math.round(w * 0.8),
          height: Math.round(h * 0.8),
        });
      }
    } else {
      setCurrentPage(newPage);
    }
  };

  // 1:1 Active Drag-to-Pan Handler (covers top, bottom, left, right in Pan mode)
  const handlePanPointerDown = (e: any) => {
    if (mode !== "pan") return;
    const container = containerRef.current;
    if (!container) return;
    const startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const startY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const startScrollLeft = container.scrollLeft;
    const startScrollTop = container.scrollTop;

    const onMove = (me: any) => {
      if (me.cancelable) me.preventDefault();
      const curX = me.clientX ?? (me.touches && me.touches[0]?.clientX) ?? startX;
      const curY = me.clientY ?? (me.touches && me.touches[0]?.clientY) ?? startY;
      container.scrollLeft = startScrollLeft - (curX - startX);
      container.scrollTop = startScrollTop - (curY - startY);
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
      updateCropBox((prev: any) => (prev ? { ...prev, x: nextX, y: nextY } : null));
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

  // 8-Handle Resize Handler (Supports micro-resizing down to 6px height)
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
        const newW = Math.max(8, initBox.width - dx);
        const newX = initBox.x + (initBox.width - newW);
        if (newX >= 0) { x = newX; w = newW; }
      }
      if (handle.includes("e")) {
        w = Math.max(8, Math.min(maxW - x, initBox.width + dx));
      }
      if (handle.includes("n")) {
        const newH = Math.max(6, initBox.height - dy);
        const newY = initBox.y + (initBox.height - newH);
        if (newY >= 0) { y = newY; h = newH; }
      }
      if (handle.includes("s")) {
        h = Math.max(6, Math.min(maxH - y, initBox.height + dy));
      }

      updateCropBox({ x, y, width: w, height: h });
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
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      let outputBytes: Uint8Array | null = null;
      let needsDecryptedRender = false;

      // Pipeline 1: Lossless vector crop for normal PDFs
      try {
        const testDoc = await PDFDocument.load(arrayBuffer);
        const pages = testDoc.getPages();
        if (pages.length === 0) throw new Error("Zero pages");

        const canvasEl = canvasRef.current;
        const dispW = canvasEl ? (canvasEl.clientWidth || 600) : 600;
        const dispH = canvasEl ? (canvasEl.clientHeight || 800) : 800;

        pages.forEach((page, i) => {
          const pageIdx = i + 1;
          const targetCrop = (typeof applyToAll !== "undefined" && applyToAll)
            ? cropBox
            : ((typeof crops !== "undefined" && crops && (crops as any)[pageIdx])
                ? (crops as any)[pageIdx]
                : (pageIdx === (typeof currentPage !== "undefined" ? currentPage : 1) ? cropBox : null));

          if (!targetCrop) return;

          const mediaBox = page.getMediaBox();
          const originX = mediaBox.x || 0;
          const originY = mediaBox.y || 0;
          const pageWidth = mediaBox.width || page.getWidth();
          const pageHeight = mediaBox.height || page.getHeight();

          const fracX = Math.max(0, targetCrop.x / (dispW || 1));
          const fracY = Math.max(0, targetCrop.y / (dispH || 1));
          const fracW = Math.min(1 - fracX, targetCrop.width / (dispW || 1));
          const fracH = Math.min(1 - fracY, targetCrop.height / (dispH || 1));

          const pdfCropX = originX + fracX * pageWidth;
          const pdfCropW = Math.max(10, fracW * pageWidth);
          const pdfCropH = Math.max(10, fracH * pageHeight);
          const pdfCropY = originY + (pageHeight - (fracY + fracH) * pageHeight);

          page.setMediaBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
          page.setCropBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        });

        const savedBytes = await testDoc.save();
        if (savedBytes && savedBytes.byteLength > 600) {
          outputBytes = savedBytes;
        } else {
          needsDecryptedRender = true;
        }
      } catch (err: any) {
        // Document has permission/owner locks (e.g. IGR receipt, bank statement)
        needsDecryptedRender = true;
      }

      // Pipeline 2: High-fidelity decrypted slice for receipts and locked files
      if (needsDecryptedRender) {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          stopAtErrors: false,
        });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;
        const outPdf = await PDFDocument.create();

        const canvasEl = canvasRef.current;
        const dispW = canvasEl ? (canvasEl.clientWidth || 600) : 600;
        const dispH = canvasEl ? (canvasEl.clientHeight || 800) : 800;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageIdx = pageNum;
          const targetCrop = (typeof applyToAll !== "undefined" && applyToAll)
            ? cropBox
            : ((typeof crops !== "undefined" && crops && (crops as any)[pageIdx])
                ? (crops as any)[pageIdx]
                : (pageIdx === (typeof currentPage !== "undefined" ? currentPage : 1) ? cropBox : null));

          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });

          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = Math.floor(viewport.width);
          pageCanvas.height = Math.floor(viewport.height);
          const pCtx = pageCanvas.getContext("2d", { alpha: false });

          if (pCtx) {
            pCtx.fillStyle = "#ffffff";
            pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            await (page.render({ canvasContext: pCtx as any, viewport } as any) as any).promise;

            if (targetCrop) {
              const fracX = Math.max(0, targetCrop.x / (dispW || 1));
              const fracY = Math.max(0, targetCrop.y / (dispH || 1));
              const fracW = Math.min(1 - fracX, targetCrop.width / (dispW || 1));
              const fracH = Math.min(1 - fracY, targetCrop.height / (dispH || 1));

              const sx = Math.floor(fracX * pageCanvas.width);
              const sy = Math.floor(fracY * pageCanvas.height);
              const sw = Math.max(10, Math.floor(fracW * pageCanvas.width));
              const sh = Math.max(10, Math.floor(fracH * pageCanvas.height));

              const cropCanvas = document.createElement("canvas");
              cropCanvas.width = sw;
              cropCanvas.height = sh;
              const cCtx = cropCanvas.getContext("2d", { alpha: false });

              if (cCtx) {
                cCtx.fillStyle = "#ffffff";
                cCtx.fillRect(0, 0, sw, sh);
                cCtx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

                const blob = await new Promise<Blob | null>((res) =>
                  cropCanvas.toBlob((b) => res(b), "image/jpeg", 0.95)
                );
                if (blob) {
                  const imgBytes = await blob.arrayBuffer();
                  const embedded = await outPdf.embedJpg(imgBytes);
                  const ptW = sw / 2;
                  const ptH = sh / 2;
                  const newPage = outPdf.addPage([ptW, ptH]);
                  newPage.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
                }
              }
              cropCanvas.width = 0;
              cropCanvas.height = 0;
            } else {
              const blob = await new Promise<Blob | null>((res) =>
                pageCanvas.toBlob((b) => res(b), "image/jpeg", 0.92)
              );
              if (blob) {
                const imgBytes = await blob.arrayBuffer();
                const embedded = await outPdf.embedJpg(imgBytes);
                const ptW = viewport.width / 2;
                const ptH = viewport.height / 2;
                const newPage = outPdf.addPage([ptW, ptH]);
                newPage.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
              }
            }
          }

          pageCanvas.width = 0;
          pageCanvas.height = 0;
          if (typeof (page as any).cleanup === "function") {
            (page as any).cleanup();
          }
        }

        outputBytes = await outPdf.save();
      }

      // Safe download anchor: prevents Safari tab takeover
      if (outputBytes && outputBytes.byteLength > 0) {
        const outBlob = new Blob([outputBytes as any], { type: "application/pdf" });
        const downloadUrl = URL.createObjectURL(outBlob);
        const fileName = (file.name.replace(/\.pdf$/i, "") || "document") + "_cropped.pdf";

        const downloadLink = document.createElement("a");
        downloadLink.href = downloadUrl;
        downloadLink.download = fileName;
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();

        setTimeout(() => {
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(downloadUrl);
        }, 2500);
      }
    } catch (err: any) {
      console.error("Crop error:", err);
      setError(err?.message || "Failed to crop PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Dynamic stage padding calculation: expands with zoom so extreme edges are 100% accessible
  const stagePadY = zoom > 1.05 ? Math.max(120, Math.round(zoom * 110)) : 32;
  const stagePadX = zoom > 1.05 ? Math.max(80, Math.round(zoom * 80)) : 32;

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
                onClick={() => { setDownloadUrl(null); setZoom((prev) => Math.max(0.5, Math.round((prev - 0.1) * 10) / 10)); }}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono px-2 text-zinc-300 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => { setDownloadUrl(null); setZoom((prev) => Math.min(3.0, Math.round((prev + 0.1) * 10) / 10)); }}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setDownloadUrl(null); setZoom(1.0); }}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => { setDownloadUrl(null); setApplyToAll(e.target.checked); }}
                className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0"
              />
              <span>Apply to all {numPages} pages</span>
            </label>
          </div>

          {/* Interactive Document Viewport (Non-flex parent eliminates negative space clipping) */}
          <div
            ref={containerRef}
            onPointerDown={handlePanPointerDown}
            style={{
              overflow: mode === "crop" ? "hidden" : "auto",
              touchAction: "none",
              overscrollBehavior: "none",
            }}
            className={`relative w-full h-[65vh] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-auto select-none ${
              mode === "pan" ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "100%",
                minHeight: "100%",
                width: "max-content",
                height: "max-content",
                padding: `${stagePadY}px ${stagePadX}px`,
                boxSizing: "border-box",
              }}
            >
              <div className="relative inline-block shadow-2xl shrink-0">
                <canvas ref={canvasRef} className="block rounded shadow-2xl object-contain pointer-events-none" />

                {cropBox ? (
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
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded pointer-events-none">
                    <span className="text-xs text-zinc-200 font-medium bg-zinc-900/90 border border-zinc-700/80 px-3 py-1.5 rounded-lg shadow-lg">
                      Page {currentPage} will not be cropped
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {cropBox ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadUrl(null);
                      setCropBox(null);
                      setCrops((prev) => ({ ...prev, [currentPage]: null }));
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-medium transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Box</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDownloadUrl(null);
                      const canvasEl = canvasRef.current;
                      const w = canvasEl ? (canvasEl.clientWidth || 250) : 250;
                      const h = canvasEl ? (canvasEl.clientHeight || 340) : 340;
                      const resetBox = {
                        x: Math.round(w * 0.1),
                        y: Math.round(h * 0.1),
                        width: Math.round(w * 0.8),
                        height: Math.round(h * 0.8),
                      };
                      setCropBox(resetBox);
                      setCrops((prev) => ({ ...prev, [currentPage]: resetBox }));
                    }}
                    className="px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-medium transition"
                  >
                    Reset Box
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDownloadUrl(null);
                    const canvasEl = canvasRef.current;
                    const w = canvasEl ? (canvasEl.clientWidth || 250) : 250;
                    const h = canvasEl ? (canvasEl.clientHeight || 340) : 340;
                    const newBox = {
                      x: Math.round(w * 0.1),
                      y: Math.round(h * 0.1),
                      width: Math.round(w * 0.8),
                      height: Math.round(h * 0.8),
                    };
                    setCropBox(newBox);
                    setCrops((prev) => ({ ...prev, [currentPage]: newBox }));
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-medium transition"
                >
                  <CropIcon className="w-3.5 h-3.5" />
                  <span>+ Add Crop Box</span>
                </button>
              )}
            </div>

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
