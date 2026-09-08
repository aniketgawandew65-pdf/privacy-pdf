import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Highlighter,
  Minus,
  Eraser,
  Palette,
  Loader2,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { generateHtmlPDF } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const INITIAL_DOC_HTML = `<div style="text-align: center; margin-bottom: 24px;">
  <p style="font-size: 24pt; font-weight: bold; margin: 0 0 6px 0; color: #111827;">MEMORANDUM &amp; BRIEF</p>
  <p style="font-size: 11pt; color: #6b7280; margin: 0;">Confidential • Generated via Privacy Document Engine</p>
</div>

<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />

<p style="font-size: 14pt; font-weight: bold; color: #1f2937; margin-bottom: 8px;">1. Executive Summary</p>
<p style="font-size: 11pt; line-height: 1.6; color: #374151; margin-bottom: 14px;">
  This document serves as an official overview. You can highlight <strong>any word or line</strong> in this editor to adjust its exact font size, toggle bold, italic, highlight, or text colors just like in Microsoft Word.
</p>

<p style="font-size: 14pt; font-weight: bold; color: #1f2937; margin-bottom: 8px;">2. Core Objectives</p>
<ul style="font-size: 11pt; line-height: 1.6; color: #374151; margin-left: 20px; margin-bottom: 16px;">
  <li>Zero server transmission — 100% offline, client-side generation</li>
  <li>Customizable margins, font families, and live retina preview</li>
  <li>Pixel-perfect A4 and US Letter document formatting</li>
</ul>

<p style="font-size: 11pt; line-height: 1.6; color: #374151;">
  Select this line to change its size or alignment, or start typing your own content from scratch.
</p>`;

