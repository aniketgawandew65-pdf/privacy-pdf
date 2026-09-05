import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sliders,
  Type,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { generateTextPDF, type TextToPdfOptions } from '../utils/pdfEngine';
import { useObjectUrl } from '../utils/useObjectUrl';

const SAMPLE_TEXT = `# Executive Project Proposal

This document was created directly in the browser with zero cloud storage.

## Key Project Objectives
- 100% privacy-first client-side document processing
- Zero server hosting maintenance costs
- Vector-grade text clarity on high-DPI displays

Type or paste your text here to preview the output instantly.`;

export const TextToPdf: React.FC = () => {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [fontFamily, setFontFamily] = useState<'helvetica' | 'times' | 'courier'>('helvetica');
  const [fontSize, setFontSize] = useState<number>(12);
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [margin, setMargin] = useState<number>(40);

  // Retina Preview & Zoom State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pageCount, setPageCount] = useState<number>(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { url: downloadUrl, createUrl } = useObjectUrl();

  // Debounced generator to keep typing responsive
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const options: TextToPdfOptions = {
          text: text.trim() || 'Type something to generate your PDF...',
          fontFamily,
          fontSize,
          pageSize,
          margin,
        };

        const pdfBytes = await generateTextPDF(options);
        if (!isMounted) return;

        const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
        createUrl(blob);

        // Render Page 1 to canvas at 2.0x Retina DPI
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });
        const pdf = await loadingTask.promise;
        if (!isMounted) return;
        setPageCount(pdf.numPages);

        const page = await pdf.getPage(1);
        const retinaScale = 2.0; // Sharpness for high-DPI
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
  }, [text, fontFamily, fontSize, pageSize, margin]);

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
        {/* Left Side: Live Notepad Editor */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 backdrop-blur-xl shadow-2xl flex flex-col h-[650px]">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium text-zinc-300">
              <FileText className="w-4 h-4 text-emerald-400" />
              Editor (Markdown & Text)
            </span>
            <span>{text.length} characters</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste text here... Use # for headings and - for bullet points"
            className="w-full flex-1 bg-zinc-950/70 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 font-mono resize-none focus:outline-none focus:border-emerald-500 leading-relaxed"
          />
        </div>

        {/* Right Side: Retina Canvas Preview Workspace with Zoom */}
        <div className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-xl shadow-2xl h-[650px] overflow-hidden flex flex-col">
          <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between bg-zinc-950/40">
            <span>High-DPI Retina Preview (Page 1)</span>
            <span className="text-zinc-500">Total: {pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
          </div>

          {/* Scrollable Preview Area */}
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-zinc-950/60">
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out',
              }}
              className="shadow-2xl rounded-sm border border-zinc-800/80 bg-white"
            >
              {/* High-DPI Canvas is rendered at 2.0x, styled down for crisp vector appearance */}
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

          {/* Floating Bottom-Right Corner Zoom Controls */}
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
      </div>
    </div>
  );
};