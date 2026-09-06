import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Heading1,
  Heading2,
  Heading3,
  List,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { generateTextPDF, type TextToPdfOptions } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

const INITIAL_CONTENT = `<h1>BLOG</h1>
<p style="text-align: center;"><strong>Title: Regulatory Update: Mandatory Static IP Requirements for API Trading</strong></p>
<h3>Header: Understanding NSE's Circular on API Trading</h3>
<p>If you depend on our API solutions for your trading strategies, then this article has some very important news. National Stock Exchange has released Circular INVG67858 requiring new guidelines in relation to retail investors who trade in API applications.</p>
<p>Through this move, the aim is to ensure that your trading platform remains safe, with priority being given to the overall integrity of the market while at the same time allowing you to implement your preferred algorithms.</p>
<p><strong>Key highlights of the NSE circular:</strong></p>
<ul>
  <li>Mandatory static IP addresses for all retail trading connections</li>
  <li>Limitations on Updating IP Address to once per calendar week</li>
  <li>10 Operations per Second (OPS) limit for unregistered algorithms</li>
</ul>`;

export const TextToPdf: React.FC = () => {
  const [fontFamily, setFontFamily] = useState<'helvetica' | 'times' | 'courier'>('helvetica');
  const [fontSize, setFontSize] = useState<number>(12);
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [margin, setMargin] = useState<number>(40);

  // Retina Preview & Zoom State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pageCount, setPageCount] = useState<number>(1);
  const [charCount, setCharCount] = useState<number>(0);
  const [htmlContent, setHtmlContent] = useState<string>(INITIAL_CONTENT);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const { url: downloadUrl, createUrl } = useObjectUrl();

  // Initialize WYSIWYG editor on mount without resetting on typing
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = INITIAL_CONTENT;
      setCharCount(editorRef.current.innerText.trim().length);
    }
  }, []);

  // Sync content from the WYSIWYG editor
  const handleEditorInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setHtmlContent(html);
    setCharCount(editorRef.current.innerText.trim().length);
  }, []);

  // Visual formatting execution (applies formatting with ZERO raw code tags inserted into text)
  const applyFormat = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  // Fine 5% step zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(2.5, Number((z + 0.05).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.05).toFixed(2))));
  const handleResetZoom = () => setZoom(1.0);

  // Debounced PDF renderer
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const options: TextToPdfOptions = {
          text: htmlContent.trim() || '<p>Type something to generate your PDF...</p>',
          fontFamily,
          fontSize,
          pageSize,
          margin,
        };

        const pdfBytes = await generateTextPDF(options);
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
        console.error('Failed to render text preview:', err);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [htmlContent, fontFamily, fontSize, pageSize, margin, createUrl]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 text-left">
      {/* Settings Bar */}
      <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Font Family */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
            <Type className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as any)}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="helvetica" className="bg-zinc-900">Sans (Helvetica)</option>
              <option value="times" className="bg-zinc-900">Serif (Times)</option>
              <option value="courier" className="bg-zinc-900">Mono (Courier)</option>
            </select>
          </div>

          {/* Font Size */}
          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-300">
            <span>Size:</span>
            <input
              type="range"
              min="9"
              max="20"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-20 accent-emerald-500 cursor-pointer"
            />
            <span className="font-mono text-emerald-400 w-5">{fontSize}pt</span>
          </div>

          {/* Page Format */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as any)}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="a4" className="bg-zinc-900">A4</option>
              <option value="letter" className="bg-zinc-900">US Letter</option>
            </select>
          </div>

          {/* Margins */}
          <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-zinc-300">
            <span>Margin:</span>
            <select
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
              className="bg-transparent text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="25" className="bg-zinc-900">Narrow (25pt)</option>
              <option value="40" className="bg-zinc-900">Normal (40pt)</option>
              <option value="60" className="bg-zinc-900">Wide (60pt)</option>
            </select>
          </div>
        </div>

        {/* Download Button */}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download="document.pdf"
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Download PDF ({pageCount} {pageCount === 1 ? 'Page' : 'Pages'})</span>
          </a>
        )}
      </div>

      {/* Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Side: Visual WYSIWYG Editor (No raw code or background commands) */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 backdrop-blur-xl shadow-2xl flex flex-col h-[650px]">
          <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800 mb-2.5 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium text-zinc-300">
              <FileText className="w-4 h-4 text-emerald-400" />
              Document Editor
            </span>
            <span>{charCount} characters</span>
          </div>

          {/* Formatting Toolbar */}
          <div className="flex flex-wrap items-center gap-1 p-1.5 mb-3 bg-zinc-950/80 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => applyFormat('formatBlock', '<h1>')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Heading 1"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('formatBlock', '<h2>')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Heading 2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('formatBlock', '<h3>')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Heading 3"
            >
              <Heading3 className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            <button
              type="button"
              onClick={() => applyFormat('bold')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('italic')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('underline')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Underline"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            <button
              type="button"
              onClick={() => applyFormat('insertUnorderedList')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Bullet Points"
            >
              <List className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />

            <button
              type="button"
              onClick={() => applyFormat('justifyLeft')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('justifyCenter')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('justifyRight')}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition"
              title="Align Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Visual ContentEditable Area: Shows pure styled text without code tags */}
          <div
            ref={editorRef}
            contentEditable
            onInput={handleEditorInput}
            className="w-full flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 font-sans focus:outline-none focus:border-emerald-500 overflow-y-auto leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-1.5 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2"
          />
        </div>

        {/* Right Side: Retina Canvas Preview with 4-Way Panning & Zero Left-Clipping */}
        <div className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-xl shadow-2xl h-[650px] overflow-hidden flex flex-col">
          <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between bg-zinc-950/40">
            <span>High-DPI Retina Preview (Page 1)</span>
            <span className="text-zinc-500">Total: {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
          </div>

          {/* Scrollable Preview Viewport */}
          <div className="flex-1 overflow-auto p-6 bg-zinc-950/60 relative">
            <div
              className={`flex items-start transition-all duration-150 ease-out min-w-full ${
                zoom > 1.0 ? 'justify-start' : 'justify-center'
              }`}
              style={{
                width: zoom > 1.0 ? `${zoom * 100}%` : '100%',
                paddingRight: zoom > 1.0 ? '3rem' : undefined,
                paddingBottom: zoom > 1.0 ? '4rem' : undefined,
              }}
            >
              <div
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: zoom > 1.0 ? 'top left' : 'top center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="shadow-2xl rounded-sm border border-zinc-800/80 bg-white shrink-0"
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
          </div>

          {/* Smooth Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-zinc-950/90 border border-zinc-800/90 rounded-xl p-1.5 shadow-2xl backdrop-blur-md text-zinc-300">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-white disabled:opacity-30 transition-colors"
              title="Zoom Out (-5%)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-16 accent-emerald-500 cursor-pointer hidden sm:block"
              title="Continuous Zoom"
            />

            <span className="text-[11px] font-mono px-1 text-zinc-400 min-w-[42px] text-center select-none">
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