export const TextToPdf = () => {
  const [fontFamily, setFontFamily] = useState<'Arial, sans-serif' | "'Times New Roman', serif" | "'Courier New', monospace" | "Georgia, serif">('Arial, sans-serif');
  const [selectedFontSize, setSelectedFontSize] = useState<number>(12);
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [margin, setMargin] = useState<number>(36);

  // Zoom & Preview States
  const [zoom, setZoom] = useState<number>(1.0);
  const [pageCount, setPageCount] = useState<number>(1);
  const [charCount, setCharCount] = useState<number>(0);
  const [htmlContent, setHtmlContent] = useState<string>(INITIAL_DOC_HTML);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const { url: downloadUrl, createUrl } = useObjectUrl();

  // Load initial content into editor
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = INITIAL_DOC_HTML;
      setCharCount(editorRef.current.innerText.trim().length);
    }
  }, []);

  const handleEditorInput = useCallback(() => {
    if (!editorRef.current) return;
    setHtmlContent(editorRef.current.innerHTML);
    setCharCount(editorRef.current.innerText.trim().length);
  }, []);

  // Standard execCommand helper
  const execFormat = (cmd: string, val: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false, val);
    handleEditorInput();
  };

  // Word-style Selection Font Sizing (Affects highlighted text only)
  const applyFontSize = (sizePt: number) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectedFontSize(sizePt);
      return;
    }

    // Wrap selection using the standard browser font tag trick, then replace with styled span
    document.execCommand('fontSize', false, '7');
    const fontElements = editorRef.current.querySelectorAll('font[size="7"]');
    fontElements.forEach((el) => {
      const span = document.createElement('span');
      span.style.fontSize = `${sizePt}pt`;
      span.style.lineHeight = '1.4';
      span.innerHTML = el.innerHTML;
      el.parentNode?.replaceChild(span, el);
    });

    setSelectedFontSize(sizePt);
    handleEditorInput();
  };

  const handleIncreaseFontSize = () => {
    const currentIdx = FONT_SIZES.indexOf(selectedFontSize);
    const nextSize = currentIdx !== -1 && currentIdx < FONT_SIZES.length - 1 ? FONT_SIZES[currentIdx + 1] : selectedFontSize + 2;
    applyFontSize(nextSize);
  };

  const handleDecreaseFontSize = () => {
    const currentIdx = FONT_SIZES.indexOf(selectedFontSize);
    const prevSize = currentIdx > 0 ? FONT_SIZES[currentIdx - 1] : Math.max(8, selectedFontSize - 2);
    applyFontSize(prevSize);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, Number((z + 0.05).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.05).toFixed(2))));
  const handleResetZoom = () => setZoom(1.0);

  // Debounced live PDF renderer
  useEffect(() => {
    let isMounted = true;
    setIsRendering(true);

    const timer = setTimeout(async () => {
      try {
        const styledDocument = `
          <div style="font-family: ${fontFamily}; padding: ${margin}pt; color: #111827; background: #ffffff; min-height: 100%;">
            ${htmlContent.trim() || '<p>Start typing your document...</p>'}
          </div>
        `;

        const pdfBytes = await generateHtmlPDF({
          html: styledDocument,
          pageSize,
          orientation: 'portrait',
        });

        if (!isMounted) return;

        const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
        createUrl(blob);

        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        const pdf = await loadingTask.promise;
        if (!isMounted) return;

        setPageCount(pdf.numPages);
        const page = await pdf.getPage(1);
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
      } catch (err) {
        console.error('Failed to render PDF preview:', err);
      } finally {
        if (isMounted) setIsRendering(false);
      }
    }, 380);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [htmlContent, fontFamily, pageSize, margin, createUrl]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 text-left">
      {/* Top Document & Layout Bar */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Font Family */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
            <Type className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as any)}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="Arial, sans-serif" className="bg-zinc-900">Arial (Sans)</option>
              <option value="'Times New Roman', serif" className="bg-zinc-900">Times New Roman (Serif)</option>
              <option value="Georgia, serif" className="bg-zinc-900">Georgia (Editorial)</option>
              <option value="'Courier New', monospace" className="bg-zinc-900">Courier New (Monospace)</option>
            </select>
          </div>

          {/* Paper Format */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as any)}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="a4" className="bg-zinc-900">A4 Standard Sheet</option>
              <option value="letter" className="bg-zinc-900">US Letter Sheet</option>
            </select>
          </div>

          {/* Margins */}
          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-300">
            <span>Margins:</span>
            <select
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="20" className="bg-zinc-900">Narrow (0.5")</option>
              <option value="36" className="bg-zinc-900">Normal (0.75")</option>
              <option value="54" className="bg-zinc-900">Wide (1.0")</option>
            </select>
          </div>
        </div>

        {/* Download PDF Button */}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download="document.pdf"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Download PDF ({pageCount} {pageCount === 1 ? 'Page' : 'Pages'})</span>
          </a>
        )}
      </div>

      {/* Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: The MS Word Document Canvas */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 backdrop-blur-xl shadow-2xl flex flex-col h-[700px]">
          {/* Ribbon Header */}
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-2.5 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium text-zinc-300">
              <FileText className="w-4 h-4 text-emerald-400" />
              Document Editor
            </span>
            <span>{charCount} characters</span>
          </div>

          {/* MS Word Ribbon Toolbar */}
          <div className="flex flex-wrap items-center gap-1 p-1.5 mb-3 bg-zinc-950/90 border border-zinc-800 rounded-xl">
            {/* Undo / Redo */}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('undo'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('redo'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Redo (Ctrl+Y)"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            {/* Selection Font Size Controls */}
            <select
              value={selectedFontSize}
              onChange={(e) => applyFontSize(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-2 py-1 rounded-lg focus:outline-none cursor-pointer"
              title="Font Size (Selected Text)"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}pt
                </option>
              ))}
            </select>

            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleIncreaseFontSize(); }}
              className="px-1.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition"
              title="Increase Font Size (A⁺)"
            >
              A⁺
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleDecreaseFontSize(); }}
              className="px-1.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition"
              title="Decrease Font Size (A⁻)"
            >
              A⁻
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            {/* Bold, Italic, Underline, Strikethrough */}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('underline'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Underline"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('strikeThrough'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            {/* Text Color & Highlight */}
            <div className="flex items-center gap-1 bg-zinc-900 px-1 py-0.5 rounded-lg border border-zinc-800">
              <Palette className="w-3 h-3 text-zinc-400" />
              <input
                type="color"
                defaultValue="#111827"
                onChange={(e) => execFormat('foreColor', e.target.value)}
                className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                title="Font Ink Color"
              />
            </div>

            <div className="flex items-center gap-1 bg-zinc-900 px-1 py-0.5 rounded-lg border border-zinc-800">
              <Highlighter className="w-3 h-3 text-yellow-400" />
              <input
                type="color"
                defaultValue="#fef08a"
                onChange={(e) => execFormat('hiliteColor', e.target.value)}
                className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                title="Text Highlight Color"
              />
            </div>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            {/* Alignment */}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('justifyLeft'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('justifyCenter'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('justifyRight'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Align Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('justifyFull'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Justify Full"
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            {/* Lists & Dividers */}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('insertUnorderedList'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Bullet Points"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('insertOrderedList'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Numbered List"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('insertHorizontalRule'); }}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Horizontal Divider"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execFormat('removeFormat'); }}
              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition"
              title="Clear Formatting"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Authentic White Paper Desk Canvas */}
          <div className="flex-1 bg-zinc-950/60 p-4 rounded-xl overflow-y-auto flex justify-center border border-zinc-800/80">
            <div
              ref={editorRef}
              contentEditable
              onInput={handleEditorInput}
              spellCheck={true}
              className="w-full max-w-[560px] bg-white text-zinc-900 rounded-sm shadow-2xl p-8 min-h-[600px] focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              style={{
                fontFamily,
              }}
            />
          </div>
        </div>

        {/* Right: High-DPI Live Retina Preview */}
        <div className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-xl shadow-2xl h-[700px] overflow-hidden flex flex-col">
          <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between bg-zinc-950/50">
            <span className="flex items-center gap-1.5">
              <span>High-DPI Retina Preview (Page 1)</span>
              {isRendering && <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />}
            </span>
            <span className="text-zinc-500">Total: {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
          </div>

          <div className="flex-1 overflow-auto p-6 bg-zinc-950/60 relative flex justify-center items-start">
            <div
              className="shadow-2xl rounded-sm border border-zinc-800 bg-white shrink-0 transition-transform duration-150"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: pageSize === 'a4' ? '420px' : '432px',
                  height: 'auto',
                  display: 'block',
                }}
              />
            </div>
          </div>

          {/* Zoom Adjuster */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-zinc-950/90 border border-zinc-800/90 rounded-xl p-1.5 shadow-2xl backdrop-blur-md text-zinc-300">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white disabled:opacity-30 transition-colors"
              title="Zoom Out (-5%)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="text-[11px] font-mono px-1.5 text-zinc-400 min-w-[42px] text-center select-none">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              disabled={zoom >= 2.5}
              className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white disabled:opacity-30 transition-colors"
              title="Zoom In (+5%)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            <button
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-emerald-400 transition-colors"
              title="Reset Zoom (100%)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextToPdf;