import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  RotateCw,
  Trash2,
  GripVertical,
  AlertCircle,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { reorderAndProcessPDF, type PageConfig } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface OrganizePdfProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

interface PageItem {
  id: string;
  originalIndex: number;
  rotation: number;
  thumbnailUrl: string;
}

export const OrganizePdf: React.FC<OrganizePdfProps> = ({ file, onFileChange }) => {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Load and render page thumbnails in browser memory
  useEffect(() => {
    if (!file) {
      setPages([]);
      return;
    }

    let isMounted = true;
    setIsLoadingPages(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    const loadThumbnails = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const total = pdf.numPages;
        const loaded: PageItem[] = [];

        for (let i = 1; i <= total; i++) {
          if (!isMounted) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.35 });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');

          if (ctx) {
            await (
              page.render({
                canvasContext: ctx as any,
                viewport,
              } as any) as any
            ).promise;

            loaded.push({
              id: `page-${i}-${Date.now()}`,
              originalIndex: i - 1,
              rotation: 0,
              thumbnailUrl: canvas.toDataURL('image/jpeg', 0.8),
            });
          }

          canvas.width = 0;
          canvas.height = 0;
        }

        if (isMounted) {
          setPages(loaded);
        }
      } catch (err) {
        console.error('Failed to load page thumbnails:', err);
        if (isMounted) {
          setErrorMessage('Could not render PDF pages. The file may be password protected or corrupted.');
        }
      } finally {
        if (isMounted) setIsLoadingPages(false);
      }
    };

    loadThumbnails();

    return () => {
      isMounted = false;
    };
  }, [file]);

  // Drag and drop reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    setPages((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, movedItem);
      return updated;
    });
    setDraggedIndex(targetIndex);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Individual page operations
  const rotatePage = (index: number) => {
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
    revokeDownloadUrl();
  };

  const removePage = (index: number) => {
    setPages((prev) => prev.filter((_, idx) => idx !== index));
    revokeDownloadUrl();
  };

  // Process and save
  const handleSave = async () => {
    if (!file || pages.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const config: PageConfig[] = pages.map((p) => ({
        originalIndex: p.originalIndex,
        rotation: p.rotation,
      }));

      const outputBytes = await reorderAndProcessPDF(file, config);
      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err) {
      console.error('Failed to save organized PDF:', err);
      setErrorMessage('Failed to generate organized PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    onFileChange(null);
    setPages([]);
    revokeDownloadUrl();
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF to organize and reorder pages"
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
          <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF here to organize pages</p>
          <p className="text-xs text-zinc-500 mt-1">Reorder, rotate, and delete pages visually</p>
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
          {/* Header Card */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-3 truncate">
              <FileText className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-medium text-zinc-200 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">
                  {pages.length} pages {pages.length > 0 && '• Drag cards to reorder'}
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

          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Loading Pages */}
          {isLoadingPages && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-xs text-zinc-400">Rendering page thumbnails...</p>
            </div>
          )}

          {/* Page Grid */}
          {!isLoadingPages && pages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto p-1 scrollbar-thin">
              {pages.map((page, index) => (
                <div
                  key={page.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`group relative flex flex-col items-center bg-zinc-950 rounded-xl border p-2.5 transition-all cursor-grab active:cursor-grabbing ${
                    draggedIndex === index
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 opacity-40'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Page Badge & Drag Handle */}
                  <div className="w-full flex items-center justify-between text-[11px] font-medium text-zinc-400 mb-2">
                    <span className="flex items-center gap-1">
                      <GripVertical className="w-3.5 h-3.5 text-zinc-600" />
                      #{index + 1}
                    </span>
                    <span className="text-zinc-600">Orig: p.{page.originalIndex + 1}</span>
                  </div>

                  {/* Thumbnail Image with Rotation */}
                  <div className="w-full aspect-[3/4] bg-zinc-900 rounded-lg flex items-center justify-center overflow-hidden border border-zinc-800/50">
                    <img
                      src={page.thumbnailUrl}
                      alt={`Page ${index + 1}`}
                      className="max-w-full max-h-full object-contain transition-transform duration-200"
                      style={{ transform: `rotate(${page.rotation}deg)` }}
                    />
                  </div>

                  {/* Controls */}
                  <div className="w-full flex items-center justify-between mt-2 pt-2 border-t border-zinc-900">
                    <button
                      type="button"
                      onClick={() => rotatePage(index)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/60 transition-colors"
                      title="Rotate +90°"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePage(index)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 transition-colors"
                      title="Delete Page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action Button / Download State */}
          {!downloadUrl ? (
            <button
              onClick={handleSave}
              disabled={isProcessing || pages.length === 0 || isLoadingPages}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing document...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Save Organized PDF ({pages.length} Pages)</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-3 rounded-lg border border-emerald-800/30 font-medium">
                <CheckCircle2 className="w-4 h-4" /> PDF Organized & Saved Successfully
              </div>
              <a
                href={downloadUrl}
                download={`organized_${file.name}`}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Download Organized PDF</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};