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
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

import { cropPDF, type CropBox } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface CropPdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const CropPdf: React.FC<CropPdfProps> = ({ file, onFileChange }) => {
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // Store crop boxes per page: { [pageNumber]: CropBox }
  const [pageBoxes, setPageBoxes] = useState<Record<number, CropBox>>({});
  const [applyToAll, setApplyToAll] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Active crop box for the current view
  const currentBox: CropBox | null = applyToAll
    ? pageBoxes[1] || pageBoxes[currentPage] || null
    : pageBoxes[currentPage] || null;

  // Load document
  useEffect(() => {
    if (!file) {
      setTotalPages(0);
      setCurrentPage(1);
      setPageBoxes({});
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

  // Render current page canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setIsLoadingPage(true);

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const containerWidth = overlayRef.current?.parentElement?.clientWidth || 600;
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Scale to fit BOTH width and a maximum height of 520px so full page is visible
      const targetHeight = 520;
      const targetWidth = Math.max(300, containerWidth - 32);
      const scale = Math.min(targetWidth / unscaledViewport.width, targetHeight / unscaledViewport.height);
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

  // Coordinate capture
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
    setIsDragging(true);
    setDragStart(coords);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart) return;
    const current = getNormalizedCoords(e);
    const x = Math.min(dragStart.x, current.x);
    const y = Math.min(dragStart.y, current.y);
    const width = Math.abs(current.x - dragStart.x);
    const height = Math.abs(current.y - dragStart.y);

    const newBox: CropBox = { x, y, width, height };

    if (applyToAll) {
      // Apply master box across all pages
      const updated: Record<number, CropBox> = {};
      for (let i = 1; i <= totalPages; i++) {
        updated[i] = newBox;
      }
      setPageBoxes(updated);
    } else {
      // Save specifically to current page
      setPageBoxes((prev) => ({
        ...prev,
        [currentPage]: newBox,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
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

    // Check if any pages have crop boxes
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
        <div className="space-y-6 text-left">
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

          {/* Canvas & Interactive Crop Overlay */}
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
              <canvas ref={canvasRef} className="block rounded shadow-md max-h-[520px] w-auto h-auto object-contain" />

              {/* Visual Crop Box Overlay */}
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
                    className="absolute border-2 border-emerald-400 pointer-events-none shadow-lg"
                    style={{
                      left: `${currentBox.x * 100}%`,
                      top: `${currentBox.y * 100}%`,
                      width: `${currentBox.width * 100}%`,
                      height: `${currentBox.height * 100}%`,
                    }}
                  >
                    <span className="absolute -top-6 left-0 bg-emerald-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                      Crop Area {applyToAll ? '(All Pages)' : `(Page ${currentPage})`}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            {applyToAll
              ? 'Drawing a box will crop every page to these exact boundaries.'
              : 'Each page maintains its own independent crop box. Flip pages to configure separately.'}
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
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
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
                <CheckCircle2 className="w-4 h-4" /> PDF Cropped Successfully (Vector Quality Preserved)
              </div>
              <a
                href={downloadUrl}
                download={`cropped_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
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