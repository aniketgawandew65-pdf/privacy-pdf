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
  Square,
  Type,
  X,
  FileEdit,
  CheckCircle2,
  AlertCircle,
  Save,
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

type ResizeHandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const VisualEditor: React.FC<VisualEditorProps> = ({ file, onFileChange }) => {
  const [items, setItems] = useState<VisualOverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [zoom, setZoom] = useState<number>(1.0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();

  // Keyboard Delete / Backspace listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteItem(selectedId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  // Load and render PDF page
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
      x: 0.25,
      y: 0.25,
      width: 0.25,
      height: 0.04,
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
      x: 0.25,
      y: 0.25,
      width: 0.35,
      height: 0.045,
      text: 'Replace text here',
      fontFamily: 'helvetica',
      fontSize: 12,
      color: '#000000',
      hasBackground: true,
      fitMode: 'wrap',
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
      setErrorMessage(err.message || 'Failed to save modifications.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    item: VisualOverlayItem,
    handle: ResizeHandleType
  ) => {
    e.stopPropagation();
    setSelectedId(item.id);
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const rect = workspace.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / rect.width;
    const startY = (e.clientY - rect.top) / rect.height;

    const initialX = item.x;
    const initialY = item.y;
    const initialW = item.width;
    const initialH = item.height;
    const minW = 0.015;
    const minH = 0.012;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentX = (moveEvent.clientX - rect.left) / rect.width;
      const currentY = (moveEvent.clientY - rect.top) / rect.height;
      const dx = currentX - startX;
      const dy = currentY - startY;

      let newX = initialX;
      let newY = initialY;
      let newW = initialW;
      let newH = initialH;

      if (handle.includes('e')) {
        newW = Math.max(minW, Math.min(1 - initialX, initialW + dx));
      }
      if (handle.includes('w')) {
        const right = initialX + initialW;
        newX = Math.max(0, Math.min(right - minW, initialX + dx));
        newW = right - newX;
      }
      if (handle.includes('s')) {
        newH = Math.max(minH, Math.min(1 - initialY, initialH + dy));
      }
      if (handle.includes('n')) {
        const bottom = initialY + initialH;
        newY = Math.max(0, Math.min(bottom - minH, initialY + dy));
        newH = bottom - newY;
      }

      handleUpdateItem(item.id, { x: newX, y: newY, width: newW, height: newH });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const currentPageItems = items.filter((item) => item.pageIndex === currentPage - 1);
  const activeItem = items.find((i) => i.id === selectedId);

  const RESIZE_HANDLES: { type: ResizeHandleType; cursor: string; className: string }[] = [
    { type: 'nw', cursor: 'nwse-resize', className: '-top-1 -left-1' },
    { type: 'n', cursor: 'ns-resize', className: '-top-1 left-1/2 -translate-x-1/2' },
    { type: 'ne', cursor: 'nesw-resize', className: '-top-1 -right-1' },
    { type: 'e', cursor: 'ew-resize', className: 'top-1/2 -right-1 -translate-y-1/2' },
    { type: 'se', cursor: 'nwse-resize', className: '-bottom-1 -right-1' },
    { type: 's', cursor: 'ns-resize', className: '-bottom-1 left-1/2 -translate-x-1/2' },
    { type: 'sw', cursor: 'nesw-resize', className: '-bottom-1 -left-1' },
    { type: 'w', cursor: 'ew-resize', className: 'top-1/2 -left-1 -translate-y-1/2' },
  ];

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
          <p className="text-xs text-zinc-500 mt-1">Seamless borderless eraser • 8-direction handles • Vector clarity</p>
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
          {/* Top Controls */}
          <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3.5 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddText}
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Type className="w-3.5 h-3.5" />
                <span>+ 2-in-1 Text &amp; Eraser Box</span>
              </button>
              <button
                onClick={handleAddWhiteout}
                className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-zinc-400 fill-white" />
                <span>+ Blank Eraser Box</span>
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

            {/* Save & Close */}
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
                      <span>Saving changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 stroke-[2.5]" />
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
                className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                title="Close file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Configuration Tray */}
          {activeItem && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[320px]">
                <span className="text-zinc-400 font-medium capitalize">{activeItem.type}:</span>

                {activeItem.type === 'text' && (
                  <>
                    <input
                      type="text"
                      value={activeItem.text || ''}
                      onChange={(e) => handleUpdateItem(activeItem.id, { text: e.target.value })}
                      placeholder="Type text..."
                      className="flex-1 min-w-[150px] bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />

                    {/* Font Family Selector */}
                    <div className="bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800">
                      <select
                        value={activeItem.fontFamily || 'helvetica'}
                        onChange={(e) =>
                          handleUpdateItem(activeItem.id, { fontFamily: e.target.value as any })
                        }
                        className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer text-xs"
                      >
                        <option value="helvetica" className="bg-zinc-900">Sans (Helvetica)</option>
                        <option value="times" className="bg-zinc-900">Serif (Times)</option>
                        <option value="courier" className="bg-zinc-900">Mono (Courier)</option>
                      </select>
                    </div>

                    {/* Fit Mode Switcher */}
                    <div className="flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px]">
                      <button
                        onClick={() => handleUpdateItem(activeItem.id, { fitMode: 'wrap' })}
                        className={`px-2 py-1 rounded transition-colors ${
                          (activeItem.fitMode || 'wrap') === 'wrap'
                            ? 'bg-zinc-800 text-emerald-400 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Wrap Text
                      </button>
                      <button
                        onClick={() => handleUpdateItem(activeItem.id, { fitMode: 'autofit' })}
                        className={`px-2 py-1 rounded transition-colors ${
                          activeItem.fitMode === 'autofit'
                            ? 'bg-zinc-800 text-emerald-400 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Auto-fit Size
                      </button>
                    </div>

                    {/* Font Size */}
                    {(activeItem.fitMode || 'wrap') === 'wrap' && (
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <span>Size:</span>
                        <input
                          type="range"
                          min="8"
                          max="48"
                          value={activeItem.fontSize || 12}
                          onChange={(e) =>
                            handleUpdateItem(activeItem.id, { fontSize: Number(e.target.value) })
                          }
                          className="w-16 accent-emerald-500 cursor-pointer"
                        />
                        <span className="font-mono text-emerald-400 w-5">{activeItem.fontSize || 12}</span>
                      </div>
                    )}

                    <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer select-none bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800">
                      <input
                        type="checkbox"
                        checked={activeItem.hasBackground ?? true}
                        onChange={(e) =>
                          handleUpdateItem(activeItem.id, { hasBackground: e.target.checked })
                        }
                        className="accent-emerald-500 rounded"
                      />
                      <span>Erase Background</span>
                    </label>

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
                    Drag box to move • Adjust from 8 border handles • Press <b>Del</b> or <b>Backspace</b> to remove
                  </span>
                )}
              </div>

              <button
                onClick={() => handleDeleteItem(activeItem.id)}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Delete item (or press Delete key)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete (Del)</span>
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {downloadUrl && (
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-800/30 font-medium">
              <CheckCircle2 className="w-4 h-4" /> Modifications Saved Successfully
            </div>
          )}

          {/* Canvas Workspace */}
          <div
            onClick={() => setSelectedId(null)}
            className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-xl shadow-2xl h-[700px] overflow-hidden flex flex-col"
          >
            <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between bg-zinc-950/40">
              <span>Retina Vector Workspace (Page {currentPage})</span>
              <span className="text-zinc-500">{currentPageItems.length} active • Click anywhere outside to deselect</span>
            </div>

            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-zinc-950/60">
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="relative shadow-2xl rounded-sm border border-zinc-800/80 bg-white"
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '500px',
                    height: 'auto',
                    display: 'block',
                  }}
                />

                {/* Overlay Interactive Elements */}
                <div
                  ref={workspaceRef}
                  className="absolute inset-0 select-none overflow-hidden"
                >
                  {currentPageItems.map((item) => {
                    const isSelected = item.id === selectedId;
                    const isText = item.type === 'text';

                    let fontFamilyCss = 'Arial, sans-serif';
                    if (item.fontFamily === 'times') fontFamilyCss = "'Times New Roman', Times, serif";
                    if (item.fontFamily === 'courier') fontFamilyCss = "'Courier New', Courier, monospace";

                    const effectiveFontSize =
                      isText && item.fitMode === 'autofit'
                        ? Math.max(
                            8,
                            Math.min(
                              item.height * 700 * 0.7,
                              (item.width * 500) / Math.max(1, (item.text || 'Text').length * 0.58)
                            )
                          )
                        : (item.fontSize || 12) * 0.9;

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
                          height: `${item.height * 100}%`,
                          zIndex: isText ? 20 : 10,
                        }}
                        className={`absolute cursor-move select-none transition-shadow ${
                          !isText || (item.hasBackground ?? true)
                            ? 'bg-white'
                            : 'bg-transparent'
                        } ${
                          isSelected
                            ? 'ring-2 ring-emerald-500 shadow-md'
                            : 'border-none outline-none shadow-none'
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
                        {/* Text Container */}
                        {isText && (
                          <div
                            style={{
                              fontFamily: fontFamilyCss,
                              fontSize: `${effectiveFontSize}px`,
                              color: item.color || '#000000',
                              lineHeight: 1.2,
                              whiteSpace: item.fitMode === 'autofit' ? 'nowrap' : 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                            className="w-full h-full flex items-center justify-start px-1 font-normal overflow-hidden select-none"
                          >
                            {item.text || ''}
                          </div>
                        )}

                        {/* 8-Directional Handles: Only visible when actively selected */}
                        {isSelected &&
                          RESIZE_HANDLES.map((handle) => (
                            <div
                              key={handle.type}
                              style={{ cursor: handle.cursor }}
                              className={`absolute w-2.5 h-2.5 bg-white border-2 border-emerald-500 rounded-xs shadow-sm z-30 ${handle.className}`}
                              onPointerDown={(e) => handleResizePointerDown(e, item, handle.type)}
                            />
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Corner Zoom Controls */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-zinc-950/90 border border-zinc-800/90 rounded-xl p-1.5 shadow-2xl backdrop-blur-md text-zinc-300"
            >
              <button
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono px-1.5 text-zinc-400 min-w-[42px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
                className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />
              <button
                onClick={() => setZoom(1.0)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-emerald-400 transition-colors cursor-pointer"
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