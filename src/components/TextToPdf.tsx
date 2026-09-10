import React, { useState, useRef, useEffect } from "react";
import {
  Download,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Minus,
  Eraser,
  Undo,
  Redo,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const TextToPdf: React.FC<any> = () => {
  const [content, setContent] = useState<string>("");
  const [charCount, setCharCount] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [fontSize, setFontSize] = useState<number>(12);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement | null>(null);

  // Instant 0ms synchronization: captures typing, backspaces, and clipboard paste
  const syncContent = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setContent(html);
    setCharCount(editorRef.current.innerText.trim().length);
    setDownloadUrl(null);
  };

  // MutationObserver guarantees toolbar formatting reflects instantly
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      syncContent();
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const formatDoc = (cmd: string, val: string = "") => {
    document.execCommand(cmd, false, val);
    syncContent();
  };

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    formatDoc("fontSize", size >= 16 ? "5" : size >= 14 ? "4" : "3");
  };

  const handleDownload = async () => {
    if (!editorRef.current) return;
    const plainText = editorRef.current.innerText.trim();
    if (!plainText) {
      setError("Please enter some text before downloading.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      const margin = 50;
      const pageWidth = 595.28; // A4 width
      const pageHeight = 841.89; // A4 height
      const contentWidth = pageWidth - margin * 2;
      const lineHeight = fontSize * 1.45;

      let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let currentY = pageHeight - margin;

      const rawParagraphs = plainText.split("\n");

      for (const para of rawParagraphs) {
        if (para.trim().length === 0) {
          currentY -= lineHeight * 0.8;
          if (currentY < margin + lineHeight) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentY = pageHeight - margin;
          }
          continue;
        }

        const words = para.split(" ");
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);

          if (testWidth > contentWidth && currentLine) {
            currentPage.drawText(currentLine, {
              x: margin,
              y: currentY,
              size: fontSize,
              font: font,
              color: rgb(0.12, 0.12, 0.12),
            });
            currentY -= lineHeight;

            if (currentY < margin + lineHeight) {
              currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
              currentY = pageHeight - margin;
            }
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }

        if (currentLine) {
          currentPage.drawText(currentLine, {
            x: margin,
            y: currentY,
            size: fontSize,
            font: font,
            color: rgb(0.12, 0.12, 0.12),
          });
          currentY -= lineHeight;

          if (currentY < margin + lineHeight) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentY = pageHeight - margin;
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    } catch (err: any) {
      setError("Failed to create PDF: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const hasContent = content && content.replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 text-white space-y-6 select-none">
      {/* Top Document Editor Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <span className="font-semibold text-sm text-zinc-200">Document Editor</span>
          </div>
          <span className="text-xs font-mono text-zinc-400">{charCount} characters</span>
        </div>

        {/* Rich Text Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950/80 border border-zinc-800 rounded-xl p-2 text-zinc-300">
          <button
            type="button"
            onClick={() => formatDoc("undo")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("redo")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <select
            value={fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700/80 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
          >
            <option value={10}>10pt</option>
            <option value={12}>12pt</option>
            <option value={14}>14pt</option>
            <option value={16}>16pt</option>
            <option value={18}>18pt</option>
            <option value={24}>24pt</option>
          </select>

          <button
            type="button"
            onClick={() => handleFontSizeChange(Math.min(32, fontSize + 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A+
          </button>
          <button
            type="button"
            onClick={() => handleFontSizeChange(Math.max(8, fontSize - 2))}
            className="px-2 py-1 text-xs font-bold hover:bg-zinc-800 rounded transition"
          >
            A-
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={() => formatDoc("bold")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("italic")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("underline")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("strikeThrough")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={() => formatDoc("justifyLeft")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("justifyCenter")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("justifyRight")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("justifyFull")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Justify"
          >
            <AlignJustify className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={() => formatDoc("insertUnorderedList")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("insertOrderedList")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("insertHorizontalRule")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Horizontal Line"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => formatDoc("removeFormat")}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title="Clear Formatting"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* User Input White Paper Area */}
        <div
          ref={editorRef}
          contentEditable={true}
          onInput={syncContent}
          onKeyUp={syncContent}
          onPaste={() => setTimeout(syncContent, 0)}
          data-placeholder="Start typing your document here..."
          className="w-full min-h-[300px] max-h-[500px] overflow-y-auto bg-white text-zinc-900 rounded-xl p-6 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-left font-sans text-sm sm:text-base leading-relaxed break-words select-text cursor-text"
        />
      </div>

      {/* Bottom Live PDF Preview Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <span className="font-semibold text-sm text-zinc-200">PDF Preview</span>
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 font-mono">
            <ChevronLeft className="w-3.5 h-3.5 opacity-40 cursor-not-allowed" />
            <span>Page 1 of 1</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-40 cursor-not-allowed" />
          </div>
        </div>

        {/* Viewport with Zoom & Single A4 Card */}
        <div className="relative w-full min-h-[480px] bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-center justify-center p-6 overflow-auto">
          {/* Single Clean A4 Page (No split boxes) */}
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
            }}
            className="w-full max-w-[580px] aspect-[1/1.414] bg-white text-zinc-900 shadow-2xl rounded-lg p-8 sm:p-12 overflow-y-auto text-left border border-zinc-700 select-text transition-transform duration-150"
          >
            {hasContent ? (
              <div
                className="font-sans text-zinc-900 text-left leading-relaxed text-sm sm:text-base break-words select-text"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <p className="text-zinc-400 italic text-sm sm:text-base select-none">
                Type your text above to see it appear here live...
              </p>
            )}
          </div>

          {/* Floating Zoom Controls Bar */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-xl p-1 shadow-2xl backdrop-blur-md text-zinc-300 z-10">
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(0.6, Math.round((prev - 0.1) * 10) / 10))}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono px-2 text-zinc-300 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(2.0, Math.round((prev + 0.1) * 10) / 10))}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1.0)}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {!downloadUrl ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={isProcessing || !hasContent}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs transition disabled:opacity-40"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isProcessing ? "Generating PDF..." : "Download PDF"}</span>
            </button>
          ) : (
            <a
              href={downloadUrl}
              download="document.pdf"
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Document PDF</span>
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
    </div>
  );
};

export default TextToPdf;
