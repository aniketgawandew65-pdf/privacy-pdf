import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Plus,
  Square,
  Type,
  X,
  FileEdit,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  applyVisualOverlays,
  type VisualOverlayItem,
} from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

interface VisualEditorProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export const VisualEditor: React.FC<VisualEditorProps> = ({ file, onFileChange }) => {
  const [items, setItems] = useState<VisualOverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Retina Preview & Zoom Controls
  const [zoom, setZoom] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Load document and render current page at 2.0x Retina scale
  useEffect(() => {
    if (!file) {
      setItems([]);
      setSelectedId(null);
      setCurrentPage(1);
      setTotalPages(1);
      revokeDownloadUrl();
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const fileBytes = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBytes).slice() });
        const pdf = await loadingTask.promise;
        if (!isMounted) return;

        setTotalPages(pdf.numPages);
        const page = await pdf.getPage(currentPage);
        const retinaScale = 2.0;
        const viewport = page.getViewport({ scale: retinaScale });

        const canvas = canvasRef.current;
        if (canvas) {
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
          }
        }
      } catch (err: any) {
        console.error('Render error:', err);
        if (isMounted) setErrorMessage('Failed to render PDF page.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [file, currentPage]);

  const handleAddWhiteout = () => {
    const newItem: VisualOverlayItem = {
      id: `whiteout-${Date.now()}`,
      type: 'whiteout',
      pageIndex: currentPage - 1,
      x: 0.2,
      y: 0.2,
      width: 0.25,
      height: 0.05,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
    revokeDownloadUrl();
  };

  const handleAddText = () => {
    const newItem: VisualOverlayItem = {
      id: `text-${Date.now()}`,
      type: 'text',
      pageIndex: currentPage - 1,
      x: 0.2,
      y: 0.3,
      width: 0.3,
      height: 0.06,
      text: 'New Text',
      fontSize: 12,
      color: '#000000',
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
    revokeDownloadUrl();
  };

  const handleUpdateItem = (id: string, updates: Partial<VisualOverlayItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    revokeDownloadUrl();
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(null);
    revokeDownloadUrl();
  };

  const handleApplyChanges = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    revokeDownloadUrl();

    try {
      const outputBytes = await applyVisualOverlays(file, items);
      const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
      createUrl(blob);
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMessage(err.message || 'Failed to save overlay modifications.');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentPageItems = items.filter((item) => item.pageIndex === currentPage - 1);
  const activeItem = items.find((i) => i.id === selectedId);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 text-left">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.type === 'application/pdf') onFileChange(dropped);
          }}
          className="cursor-pointer border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 transition-all rounded-2xl p-12 text-center bg-zinc-950/40 max-w-xl mx-auto"
        >
          <FileEdit className="w-10 h-10 text-emerald-400 mx-auto mb-3 stroke-[1.5]" />
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF to add text or whiteout</p>
          <p className="text-xs text-zinc-500 mt-1">100% vector clarity • Zero server re-compression</p>
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
        <>
          {/* Top Control Bar */}
          <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3.5 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
            {/* Tool Insertion Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddWhiteout}
                className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-zinc-400 fill-white" />
                <span>+ Whiteout Box</span>
              </button>
              <button
                onClick={handleAddText}
                className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Type className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ Add Text</span>
              </button>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-xs text-zinc-300">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] px-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Export Actions */}
            <div className="flex items-center gap-2">
              {!downloadUrl ? (
                <button
                  onClick={handleApplyChanges}
                  disabled={isProcessing || items.length === 0}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Burning modifications...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Save Changes ({items.length})</span>
                    </>
                  )}
                </button>
              ) : (
                <a
                  href={downloadUrl}
                  download={`edited_${file.name}`}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Download Edited PDF</span>
                </a>
              )}
              <button
                onClick={() => onFileChange(null)}
                className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-xl transition-colors"
                title="Close file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Item Configuration Tray */}
          {activeItem && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <span className="text-zinc-400 font-medium capitalize">{activeItem.type}:</span>
                {activeItem.type === 'text' && (
                  <>
                    <input
                      type="text"
                      value={activeItem.text || ''}
                      onChange={(e) => handleUpdateItem(activeItem.id, { text: e.target.value })}
                      placeholder="Enter text..."
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex items-center gap-1 text-zinc-400">
                      <span>Size:</span>
                      <input
                        type="number"
                        min="8"
                        max="72"
                        value={activeItem.fontSize || 12}
                        onChange={(e) =>
                          handleUpdateItem(activeItem.id, { fontSize: Number(e.target.value) })
                        }
                        className="w-14 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-200"
                      />
                    </div>
                    <input
                      type="color"
                      value={activeItem.color || '#000000'}
                      onChange={(e) => handleUpdateItem(activeItem.id, { color: e.target.value })}
                      className="w-7 h-7 rounded border border-zinc-800 bg-transparent cursor-pointer"
                      title="Select text color"
                    />
                  </>
                )}
                {activeItem.type === 'whiteout' && (
                  <span className="text-zinc-400 text-[11px]">
                    Drag to move • Drag bottom-right corner to resize
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDeleteItem(activeItem.id)}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {downloadUrl && (
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-800/30 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Vector Modifications Applied Successfully
            </div>
          )}

          {/* High-DPI Visual Canvas Workspace with Zoom */}
          <div className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-xl shadow-2xl h-[700px] overflow-hidden flex flex-col">
            <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between bg-zinc-950/40">
              <span>Retina Vector Workspace (Page {currentPage})</span>
              <span className="text-zinc-500">{currentPageItems.length} active on this page</span>
            </div>

            {/* Scrollable Viewport */}
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-zinc-950/60">
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="relative shadow-2xl rounded-sm border border-zinc-800/80 bg-white"
              >
                {/* 2.0x Retina Base Canvas */}
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '500px',
                    height: 'auto',
                    display: 'block',
                  }}
                />

                {/* Interactive Placement Overlay */}
                <div
                  ref={workspaceRef}
                  className="absolute inset-0 select-none overflow-hidden"
                >
                  {currentPageItems.map((item) => {
                    const isSelected = item.id === selectedId;

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(item.id);
                        }}
                        style={{
                          left: `${item.x * 100}%`,
                          top: `${item.y * 100}%`,
                          width: `${item.width * 100}%`,
                          height:
                            item.type === 'whiteout'
                              ? `${item.height * 100}%`
                              : 'auto',
                        }}
                        className={`absolute cursor-move transition-shadow ${
                          item.type === 'whiteout' ? 'bg-white' : 'bg-transparent'
                        } ${
                          isSelected
                            ? 'ring-2 ring-emerald-500 shadow-md'
                            : 'ring-1 ring-zinc-400/40 hover:ring-zinc-400'
                        }`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedId(item.id);
                          const workspace = workspaceRef.current;
                          if (!workspace) return;

                          const rect = workspace.getBoundingClientRect();
                          const startX = (e.clientX - rect.left) / rect.width;
                          const startY = (e.clientY - rect.top) / rect.height;
                          const initialItemX = item.x;
                          const initialItemY = item.y;

                          const onPointerMove = (moveEvent: PointerEvent) => {
                            const currentX = (moveEvent.clientX - rect.left) / rect.width;
                            const currentY = (moveEvent.clientY - rect.top) / rect.height;
                            const deltaX = currentX - startX;
                            const deltaY = currentY - startY;

                            const newX = Math.max(0, Math.min(1 - item.width, initialItemX + deltaX));
                            const newY = Math.max(0, Math.min(1 - item.height, initialItemY + deltaY));
                            handleUpdateItem(item.id, { x: newX, y: newY });
                          };

                          const onPointerUp = () => {
                            window.removeEventListener('pointermove', onPointerMove);
                            window.removeEventListener('pointerup', onPointerUp);
                          };

                          window.addEventListener('pointermove', onPointerMove);
                          window.addEventListener('pointerup', onPointerUp);
                        }}
                      >
                        {item.type === 'text' && (
                          <div
                            style={{
                              fontSize: `${(item.fontSize || 12) * 0.9}px`,
                              color: item.color || '#000000',
                              lineHeight: 1.2,
                              whiteSpace: 'nowrap',
                            }}
                            className="font-sans px-1 font-normal"
                          >
                            {item.text || 'Text'}
                          </div>
                        )}

                        {/* Resize Corner Handle (Whiteout only) */}
                        {item.type === 'whiteout' && isSelected && (
                          <div
                            className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 cursor-nwse-resize"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const workspace = workspaceRef.current;
                              if (!workspace) return;

                              const rect = workspace.getBoundingClientRect();
                              const startX = (e.clientX - rect.left) / rect.width;
                              const startY = (e.clientY - rect.top) / rect.height;
                              const initialW = item.width;
                              const initialH = item.height;

                              const onResizeMove = (moveEvent: PointerEvent) => {
                                const currentX = (moveEvent.clientX - rect.left) / rect.width;
                                const currentY = (moveEvent.clientY - rect.top) / rect.height;
                                const deltaW = currentX - startX;
                                const deltaH = currentY - startY;

                                const newW = Math.max(0.02, Math.min(1 - item.x, initialW + deltaW));
                                const newH = Math.max(0.01, Math.min(1 - item.y, initialH + deltaH));
                                handleUpdateItem(item.id, { width: newW, height: newH });
                              };

                              const onResizeUp = () => {
                                window.removeEventListener('pointermove', onResizeMove);
                                window.removeEventListener('pointerup', onResizeUp);
                              };

                              window.addEventListener('pointermove', onResizeMove);
                              window.addEventListener('pointerup', onResizeUp);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Corner Zoom Controls */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-zinc-950/90 border border-zinc-800/90 rounded-xl p-1.5 shadow-2xl backdrop-blur-md text-zinc-300">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono px-1.5 text-zinc-400 min-w-[42px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
                className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />
              <button
                onClick={() => setZoom(1.0)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-emerald-400 transition-colors"
                title="Reset Zoom (100%)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};