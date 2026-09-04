import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  AlertCircle,
  RotateCw,
  Trash2,
  GripVertical,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { reorderAndProcessPDF, type PageConfig } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface OrganizePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

interface PageThumbnail {
  originalIndex: number;
  rotation: number;
  dataUrl: string;
}

export const OrganizePdf: React.FC<OrganizePdfProps> = ({ file, onFileChange }) => {
  const [pages, setPages] = useState<PageThumbnail[]>([]);
  const [cardZoom, setCardZoom] = useState<number>(1.0);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const draggedIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  useEffect(() => {
    if (!file) {
      setPages([]);
      setCardZoom(1.0);
      revokeDownloadUrl();
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoadingPages(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer).slice() }).promise;
        const total = pdf.numPages;
        const thumbs: PageThumbnail[] = [];

        const dpr = Math.max(window.devicePixelRatio || 1, 2.0);

        for (let i = 1; i <= total; i++) {
          const page = await pdf.getPage(i);
          const unscaled = page.getViewport({ scale: 1.0 });
          const scale = (320 / unscaled.width) * dpr;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');

          if (ctx) {
            await page.render({ canvasContext: ctx as any, viewport } as any).promise;
            thumbs.push({
              originalIndex: i - 1,
              rotation: 0,
              dataUrl: canvas.toDataURL('image/jpeg', 0.92),
            });
          }
          canvas.width = 0;
          canvas.height = 0;
        }

        if (isMounted) setPages(thumbs);
      } catch (err: any) {
        console.error('Failed to load page thumbnails:', err);
        if (isMounted) setErrorMessage('Failed to render page previews.');
      } finally {
        if (isMounted) setIsLoadingPages(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file]);

  const handleRotatePage = (index: number) => {
    setPages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], rotation: (next[index].rotation + 90) % 360 };
      return next;
    });
  };

  const handleDeletePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragStart = (index: number) => {
    draggedIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const draggedIndex = draggedIndexRef.current;
    if (draggedIndex === null || draggedIndex === index) return;

    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(draggedIndex, 1);
      next.splice(index, 0, item);
      draggedIndexRef.current = index;
      return next;
    });
  };

  const handleApply = async () => {
    if (!file || pages.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const config: PageConfig[] = pages.map((p) => ({
        originalIndex: p.originalIndex,
        rotation: p.rotation,
      }));

      const bytes = await reorderAndProcessPDF(file, config);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Organize export error:', err);
      setErrorMessage(err.message || 'Failed to save organized PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to organize"
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
          <FileText className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to organize &amp; reorder</p>
          <p className="text-xs text-zinc-500 mt-1">High-Resolution Previews • Drag &amp; Drop Reordering</p>
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
        <div className="space-y-6 text-left select-none">
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{pages.length} pages • Drag cards to reorder</p>
              </div>
            </div>
            <button
              onClick={() => {
                onFileChange(null);
                revokeDownloadUrl();
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Page Grid Container with Floating Bottom-Right Zoom */}
          <div className="relative">
            {isLoadingPages ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <span className="text-xs">Rendering high-resolution previews...</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(140 * cardZoom)}px, 1fr))`,
                  gap: '1rem',
                }}
                className="max-h-[560px] overflow-y-auto p-2 pb-14"
              >
                {pages.map((p, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    className="group relative bg-zinc-950 border border-zinc-800 hover:border-emerald-500/60 rounded-xl p-2 transition flex flex-col items-center cursor-grab active:cursor-grabbing"
                  >
                    <div className="w-full flex items-center justify-between text-[11px] text-zinc-500 mb-1 px-1">
                      <span className="flex items-center gap-1 font-mono text-zinc-400">
                        <GripVertical className="w-3 h-3 text-zinc-600" /> #{idx + 1}
                      </span>
                      <span>Orig: p.{p.originalIndex + 1}</span>
                    </div>

                    <div className="w-full aspect-[1/1.414] bg-zinc-900 rounded-lg overflow-hidden flex items-center justify-center p-1">
                      <img
                        src={p.dataUrl}
                        alt={`Page ${idx + 1}`}
                        style={{ transform: `rotate(${p.rotation}deg)` }}
                        className="w-full h-full object-contain rounded transition-transform duration-200"
                      />
                    </div>

                    <div className="w-full flex items-center justify-between mt-2 pt-1 border-t border-zinc-900">
                      <button
                        type="button"
                        onClick={() => handleRotatePage(idx)}
                        className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 transition"
                        title="Rotate Page"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePage(idx)}
                        className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-900 transition"
                        title="Delete Page"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom-Right Floating Zoom Controls */}
            {!isLoadingPages && pages.length > 0 && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-zinc-900/90 border border-zinc-700/80 backdrop-blur-md px-2 py-1 rounded-lg shadow-lg z-20">
                <button
                  type="button"
                  onClick={() => setCardZoom((z) => Math.max(0.7, parseFloat((z - 0.2).toFixed(1))))}
                  disabled={cardZoom <= 0.7}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                  title="Smaller Cards"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-zinc-300 min-w-[36px] text-center">
                  {Math.round(cardZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setCardZoom((z) => Math.min(2.2, parseFloat((z + 0.2).toFixed(1))))}
                  disabled={cardZoom >= 2.2}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800 transition cursor-pointer"
                  title="Larger Cards"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!downloadUrl ? (
            <button
              onClick={handleApply}
              disabled={isProcessing || pages.length === 0}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 text-xs cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Document...</span>
                </>
              ) : (
                <span>Save &amp; Download Organized PDF</span>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Organized Successfully
              </div>
              <a
                href={downloadUrl}
                download={`organized_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Download Organized PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};