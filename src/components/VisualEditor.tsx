import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Loader2,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Hand,
  ChevronLeft,
  ChevronRight,
  Square,
  Type,
  X,
  FileEdit,
  CheckCircle2,
  AlertCircle,
  Save,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { pdfjsLib } from '../utils/pdfjs';
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
  const [isPanMode, setIsPanMode] = useState<boolean>(false);

  // The editor always uses a stable 500px-wide coordinate system.
  // Only the outer visual scale changes.
  const [pageDisplayHeight, setPageDisplayHeight] = useState<number>(700);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preserve viewport position while the mobile keyboard opens/closes.
  const mobileFocusScrollRef = useRef<{
    x: number;
    y: number;
    canvasLeft: number;
    canvasTop: number;
  } | null>(null);

  const { url: downloadUrl, createUrl, revoke: revokeDownloadUrl } = useObjectUrl();


  // Mobile Safari:
  // 1. 16px inputs prevent automatic browser zoom.
  // 2. Restore the document position after the keyboard closes.
  useEffect(() => {
    document.documentElement.classList.add('visual-editor-open');

    const isMobile = () =>
      window.matchMedia('(max-width: 767px)').matches;

    const isFormControl = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    const handleFocusIn = (event: FocusEvent) => {
      if (!isMobile() || !isFormControl(event.target)) return;

      const canvasScroller = canvasScrollRef.current;

      mobileFocusScrollRef.current = {
        x: window.scrollX,
        y: window.scrollY,
        canvasLeft: canvasScroller?.scrollLeft ?? 0,
        canvasTop: canvasScroller?.scrollTop ?? 0,
      };
    };

    const restoreScroll = () => {
      if (!isMobile()) return;

      const saved = mobileFocusScrollRef.current;
      if (!saved) return;

      window.scrollTo({
        left: saved.x,
        top: saved.y,
        behavior: 'auto',
      });

      const canvasScroller = canvasScrollRef.current;

      if (canvasScroller) {
        canvasScroller.scrollLeft = saved.canvasLeft;
        canvasScroller.scrollTop = saved.canvasTop;
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (!isMobile() || !isFormControl(event.target)) return;

      // iOS changes the visual viewport in stages while
      // closing its keyboard, so restore twice.
      window.setTimeout(restoreScroll, 80);
      window.setTimeout(restoreScroll, 320);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.documentElement.classList.remove('visual-editor-open');

      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Keyboard Delete & Sub-Pixel Arrow Key Nudging
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      // Delete item
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteItem(selectedId);
        return;
      }

      // Nudge position with arrow keys (Shift = 5x step, Normal = single pixel precision)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 0.006 : 0.0012; // 0.0012 gives ~0.6px micro-control on canvas
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedId) return item;
            let newX = item.x;
            let newY = item.y;
            if (e.key === 'ArrowLeft') newX = Math.max(0, item.x - step);
            if (e.key === 'ArrowRight') newX = Math.min(1 - item.width, item.x + step);
            if (e.key === 'ArrowUp') newY = Math.max(0, item.y - step);
            if (e.key === 'ArrowDown') newY = Math.min(1 - item.height, item.y + step);
            return { ...item, x: newX, y: newY };
          })
        );
        revokeDownloadUrl();
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
        const loadingTask = pdfjsLib.getDocument({ isEvalSupported: false, data: new Uint8Array(fileBytes).slice() });
        const pdf = await loadingTask.promise;
        if (!isMounted) return;

        setTotalPages(pdf.numPages);
        const page = await pdf.getPage(currentPage);
        const retinaScale = 2.0;
        const viewport = page.getViewport({ scale: retinaScale });

        // Canvas is displayed at a fixed base width of 500px.
        // Store the matching height so the zoom sizing wrapper
        // always has the exact same aspect ratio as the PDF.
        setPageDisplayHeight(
          500 * (viewport.height / viewport.width)
        );

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
            if (isMounted) setErrorMessage(null);
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
      width: 0.2,
      height: 0.03,
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
      width: 0.3,
      height: 0.035,
      text: 'Replace text here',
      fontFamily: 'helvetica',
      fontSize: 12,
      color: '#000000',
      hasBackground: true,
      fitMode: 'wrap',
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrikethrough: false,
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

  // Delta-based Drag Move
  const handleDragPointerDown = (e: React.PointerEvent, item: VisualOverlayItem) => {
    e.stopPropagation();
    setSelectedId(item.id);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);

    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let lastX = e.clientX;
    let lastY = e.clientY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const dx = (moveEvent.clientX - lastX) / rect.width;
      const dy = (moveEvent.clientY - lastY) / rect.height;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id) return it;
          const newX = Math.max(0, Math.min(1 - it.width, it.x + dx));
          const newY = Math.max(0, Math.min(1 - it.height, it.y + dy));
          return { ...it, x: newX, y: newY };
        })
      );
      revokeDownloadUrl();
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture?.(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  };

  // Delta-based Resize
  const handleResizePointerDown = (
    e: React.PointerEvent,
    item: VisualOverlayItem,
    handle: ResizeHandleType
  ) => {
    e.stopPropagation();
    setSelectedId(item.id);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);

    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let lastX = e.clientX;
    let lastY = e.clientY;
    const minW = 0.01;
    const minH = 0.008;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const dx = (moveEvent.clientX - lastX) / rect.width;
      const dy = (moveEvent.clientY - lastY) / rect.height;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id) return it;
          let newX = it.x;
          let newY = it.y;
          let newW = it.width;
          let newH = it.height;

          if (handle.includes('e')) {
            newW = Math.max(minW, Math.min(1 - it.x, it.width + dx));
          }
          if (handle.includes('w')) {
            const right = it.x + it.width;
            newX = Math.max(0, Math.min(right - minW, it.x + dx));
            newW = right - newX;
          }
          if (handle.includes('s')) {
            newH = Math.max(minH, Math.min(1 - it.y, it.height + dy));
          }
          if (handle.includes('n')) {
            const bottom = it.y + it.height;
            newY = Math.max(0, Math.min(bottom - minH, it.y + dy));
            newH = bottom - newY;
          }

          return { ...it, x: newX, y: newY, width: newW, height: newH };
        })
      );
      revokeDownloadUrl();
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture?.(upEvent.pointerId);
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  };

  // PDF page can move only when Pan mode is explicitly enabled.
  const handlePanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanMode) return;

    const scroller = canvasScrollRef.current;
    if (!scroller) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = scroller.scrollLeft;
    const startTop = scroller.scrollTop;

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      scroller.scrollLeft =
        startLeft - (moveEvent.clientX - startX);

      scroller.scrollTop =
        startTop - (moveEvent.clientY - startY);
    };

    const finish = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture?.(upEvent.pointerId);
      } catch {}

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };

    window.addEventListener(
      'pointermove',
      onPointerMove,
      { passive: false }
    );

    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const currentPageItems = items.filter((item) => item.pageIndex === currentPage - 1);
  const activeItem = items.find((i) => i.id === selectedId);

  // Unobstructed 4-Corner Handles
  const CORNER_HANDLES: { type: ResizeHandleType; cursor: string; className: string }[] = [
    { type: 'nw', cursor: 'nwse-resize', className: '-top-1 -left-1' },
    { type: 'ne', cursor: 'nesw-resize', className: '-top-1 -right-1' },
    { type: 'se', cursor: 'nwse-resize', className: '-bottom-1 -right-1' },
    { type: 'sw', cursor: 'nesw-resize', className: '-bottom-1 -left-1' },
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
          <p className="text-sm font-semibold text-zinc-200">Drop a PDF to Edit (Replace Text or Erase)</p>
          <p className="text-xs text-zinc-500 mt-1">Millimeter hairline precision • Arrow key micro-nudging • Zero data egress</p>
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
                <span>+ Text &amp; Erase Box</span>
              </button>
              <button
                onClick={handleAddWhiteout}
                className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-zinc-400 fill-white" />
                <span>+ Blank Eraser Box</span>
              </button>
            </div>

            {/* Pagination */}
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
                      <span>Applying edits...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Save Edits ({items.length})</span>
                    </>
                  )}
                </button>
              ) : (
                <a
                  href={downloadUrl}
                  download={`edited_${file.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
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
                      placeholder="Type replacement text..."
                      className="flex-1 min-w-[150px] md:min-w-[260px] lg:min-w-[320px] bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />

                    {/* Font Selector */}
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

                    {/* Text Styling: Bold, Italic, Underline, Strikethrough */}
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isBold: !activeItem.isBold })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs font-bold transition-colors cursor-pointer ${
                          activeItem.isBold
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Bold"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isItalic: !activeItem.isItalic })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs italic font-serif transition-colors cursor-pointer ${
                          activeItem.isItalic
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Italic"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isUnderline: !activeItem.isUnderline })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs underline underline-offset-2 transition-colors cursor-pointer ${
                          activeItem.isUnderline
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Underline"
                      >
                        U
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { isStrikethrough: !activeItem.isStrikethrough })}
                        className={`w-7 h-6 rounded flex items-center justify-center text-xs line-through transition-colors cursor-pointer ${
                          activeItem.isStrikethrough
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Strikethrough (Cross-out)"
                      >
                        S
                      </button>
                    </div>

                    {/* Text Alignment */}
                    <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { textAlign: 'left' })}
                        className={`w-7 h-6 rounded flex items-center justify-center transition-colors ${
                          (activeItem.textAlign || 'left') === 'left'
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Align left"
                      >
                        <AlignLeft size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { textAlign: 'center' })}
                        className={`w-7 h-6 rounded flex items-center justify-center transition-colors ${
                          activeItem.textAlign === 'center'
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Align center"
                      >
                        <AlignCenter size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateItem(activeItem.id, { textAlign: 'right' })}
                        className={`w-7 h-6 rounded flex items-center justify-center transition-colors ${
                          activeItem.textAlign === 'right'
                            ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Align right"
                      >
                        <AlignRight size={14} />
                      </button>
                    </div>

                    {/* Fit Mode Switcher */}
                    <div className="flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px]">
                      <button
                        onClick={() => handleUpdateItem(activeItem.id, { fitMode: 'wrap' })}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          (activeItem.fitMode || 'wrap') === 'wrap'
                            ? 'bg-zinc-800 text-emerald-400 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Wrap Text
                      </button>
                      <button
                        onClick={() => handleUpdateItem(activeItem.id, { fitMode: 'autofit' })}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          activeItem.fitMode === 'autofit'
                            ? 'bg-zinc-800 text-emerald-400 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Auto-fit
                      </button>
                    </div>

                    {/* Synchronized Slider & Numeric Input */}
                    {(activeItem.fitMode || 'wrap') === 'wrap' && (
                      <div className="flex items-center gap-1.5 bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800 text-zinc-400">
                        <span>Size:</span>
                        <input
                          type="range"
                          min="1"
                          max="72"
                          value={activeItem.fontSize || 12}
                          onChange={(e) =>
                            handleUpdateItem(activeItem.id, { fontSize: Number(e.target.value) })
                          }
                          className="w-14 accent-emerald-500 cursor-pointer"
                        />
                        <input
                          type="number"
                          min="1"
                          max="72"
                          value={activeItem.fontSize || 12}
                          onChange={(e) => {
                            const val = Math.max(1, Math.min(72, Number(e.target.value) || 1));
                            handleUpdateItem(activeItem.id, { fontSize: val });
                          }}
                          className="w-11 bg-zinc-900 border border-zinc-800 text-emerald-400 rounded px-1 py-0.5 font-mono text-center text-xs"
                        />
                        <span className="text-[10px] text-zinc-500">pt</span>
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
                      <span>Erase Underneath</span>
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
                    Drag to move • Corner handles to scale • Use <b>Arrow Keys</b> for 1px precision • <b>Del</b> to remove
                  </span>
                )}
              </div>

              <button
                onClick={() => handleDeleteItem(activeItem.id)}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Delete (or press Delete key)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
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
              <CheckCircle2 className="w-4 h-4" /> Edits Successfully Saved into PDF
            </div>
          )}

          {/* Canvas Workspace */}
          <div
            onClick={() => setSelectedId(null)}
            className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-xl shadow-2xl h-[700px] overflow-hidden flex flex-col"
          >
            <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between bg-zinc-950/40">
              <span>PDF Canvas (Page {currentPage})</span>
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5"
              >
                <span className="hidden sm:inline text-zinc-500 mr-2">
                  {currentPageItems.length} active
                </span>

                {/* Explicit Pan Mode */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPanMode((current) => !current);
                    setSelectedId(null);
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isPanMode
                      ? 'bg-emerald-500 text-black'
                      : 'hover:bg-zinc-800 hover:text-white'
                  }`}
                  title={isPanMode ? "Exit Pan Mode" : "Pan PDF"}
                  aria-pressed={isPanMode}
                >
                  <Hand className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-zinc-800 mx-0.5" />

                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) =>
                      Math.max(
                        0.5,
                        Number((z - 0.15).toFixed(2))
                      )
                    )
                  }
                  className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <span className="text-[11px] font-mono px-1 text-zinc-400 min-w-[42px] text-center">
                  {Math.round(zoom * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setZoom((z) =>
                      Math.min(
                        2.5,
                        Number((z + 0.15).toFixed(2))
                      )
                    )
                  }
                  className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-zinc-800" />

                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-emerald-400 transition-colors"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div
              ref={canvasScrollRef}
              onPointerDown={handlePanPointerDown}
              className={`flex-1 p-3 sm:p-6 bg-zinc-950/60 overscroll-contain ${
                isPanMode
                  ? 'overflow-auto cursor-grab active:cursor-grabbing'
                  : 'overflow-hidden cursor-default'
              }`}
              style={{
                touchAction: 'none',
              }}
            >
              {/* 
                  ZOOM SIZER

                  This outer box tells the scroll container the REAL
                  visual size of the zoomed PDF.

                  The PDF itself keeps one permanent coordinate system,
                  so Text and Whiteout overlays never shift.
              */}
              <div
                style={{
                  width: `${500 * zoom}px`,
                  height: `${pageDisplayHeight * zoom}px`,
                  margin:
                    zoom <= 1
                      ? '0 auto'
                      : '0',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: '500px',
                    height: `${pageDisplayHeight}px`,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
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
                  className={`absolute inset-0 select-none overflow-hidden ${
                    isPanMode ? 'pointer-events-none' : ''
                  }`}
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
                            6,
                            Math.min(
                              item.height * pageDisplayHeight * 0.7,
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
                          touchAction: 'none',
                        }}
                        /* 1px Hairline Border: eliminates outer padding that obscured adjacent characters */
                        className={`absolute cursor-move select-none ${
                          !isText || (item.hasBackground ?? true)
                            ? 'bg-white'
                            : 'bg-transparent'
                        } ${
                          isSelected
                            ? 'border border-emerald-500 shadow-sm'
                            : 'border-none'
                        }`}
                        onPointerDown={(e) => handleDragPointerDown(e, item)}
                      >
                        {/* Text Container: Placed at exact 2px offset to match PDF engine output */}
                        {isText && (
                          <div
                            style={{
                              fontFamily: fontFamilyCss,
                              fontSize: `${effectiveFontSize}px`,
                              color: item.color || '#000000',
                              lineHeight: 1.15,
                              whiteSpace: item.fitMode === 'autofit' ? 'nowrap' : 'pre-wrap',
                              wordBreak: 'break-word',
                              paddingLeft: '2px',
                              paddingRight: '2px',
                              fontWeight: item.isBold ? 'bold' : 'normal',
                              fontStyle: item.isItalic ? 'italic' : 'normal',
                              textDecoration: [
                                item.isUnderline ? 'underline' : '',
                                item.isStrikethrough ? 'line-through' : '',
                              ].filter(Boolean).join(' ') || 'none',
                              textAlign: item.textAlign || 'left',
                              justifyContent:
                                item.textAlign === 'center'
                                  ? 'center'
                                  : item.textAlign === 'right'
                                    ? 'flex-end'
                                    : 'flex-start',
                            }}
                            className="w-full h-full flex items-center overflow-hidden select-none"
                          >
                            {item.text || ''}
                          </div>
                        )}

                        {/* 4 Unobstructed Corner Handles */}
                        {isSelected &&
                          CORNER_HANDLES.map((handle) => (
                            <div
                              key={handle.type}
                              style={{ cursor: handle.cursor, touchAction: 'none' }}
                              className={`absolute w-2 h-2 bg-white border border-emerald-500 rounded-full shadow-xs z-30 ${handle.className}`}
                              onPointerDown={(e) => handleResizePointerDown(e, item, handle.type)}
                            />
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              </div>
            </div>


          </div>
        </>
      )}
    </div>
  );
};